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
} from '../astronomy/SolarSystem.js';
import {getPlanetImageUrl, getPlanetFallbackUrl} from '../data/PlanetImages.js';
import {createLogger} from '../core/Logger.js';

const logger = createLogger('PlanetRenderer');

/**
 * Terminator geometry for a lunar phase.
 *
 * `phase` runs 0 at new moon, 0.5 at full, back to 1 at the next new — the
 * convention SolarSystem.calculateMoonPosition produces.
 *
 * `semiAxis` is the terminator ellipse's x semi-axis as a fraction of the
 * disc radius, signed by which way it bulges:
 *   -1  new moon      ellipse bulges across the lit side, whole disc shaded
 *    0  quarter       straight line, exactly half shaded
 *   +1  full moon     ellipse hugs the shaded limb, nothing shaded
 *
 * @param {number} phase - Lunar phase, 0 to 1
 * @returns {{illuminated: number, waxing: boolean, semiAxis: number}}
 */
export function moonShadowGeometry(phase) {
  // Triangular in phase: 0 at both new moons, 1 at full.
  const illuminated = 1 - Math.abs(2 * phase - 1);
  return {
    illuminated,
    waxing: phase < 0.5,
    semiAxis: 2 * illuminated - 1,
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
    const sunPos = calculateSunPosition(simTime);
    const moonPos = calculateMoonPosition(simTime);

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

    // Store planet data
    let type = 'Planet';
    if (planet.name === 'Sun') type = 'Star';
    else if (planet.name === 'Moon') type = 'Moon';

    sprite.userData = {
      planet: planet,
      type,
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
   * Draw moon sprite with phase.
   * @param {!CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} size - Canvas size
   * @param {number} phase - Moon phase (0-1)
   * @private
   */
  /**
   * Repaint the Moon's canvas texture for a new phase.
   *
   * No-op once a photograph has replaced the drawn disc, since the canvas is
   * no longer what the sprite shows.
   *
   * @param {!THREE.Sprite} sprite - The Moon sprite
   * @param {number} phase - Illuminated fraction, 0..1
   * @private
   */
  redrawMoonPhase_(sprite, phase) {
    if (sprite.userData.imageLoaded) return;

    const canvas = sprite.material.map?.image;
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawMoon_(ctx, canvas.width, phase);
    sprite.material.map.needsUpdate = true;
  }

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

    // Draw shadow for phase. Near full there is nothing to shade.
    const {illuminated, waxing, semiAxis} = moonShadowGeometry(phase);
    if (illuminated < 0.98) {
      ctx.fillStyle = 'rgba(10, 15, 28, 0.95)';
      ctx.beginPath();

      const rx = Math.abs(semiAxis) * r;

      if (waxing) {
        // Lit on the right: shade the left limb, top to bottom...
        ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, true);
        // ...then close along the terminator. A negative semi-axis bulges the
        // ellipse into the lit side (crescent), a positive one back toward the
        // shaded limb (gibbous).
        ctx.ellipse(cx, cy, rx, r, 0, Math.PI / 2, -Math.PI / 2, semiAxis < 0);
      } else {
        // Waning: mirrored, lit on the left.
        ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);
        ctx.ellipse(cx, cy, rx, r, 0, Math.PI / 2, -Math.PI / 2, semiAxis >= 0);
      }
      ctx.fill();
    }
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
    this.cachedPositions_['Sun'] = calculateSunPosition(simTime);
    this.cachedPositions_['Moon'] = calculateMoonPosition(simTime);

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

      // Calculate real angular size in pixels
      const angularSizeDeg = (data.angularSize || 0.1) / 60;
      const realSizePixels = angularSizeDeg * pixelsPerDeg;

      // Calculate magnitude-based size (planets use larger maxSize=6)
      const mag = data.mag || 0;
      const magBasedSize = magnitudeToSize(mag, 6);
      const magBasedPixels = magBasedSize * 1.5;

      // Use larger of real or magnitude-based size
      const useRealSize = realSizePixels >= magBasedPixels;
      const displaySizePixels = useRealSize ? realSizePixels : magBasedPixels;

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
   * Load real planet image texture with fallback support.
   * @param {!THREE.Sprite} sprite - Sprite to update
   * @param {string} imageUrl - Fallback image URL if no centralized URL exists
   * @private
   */
  loadPlanetImage_(sprite, imageUrl) {
    const data = sprite.userData;
    if (data.imageLoading || data.imageLoaded || data.imageFailed) return;

    data.imageLoading = true;

    // Use centralized planet image URL (with fallback support)
    const primaryUrl = getPlanetImageUrl(data.name) || imageUrl;
    const fallbackUrl = getPlanetFallbackUrl(data.name);

    this.loadImageWithFallback_(sprite, primaryUrl, fallbackUrl);
  }

  /**
   * Load image with fallback on failure.
   * @param {!THREE.Sprite} sprite - Sprite to update
   * @param {string} primaryUrl - Primary image URL
   * @param {?string} fallbackUrl - Fallback URL if primary fails
   * @private
   */
  loadImageWithFallback_(sprite, primaryUrl, fallbackUrl) {
    const data = sprite.userData;

    this.textureLoader_.load(
      primaryUrl,
      (texture) => {
        this.applyTexture_(sprite, texture);
      },
      undefined,
      (error) => {
        logger.warn(`Failed to load primary image for ${data.name}, trying fallback...`);
        if (fallbackUrl) {
          this.textureLoader_.load(
            fallbackUrl,
            (texture) => {
              this.applyTexture_(sprite, texture);
            },
            undefined,
            (fallbackError) => {
              logger.warn(`Failed to load fallback image for ${data.name}:`, fallbackError);
              data.imageLoading = false;
              data.imageFailed = true;
            }
          );
        } else {
          data.imageLoading = false;
          data.imageFailed = true;
        }
      }
    );
  }

  /**
   * Apply loaded texture to sprite.
   * @param {!THREE.Sprite} sprite - Sprite to update
   * @param {!THREE.Texture} texture - Loaded texture
   * @private
   */
  applyTexture_(sprite, texture) {
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

    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const imgWidth = texture.image?.naturalWidth || texture.image?.width || 1;
    const imgHeight = texture.image?.naturalHeight || texture.image?.height || 1;
    data.aspectRatio = imgWidth / imgHeight;

    const newMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
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
