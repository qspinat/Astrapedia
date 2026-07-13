/**
 * @fileoverview Star field rendering with magnitude-based visibility.
 * Handles star visualization, colors, and magnitude filtering.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {SHADERS, SPHERE, STARS} from '../core/Constants.js';
import {raDecToCartesian} from '../core/CoordinateUtils.js';
import {magnitudeToSize} from '../core/MagnitudeUtils.js';

/**
 * DSO type to color mapping.
 * @const {!Object<string, !Array<number>>}
 */
const DSO_COLORS = {
  'G': [1.0, 0.9, 0.6],       // Galaxies: yellowish
  'PN': [0.6, 1.0, 0.6],      // Planetary nebulae: greenish
  'Neb': [1.0, 0.6, 0.8],     // Nebulae: pinkish
  'Cl+N': [1.0, 0.6, 0.8],    // Cluster with nebula: pinkish
  'EmN': [1.0, 0.6, 0.8],     // Emission nebulae: pinkish
  'HII': [1.0, 0.6, 0.8],     // HII regions: pinkish
  'GCl': [1.0, 1.0, 0.8],     // Globular clusters: pale yellow
  'OCl': [0.8, 0.9, 1.0],     // Open clusters: pale blue
  'default': [0.5, 0.8, 1.0], // Default: light blue
};

/**
 * StarFieldRenderer manages the visualization of stars and DSOs.
 */
export class StarFieldRenderer {
  /**
   * Creates a new StarFieldRenderer instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {!THREE.Group} dependencies.celestialSphere - Celestial sphere group
   * @param {function(): !Array<!Object>} dependencies.getStars - Get stars array
   * @param {function(): !Array<!Object>} dependencies.getDSOs - Get DSOs array
   * @param {function(): void=} dependencies.requestRender - Request render callback
   */
  constructor(dependencies) {
    /** @private @const */
    this.celestialSphere_ = dependencies.celestialSphere;

    /** @private @const */
    this.getStars_ = dependencies.getStars;

    /** @private @const */
    this.getDSOs_ = dependencies.getDSOs;

    /** @private @const */
    this.requestRender_ = dependencies.requestRender || (() => {});

    /** @private {?THREE.Points} */
    this.starField_ = null;

    /** @private {?THREE.ShaderMaterial} */
    this.material_ = null;

    /** @private {number} */
    this.magnitudeLimit_ = STARS.DEFAULT_MAGNITUDE;

    /** @private {number} */
    this.radius_ = SPHERE.RADIUS;
  }

  /**
   * Get the star field mesh.
   * @returns {?THREE.Points} Star field
   */
  getStarField() {
    return this.starField_;
  }

  /**
   * Get current magnitude limit.
   * @returns {number} Magnitude limit
   */
  getMagnitudeLimit() {
    return this.magnitudeLimit_;
  }

