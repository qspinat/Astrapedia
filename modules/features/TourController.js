/**
 * @fileoverview Tour controller for guided celestial tours.
 * Manages tour navigation, highlighting, and object information display.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {SPHERE} from '../core/Constants.js';

/**
 * @typedef {{
 *   name: string,
 *   ra: number,
 *   dec: number,
 *   description: string,
 *   mag: ?number,
 *   abbrev: ?string,
 *   angularSize: ?number,
 *   altitude: ?number
 * }}
 */
let TourStep;

/**
 * @typedef {{
 *   name: string,
 *   type: ?string,
 *   steps: !Array<!TourStep>
 * }}
 */
let Tour;

/**
 * Planet description lookup table.
 * @const {!Object<string, string>}
 */
const PLANET_DESCRIPTIONS = {
  'Sun': 'Our star - a G-type main-sequence star at the center of the Solar System',
  'Moon': 'Earth\'s only natural satellite - the fifth largest moon in the Solar System',
  'Mercury': 'The smallest planet and closest to the Sun - heavily cratered surface',
  'Venus': 'Second planet from the Sun - hottest planet due to thick atmosphere',
  'Mars': 'The Red Planet - most explored planet, potential for future colonization',
  'Jupiter': 'Largest planet - gas giant with the famous Great Red Spot storm',
  'Saturn': 'Second largest planet - known for its spectacular ring system',
  'Uranus': 'Ice giant - tilted on its side, rotates at 98 degree angle',
  'Neptune': 'Most distant planet - ice giant with strongest winds in the Solar System',
};

/**
 * DSO type descriptions.
 * @const {!Object<string, string>}
 */
const DSO_TYPE_DESCRIPTIONS = {
  'G': 'Galaxy',
  'Neb': 'Nebula',
  'PN': 'Planetary Nebula',
  'EmN': 'Emission Nebula',
  'HII': 'HII Region',
  'RfN': 'Reflection Nebula',
  'SNR': 'Supernova Remnant',
  'GCl': 'Globular Cluster',
  'OCl': 'Open Cluster',
  'Cl+N': 'Cluster with Nebulosity',
};

/**
 * Types to exclude from "tonight's best" tour.
 * @const {!Array<string>}
 */
const EXCLUDE_STELLAR_TYPES = ['*', '**', '*Ass', 'Star', 'Nova', 'SNR?'];

/**
 * TourController manages guided tours through the night sky.
 */
export class TourController {
  /**
   * Creates a new TourController instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(number, number): void} dependencies.navigateToRaDec - Navigate camera
   * @param {function(string): void} dependencies.highlightConstellation - Highlight lines
   * @param {function(): void} dependencies.unhighlightConstellation - Remove highlight
   * @param {function(!Object): void} dependencies.showObjectInfo - Show info panel
   * @param {function(string): void} dependencies.showConstellationInfo - Show constellation
   * @param {function(): number} dependencies.getLST - Get local sidereal time
   * @param {function(): {lat: number, lon: number}} dependencies.getLocation - Get location
   * @param {function(): !Array} dependencies.getPlanets - Get planets array
   * @param {function(): !Array} dependencies.getDeepSkyObjects - Get DSO array
   * @param {function(): !Array} dependencies.getStars - Get stars array
   * @param {function(): number} dependencies.getFOV - Get current FOV
   * @param {function(number): void} dependencies.setFOV - Set target FOV
   * @param {function(string): string} dependencies.getConstellationName - Translate name
   */
  constructor(dependencies) {
    /** @private @const */
    this.navigateToRaDec_ = dependencies.navigateToRaDec;

    /** @private @const */
    this.highlightConstellation_ = dependencies.highlightConstellation;

    /** @private @const */
    this.unhighlightConstellation_ = dependencies.unhighlightConstellation;

    /** @private @const */
    this.showObjectInfo_ = dependencies.showObjectInfo;

    /** @private @const */
    this.showConstellationInfo_ = dependencies.showConstellationInfo;

    /** @private @const */
    this.getLST_ = dependencies.getLST;

    /** @private @const */
    this.getLocation_ = dependencies.getLocation;

    /** @private @const */
    this.getPlanets_ = dependencies.getPlanets;

    /** @private @const */
    this.getDeepSkyObjects_ = dependencies.getDeepSkyObjects;

    /** @private @const */
    this.getStars_ = dependencies.getStars;

    /** @private @const */
    this.getFOV_ = dependencies.getFOV;

    /** @private @const */
    this.setFOV_ = dependencies.setFOV;

    /** @private @const */
    this.getConstellationName_ = dependencies.getConstellationName || ((n) => n);

    /**
     * Current active tour.
     * @private {?Tour}
     */
    this.currentTour_ = null;

    /**
     * Current step index in tour.
     * @private {number}
     */
    this.tourStep_ = 0;

    /**
     * Tour highlight sprite (created externally).
     * @private {?THREE.Sprite}
     */
    this.tourHighlight_ = null;

    /**
     * Callback to add highlight to scene.
     * @private {?function(!THREE.Sprite): void}
     */
    this.addHighlightToScene_ = null;

    /**
     * Callback to remove highlight from scene.
     * @private {?function(!THREE.Sprite): void}
     */
    this.removeHighlightFromScene_ = null;

    /**
     * Available tours cache.
     * @private {?Object<string, !Tour>}
     */
    this.toursCache_ = null;
  }

  /**
   * Set the scene manipulation callbacks.
   * @param {function(!THREE.Sprite): void} addCallback - Add to scene
   * @param {function(!THREE.Sprite): void} removeCallback - Remove from scene
   */
  setSceneCallbacks(addCallback, removeCallback) {
    this.addHighlightToScene_ = addCallback;
    this.removeHighlightFromScene_ = removeCallback;
  }

  /**
   * Check if a tour is currently active.
   * @returns {boolean} True if tour is active
   */
  isActive() {
    return this.currentTour_ !== null;
  }

  /**
   * Get the current tour.
   * @returns {?Tour} Current tour or null
   */
  getCurrentTour() {
    return this.currentTour_;
  }

  /**
   * Get current step index.
   * @returns {number} Current step index
   */
  getCurrentStep() {
    return this.tourStep_;
  }

  /**
   * Get total steps in current tour.
   * @returns {number} Total steps or 0
   */
  getTotalSteps() {
    return this.currentTour_?.steps?.length || 0;
  }

  /**
   * Start a tour by name.
   * @param {string} tourName - Name of tour to start
   */
  start(tourName) {
    const tours = this.getAvailableTours();
    this.currentTour_ = tours[tourName];

    if (!this.currentTour_) {
      console.warn(`Tour not found: ${tourName}`);
      return;
    }

    this.tourStep_ = 0;

    globalEventBus.emit(Events.TOUR_STARTED, {
      tourName,
      tour: this.currentTour_,
    });

    this.showStep_();
  }

