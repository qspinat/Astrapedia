/**
 * @fileoverview Star field rendering with magnitude-based visibility.
 * Handles star visualization, colors, and magnitude filtering.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {SPHERE, STARS} from '../core/Constants.js';
import {raDecToCartesian} from '../core/CoordinateUtils.js';
import {freezeTransform} from './SceneUtils.js';
import {createStarMaterial, starColor} from './StarPoints.js';

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

    /**
     * Every object's magnitude, ascending. Rebuilt by create().
     * @private {?Float64Array}
     */
    this.sortedMagnitudes_ = null;

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
    // `dso.mag &&` would drop a magnitude-0 object; test for a value.
    const dsos = this.getDSOs_().filter(
        (dso) => dso.mag != null && dso.mag <= maxMagnitude);

    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const magnitudes = [];

    // Add stars
    stars.forEach((star) => {
      const pos = raDecToCartesian(star.ra, star.dec, this.radius_);
      positions.push(pos.x, pos.y, pos.z);

      colors.push(...starColor(star.ci, star.spect));
      magnitudes.push(star.mag);
    });

    // Add DSOs with distinct colors
    dsos.forEach((dso) => {
      const pos = raDecToCartesian(dso.ra, dso.dec, this.radius_);
      positions.push(pos.x, pos.y, pos.z);

      const color = DSO_COLORS[dso.type] || DSO_COLORS['default'];
      colors.push(color[0], color[1], color[2]);
      magnitudes.push(dso.mag);
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('magnitude', new THREE.Float32BufferAttribute(magnitudes, 1));

    // Size, brightness and the fade past the limit come from the magnitude.
    this.material_ = createStarMaterial(this.magnitudeLimit_);

    // Remove old star field if exists (dispose the old material via the old
    // Points, since this.material_ was already reassigned above).
    if (this.starField_) {
      this.celestialSphere_.remove(this.starField_);
      this.starField_.geometry.dispose();
      this.starField_.material.dispose();
    }

    this.starField_ = new THREE.Points(geometry, this.material_);
    freezeTransform(this.starField_);
    this.celestialSphere_.add(this.starField_);

    // Store star data for interaction
    this.starField_.userData.stars = stars;
    this.starField_.userData.dsos = dsos;

    // Sorted magnitudes, so getVisibleCount is a binary search rather than a
    // scan of every object. The slider fires this on every input event.
    // Float64, not Float32: rounding a magnitude to float32 can move it
    // across the slider threshold and shift the count by one.
    const mags = new Float64Array(stars.length + dsos.length);
    let n = 0;
    for (const star of stars) mags[n++] = star.mag;
    for (const dso of dsos) mags[n++] = dso.mag;
    this.sortedMagnitudes_ = mags.sort();

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
    if (!this.starField_ || !this.sortedMagnitudes_) return 0;

    // Count of magnitudes <= the limit, via upper-bound binary search. The
    // previous two .filter().length calls walked ~43,000 objects and built two
    // throwaway arrays on every slider input event.
    const mags = this.sortedMagnitudes_;
    let lo = 0;
    let hi = mags.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (mags[mid] <= this.magnitudeLimit_) lo = mid + 1;
      else hi = mid;
    }
    return lo;
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
