/**
 * @fileoverview Planet and solar system body rendering.
 * Handles creation and updates for Sun, Moon, and planets.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {raDecToCartesian} from '../core/CoordinateUtils.js';
import {SPHERE} from '../core/Constants.js';
import {magnitudeToSize} from '../core/MagnitudeUtils.js';
import {
  calculateSunPosition,
  calculateMoonPosition,
  calculatePlanetPosition,
  PLANET_DEFAULTS,
  solarSystemType,
} from '../astronomy/SolarSystem.js';
import {getPlanetImageSources} from '../data/PlanetImages.js';
import {createLogger} from '../core/Logger.js';
import {composeBodyDisc, drawMoonShadow} from './BodyImage.js';

const logger = createLogger('PlanetRenderer');

/**
 * On-screen size of a planet sprite: its real angular size once that is
 * larger than the magnitude-based dot. ClickHandler sizes tap targets with
 * this too, so what can be tapped matches what is drawn.
 * @param {{angularSize: number, mag: number}} data - Sprite userData
 * @param {number} pixelsPerDeg - Canvas pixels per degree at the current FOV
 * @returns {{displaySizePixels: number, realSizePixels: number,
 *     useRealSize: boolean}}
 */
export function planetDisplaySize(data, pixelsPerDeg) {
  const realSizePixels = ((data.angularSize || 0.1) / 60) * pixelsPerDeg;
  // Planets use a larger maxSize (6) than stars.
  const magBasedPixels = magnitudeToSize(data.mag || 0, 6) * 1.5;
  const useRealSize = realSizePixels >= magBasedPixels;
  return {
    displaySizePixels: useRealSize ? realSizePixels : magBasedPixels,
    realSizePixels,
    useRealSize,
  };
}

/**
 * PlanetRenderer manages planet sprite visualization.
 */
export class PlanetRenderer {
  /**
   * Creates a new PlanetRenderer instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {!THREE.Group} dependencies.celestialSphere - Celestial sphere group
   * @param {function(): Date} dependencies.getSimulationTime - Get simulation time
   * @param {function(): ?{lat: number, lon: number, height: number}} dependencies.getObserverLocation - Get observer
   * @param {function(): void=} dependencies.requestRender - Request render callback
   */
  constructor(dependencies) {
    /** @private @const */
    this.celestialSphere_ = dependencies.celestialSphere;

    /** @private @const */
    this.getSimulationTime_ = dependencies.getSimulationTime;

    /** @private @const */
    this.getObserverLocation_ = dependencies.getObserverLocation;

    /** @private @const */
    this.requestRender_ = dependencies.requestRender || (() => {});

    /** @private {!Array<!Object>} */
    this.planets_ = [];

    /** @private {!Array<!THREE.Sprite>} */
    this.sprites_ = [];

    /** @private {!Map<string, !Object>} */
    this.planetDataByName_ = new Map();

    /** @private {?Object} */
    this.cachedPositions_ = {};

    /** @private {?THREE.TextureLoader} */
    this.textureLoader_ = null;

    /**
     * Incremented by create(). A texture load stamps the generation it
     * started in, so one that resolves after a rebuild can be discarded
     * instead of being applied to a disposed sprite.
     * @private {number}
     */
    this.generation_ = 0;

    /** @private {number} */
    this.radius_ = SPHERE.GRID_RADIUS;
  }

  /**
   * Get all planet data.
   * @returns {!Array<!Object>} Planet array
   */
  getPlanets() {
    return this.planets_;
  }

  /**
   * Get all planet sprites.
   * @returns {!Array<!THREE.Sprite>} Sprite array
   */
  getSprites() {
    return this.sprites_;
  }

  /**
   * Get planet data by name.
   * @param {string} name - Planet name
   * @returns {?Object} Planet data or null
   */
  getPlanetByName(name) {
    return this.planetDataByName_.get(name) || null;
  }

