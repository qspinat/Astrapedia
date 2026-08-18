/**
 * @fileoverview Extended object rendering for DSOs with angular sizes.
 * Creates semi-transparent halos for galaxies, nebulae, and clusters.
 */

import {raDecToCartesian} from '../core/CoordinateUtils.js';
import {getDsoHaloColor} from '../core/TypeMappings.js';
import {SPHERE, STARS} from '../core/Constants.js';
import {isWithinMagnitudeLimit} from '../core/MagnitudeUtils.js';
import {
  disposeSpriteTexture,
  freezeTransform,
  getSharedHaloTexture,
} from './SceneUtils.js';

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

    /**
     * Magnitude limit currently in force. Halos fainter than this are hidden,
     * so what is drawn matches what ClickHandler will let you select.
     * @private {number}
     */
    this.magnitudeLimit_ = STARS.DEFAULT_MAGNITUDE;
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
    // Dispose only the sprites this renderer owns. DynamicObjectManager pushes
    // its own sprites into this same array (via the addExtendedSprite
    // callback) and tracks them for its own cleanup — tearing them down here
    // would dispose live scene objects it still holds references to.
    const dynamic = [];
    for (const sprite of this.sprites_) {
      if (sprite.userData?.isDynamic) {
        dynamic.push(sprite);
        continue;
      }
      this.celestialSphere_.remove(sprite);
      disposeSpriteTexture(sprite);
      sprite.material.dispose();
    }

    // Empty in place rather than reassigning: skymap.js aliases this array, so
    // a fresh array would silently detach the app's copy and strand every
    // sprite added afterwards.
    this.sprites_.length = 0;
    for (const sprite of dynamic) this.sprites_.push(sprite);

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

    // The halo's visible brightness is the product of the gradient's centre
    // alpha and the material opacity. With a shared white texture normalised
    // to alpha 1.0, that whole product has to live in the opacity — fold both
    // terms together or the magnitude ramp flattens.
    const mag = dso.mag || 10;
    const magIntensity = clamp((10 - mag) / 24, 0.02, 0.25);
    const baseOpacity = clamp((10 - mag) / 10, 0.1, 0.6) * magIntensity;

    const [r, g, b] = getDsoHaloColor(dso.type);
    const material = new THREE.SpriteMaterial({
      map: getSharedHaloTexture(),
      color: new THREE.Color(r / 255, g / 255, b / 255),
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
    sprite.visible = isWithinMagnitudeLimit(dso.mag, this.magnitudeLimit_);
    freezeTransform(sprite);

    return sprite;
  }

  /**
   * Set the magnitude limit and hide halos fainter than it.
   *
   * Applies to dynamically loaded objects too, since they are pushed into
   * this same sprite array.
   *
   * @param {number} limit - Magnitude limit from the settings slider
   */
  setMagnitudeLimit(limit) {
    this.magnitudeLimit_ = limit;
    for (const sprite of this.sprites_) {
      const mag = sprite.userData?.dso?.mag;
      sprite.visible = isWithinMagnitudeLimit(mag, limit);
    }
    this.requestRender_();
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
      sprite.updateMatrix();

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
      disposeSpriteTexture(sprite);
      sprite.material.dispose();
    });
    this.sprites_ = [];
  }
}
