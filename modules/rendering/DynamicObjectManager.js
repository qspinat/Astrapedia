/**
 * @fileoverview Dynamic Object Manager for loading stars and DSOs from VizieR.
 *
 * Manages dynamic loading of additional stars and deep sky objects when the user
 * zooms in beyond the static catalog limits. Handles:
 * - VizieR API queries for faint stars (Gaia catalog)
 * - VizieR API queries for additional DSOs
 * - Three.js Points geometry for dynamic star field
 * - Sprite creation for dynamic DSOs
 * - Memory management and cleanup when zooming out
 *
 * @module rendering/DynamicObjectManager
 */

// THREE is loaded globally via script tag in app.html
/* global THREE */

import {raDecToCartesian, cartesianToRaDec} from '../core/CoordinateUtils.js';
import {magnitudeToSize} from '../core/MagnitudeUtils.js';
import {SHADERS, SPHERE, DYNAMIC_DATA} from '../core/Constants.js';
import {dynamicDataLoader} from '../services/DynamicDataLoader.js';
import {domCache} from '../ui/DOMCache.js';
import {createLogger} from '../core/Logger.js';
import {
  createHaloSprite,
  disposeSpriteTexture,
  freezeTransform,
  getSharedHaloTexture,
} from './SceneUtils.js';

const logger = createLogger('DynamicObjectManager');

/**
 * Manages dynamic loading of stars and DSOs from VizieR when zoomed in.
 */
export class DynamicObjectManager {
  /**
   * Create a DynamicObjectManager.
   * @param {Object} callbacks - Callback functions for accessing app state
   * @param {function(): THREE.Group} callbacks.getCelestialSphere - Get celestial sphere group
   * @param {function(): THREE.Camera} callbacks.getCamera - Get camera for FOV/matrix
   * @param {function(): Object} callbacks.getStarFieldRenderer - Get StarFieldRenderer for color
   * @param {function(): Array} callbacks.getExtendedObjectSprites - Get sprite array
   * @param {function(THREE.Sprite): void} callbacks.addExtendedSprite - Add sprite to array
   * @param {function(THREE.Sprite): void} callbacks.removeExtendedSprite - Remove sprite from array
   * @param {function(): number} callbacks.getMagnitude - Get current magnitude limit
   * @param {function(): void} callbacks.requestRender - Request a render frame
   */
  constructor(callbacks) {
    this.callbacks_ = callbacks;

    // Dynamic star loading state
    this.dynamicStars = [];
    this.dynamicStarField = null;
    this.visibleDynamicStarIndices = [];

    // Dynamic DSO loading state
    this.dynamicDSOs = [];

    // Query tracking
    this.queriedRegions = new Set();
    this.isQueryingGaia = false;
    this.isQueryingDSO = false;
    this.lastQueryFov = null;
    this.lastQueryRa = null;
    this.lastQueryDec = null;

    // Limits (can be adjusted via settings UI)
    this.maxDynamicStars = DYNAMIC_DATA.MAX_STARS;
    this.maxDynamicDSOs = DYNAMIC_DATA.MAX_DSOS;
    this.maxQueriedRegions = DYNAMIC_DATA.MAX_REGIONS;

    // Reusable objects for performance
    this._tempVec3 = new THREE.Vector3();
    this._tempVec3B = new THREE.Vector3();
    this._tempMatrix4 = new THREE.Matrix4();
    this._tempMatrix4B = new THREE.Matrix4();
    this._tempMatrix3 = new THREE.Matrix3();
  }

  /* ======================================================================
     PUBLIC GETTERS - For click handling in skymap.js
     ====================================================================== */

  /**
   * Get the dynamic star field Points object for raycasting.
   * @returns {THREE.Points|null}
   */
  getDynamicStarField() {
    return this.dynamicStarField;
  }

  /**
   * Get the array of dynamic stars.
   * @returns {Array}
   */
  getDynamicStars() {
    return this.dynamicStars;
  }

  /**
   * Get the visible index mapping array.
   * @returns {Array}
   */
  getVisibleIndices() {
    return this.visibleDynamicStarIndices;
  }

  /* ======================================================================
     PUBLIC SETTERS - For settings UI
     ====================================================================== */

  /**
   * Update the magnitude limit uniform on the dynamic star field shader.
   * @param {number} magLimit - New magnitude limit
   */
  setMagnitudeLimit(magLimit) {
    if (this.dynamicStarField?.material?.uniforms?.magLimit) {
      this.dynamicStarField.material.uniforms.magLimit.value = magLimit;
    }
  }

