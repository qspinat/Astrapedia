/**
 * @fileoverview Planet and solar system body rendering.
 * Handles creation and updates for Sun, Moon, and planets.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {raDecToCartesian} from '../core/CoordinateUtils.js';
import {
  calculateSunPosition,
  calculateMoonPosition,
  calculatePlanetPosition,
  PLANET_DEFAULTS,
} from '../astronomy/SolarSystem.js';

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

    /** @private {number} */
    this.radius_ = 99;
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
    // Remove old planet sprites
    this.sprites_.forEach((sprite) => this.celestialSphere_.remove(sprite));
    this.sprites_ = [];

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
      this.drawMoon_(ctx, canvasSize, planet.phase || 0.5);
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
    sprite.userData = {
      planet: planet,
      type: planet.name === 'Sun' ? 'Star' : (planet.name === 'Moon' ? 'Moon' : 'Planet'),
      name: planet.name,
      ra: planet.ra,
      dec: planet.dec,
      mag: planet.mag,
      angularSize: planet.angularSize,
      phase: planet.phase,
      imageUrl: planet.imageUrl,
      imageLoaded: false,
      imageLoading: false,
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
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, '#FFFFFF');
    gradient.addColorStop(0.3, '#FFFDE7');
    gradient.addColorStop(0.7, '#FFD54F');
    gradient.addColorStop(0.9, '#FF8F00');
    gradient.addColorStop(1, 'rgba(255, 143, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Draw moon sprite with phase.
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

    // Draw shadow for phase
    if (phase < 0.98) {
      ctx.fillStyle = 'rgba(10, 15, 28, 0.95)';
      ctx.beginPath();

      const illumination = phase;

      if (illumination < 0.5) {
        const terminatorX = cx + r * (1 - illumination * 4);
        ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);
        ctx.quadraticCurveTo(terminatorX, cy, cx, cy - r);
      } else {
        const terminatorX = cx - r * ((1 - illumination) * 4);
        ctx.arc(cx, cy, r, Math.PI / 2, -Math.PI / 2, false);
        ctx.quadraticCurveTo(terminatorX, cy, cx, cy - r);
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
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, `rgba(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)}, 1)`);
    gradient.addColorStop(0.7, `rgba(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)}, 0.9)`);
    gradient.addColorStop(1, `rgba(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)}, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
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

        // Update sprite position
        const raRad = THREE.MathUtils.degToRad(pos.ra);
        const decRad = THREE.MathUtils.degToRad(pos.dec);
        sprite.position.set(
          this.radius_ * Math.cos(decRad) * Math.cos(raRad),
          this.radius_ * Math.sin(decRad),
          -this.radius_ * Math.cos(decRad) * Math.sin(raRad)
        );

        // Update userData
        sprite.userData.ra = pos.ra;
        sprite.userData.dec = pos.dec;
        if (pos.phase !== undefined) sprite.userData.phase = pos.phase;
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

      // Calculate magnitude-based size
      const mag = data.mag || 0;
      const baseMag = 8;
      const baseSize = 0.8;
      const maxSize = 6;
      const magnitudeDiff = baseMag - mag;
      const magBasedSize = Math.min(maxSize, Math.max(baseSize, baseSize * Math.pow(1.15, magnitudeDiff)));
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
      if (useRealSize && realSizePixels > 20 && !data.imageLoaded && data.imageUrl) {
        this.loadPlanetImage_(sprite, data.imageUrl);
      }
    }
  }

  /**
   * Load real planet image texture.
   * @param {!THREE.Sprite} sprite - Sprite to update
   * @param {string} imageUrl - Image URL
   * @private
   */
  loadPlanetImage_(sprite, imageUrl) {
    const data = sprite.userData;
    if (data.imageLoading || data.imageLoaded) return;

    data.imageLoading = true;

    this.textureLoader_.load(
      imageUrl,
      (texture) => {
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
      },
      undefined,
      (error) => {
        console.warn(`Failed to load image for ${data.name}:`, error);
        data.imageLoading = false;
      }
    );
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

/**
 * Singleton planet renderer instance.
 * @type {?PlanetRenderer}
 */
export let planetRenderer = null;

/**
 * Initialize the planet renderer singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!PlanetRenderer} Initialized renderer
 */
export function initializePlanetRenderer(dependencies) {
  planetRenderer = new PlanetRenderer(dependencies);
  return planetRenderer;
}