  /**
   * Create the star field visualization.
   */
  create() {
    // Include ALL stars up to max magnitude (shader handles visibility)
    const maxMagnitude = 20;
    const stars = this.getStars_().filter((s) => s.mag <= maxMagnitude);
    const dsos = this.getDSOs_().filter((dso) => dso.mag && dso.mag <= maxMagnitude);

    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const sizes = [];
    const magnitudes = [];

    // Add stars
    stars.forEach((star) => {
      const pos = raDecToCartesian(star.ra, star.dec, this.radius_);
      positions.push(pos.x, pos.y, pos.z);

      const starColor = this.spectralTypeToColor(star.spect, star.ci);
      colors.push(starColor[0], starColor[1], starColor[2]);

      const size = this.magnitudeToSize(star.mag);
      sizes.push(size);

      magnitudes.push(star.mag);
    });

    // Add DSOs with distinct colors
    dsos.forEach((dso) => {
      const pos = raDecToCartesian(dso.ra, dso.dec, this.radius_);
      positions.push(pos.x, pos.y, pos.z);

      const color = DSO_COLORS[dso.type] || DSO_COLORS['default'];
      colors.push(color[0], color[1], color[2]);

      const size = this.magnitudeToSize(dso.mag);
      sizes.push(size);

      magnitudes.push(dso.mag);
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('magnitude', new THREE.Float32BufferAttribute(magnitudes, 1));

    // Create shader material with magnitude-based visibility
    this.material_ = new THREE.ShaderMaterial({
      uniforms: {
        opacity: {value: 0.9},
        magLimit: {value: this.magnitudeLimit_},
        magFadeRange: {value: 1.5},
      },
      vertexShader: SHADERS.VERTEX,
      fragmentShader: SHADERS.FRAGMENT,
      transparent: true,
      vertexColors: true,
      depthWrite: false,
    });

    // Remove old star field if exists (dispose the old material via the old
    // Points, since this.material_ was already reassigned above).
    if (this.starField_) {
      this.celestialSphere_.remove(this.starField_);
      this.starField_.geometry.dispose();
      this.starField_.material.dispose();
    }

    this.starField_ = new THREE.Points(geometry, this.material_);
    this.celestialSphere_.add(this.starField_);

    // Store star data for interaction
    this.starField_.userData.stars = stars;
    this.starField_.userData.dsos = dsos;

    globalEventBus.emit(Events.STAR_FIELD_CREATED, {
      starCount: stars.length,
      dsoCount: dsos.length,
    });

    return {
      starCount: stars.length,
      dsoCount: dsos.length,
    };
  }

  /**
   * Set the magnitude limit for star visibility.
   * @param {number} magLimit - New magnitude limit
   */
  setMagnitudeLimit(magLimit) {
    const previousMag = this.magnitudeLimit_;
    this.magnitudeLimit_ = magLimit;

    if (this.material_) {
      this.material_.uniforms.magLimit.value = magLimit;
    }

    this.requestRender_();

    globalEventBus.emit(Events.MAGNITUDE_CHANGED, {
      previous: previousMag,
      current: magLimit,
    });
  }

  /**
   * Get approximate visible object count at current magnitude.
   * @returns {number} Visible count
   */
  getVisibleCount() {
    if (!this.starField_) return 0;

    const stars = this.starField_.userData.stars || [];
    const dsos = this.starField_.userData.dsos || [];

    return (
      stars.filter((s) => s.mag <= this.magnitudeLimit_).length +
      dsos.filter((d) => d.mag <= this.magnitudeLimit_).length
    );
  }

  /**
   * Convert magnitude to point size.
   * @param {number} mag - Magnitude value
   * @returns {number} Point size
   */
  magnitudeToSize(mag) {
    return magnitudeToSize(mag);
  }

  /**
   * Convert spectral type and color index to RGB color.
   * @param {?string} spectralType - Spectral type (e.g., 'G2V')
   * @param {?number} colorIndex - B-V color index
   * @returns {!Array<number>} RGB color array [r, g, b]
   */
  spectralTypeToColor(spectralType, colorIndex) {
    // Use color index if available (B-V color)
    if (colorIndex !== null && colorIndex !== undefined) {
      let r, g, b;

      if (colorIndex < -0.1) {
        // Hot blue stars (O, B)
        r = 0.9 + colorIndex * 0.2;
        g = 0.95 + colorIndex * 0.1;
        b = 1.0;
      } else if (colorIndex < 0.4) {
        // White stars (A, F)
        r = 1.0;
        g = 1.0;
        b = 1.0 - colorIndex * 0.1;
      } else if (colorIndex < 1.0) {
        // Yellow-white stars (G)
        r = 1.0;
        g = 1.0 - (colorIndex - 0.4) * 0.15;
        b = 0.95 - (colorIndex - 0.4) * 0.25;
      } else if (colorIndex < 1.5) {
        // Orange stars (K)
        r = 1.0;
        g = 0.9 - (colorIndex - 1.0) * 0.15;
        b = 0.85 - (colorIndex - 1.0) * 0.2;
      } else {
        // Red stars (M)
        r = 1.0;
        g = Math.max(0.7, 0.85 - (colorIndex - 1.5) * 0.2);
        b = Math.max(0.6, 0.75 - (colorIndex - 1.5) * 0.2);
      }
      return [r, g, b];
    }

    // Fallback to spectral type parsing
    if (spectralType && spectralType.length > 0) {
      const type = spectralType.charAt(0).toUpperCase();
      switch (type) {
        case 'O':
        case 'B':
          return [0.9, 0.95, 1.0];
        case 'A':
          return [0.98, 0.98, 1.0];
        case 'F':
          return [1.0, 1.0, 0.98];
        case 'G':
          return [1.0, 1.0, 0.95];
        case 'K':
          return [1.0, 0.95, 0.85];
        case 'M':
          return [1.0, 0.85, 0.75];
        default:
          return [1.0, 1.0, 1.0];
      }
    }

    return [1.0, 1.0, 1.0]; // Default white
  }

  /**
   * Dispose of resources.
   */
  dispose() {
    if (this.starField_) {
      this.celestialSphere_.remove(this.starField_);
      this.starField_.geometry.dispose();
      if (this.material_) {
        this.material_.dispose();
      }
      this.starField_ = null;
      this.material_ = null;
    }
  }
}

/**
 * Singleton star field renderer instance.
 * @type {?StarFieldRenderer}
 */
export let starFieldRenderer = null;

/**
 * Initialize the star field renderer singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!StarFieldRenderer} Initialized renderer
 */
export function initializeStarFieldRenderer(dependencies) {
  starFieldRenderer = new StarFieldRenderer(dependencies);
  return starFieldRenderer;
}