  /**
   * Update the limits for dynamic data loading.
   * @param {number} maxStars - Maximum number of dynamic stars
   * @param {number} [maxDSOs] - Maximum number of dynamic DSOs (defaults to maxStars/6)
   * @param {number} [maxRegions] - Maximum cached regions (defaults to DYNAMIC_DATA.MAX_REGIONS)
   */
  setLimits(maxStars, maxDSOs, maxRegions) {
    this.maxDynamicStars = maxStars;
    this.maxDynamicDSOs = maxDSOs ?? Math.max(1000, Math.floor(maxStars / 6));
    this.maxQueriedRegions = maxRegions ?? DYNAMIC_DATA.MAX_REGIONS;
  }

  /**
   * Get current limits.
   * @returns {{maxStars: number, maxDSOs: number, maxRegions: number}}
   */
  getLimits() {
    return {
      maxStars: this.maxDynamicStars,
      maxDSOs: this.maxDynamicDSOs,
      maxRegions: this.maxQueriedRegions,
    };
  }

  /* ======================================================================
     DYNAMIC STAR LOADING
     ====================================================================== */

  /**
   * Check if we need to load more stars for the current view.
   * Called from the animation loop when zoomed in.
   */
  checkLoading() {
    const camera = this.callbacks_.getCamera();
    if (!camera) return;

    // Start loading when zoomed in (FOV < 10°)
    if (camera.fov > 10) return;
    if (this.isQueryingGaia || this.isQueryingDSO) return;

    const celestialSphere = this.callbacks_.getCelestialSphere();

    // Get camera's forward direction in world coordinates
    camera.getWorldDirection(this._tempVec3);

    // Transform view direction from world coords to celestial coords
    // by applying the INVERSE of the celestialSphere's world transformation
    this._tempVec3B.copy(this._tempVec3);
    if (celestialSphere) {
      celestialSphere.updateMatrixWorld();
      this._tempMatrix4.copy(celestialSphere.matrixWorld);
      this._tempMatrix4B.copy(this._tempMatrix4).invert();
      this._tempMatrix3.setFromMatrix4(this._tempMatrix4B);
      this._tempVec3B.applyMatrix3(this._tempMatrix3);
    }

    const raDec = cartesianToRaDec(this._tempVec3B.x, this._tempVec3B.y, this._tempVec3B.z);

    // Region key for caching (finer grid for deeper zoom) — shared formula
    // with DynamicDataLoader so the two dedup caches agree.
    const magLimit = this.callbacks_.getMagnitude();
    const regionKey = dynamicDataLoader.getRegionKey(
        raDec.ra, raDec.dec, camera.fov, magLimit);

    // Skip if already queried this region at this magnitude
    if (this.queriedRegions.has(regionKey)) return;

    logger.debug(`Dynamic loading triggered: FOV=${camera.fov.toFixed(2)}°, RA=${raDec.ra.toFixed(1)}°, Dec=${raDec.dec.toFixed(1)}°`);

    // Query for stars and DSOs in this region.
    //
    // Mark the region covered as soon as a query actually RAN — including when
    // it ran and found nothing (queryStars/queryDSOs return [] for "empty" and
    // null for "rate-limited/busy, didn't run"). Marking on results-received
    // instead meant a genuinely empty region was never recorded, so it was
    // re-queried every tick — a stream of successful empty requests that
    // tripped the rate limiter and starved loading everywhere. A null result
    // leaves the region unmarked so it retries once the limiter clears.
    const ra = raDec.ra, dec = raDec.dec, fov = camera.fov;
    const starsPromise = dynamicDataLoader.queryStars(ra, dec, fov, magLimit)
      .catch(err => {
        logger.warn('Dynamic star query failed:', err?.message || err);
        return null;
      });
    const dsosPromise = fov <= 10 ?
      dynamicDataLoader.queryDSOs(ra, dec, fov, magLimit)
        .catch(err => {
          logger.warn('Dynamic DSO query failed:', err?.message || err);
          return null;
        }) :
      Promise.resolve(null);

    Promise.all([starsPromise, dsosPromise]).then(([stars, dsos]) => {
      if (stars !== null || dsos !== null) this.queriedRegions.add(regionKey);
      if (stars && stars.length > 0) {
        this.addDynamicStars(stars.map(s => [s.ra, s.dec, s.mag, s.ci || 0]), false);
      }
      if (dsos && dsos.length > 0) this.addDynamicDSOs(dsos);
    });
  }