  /**
   * Stop the current tour.
   */
  stop() {
    if (!this.currentTour_) return;

    const tourName = this.currentTour_.name;
    this.currentTour_ = null;
    this.tourStep_ = 0;

    this.hideHighlight_();
    this.unhighlightConstellation_?.();

    globalEventBus.emit(Events.TOUR_ENDED, {tourName});
  }

  /**
   * Advance to next step.
   */
  next() {
    if (!this.currentTour_) return;

    this.unhighlightConstellation_?.();
    this.tourStep_++;

    if (this.tourStep_ >= this.currentTour_.steps.length) {
      this.stop();
      return;
    }

    this.showStep_();
  }

  /**
   * Go to previous step.
   */
  previous() {
    if (!this.currentTour_ || this.tourStep_ <= 0) return;

    this.unhighlightConstellation_?.();
    this.tourStep_--;
    this.showStep_();
  }

  /**
   * Jump to a specific step.
   * @param {number} stepIndex - Index of step to show
   */
  goToStep(stepIndex) {
    if (!this.currentTour_) return;
    if (stepIndex < 0 || stepIndex >= this.currentTour_.steps.length) return;

    this.unhighlightConstellation_?.();
    this.tourStep_ = stepIndex;
    this.showStep_();
  }

  /**
   * Show the current tour step.
   * @private
   */
  showStep_() {
    if (!this.currentTour_ || this.tourStep_ >= this.currentTour_.steps.length) {
      this.stop();
      return;
    }

    const step = this.currentTour_.steps[this.tourStep_];

    // Determine required FOV based on tour type
    let requiredFov = this.calculateRequiredFOV_(step);
    const currentFov = this.getFOV_?.() || 60;

    if (requiredFov && currentFov < requiredFov) {
      this.setFOV_?.(requiredFov);
    }

    // Navigate to target (defer to ensure animation triggers after panel opens)
    requestAnimationFrame(() => {
      this.navigateToRaDec_?.(step.ra, step.dec);
    });

    // Handle different tour types
    if (this.currentTour_.type === 'constellation') {
      this.showConstellationStep_(step);
    } else if (this.currentTour_.type === 'planets') {
      this.showPlanetStep_(step);
    } else {
      this.showObjectStep_(step);
    }

    // Emit step change event
    globalEventBus.emit(Events.TOUR_STEP_CHANGED, {
      tour: this.currentTour_,
      step,
      stepIndex: this.tourStep_,
      totalSteps: this.currentTour_.steps.length,
    });
  }

  /**
   * Calculate required FOV for a step.
   * @param {!TourStep} step - Tour step
   * @returns {number} Required FOV in degrees
   * @private
   */
  calculateRequiredFOV_(step) {
    if (this.currentTour_.type === 'constellation') {
      return 30;
    }

    const planets = this.getPlanets_?.() || [];
    const planet = planets.find((p) => p.name === step.name);
    const obj = !planet ? this.findObjectByNameOrCoords_(
      step.name, step.ra, step.dec
    ) : null;

    const angularSizeArcmin = planet?.angularSize || obj?.size_major ||
      step.angularSize || 10;
    let requiredFov = (angularSizeArcmin / 60) * 1.5;

    return Math.max(1, Math.min(60, requiredFov));
  }

  /**
   * Show constellation tour step.
   * @param {!TourStep} step - Tour step
   * @private
   */
  showConstellationStep_(step) {
    this.hideHighlight_();
    this.highlightConstellation_?.(step.name);
    this.showConstellationInfo_?.(step.abbrev || step.name);
  }

  /**
   * Show planet tour step.
   * @param {!TourStep} step - Tour step
   * @private
   */
  showPlanetStep_(step) {
    const planets = this.getPlanets_?.() || [];
    const planet = planets.find((p) => p.name === step.name);

    if (planet) {
      const clickedObject = {
        name: planet.name,
        type: planet.name === 'Sun' ? 'Star' :
          (planet.name === 'Moon' ? 'Natural Satellite' : 'Planet'),
        subtype: planet.name === 'Sun' ? 'Star (G2V)' :
          (planet.name === 'Moon' ? 'Natural Satellite' : 'Planet'),
        ra: planet.ra,
        dec: planet.dec,
        mag: planet.mag,
        angularSize: planet.angularSize,
        phase: planet.phase,
      };
      this.showObjectInfo_?.(clickedObject);
    }

    const angularSizeArcmin = step.angularSize || 30;
    this.showHighlight_(step.ra, step.dec, angularSizeArcmin);
  }

  /**
   * Show regular object tour step.
   * @param {!TourStep} step - Tour step
   * @private
   */
  showObjectStep_(step) {
    const planets = this.getPlanets_?.() || [];
    const planet = planets.find((p) => p.name === step.name);

    if (planet) {
      this.showPlanetStep_(step);
      return;
    }

    const obj = this.findObjectByNameOrCoords_(step.name, step.ra, step.dec);
    const angularSizeArcmin = obj?.size_major || obj?.angularSize ||
      step.angularSize || 10;

    this.showHighlight_(step.ra, step.dec, angularSizeArcmin);

    if (obj) {
      this.showObjectInfo_?.(obj);
    }
  }

  /**
   * Show highlight at position.
   * @param {number} ra - Right ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {number} angularSizeArcmin - Angular size in arcminutes
   * @private
   */
  showHighlight_(ra, dec, angularSizeArcmin = 10) {
    this.hideHighlight_();

    if (typeof THREE === 'undefined') return;

    const canvas = document.createElement('canvas');
    const size = 128;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Draw glowing ring
    ctx.clearRect(0, 0, size, size);
    const centerX = size / 2;
    const centerY = size / 2;
    const outerRadius = size / 2 - 4;
    const innerRadius = outerRadius - 12;

    const gradient = ctx.createRadialGradient(
      centerX, centerY, innerRadius - 10,
      centerX, centerY, outerRadius + 10
    );
    gradient.addColorStop(0, 'rgba(255, 215, 0, 0)');
    gradient.addColorStop(0.4, 'rgba(255, 215, 0, 0.8)');
    gradient.addColorStop(0.6, 'rgba(255, 215, 0, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');

    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
    ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2, true);
    ctx.fillStyle = gradient;
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    this.tourHighlight_ = new THREE.Sprite(material);

    const radius = SPHERE.RADIUS - 2;
    const raRad = ra * Math.PI / 180;
    const decRad = dec * Math.PI / 180;
    const pos = {
      x: radius * Math.cos(decRad) * Math.cos(raRad),
      y: radius * Math.sin(decRad),
      z: -radius * Math.cos(decRad) * Math.sin(raRad),
    };
    this.tourHighlight_.position.set(pos.x, pos.y, pos.z);