  /**
   * Create planet sprites.
   */
  create() {
    // Remove old planet sprites and free their GPU resources (scene removal
    // alone does not dispose materials/textures). create() reruns on location
    // changes and during time playback, so skipping this leaks steadily.
    this.sprites_.forEach((sprite) => {
      if (sprite.material.map) sprite.material.map.dispose();
      sprite.material.dispose();
      this.celestialSphere_.remove(sprite);
    });
    this.sprites_ = [];

    // Invalidate any texture load still in flight against the sprites just
    // disposed, so it cannot resolve onto an orphan. See applyTexture_.
    this.generation_++;

    // Initialize texture loader
    if (!this.textureLoader_) {
      this.textureLoader_ = new THREE.TextureLoader();
      this.textureLoader_.setCrossOrigin('anonymous');
    }

    const simTime = this.getSimulationTime_();
    const observer = this.getObserverLocation_();

    // Calculate positions
    const sunPos = calculateSunPosition(simTime, observer);
    const moonPos = calculateMoonPosition(simTime, observer);

    // Build planet data with positions
    this.planets_ = PLANET_DEFAULTS.map((defaults) => {
      const planet = {...defaults};

      if (planet.name === 'Sun') {
        planet.ra = sunPos.ra;
        planet.dec = sunPos.dec;
      } else if (planet.name === 'Moon') {
        planet.ra = moonPos.ra;
        planet.dec = moonPos.dec;
        planet.phase = moonPos.phase;
      } else {
        const pos = calculatePlanetPosition(planet.name, simTime, observer) || {ra: 0, dec: 0};
        planet.ra = pos.ra;
        planet.dec = pos.dec;
      }

      return planet;
    });

    // Build lookup map
    this.planetDataByName_.clear();
    this.planets_.forEach((p) => this.planetDataByName_.set(p.name, p));

    // Create sprites
    this.planets_.forEach((planet) => {
      const sprite = this.createPlanetSprite_(planet);
      this.sprites_.push(sprite);
      this.celestialSphere_.add(sprite);
    });

    this.requestRender_();

    globalEventBus.emit(Events.PLANETS_CREATED, {
      count: this.planets_.length,
    });

    return this.planets_.length;
  }

  /**
   * Create a sprite for a planet.
   * @param {!Object} planet - Planet data
   * @returns {!THREE.Sprite} Created sprite
   * @private
   */
  createPlanetSprite_(planet) {
    const canvas = document.createElement('canvas');
    const canvasSize = 128;
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');

    const color = new THREE.Color(planet.color);

    if (planet.name === 'Sun') {
      this.drawSun_(ctx, canvasSize);
    } else if (planet.name === 'Moon') {
      this.drawMoon_(ctx, canvasSize, planet.phase ?? 0.5);
    } else {
      this.drawPlanet_(ctx, canvasSize, color);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);

    // Position
    const pos = raDecToCartesian(planet.ra, planet.dec, this.radius_);
    sprite.position.copy(pos);

    sprite.userData = {
      planet: planet,
      type: solarSystemType(planet.name),
      name: planet.name,
      ra: planet.ra,
      dec: planet.dec,
      mag: planet.mag,
      angularSize: planet.angularSize,
      phase: planet.phase,
      imageUrl: planet.imageUrl,
      imageLoaded: false,
      imageLoading: false,
      // Checked by applyTexture_ to discard loads that outlive their sprite.
      generation: this.generation_,
    };

    sprite.scale.set(1, 1, 1);

    return sprite;
  }