  /**
   * Cleanup dynamic stars when zoomed out or outside FOV.
   * Called from the animation loop.
   */
  checkCleanup() {
    if (this.dynamicStars.length === 0) return;

    const camera = this.callbacks_.getCamera();
    const celestialSphere = this.callbacks_.getCelestialSphere();
    if (!camera) return;

    const fov = camera.fov;

    // If zoomed out (FOV > 15°), clear all dynamic objects
    if (fov > 15) {
      this.clearAll_();
      return;
    }

    // When zoomed in, filter out stars outside the current FOV
    this.filterStarsOutsideFov_(camera, celestialSphere, fov);
  }

  /**
   * Clear all dynamic stars and DSOs.
   * @private
   */
  clearAll_() {
    const celestialSphere = this.callbacks_.getCelestialSphere();

    // Dispose dynamic star field
    if (this.dynamicStarField) {
      if (this.dynamicStarField.geometry) this.dynamicStarField.geometry.dispose();
      if (this.dynamicStarField.material) this.dynamicStarField.material.dispose();
      celestialSphere?.remove(this.dynamicStarField);
      this.dynamicStarField = null;
    }

    // Remove dynamic DSO sprites
    if (this.dynamicDSOs.length > 0) {
      const getSprites = this.callbacks_.getExtendedObjectSprites;
      const removeSprite = this.callbacks_.removeExtendedSprite;
      if (getSprites && removeSprite) {
        const sprites = getSprites();
        const spritesToRemove = sprites.filter(sprite =>
          sprite.userData && sprite.userData.isDynamic
        );
        spritesToRemove.forEach(sprite => {
          if (sprite.material) {
            disposeSpriteTexture(sprite);
            sprite.material.dispose();
          }
          celestialSphere?.remove(sprite);
          removeSprite(sprite);
        });
      }
    }

    this.dynamicStars = [];
    this.dynamicDSOs = [];
    this.queriedRegions.clear();

    const statusEl = domCache.dynamicStarsCount;
    if (statusEl) statusEl.textContent = '0';
  }

  /**
   * Filter out stars that are outside the current field of view.
   * @param {THREE.Camera} camera
   * @param {THREE.Group} celestialSphere
   * @param {number} fov
   * @private
   */
  filterStarsOutsideFov_(camera, celestialSphere, fov) {
    // Reuse the instance temporaries rather than allocating five Three.js
    // objects per call; checkLoading twenty lines above already does this.
    const viewDirCelestial = this._tempVec3
        .set(0, 0, 0).sub(camera.position).normalize();
    if (celestialSphere) {
      celestialSphere.updateMatrixWorld();
      this._tempMatrix4.copy(celestialSphere.matrixWorld);
      this._tempMatrix4B.copy(this._tempMatrix4).invert();
      this._tempMatrix3.setFromMatrix4(this._tempMatrix4B);
      viewDirCelestial.applyMatrix3(this._tempMatrix3);
    }
    const viewRaDec = cartesianToRaDec(viewDirCelestial.x, viewDirCelestial.y, viewDirCelestial.z);

    // Filter radius relative to zoom
    const filterRadius = Math.max(fov * 1.5, fov + 2);
    const filterRadiusRad = THREE.MathUtils.degToRad(filterRadius);
    const cosFilterRadius = Math.cos(filterRadiusRad);

    const initialCount = this.dynamicStars.length;

    // Hoist view-center trig out of the per-star loop (loop-invariant).
    const viewRaRad = THREE.MathUtils.degToRad(viewRaDec.ra);
    const viewDecRad = THREE.MathUtils.degToRad(viewRaDec.dec);
    const sinViewDec = Math.sin(viewDecRad);
    const cosViewDec = Math.cos(viewDecRad);

    // Filter stars within angular distance of view center
    this.dynamicStars = this.dynamicStars.filter(star => {
      const starRaRad = THREE.MathUtils.degToRad(star.ra);
      const starDecRad = THREE.MathUtils.degToRad(star.dec);

      // Spherical law of cosines for angular distance
      const cosDist = sinViewDec * Math.sin(starDecRad) +
               cosViewDec * Math.cos(starDecRad) * Math.cos(starRaRad - viewRaRad);

      return cosDist >= cosFilterRadius;
    });

    const removed = initialCount - this.dynamicStars.length;
    if (removed > 0) {
      logger.debug(`Filtered ${removed} dynamic stars outside FOV`);
      this.createDynamicStarField_();
    }
  }

  /* ======================================================================
     STAR FIELD CREATION
     ====================================================================== */