    const angularSizeRad = THREE.MathUtils.degToRad(angularSizeArcmin / 60);
    const realWorldSize = radius * angularSizeRad * 2;

    this.tourHighlight_.renderOrder = 100;
    this.tourHighlight_.userData = {
      ra,
      dec,
      startTime: Date.now(),
      angularSizeArcmin,
      realWorldSize,
      maxWorldSize: 15,
    };

    this.addHighlightToScene_?.(this.tourHighlight_);
  }

  /**
   * Hide the tour highlight.
   * @private
   */
  hideHighlight_() {
    if (!this.tourHighlight_) return;

    this.removeHighlightFromScene_?.(this.tourHighlight_);

    if (this.tourHighlight_.material.map) {
      this.tourHighlight_.material.map.dispose();
    }
    this.tourHighlight_.material.dispose();
    this.tourHighlight_ = null;
  }

  /**
   * Update highlight animation (call from animation loop).
   * @param {number} fov - Current camera FOV
   * @param {number} canvasHeight - Canvas height in pixels
   */
  updateHighlight(fov, canvasHeight) {
    if (!this.tourHighlight_) return;

    const userData = this.tourHighlight_.userData;
    const elapsed = (Date.now() - userData.startTime) / 1000;

    // Pulsing opacity
    const pulse = 0.7 + 0.3 * Math.sin(elapsed * 3);
    this.tourHighlight_.material.opacity = pulse;

    // Scale based on FOV
    const pixelsPerDeg = canvasHeight / fov;
    const angularSizeDeg = userData.angularSizeArcmin / 60;
    const realSizePixels = angularSizeDeg * pixelsPerDeg;

    const minHighlightPixels = 80;
    const targetPixels = Math.max(realSizePixels * 1.5, minHighlightPixels);

    const radius = SPHERE.RADIUS - 2;
    const fovRad = THREE.MathUtils.degToRad(fov / 2);
    const worldSize = (targetPixels / canvasHeight) * 2 * radius * Math.tan(fovRad);

    const clampedSize = Math.min(
      Math.max(worldSize, userData.realWorldSize * 1.2),
      userData.maxWorldSize
    );
    const pulsedSize = clampedSize * (1 + 0.1 * Math.sin(elapsed * 2));

    this.tourHighlight_.scale.set(pulsedSize, pulsedSize, 1);
  }

  /**
   * Find object by name or coordinates.
   * @param {string} name - Object name
   * @param {number} ra - Right ascension
   * @param {number} dec - Declination
   * @returns {?Object} Found object or null
   * @private
   */
  findObjectByNameOrCoords_(name, ra, dec) {
    const planets = this.getPlanets_?.() || [];
    const planet = planets.find((p) => p.name === name);
    if (planet) {
      return {
        name: planet.name,
        type: planet.name === 'Sun' ? 'Star' :
          (planet.name === 'Moon' ? 'Natural Satellite' : 'Planet'),
        ra: planet.ra,
        dec: planet.dec,
        mag: planet.mag,
        angularSize: planet.angularSize,
      };
    }

    const dsos = this.getDeepSkyObjects_?.() || [];

    // Check Messier name
    if (name.startsWith('M') && /^M\d+$/.test(name)) {
      const messierNum = parseInt(name.substring(1), 10);
      const dso = dsos.find((d) => d.messier &&
        Math.floor(d.messier) === messierNum);
      if (dso) return {...dso, name};
    }

    // Check by name
    let obj = dsos.find((d) =>
      d.name === name ||
      (d.common_names && d.common_names.toLowerCase().includes(name.toLowerCase()))
    );
    if (obj) return obj;

    // Check stars
    const stars = this.getStars_?.() || [];
    obj = stars.find((s) =>
      s.proper === name || s.name === name || s.bayer === name
    );
    if (obj) return {...obj, type: 'Star'};

    // Check by coordinates
    obj = dsos.find((d) =>
      Math.abs(d.ra - ra) < 0.5 && Math.abs(d.dec - dec) < 0.5
    );
    if (obj) return obj;

    obj = stars.find((s) =>
      Math.abs(s.ra - ra) < 0.5 && Math.abs(s.dec - dec) < 0.5
    );
    if (obj) return {...obj, type: 'Star'};

    return {name, ra, dec, type: 'Unknown'};
  }

  /**
   * Get description for a planet.
   * @param {string} planetName - Planet name
   * @returns {string} Description
   */
  getPlanetDescription(planetName) {
    return PLANET_DESCRIPTIONS[planetName] || 'Solar System object';
  }

  /**
   * Calculate altitude of object at location.
   * @param {number} ra - Right ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {number} lat - Latitude in degrees
   * @param {number} lst - Local sidereal time in degrees
   * @returns {number} Altitude in degrees
   * @private
   */
  calculateAltitude_(ra, dec, lat, lst) {
    const latRad = lat * Math.PI / 180;
    const decRad = dec * Math.PI / 180;
    const haRad = (lst - ra) * Math.PI / 180;

    const sinAlt = Math.sin(latRad) * Math.sin(decRad) +
      Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);

    return Math.asin(sinAlt) * 180 / Math.PI;
  }

  /**
   * Get the best visible objects for tonight.
   * @returns {!Array<!TourStep>} Array of visible objects
   */
  getBestVisibleObjectsTonight() {
    const objects = [];
    const location = this.getLocation_?.() || {lat: 45, lon: 0};
    const lst = this.getLST_?.() || 0;
    const minAltitude = 15;

    // Add visible planets
    const planets = this.getPlanets_?.() || [];
    planets.forEach((planet) => {
      if (planet.name !== 'Sun' && planet.name !== 'Moon') {
        const altitude = this.calculateAltitude_(
          planet.ra, planet.dec, location.lat, lst
        );
        if (altitude > minAltitude && planet.mag < 6) {
          objects.push({
            name: planet.name,
            ra: planet.ra,
            dec: planet.dec,
            mag: planet.mag,
            altitude,
            description: `${this.getPlanetDescription(planet.name)} - ` +
              `Currently ${altitude.toFixed(0)}° above horizon`,
          });
        }
      }
    });

    // Add visible DSOs
    const dsos = this.getDeepSkyObjects_?.() || [];
    dsos.forEach((dso) => {
      if (EXCLUDE_STELLAR_TYPES.includes(dso.type)) return;

      if (dso.mag && dso.mag < 10) {
        const altitude = this.calculateAltitude_(
          dso.ra, dso.dec, location.lat, lst
        );
        if (altitude > minAltitude) {
          const name = dso.messier ? `M${Math.floor(dso.messier)}` :
            (dso.name?.match(/^(NGC|IC)\d+/)?.[0] || dso.name);
          const typeName = DSO_TYPE_DESCRIPTIONS[dso.type] || dso.type ||
            'Deep Sky Object';
          const commonName = dso.common_names ? ` (${dso.common_names})` : '';

          objects.push({
            name,
            ra: dso.ra,
            dec: dso.dec,
            mag: dso.mag,
            altitude,
            description: `${typeName}${commonName} - ` +
              `Mag ${dso.mag.toFixed(1)}, Alt ${altitude.toFixed(0)}°`,
          });
        }
      }
    });

    return objects.sort((a, b) => a.mag - b.mag).slice(0, 50);
  }

  /**
   * Get all available tours.
   * @returns {!Object<string, !Tour>} Tours indexed by name
   */
  getAvailableTours() {
    const planets = this.getPlanets_?.() || [];

    return {
      'winter-sky': {
        name: 'Winter Sky Highlights',
        steps: [
          {name: 'Sirius', ra: 101.29, dec: -16.72, description: 'The brightest star in the night sky, Alpha Canis Majoris'},
          {name: 'Betelgeuse', ra: 88.79, dec: 7.41, description: 'Red supergiant marking Orion\'s shoulder, destined to explode as a supernova'},
          {name: 'Rigel', ra: 78.63, dec: -8.20, description: 'Blue supergiant, the 7th brightest star, Orion\'s foot'},
          {name: 'M42', ra: 83.82, dec: -5.39, description: 'Great Orion Nebula - stunning stellar nursery visible to naked eye'},
          {name: 'M45', ra: 56.87, dec: 24.12, description: 'Pleiades - the Seven Sisters, a young open cluster'},
          {name: 'Aldebaran', ra: 68.98, dec: 16.51, description: 'The fiery eye of Taurus, an orange giant star'},
          {name: 'Capella', ra: 79.17, dec: 45.99, description: 'The Goat Star in Auriga, 6th brightest in the sky'},
          {name: 'M1', ra: 83.63, dec: 22.01, description: 'Crab Nebula - remnant of the supernova of 1054 AD'},
          {name: 'Procyon', ra: 114.83, dec: 5.22, description: 'Little Dog Star, 8th brightest, with white dwarf companion'},
          {name: 'Castor', ra: 113.65, dec: 31.89, description: 'Alpha Geminorum - actually a sextuple star system'},
        ],
      },
      'messier-marathon': this.getMessierMarathonTour_(),
      'constellations': this.getConstellationsTour_(),
      'planets': {
        name: 'Solar System Tour',
        type: 'planets',
        steps: planets.map((planet) => ({
          name: planet.name,
          ra: planet.ra,
          dec: planet.dec,
          description: this.getPlanetDescription(planet.name),
          angularSize: planet.angularSize,
        })),
      },
      'best-messier': this.getBestMessierTour_(),
      'best-ngc': this.getBestNGCTour_(),
      'best-nebulae': this.getNebulaeTour_(),
      'best-galaxies': this.getGalaxiesTour_(),
      'tonight-best': {
        name: 'Best Objects Tonight',
        steps: this.getBestVisibleObjectsTonight(),
      },
      'best-clusters': this.getClustersTour_(),
    };
  }

  /**
   * Get Messier Marathon tour.
   * @returns {!Tour} Messier marathon tour
   * @private
   */
  getMessierMarathonTour_() {
    return {
      name: 'Complete Messier Catalog',
      steps: [
        {name: 'M1', ra: 83.63, dec: 22.01, mag: 8.4, description: 'Crab Nebula - supernova remnant from 1054 AD in Taurus'},
        {name: 'M2', ra: 323.36, dec: -0.82, mag: 6.5, description: 'Globular cluster in Aquarius, 37,000 light-years away'},
        {name: 'M3', ra: 205.55, dec: 28.38, mag: 6.2, description: 'Bright globular cluster in Canes Venatici with 500,000 stars'},
        {name: 'M4', ra: 245.90, dec: -26.53, mag: 5.6, description: 'Nearest globular cluster at 7,200 light-years in Scorpius'},
        {name: 'M5', ra: 229.64, dec: 2.08, mag: 5.7, description: 'Beautiful globular cluster in Serpens, 13 billion years old'},
        {name: 'M6', ra: 265.07, dec: -32.22, mag: 4.2, description: 'Butterfly Cluster - open cluster in Scorpius'},
        {name: 'M7', ra: 268.47, dec: -34.82, mag: 3.3, description: 'Ptolemy Cluster - bright open cluster visible to naked eye'},
        {name: 'M8', ra: 270.92, dec: -24.38, mag: 6.0, description: 'Lagoon Nebula - stunning emission nebula in Sagittarius'},
        {name: 'M9', ra: 259.80, dec: -18.52, mag: 7.7, description: 'Globular cluster near galactic center in Ophiuchus'},
        {name: 'M10', ra: 254.29, dec: -4.10, mag: 6.6, description: 'Globular cluster in Ophiuchus, 14,300 light-years distant'},
        {name: 'M11', ra: 282.77, dec: -6.27, mag: 6.3, description: 'Wild Duck Cluster - rich open cluster in Scutum'},
        {name: 'M12', ra: 251.81, dec: -1.95, mag: 6.7, description: 'Gumball Globular in Ophiuchus'},
        {name: 'M13', ra: 250.42, dec: 36.46, mag: 5.8, description: 'Great Hercules Cluster - finest globular in northern sky'},
        {name: 'M14', ra: 264.40, dec: -3.25, mag: 7.6, description: 'Globular cluster in Ophiuchus'},
        {name: 'M15', ra: 322.49, dec: 12.17, mag: 6.2, description: 'Pegasus Cluster - dense globular with planetary nebula'},
        {name: 'M16', ra: 274.70, dec: -13.81, mag: 6.4, description: 'Eagle Nebula - home of the Pillars of Creation'},
        {name: 'M17', ra: 275.20, dec: -16.18, mag: 6.0, description: 'Omega/Swan Nebula - bright emission nebula'},
        {name: 'M18', ra: 274.52, dec: -17.13, mag: 7.5, description: 'Small open cluster in Sagittarius'},
        {name: 'M19', ra: 255.66, dec: -26.27, mag: 6.8, description: 'Oblate globular cluster in Ophiuchus'},
        {name: 'M20', ra: 270.59, dec: -23.03, mag: 6.3, description: 'Trifid Nebula - emission, reflection, and dark nebula combined'},
        {name: 'M21', ra: 271.05, dec: -22.50, mag: 6.5, description: 'Open cluster near the Trifid Nebula'},
        {name: 'M22', ra: 279.10, dec: -23.90, mag: 5.1, description: 'Sagittarius Cluster - one of the nearest globulars'},
        {name: 'M23', ra: 269.27, dec: -19.02, mag: 6.9, description: 'Open cluster in Sagittarius'},
        {name: 'M24', ra: 274.73, dec: -18.42, mag: 4.6, description: 'Sagittarius Star Cloud - dense Milky Way patch'},
        {name: 'M25', ra: 277.95, dec: -19.12, mag: 6.5, description: 'Open cluster in Sagittarius with Cepheid variable'},
        {name: 'M26', ra: 281.32, dec: -9.38, mag: 8.0, description: 'Open cluster in Scutum'},
        {name: 'M27', ra: 299.90, dec: 22.72, mag: 7.5, description: 'Dumbbell Nebula - large bright planetary nebula in Vulpecula'},
        {name: 'M28', ra: 276.14, dec: -24.87, mag: 6.8, description: 'Globular cluster in Sagittarius'},
        {name: 'M29', ra: 305.98, dec: 38.53, mag: 7.1, description: 'Open cluster in Cygnus'},
        {name: 'M30', ra: 325.09, dec: -23.18, mag: 7.2, description: 'Globular cluster in Capricornus'},
        {name: 'M31', ra: 10.68, dec: 41.27, mag: 3.4, description: 'Andromeda Galaxy - nearest major galaxy, 2.5 million light-years'},
        {name: 'M32', ra: 10.67, dec: 40.87, mag: 8.1, description: 'Elliptical satellite galaxy of M31'},
        {name: 'M33', ra: 23.46, dec: 30.66, mag: 5.7, description: 'Triangulum Galaxy - third largest in Local Group'},
        {name: 'M34', ra: 40.52, dec: 42.78, mag: 5.5, description: 'Open cluster in Perseus'},
        {name: 'M35', ra: 92.27, dec: 24.33, mag: 5.3, description: 'Rich open cluster in Gemini'},
        {name: 'M36', ra: 84.07, dec: 34.13, mag: 6.3, description: 'Pinwheel Cluster in Auriga'},
        {name: 'M37', ra: 88.07, dec: 32.55, mag: 6.2, description: 'Richest of the Auriga clusters'},
        {name: 'M38', ra: 82.18, dec: 35.85, mag: 7.4, description: 'Starfish Cluster in Auriga'},
        {name: 'M39', ra: 322.33, dec: 48.43, mag: 5.5, description: 'Large open cluster in Cygnus'},
        {name: 'M40', ra: 185.55, dec: 58.08, mag: 8.4, description: 'Winnecke 4 - double star in Ursa Major'},
        {name: 'M41', ra: 101.50, dec: -20.73, mag: 4.5, description: 'Open cluster near Sirius in Canis Major'},
        {name: 'M42', ra: 83.82, dec: -5.39, mag: 4.0, description: 'Great Orion Nebula - the most famous nebula in the sky'},
        {name: 'M43', ra: 83.89, dec: -5.27, mag: 9.0, description: 'De Mairan\'s Nebula - part of Orion complex'},
        {name: 'M44', ra: 130.05, dec: 19.67, mag: 3.7, description: 'Beehive Cluster (Praesepe) - naked-eye cluster in Cancer'},
        {name: 'M45', ra: 56.87, dec: 24.12, mag: 1.6, description: 'Pleiades - the Seven Sisters, most famous star cluster'},
        {name: 'M46', ra: 115.44, dec: -14.82, mag: 6.1, description: 'Open cluster in Puppis with planetary nebula NGC2438'},
        {name: 'M47', ra: 114.15, dec: -14.50, mag: 4.2, description: 'Bright open cluster in Puppis'},
        {name: 'M48', ra: 123.43, dec: -5.73, mag: 5.5, description: 'Open cluster in Hydra'},
        {name: 'M49', ra: 187.44, dec: 8.00, mag: 8.4, description: 'Elliptical galaxy in Virgo Cluster'},
        {name: 'M50', ra: 105.68, dec: -8.37, mag: 5.9, description: 'Open cluster in Monoceros'},
        {name: 'M51', ra: 202.47, dec: 47.20, mag: 8.4, description: 'Whirlpool Galaxy - stunning face-on spiral with companion'},
        {name: 'M52', ra: 351.20, dec: 61.60, mag: 7.3, description: 'Open cluster in Cassiopeia'},
        {name: 'M53', ra: 198.23, dec: 18.17, mag: 7.6, description: 'Globular cluster in Coma Berenices'},
        {name: 'M54', ra: 283.76, dec: -30.48, mag: 7.6, description: 'Globular cluster - actually belongs to Sagittarius Dwarf Galaxy'},
        {name: 'M55', ra: 294.99, dec: -30.96, mag: 6.3, description: 'Summer Rose Star - loose globular in Sagittarius'},
        {name: 'M56', ra: 289.15, dec: 30.18, mag: 8.3, description: 'Globular cluster in Lyra'},
        {name: 'M57', ra: 283.40, dec: 33.03, mag: 8.8, description: 'Ring Nebula - famous smoke-ring planetary nebula in Lyra'},
        {name: 'M58', ra: 189.43, dec: 11.82, mag: 9.7, description: 'Barred spiral galaxy in Virgo Cluster'},
        {name: 'M59', ra: 190.51, dec: 11.65, mag: 9.6, description: 'Elliptical galaxy in Virgo Cluster'},
        {name: 'M60', ra: 190.92, dec: 11.55, mag: 8.8, description: 'Giant elliptical galaxy in Virgo Cluster'},
        {name: 'M61', ra: 185.48, dec: 4.47, mag: 9.7, description: 'Face-on spiral galaxy in Virgo Cluster'},
        {name: 'M62', ra: 255.30, dec: -30.11, mag: 6.5, description: 'Asymmetric globular cluster in Ophiuchus'},
        {name: 'M63', ra: 198.96, dec: 42.03, mag: 8.6, description: 'Sunflower Galaxy - flocculent spiral in Canes Venatici'},
        {name: 'M64', ra: 194.18, dec: 21.68, mag: 8.5, description: 'Black Eye Galaxy - spiral with distinctive dark dust band'},
        {name: 'M65', ra: 169.73, dec: 13.09, mag: 9.3, description: 'Leo Triplet member - edge-on spiral'},
        {name: 'M66', ra: 170.06, dec: 12.99, mag: 8.9, description: 'Leo Triplet member - disturbed spiral galaxy'},
        {name: 'M67', ra: 132.85, dec: 11.82, mag: 6.1, description: 'Old open cluster in Cancer, 4 billion years old'},
        {name: 'M68', ra: 189.87, dec: -26.75, mag: 7.8, description: 'Globular cluster in Hydra'},
        {name: 'M69', ra: 277.85, dec: -32.35, mag: 7.6, description: 'Globular cluster in Sagittarius'},
        {name: 'M70', ra: 280.80, dec: -32.30, mag: 7.9, description: 'Globular cluster in Sagittarius'},
        {name: 'M71', ra: 298.44, dec: 18.78, mag: 8.2, description: 'Loose globular cluster in Sagitta'},
        {name: 'M72', ra: 313.37, dec: -12.54, mag: 9.3, description: 'Remote globular cluster in Aquarius'},
        {name: 'M73', ra: 314.75, dec: -12.63, mag: 9.0, description: 'Asterism of four stars in Aquarius'},
        {name: 'M74', ra: 24.17, dec: 15.78, mag: 9.4, description: 'Phantom Galaxy - perfect face-on spiral in Pisces'},
        {name: 'M75', ra: 301.52, dec: -21.92, mag: 8.5, description: 'Compact globular cluster in Sagittarius'},
        {name: 'M76', ra: 25.58, dec: 51.58, mag: 10.1, description: 'Little Dumbbell Nebula - planetary nebula in Perseus'},
        {name: 'M77', ra: 40.67, dec: -0.01, mag: 8.9, description: 'Cetus A - Seyfert galaxy with active nucleus'},
        {name: 'M78', ra: 86.69, dec: 0.08, mag: 8.3, description: 'Brightest reflection nebula in Orion'},
        {name: 'M79', ra: 81.04, dec: -24.52, mag: 7.7, description: 'Globular cluster in Lepus - unusual winter position'},
        {name: 'M80', ra: 244.26, dec: -22.98, mag: 7.3, description: 'Dense globular cluster in Scorpius'},
        {name: 'M81', ra: 148.89, dec: 69.07, mag: 6.9, description: 'Bode\'s Galaxy - grand design spiral in Ursa Major'},
        {name: 'M82', ra: 148.97, dec: 69.68, mag: 8.4, description: 'Cigar Galaxy - starburst galaxy with dramatic outflows'},
        {name: 'M83', ra: 204.25, dec: -29.87, mag: 7.5, description: 'Southern Pinwheel - barred spiral with intense star formation'},
        {name: 'M84', ra: 186.27, dec: 12.89, mag: 9.1, description: 'Lenticular galaxy in Virgo Cluster'},
        {name: 'M85', ra: 186.35, dec: 18.19, mag: 9.1, description: 'Lenticular galaxy in Virgo Cluster'},
        {name: 'M86', ra: 186.55, dec: 12.95, mag: 8.9, description: 'Giant elliptical in Virgo Cluster, blueshifted'},
        {name: 'M87', ra: 187.71, dec: 12.39, mag: 8.6, description: 'Virgo A - giant elliptical with jet and famous black hole'},
        {name: 'M88', ra: 187.99, dec: 14.42, mag: 9.6, description: 'Spiral galaxy in Virgo Cluster'},
        {name: 'M89', ra: 188.92, dec: 12.55, mag: 9.8, description: 'Almost perfectly spherical elliptical galaxy'},
        {name: 'M90', ra: 189.21, dec: 13.16, mag: 9.5, description: 'Large spiral galaxy in Virgo Cluster'},
        {name: 'M91', ra: 188.86, dec: 14.50, mag: 10.2, description: 'Barred spiral galaxy in Virgo Cluster'},
        {name: 'M92', ra: 259.28, dec: 43.14, mag: 6.4, description: 'Ancient globular in Hercules, 14 billion years old'},
        {name: 'M93', ra: 116.15, dec: -23.87, mag: 6.0, description: 'Open cluster in Puppis'},
        {name: 'M94', ra: 192.72, dec: 41.12, mag: 8.2, description: 'Croc\'s Eye Galaxy - spiral with starburst ring'},
        {name: 'M95', ra: 160.99, dec: 11.70, mag: 9.7, description: 'Barred spiral in Leo'},
        {name: 'M96', ra: 161.69, dec: 11.82, mag: 9.2, description: 'Double-barred spiral in Leo'},
        {name: 'M97', ra: 168.70, dec: 55.02, mag: 9.9, description: 'Owl Nebula - planetary nebula in Ursa Major'},
        {name: 'M98', ra: 183.45, dec: 14.90, mag: 10.1, description: 'Edge-on spiral in Virgo Cluster'},
        {name: 'M99', ra: 184.71, dec: 14.42, mag: 9.9, description: 'Coma Pinwheel - face-on spiral'},
        {name: 'M100', ra: 185.73, dec: 15.82, mag: 9.3, description: 'Grand design spiral in Virgo Cluster'},
        {name: 'M101', ra: 210.80, dec: 54.35, mag: 7.9, description: 'Pinwheel Galaxy - stunning face-on spiral in Ursa Major'},
        {name: 'M102', ra: 226.62, dec: 55.76, mag: 9.9, description: 'Spindle Galaxy (NGC5866) - edge-on lenticular'},
        {name: 'M103', ra: 23.34, dec: 60.70, mag: 7.4, description: 'Open cluster in Cassiopeia'},
        {name: 'M104', ra: 189.99, dec: -11.62, mag: 8.0, description: 'Sombrero Galaxy - iconic edge-on with dust lane'},
        {name: 'M105', ra: 161.96, dec: 12.58, mag: 9.3, description: 'Elliptical galaxy in Leo'},
        {name: 'M106', ra: 184.74, dec: 47.30, mag: 8.4, description: 'Seyfert galaxy with water maser'},
        {name: 'M107', ra: 248.13, dec: -13.05, mag: 7.9, description: 'Loose globular cluster in Ophiuchus'},
        {name: 'M108', ra: 167.88, dec: 55.67, mag: 10.0, description: 'Surfboard Galaxy - edge-on spiral in Ursa Major'},
        {name: 'M109', ra: 179.40, dec: 53.37, mag: 9.8, description: 'Barred spiral galaxy in Ursa Major'},
        {name: 'M110', ra: 10.09, dec: 41.68, mag: 8.5, description: 'Elliptical satellite of Andromeda Galaxy'},
      ].sort((a, b) => a.mag - b.mag),
    };
  }

  /**
   * Get constellations tour.
   * @returns {!Tour} Constellations tour
   * @private
   */
  getConstellationsTour_() {
    return {
      name: 'Constellation Tour',
      type: 'constellation',
      steps: [
        {name: 'Orion', abbrev: 'Ori', ra: 85.0, dec: 0.0, description: 'The Hunter - one of the most recognizable constellations'},
        {name: 'Ursa Major', abbrev: 'UMa', ra: 165.0, dec: 55.0, description: 'The Great Bear - home of the Big Dipper'},
        {name: 'Cassiopeia', abbrev: 'Cas', ra: 15.0, dec: 60.0, description: 'The Queen - distinctive W or M shape'},
        {name: 'Scorpius', abbrev: 'Sco', ra: 255.0, dec: -30.0, description: 'The Scorpion - prominent summer constellation'},
        {name: 'Leo', abbrev: 'Leo', ra: 165.0, dec: 15.0, description: 'The Lion - spring zodiac constellation'},
        {name: 'Cygnus', abbrev: 'Cyg', ra: 305.0, dec: 40.0, description: 'The Swan - contains the Northern Cross asterism'},
        {name: 'Sagittarius', abbrev: 'Sgr', ra: 285.0, dec: -30.0, description: 'The Archer - points toward galactic center'},
        {name: 'Gemini', abbrev: 'Gem', ra: 112.0, dec: 25.0, description: 'The Twins - winter zodiac constellation'},
        {name: 'Lyra', abbrev: 'Lyr', ra: 282.0, dec: 35.0, description: 'The Lyre - home of bright star Vega'},
        {name: 'Taurus', abbrev: 'Tau', ra: 65.0, dec: 15.0, description: 'The Bull - contains the Pleiades and Hyades'},
        {name: 'Aquila', abbrev: 'Aql', ra: 295.0, dec: 5.0, description: 'The Eagle - home of bright star Altair'},
        {name: 'Pegasus', abbrev: 'Peg', ra: 340.0, dec: 20.0, description: 'The Winged Horse - famous Great Square asterism'},
        {name: 'Andromeda', abbrev: 'And', ra: 10.0, dec: 38.0, description: 'The Chained Princess - contains M31 galaxy'},
        {name: 'Canis Major', abbrev: 'CMa', ra: 105.0, dec: -22.0, description: 'The Great Dog - home of Sirius, brightest star'},
        {name: 'Perseus', abbrev: 'Per', ra: 50.0, dec: 42.0, description: 'The Hero - home of the Perseid meteor shower radiant'},
        {name: 'Centaurus', abbrev: 'Cen', ra: 200.0, dec: -50.0, description: 'The Centaur - contains Alpha Centauri, nearest star system'},
        {name: 'Crux', abbrev: 'Cru', ra: 185.0, dec: -60.0, description: 'The Southern Cross - smallest constellation, iconic in Southern Hemisphere'},
        {name: 'Draco', abbrev: 'Dra', ra: 260.0, dec: 65.0, description: 'The Dragon - winds around the north celestial pole'},
      ],
    };
  }

  /**
   * Get best Messier tour.
   * @returns {!Tour} Best Messier objects tour
   * @private
   */
  getBestMessierTour_() {
    return {
      name: 'Best Messier Objects',
      steps: [
        {name: 'M42', ra: 83.82, dec: -5.39, description: 'Orion Nebula - the brightest nebula visible to the naked eye'},
        {name: 'M31', ra: 10.68, dec: 41.27, description: 'Andromeda Galaxy - nearest major galaxy, 2.5 million light-years away'},
        {name: 'M45', ra: 56.87, dec: 24.12, description: 'Pleiades - the Seven Sisters, a stunning open cluster'},
        {name: 'M13', ra: 250.42, dec: 36.46, description: 'Hercules Cluster - finest globular cluster in northern skies'},
        {name: 'M51', ra: 202.47, dec: 47.20, description: 'Whirlpool Galaxy - beautiful face-on spiral with companion'},
        {name: 'M8', ra: 270.92, dec: -24.38, description: 'Lagoon Nebula - bright emission nebula in Sagittarius'},
        {name: 'M57', ra: 283.40, dec: 33.03, description: 'Ring Nebula - classic planetary nebula in Lyra'},
        {name: 'M1', ra: 83.63, dec: 22.01, description: 'Crab Nebula - supernova remnant from 1054 AD'},
        {name: 'M104', ra: 189.99, dec: -11.62, description: 'Sombrero Galaxy - distinctive edge-on spiral with dust lane'},
        {name: 'M27', ra: 299.90, dec: 22.72, description: 'Dumbbell Nebula - large, bright planetary nebula'},
        {name: 'M16', ra: 274.70, dec: -13.81, description: 'Eagle Nebula - home of the famous Pillars of Creation'},
        {name: 'M101', ra: 210.80, dec: 54.35, description: 'Pinwheel Galaxy - grand design face-on spiral'},
      ],
    };
  }

  /**
   * Get best NGC tour.
   * @returns {!Tour} Best NGC objects tour
   * @private
   */
  getBestNGCTour_() {
    return {
      name: 'Best NGC Objects',
      steps: [
        {name: 'NGC7000', ra: 314.75, dec: 44.53, description: 'North America Nebula - distinctive continent-shaped emission nebula'},
        {name: 'NGC6992', ra: 312.75, dec: 31.72, description: 'Veil Nebula (Eastern) - stunning supernova remnant'},
        {name: 'NGC2237', ra: 97.97, dec: 5.05, description: 'Rosette Nebula - beautiful flower-shaped emission nebula'},
        {name: 'NGC7293', ra: 337.41, dec: -20.84, description: 'Helix Nebula - largest planetary nebula, the "Eye of God"'},
        {name: 'NGC6543', ra: 269.64, dec: 66.63, description: 'Cat\'s Eye Nebula - complex planetary nebula with intricate structure'},
        {name: 'NGC2070', ra: 84.68, dec: -69.10, description: 'Tarantula Nebula - largest emission nebula known, in the LMC'},
        {name: 'NGC3372', ra: 161.27, dec: -59.87, description: 'Carina Nebula - massive star-forming region with Eta Carinae'},
        {name: 'NGC6888', ra: 303.06, dec: 38.35, description: 'Crescent Nebula - emission nebula shaped by stellar winds'},
        {name: 'NGC1499', ra: 60.21, dec: 36.39, description: 'California Nebula - long emission nebula near Xi Persei'},
        {name: 'NGC6826', ra: 295.37, dec: 50.53, description: 'Blinking Planetary - appears to "blink" when viewed'},
        {name: 'NGC2392', ra: 112.29, dec: 20.91, description: 'Eskimo Nebula - planetary nebula resembling a face in a parka'},
        {name: 'NGC891', ra: 35.64, dec: 42.35, description: 'Edge-on Galaxy - perfect example of an edge-on spiral galaxy'},
      ],
    };
  }

  /**
   * Get nebulae tour.
   * @returns {!Tour} Nebulae tour
   * @private
   */
  getNebulaeTour_() {
    return {
      name: 'Nebulae Tour',
      steps: [
        {name: 'M42', ra: 83.82, dec: -5.39, mag: 4.0, description: 'Orion Nebula - the crown jewel, brightest diffuse nebula in the sky'},
        {name: 'M8', ra: 270.92, dec: -24.38, mag: 6.0, description: 'Lagoon Nebula - stunning emission nebula with newborn stars'},
        {name: 'M20', ra: 270.59, dec: -23.03, mag: 6.3, description: 'Trifid Nebula - emission, reflection, and dark nebula in one'},
        {name: 'M17', ra: 275.20, dec: -16.18, mag: 6.0, description: 'Swan/Omega Nebula - bright nebula resembling a swan'},
        {name: 'M16', ra: 274.70, dec: -13.81, mag: 6.4, description: 'Eagle Nebula - home of the iconic Pillars of Creation'},
        {name: 'NGC7000', ra: 314.75, dec: 44.53, mag: 4.0, description: 'North America Nebula - continent-shaped in Cygnus'},
        {name: 'NGC2237', ra: 97.97, dec: 5.05, mag: 6.0, description: 'Rosette Nebula - flower-shaped around open cluster'},
        {name: 'NGC3372', ra: 161.27, dec: -59.87, mag: 1.0, description: 'Carina Nebula - one of the largest and brightest nebulae'},
        {name: 'M57', ra: 283.40, dec: 33.03, mag: 8.8, description: 'Ring Nebula - perfect smoke-ring, the classic planetary nebula'},
        {name: 'M27', ra: 299.90, dec: 22.72, mag: 7.5, description: 'Dumbbell Nebula - large and bright apple-core shape'},
        {name: 'NGC7293', ra: 337.41, dec: -20.84, mag: 7.6, description: 'Helix Nebula - "Eye of God", nearest bright planetary'},
        {name: 'M1', ra: 83.63, dec: 22.01, mag: 8.4, description: 'Crab Nebula - expanding debris from 1054 AD supernova'},
      ].sort((a, b) => a.mag - b.mag),
    };
  }

  /**
   * Get galaxies tour.
   * @returns {!Tour} Galaxies tour
   * @private
   */
  getGalaxiesTour_() {
    return {
      name: 'Galaxies Tour',
      steps: [
        {name: 'M31', ra: 10.68, dec: 41.27, mag: 3.4, description: 'Andromeda Galaxy - nearest major galaxy at 2.5 million light-years'},
        {name: 'M33', ra: 23.46, dec: 30.66, mag: 5.7, description: 'Triangulum Galaxy - third largest Local Group member, face-on spiral'},
        {name: 'M51', ra: 202.47, dec: 47.20, mag: 8.4, description: 'Whirlpool Galaxy - stunning spiral arms interacting with NGC5195'},
        {name: 'M101', ra: 210.80, dec: 54.35, mag: 7.9, description: 'Pinwheel Galaxy - enormous face-on spiral, twice Milky Way size'},
        {name: 'M104', ra: 189.99, dec: -11.62, mag: 8.0, description: 'Sombrero Galaxy - iconic dust lane and bright bulge'},
        {name: 'M81', ra: 148.89, dec: 69.07, mag: 6.9, description: 'Bode\'s Galaxy - grand design spiral interacting with M82'},
        {name: 'M82', ra: 148.97, dec: 69.68, mag: 8.4, description: 'Cigar Galaxy - starburst with dramatic outflows from M81 interaction'},
        {name: 'M83', ra: 204.25, dec: -29.87, mag: 7.5, description: 'Southern Pinwheel - barred spiral with intense star formation'},
        {name: 'M64', ra: 194.18, dec: 21.68, mag: 8.5, description: 'Black Eye Galaxy - dust band from ancient merger'},
        {name: 'M87', ra: 187.71, dec: 12.39, mag: 8.6, description: 'Virgo A - giant elliptical with famous black hole and jet'},
        {name: 'NGC891', ra: 35.64, dec: 42.35, mag: 9.9, description: 'Silver Sliver - perfect edge-on, Milky Way analog'},
        {name: 'NGC253', ra: 11.89, dec: -25.29, mag: 7.2, description: 'Sculptor Galaxy - bright starburst, nearly edge-on'},
      ].sort((a, b) => a.mag - b.mag),
    };
  }

  /**
   * Get clusters tour.
   * @returns {!Tour} Star clusters tour
   * @private
   */
  getClustersTour_() {
    return {
      name: 'Star Clusters Tour',
      steps: [
        {name: 'M45', ra: 56.87, dec: 24.12, mag: 1.6, description: 'Pleiades - the Seven Sisters, most famous cluster in the sky'},
        {name: 'M7', ra: 268.47, dec: -34.82, mag: 3.3, description: 'Ptolemy Cluster - ancient Greeks saw it naked-eye'},
        {name: 'M44', ra: 130.05, dec: 19.67, mag: 3.7, description: 'Beehive Cluster/Praesepe - swarm of 1,000 stars in Cancer'},
        {name: 'M6', ra: 265.07, dec: -32.22, mag: 4.2, description: 'Butterfly Cluster - star pattern like a butterfly'},
        {name: 'NGC869', ra: 34.75, dec: 57.13, mag: 4.3, description: 'h Persei - half of stunning Double Cluster'},
        {name: 'NGC884', ra: 35.60, dec: 57.15, mag: 4.4, description: 'χ Persei - companion to h Persei, 7,500 light-years'},
        {name: 'M13', ra: 250.42, dec: 36.46, mag: 5.8, description: 'Great Hercules Cluster - northern sky\'s finest globular'},
        {name: 'M22', ra: 279.10, dec: -23.90, mag: 5.1, description: 'One of nearest globulars at 10,000 light-years'},
        {name: 'M5', ra: 229.64, dec: 2.08, mag: 5.7, description: 'One of oldest globulars, 13 billion years'},
        {name: 'M4', ra: 245.90, dec: -26.53, mag: 5.6, description: 'Nearest globular at 7,200 light-years, easy to resolve'},
        {name: 'M3', ra: 205.55, dec: 28.38, mag: 6.2, description: '500,000 stars in a perfect sphere'},
        {name: 'M11', ra: 282.77, dec: -6.27, mag: 6.3, description: 'Wild Duck Cluster - V-formation like flying ducks'},
      ].sort((a, b) => a.mag - b.mag),
    };
  }
}

/**
 * Singleton instance for application-wide tour control.
 * Note: Must be initialized with dependencies before use.
 * @type {?TourController}
 */
export let tourController = null;

/**
 * Initialize the tour controller singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!TourController} Initialized controller
 */
export function initializeTourController(dependencies) {
  tourController = new TourController(dependencies);
  return tourController;
}