  /**
   * Draw sun sprite.
   * @param {!CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} size - Canvas size
   * @private
   */
  drawSun_(ctx, size) {
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, '#FFFFFF');
    gradient.addColorStop(0.3, '#FFFDE7');
    gradient.addColorStop(0.7, '#FFD54F');
    gradient.addColorStop(0.9, '#FF8F00');
    gradient.addColorStop(1, 'rgba(255, 143, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Repaint the Moon's canvas texture for a new phase: the drawn disc, or
   * the photograph once it has loaded.
   *
   * @param {!THREE.Sprite} sprite - The Moon sprite
   * @param {number} phase - Moon phase 0..1 (0 = new, 0.5 = full)
   * @private
   */
  redrawMoonPhase_(sprite, phase) {
    const canvas = sprite.material.map?.image;
    const {photo, disc} = sprite.userData;
    if (photo && disc) {
      if (!composeBodyDisc(canvas, photo, disc, phase)) return;
    } else {
      const ctx = canvas?.getContext?.('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.drawMoon_(ctx, canvas.width, phase);
    }
    sprite.material.map.needsUpdate = true;
  }

  /**
   * Draw moon sprite with phase, shown until the photograph loads.
   * @param {!CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} size - Canvas size
   * @param {number} phase - Moon phase (0-1)
   * @private
   */
  drawMoon_(ctx, size, phase) {
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 4;

    // Draw full moon disc
    ctx.fillStyle = '#D4D4D4';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Add subtle crater texture
    ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.3, cy - r * 0.2, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + r * 0.2, cy + r * 0.3, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - r * 0.1, cy + r * 0.4, r * 0.1, 0, Math.PI * 2);
    ctx.fill();

    drawMoonShadow(ctx, cx, cy, r, phase);
  }

  /**
   * Draw generic planet sprite.
   * @param {!CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} size - Canvas size
   * @param {!THREE.Color} color - Planet color
   * @private
   */
  drawPlanet_(ctx, size, color) {
    const r = Math.floor(color.r * 255);
    const g = Math.floor(color.g * 255);
    const b = Math.floor(color.b * 255);
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
    gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.9)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Update planet positions without recreating sprites.
   */
  updatePositions() {
    if (this.sprites_.length === 0) {
      this.create();
      return;
    }

    const simTime = this.getSimulationTime_();
    const observer = this.getObserverLocation_();

    // Calculate new positions
    this.cachedPositions_['Sun'] = calculateSunPosition(simTime, observer);
    this.cachedPositions_['Moon'] = calculateMoonPosition(simTime, observer);

    const planetNames = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
    planetNames.forEach((name) => {
      const pos = calculatePlanetPosition(name, simTime, observer);
      this.cachedPositions_[name] = pos || this.cachedPositions_[name] || {ra: 0, dec: 0};
    });

    // Update each sprite
    this.sprites_.forEach((sprite) => {
      const name = sprite.userData.name;
      const pos = this.cachedPositions_[name];

      if (pos) {
        // Update planet data
        const planetData = this.planetDataByName_.get(name);
        if (planetData) {
          planetData.ra = pos.ra;
          planetData.dec = pos.dec;
          if (pos.phase !== undefined) planetData.phase = pos.phase;
        }

        // Update sprite position using shared coordinate utility
        const newPos = raDecToCartesian(pos.ra, pos.dec, this.radius_);
        sprite.position.copy(newPos);

        // Update userData
        sprite.userData.ra = pos.ra;
        sprite.userData.dec = pos.dec;
        if (pos.phase !== undefined) {
          // The Moon's phase is painted into its canvas texture, not derived
          // from the transform, so repositioning alone leaves the crescent
          // frozen at whatever it was when create() last ran. At 1000x that
          // is days of simulated time showing one stale shape.
          if (name === 'Moon' && pos.phase !== sprite.userData.phase) {
            this.redrawMoonPhase_(sprite, pos.phase);
          }
          sprite.userData.phase = pos.phase;
        }
      }
    });

    this.requestRender_();
  }

  /**
   * Update planet sizes based on FOV.
   * @param {number} fov - Camera FOV in degrees
   * @param {number} canvasHeight - Canvas height in pixels
   */
  updateSizes(fov, canvasHeight) {
    const pixelsPerDeg = canvasHeight / fov;

    for (const sprite of this.sprites_) {
      const data = sprite.userData;
      if (!data) continue;

      const {displaySizePixels, realSizePixels, useRealSize} =
          planetDisplaySize(data, pixelsPerDeg);

      // Convert to world units
      const worldSize = (displaySizePixels / canvasHeight) * 2 * this.radius_ * Math.tan(THREE.MathUtils.degToRad(fov / 2));

      // Apply aspect ratio if image loaded
      const aspectRatio = data.aspectRatio || 1;
      if (aspectRatio >= 1) {
        sprite.scale.set(worldSize, worldSize / aspectRatio, 1);
      } else {
        sprite.scale.set(worldSize * aspectRatio, worldSize, 1);
      }

      // Load real image when at real size and large enough
      if (useRealSize && realSizePixels > 20 && !data.imageLoaded && !data.imageFailed && data.imageUrl) {
        this.loadPlanetImage_(sprite, data.imageUrl);
      }
    }
  }

  /**
   * Load the body's photograph, trying each source in turn.
   * @param {!THREE.Sprite} sprite - Sprite to update
   * @param {string} imageUrl - Used when the body has no entry in PlanetImages
   * @private
   */
  loadPlanetImage_(sprite, imageUrl) {
    const data = sprite.userData;
    if (data.imageLoading || data.imageLoaded || data.imageFailed) return;

    data.imageLoading = true;
    const sources = getPlanetImageSources(data.name);
    this.loadImageFrom_(sprite, sources.length ? sources : [{url: imageUrl, disc: null}]);
  }

  /**
   * Load the first source, falling back to the next on failure.
   * @param {!THREE.Sprite} sprite - Sprite to update
   * @param {!Array<{url: string, disc: ?Object}>} sources - In order to try
   * @private
   */
  loadImageFrom_(sprite, sources) {
    const data = sprite.userData;
    const [{url, disc}, ...rest] = sources;

    this.textureLoader_.load(
      url,
      (texture) => this.applyTexture_(sprite, texture, disc),
      undefined,
      (error) => {
        logger.warn(`Failed to load image for ${data.name}: ${url}`, error);
        if (rest.length) {
          this.loadImageFrom_(sprite, rest);
        } else {
          data.imageLoading = false;
          data.imageFailed = true;
        }
      }
    );
  }

  /**
   * Apply loaded texture to sprite.
   *
   * A photo with a known disc is cut out onto a square canvas, so the black
   * background is gone and the disc fills the sprite at the body's true
   * angular size; the Moon is also shaded to its phase. Without a disc
   * (Saturn's rings) the photo is drawn additively, which makes its black
   * background invisible against the sky.
   *
   * @param {!THREE.Sprite} sprite - Sprite to update
   * @param {!THREE.Texture} texture - Loaded texture
   * @param {?Object=} disc - Disc position in the photo, from PlanetImages
   * @private
   */
  applyTexture_(sprite, texture, disc = null) {
    const data = sprite.userData;

    // A load started before the last create() targets a sprite that has since
    // been disposed and removed from the scene. Applying it would
    // double-dispose the material, strand the new texture on an orphan, and
    // set imageLoaded on dead userData — leaving the live sprite to request
    // the same image again on the next frame.
    if (data.generation !== this.generation_) {
      texture.dispose();
      return;
    }

    let map = texture;
    let blending = THREE.AdditiveBlending;
    const canvas = disc ? document.createElement('canvas') : null;
    const phase = data.name === 'Moon' ? data.phase ?? null : null;
    if (canvas && composeBodyDisc(canvas, texture.image, disc, phase)) {
      data.photo = texture.image;
      data.disc = disc;
      data.aspectRatio = 1;
      map = new THREE.CanvasTexture(canvas);
      blending = THREE.NormalBlending;
      texture.dispose();
    } else {
      const imgWidth = texture.image?.naturalWidth || texture.image?.width || 1;
      const imgHeight = texture.image?.naturalHeight || texture.image?.height || 1;
      data.aspectRatio = imgWidth / imgHeight;
    }
    map.minFilter = THREE.LinearFilter;
    map.magFilter = THREE.LinearFilter;

    const newMaterial = new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
      blending,
    });

    sprite.material.dispose();
    sprite.material = newMaterial;
    data.imageLoaded = true;
    data.imageLoading = false;

    this.requestRender_();
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
    this.planets_ = [];
    this.planetDataByName_.clear();
  }
}