  /**
   * Add dynamically loaded stars to the scene.
   * @param {Array} starData - Array of [ra, dec, mag, colorIndex] arrays
   * @param {boolean} [isSimbad=false] - Whether data is from SIMBAD format
   */
  addDynamicStars(starData, isSimbad = false) {
    const newStars = [];
    // O(1) dedup via quantized ra/dec buckets (~0.001 deg) instead of an
    // O(n*m) scan of the whole accumulated list on every batch.
    const key = (ra, dec) => `${Math.round(ra * 1000)}:${Math.round(dec * 1000)}`;
    const seen = new Set(this.dynamicStars.map((s) => key(s.ra, s.dec)));

    starData.forEach(row => {
      const ra = parseFloat(row[0]);
      const dec = parseFloat(row[1]);
      const mag = parseFloat(row[2]);
      const colorIndex = isSimbad ? 0 : parseFloat(row[3]) || 0;

      if (isNaN(ra) || isNaN(dec) || isNaN(mag)) return;

      const k = key(ra, dec);
      if (seen.has(k)) return;
      seen.add(k);

      newStars.push({ ra, dec, mag, ci: colorIndex });
    });

    if (newStars.length === 0) return;

    this.dynamicStars.push(...newStars);

    // Enforce limit
    if (this.dynamicStars.length > this.maxDynamicStars) {
      this.dynamicStars.sort((a, b) => a.mag - b.mag);
      const excess = this.dynamicStars.length - this.maxDynamicStars;
      this.dynamicStars = this.dynamicStars.slice(0, this.maxDynamicStars);
      logger.debug(`Dynamic stars trimmed: removed ${excess} faintest, keeping ${this.maxDynamicStars}`);
    }

    // Limit queried regions cache
    if (this.queriedRegions.size > this.maxQueriedRegions) {
      const regionsArray = Array.from(this.queriedRegions);
      const toRemove = Math.floor(regionsArray.length / 2);
      for (let i = 0; i < toRemove; i++) {
        this.queriedRegions.delete(regionsArray[i]);
      }
      logger.debug(`Queried regions cache trimmed: removed ${toRemove} regions`);
    }

    this.createDynamicStarField_();
  }

