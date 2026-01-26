/**
 * @fileoverview Extended object rendering for DSOs with angular sizes.
 * Creates semi-transparent halos for galaxies, nebulae, and clusters.
 */

import {raDecToCartesian} from '../core/CoordinateUtils.js';
import {SPHERE} from '../core/Constants.js';

/**
 * Clamp a value between min and max.
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * ExtendedObjectRenderer creates sprites for DSOs with real angular sizes.
 */
export class ExtendedObjectRenderer {
  /**
   * Creates a new ExtendedObjectRenderer instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {!THREE.Group} dependencies.celestialSphere - Celestial sphere group
   * @param {function(): !Array<!Object>} dependencies.getDSOs - Get DSOs array
   * @param {function(): void=} dependencies.requestRender - Request render callback
   */
  constructor(dependencies) {
    /** @private @const */
    this.celestialSphere_ = dependencies.celestialSphere;

    /** @private @const */
    this.getDSOs_ = dependencies.getDSOs;

    /** @private @const */
    this.requestRender_ = dependencies.requestRender || (() => {});

    /** @private {!Array<!THREE.Sprite>} */
    this.sprites_ = [];

    /** @private {number} */
    this.radius_ = SPHERE.RADIUS;
  }

  /**
   * Get all extended object sprites.
   * @returns {!Array<!THREE.Sprite>} Sprite array
   */
  getSprites() {
    return this.sprites_;
  }

  /**
   * Create extended object sprites for DSOs with angular sizes.
   */
  create() {
    // Clear existing sprites
    this.sprites_.forEach((sprite) => {
      this.celestialSphere_.remove(sprite);
      if (sprite.material.map) sprite.material.map.dispose();
      sprite.material.dispose();
    });
    this.sprites_ = [];

    const dsos = this.getDSOs_();

    // Create sprites for DSOs with known angular sizes
    dsos.forEach((dso) => {
      if (!dso.size_major || dso.size_major <= 0) return;

      const sprite = this.createSprite_(dso);
      this.sprites_.push(sprite);
      this.celestialSphere_.add(sprite);
    });

    this.requestRender_();

    return this.sprites_.length;
  }

  /**
   * Create a sprite for a DSO.
   * @param {!Object} dso - DSO data
   * @returns {!THREE.Sprite} Created sprite
   * @private
   */
  createSprite_(dso) {
    const pos = raDecToCartesian(dso.ra, dso.dec, this.radius_);

    // Calculate magnitude-based intensity
    const mag = dso.mag || 10;
    const magIntensity = clamp((10 - mag) / 24, 0.02, 0.25);

    // Create canvas texture
    const canvas = document.createElement('canvas');
    const size = 128;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Draw gradient based on type
    ctx.clearRect(0, 0, size, size);
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);

    // Color based on type
    const [r, g, b] = this.getColorForType_(dso.type);

    const color1 = `rgba(${r}, ${g}, ${b}, ${magIntensity})`;
    const color2 = `rgba(${r}, ${g}, ${b}, 0)`;

    gradient.addColorStop(0, color1);
    gradient.addColorStop(0.7, color2);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    // Create sprite with magnitude-based opacity
    const texture = new THREE.CanvasTexture(canvas);
    const baseOpacity = clamp((10 - mag) / 10, 0.1, 0.6);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: baseOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(pos);
    sprite.renderOrder = 5;

    // Store data for updates
    sprite.userData = {
      angularSizeArcmin: dso.size_major,
      dso: dso,
      baseOpacity: baseOpacity,
    };

    // Calculate display size
    const angularSizeRad = THREE.MathUtils.degToRad(dso.size_major / 60);
    const displaySize = this.radius_ * angularSizeRad * 2;
    sprite.userData.baseSize = displaySize;
    sprite.scale.set(displaySize, displaySize, 1);

    return sprite;
  }

  /**
   * Get RGB color for DSO type.
   * @param {string} type - DSO type
   * @returns {!Array<number>} RGB values [r, g, b]
   * @private
   */
  getColorForType_(type) {
    switch (type) {
      case 'G':
        return [255, 240, 200]; // Galaxy - yellowish
      case 'PN':
        return [180, 255, 200]; // Planetary nebula - greenish
      case 'Neb':
      case 'Cl+N':
      case 'EmN':
      case 'HII':
        return [255, 180, 200]; // Nebula - pinkish
      default:
        return [200, 220, 255]; // Default - pale blue
    }
  }

  /**
   * Update sprite sizes based on FOV.
   * @param {number} fov - Camera FOV in degrees
   * @param {number} canvasHeight - Canvas height in pixels
   */
  updateSizes(fov, canvasHeight) {
    const pixelsPerDeg = canvasHeight / fov;

    for (const sprite of this.sprites_) {
      const userData = sprite.userData;
      if (!userData || !userData.angularSizeArcmin) continue;

      // Calculate size in pixels
      const angularSizeDeg = userData.angularSizeArcmin / 60;
      const sizePixels = angularSizeDeg * pixelsPerDeg;

      // Convert to world units
      const fovRad = THREE.MathUtils.degToRad(fov / 2);
      const worldSize = (sizePixels / canvasHeight) * 2 * this.radius_ * Math.tan(fovRad);

      // Use larger of base size or FOV-based size
      const displaySize = Math.max(userData.baseSize, worldSize);
      sprite.scale.set(displaySize, displaySize, 1);

      // Fade opacity based on screen coverage (50-100% = 1.0-0.0 opacity)
      const screenCoverage = sizePixels / canvasHeight;
      const opacityMod = screenCoverage > 0.5 ?
        Math.max(0, 1 - (screenCoverage - 0.5) * 2) : 1.0;
      sprite.material.opacity = userData.baseOpacity * opacityMod;
    }
  }

  /**
   * Dispose of resources.
   */
  dispose() {
    this.sprites_.forEach((sprite) => {
      this.celestialSphere_.remove(sprite);
      if (sprite.material.map) sprite.material.map.dispose();
      sprite.material.dispose();
    });
    this.sprites_ = [];
  }
}

/**
 * Singleton extended object renderer instance.
 * @type {?ExtendedObjectRenderer}
 */
export let extendedObjectRenderer = null;

/**
 * Initialize the extended object renderer singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!ExtendedObjectRenderer} Initialized renderer
 */
export function initializeExtendedObjectRenderer(dependencies) {
  extendedObjectRenderer = new ExtendedObjectRenderer(dependencies);
  return extendedObjectRenderer;
}