  /**
   * Create/update the dynamic star field from loaded stars.
   * @private
   */
  createDynamicStarField_() {
    const celestialSphere = this.callbacks_.getCelestialSphere();

    // Remove old field and dispose GPU resources
    if (this.dynamicStarField) {
      if (this.dynamicStarField.geometry) this.dynamicStarField.geometry.dispose();
      if (this.dynamicStarField.material) this.dynamicStarField.material.dispose();
      celestialSphere?.remove(this.dynamicStarField);
    }

    if (this.dynamicStars.length === 0) {
      this.dynamicStarField = null;
      const statusEl = domCache.dynamicStarsCount;
      if (statusEl) statusEl.textContent = '0';
      return;
    }

    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const sizes = [];
    const magnitudes = [];
    const radius = SPHERE.RADIUS;

    const starFieldRenderer = this.callbacks_.getStarFieldRenderer();
    this.visibleDynamicStarIndices = [];

    this.dynamicStars.forEach((star, originalIndex) => {
      this.visibleDynamicStarIndices.push(originalIndex);

      const pos = raDecToCartesian(star.ra, star.dec, radius);
      positions.push(pos.x, pos.y, pos.z);

      const color = starFieldRenderer.spectralTypeToColor(null, star.ci);
      colors.push(color[0], color[1], color[2]);

      const size = magnitudeToSize(star.mag);
      sizes.push(size);

      magnitudes.push(star.mag);
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('magnitude', new THREE.Float32BufferAttribute(magnitudes, 1));

    const magLimit = this.callbacks_.getMagnitude();
    const material = new THREE.ShaderMaterial({
      uniforms: {
        opacity: { value: 0.9 },
        magLimit: { value: magLimit },
        magFadeRange: { value: 1.5 }
      },
      vertexShader: SHADERS.VERTEX,
      fragmentShader: SHADERS.FRAGMENT,
      transparent: true,
      vertexColors: true,
      depthWrite: false
    });

    this.dynamicStarField = new THREE.Points(geometry, material);
    freezeTransform(this.dynamicStarField);
    celestialSphere?.add(this.dynamicStarField);

    const statusEl = domCache.dynamicStarsCount;
    if (statusEl) statusEl.textContent = String(this.dynamicStars.length);

    logger.debug(`Dynamic star field: ${this.dynamicStars.length} stars`);
  }

  /* ======================================================================
     DSO SPRITE CREATION
     ====================================================================== */

  /**
   * Add dynamically loaded DSOs to the scene.
   * @param {Array} dsoData - Array of DSO data from VizieR
   */
  addDynamicDSOs(dsoData) {
    const celestialSphere = this.callbacks_.getCelestialSphere();
    const radius = SPHERE.DSO_SPRITE_RADIUS;
    let addedCount = 0;

    // Parse all DSOs first
    const newDSOs = [];
    // O(1) dedup via quantized ra/dec buckets (~0.01 deg) instead of scanning
    // the whole accumulated list for each incoming DSO.
    const key = (ra, dec) => `${Math.round(ra * 100)}:${Math.round(dec * 100)}`;
    const seen = new Set(this.dynamicDSOs.map((d) => key(d.ra, d.dec)));
    // DynamicDataLoader.parseVOTableDSOs_ yields objects, not positional rows,
    // and already resolves the catalog designation into `name`.
    dsoData.forEach(row => {
      const ra = parseFloat(row.ra);
      const dec = parseFloat(row.dec);
      const mag = parseFloat(row.mag) || 12;
      const sizeMajor = parseFloat(row.size_major) || 1;
      const sizeMinor = parseFloat(row.size_minor) || sizeMajor;

      if (isNaN(ra) || isNaN(dec)) return;

      const k = key(ra, dec);
      if (seen.has(k)) return;
      seen.add(k);

      newDSOs.push({
        ra, dec, mag,
        size_major: sizeMajor,
        size_minor: sizeMinor,
        name: row.name,
        type: row.type || 'DSO'
      });
    });

    this.dynamicDSOs.push(...newDSOs);

    // Enforce limit - prioritize by size then brightness
    if (this.dynamicDSOs.length > this.maxDynamicDSOs) {
      this.dynamicDSOs.sort((a, b) => {
        const sizeDiff = (b.size_major || 1) - (a.size_major || 1);
        if (Math.abs(sizeDiff) > 0.5) return sizeDiff;
        return (a.mag || 15) - (b.mag || 15);
      });
      const excess = this.dynamicDSOs.length - this.maxDynamicDSOs;
      const removed = this.dynamicDSOs.slice(this.maxDynamicDSOs);
      this.dynamicDSOs = this.dynamicDSOs.slice(0, this.maxDynamicDSOs);
      // Dispose sprites of trimmed DSOs so the rendered set matches the list
      // (otherwise earlier-added sprites are orphaned until the next clearAll_).
      this.removeDSOSprites_(removed);
      logger.debug(`Dynamic DSOs trimmed: removed ${excess}, keeping ${this.maxDynamicDSOs}`);
    }

    // Create sprites for new DSOs that survived the trim (O(1) membership).
    const survivors = new Set(this.dynamicDSOs);
    newDSOs.forEach(dso => {
      if (survivors.has(dso)) {
        this.createDynamicDSOSprite_(dso, radius, celestialSphere);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      logger.debug(`Added ${addedCount} new DSO sprites`);
    }
  }

  /**
   * Remove and dispose the sprites belonging to the given DSOs.
   * @param {!Array<!Object>} dsos - DSOs whose sprites should be removed.
   * @private
   */
  removeDSOSprites_(dsos) {
    if (!dsos.length) return;
    const getSprites = this.callbacks_.getExtendedObjectSprites;
    const removeSprite = this.callbacks_.removeExtendedSprite;
    if (!getSprites || !removeSprite) return;
    const celestialSphere = this.callbacks_.getCelestialSphere();
    const removedSet = new Set(dsos);
    getSprites()
      .filter((s) => s.userData?.isDynamic && removedSet.has(s.userData.dso))
      .forEach((sprite) => {
        if (sprite.material) {
          disposeSpriteTexture(sprite);
          sprite.material.dispose();
        }
        celestialSphere?.remove(sprite);
        removeSprite(sprite);
      });
  }

  /**
   * Create a sprite for a dynamically loaded DSO.
   * @param {Object} dso - DSO data
   * @param {number} radius - Sphere radius for positioning
   * @param {THREE.Group} celestialSphere - Parent group
   * @private
   */
  createDynamicDSOSprite_(dso, radius, celestialSphere) {
    const sprite = createHaloSprite(dso, radius, {
      magnitudeLimit: this.callbacks_.getMagnitude?.() ?? 12,
      isDynamic: true,
    });

    // Its owner tracks these separately so it can dispose only its own.
    const addSprite = this.callbacks_.addExtendedSprite;
    if (addSprite) addSprite(sprite);

    celestialSphere?.add(sprite);
  }
}
