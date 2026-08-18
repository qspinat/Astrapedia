/**
 * @fileoverview Astrapedia - Interactive Celestial Sphere Application.
 *
 * A Three.js-based celestial sphere visualization for learning astronomical
 * coordinates and finding celestial objects.
 *
 * Features:
 * - 3D celestial sphere with real star positions from HYG database
 * - Deep sky objects (NGC/IC/Messier) with type-based coloring
 * - Constellation lines and labels
 * - Real-time sky simulation based on observer location and time
 * - Interactive game mode for learning object identification
 * - Search functionality for stars, DSOs, and constellations
 * - Dynamic star loading from VizieR when zoomed in
 *
 * File Structure:
 * 1. Shared Constants (shaders)
 * 2. Constructor & State Variables
 * 3. Initialization Methods
 * 4. Coordinate System Methods
 * 5. Celestial Object Creation
 * 6. Astronomical Calculations
 * 7. Dynamic Data Loading (VizieR)
 * 8. Rendering & Updates
 * 9. Camera & Interaction
 * 10. Search & Selection
 * 11. Game Mode
 * 12. Time Controls
 * 13. Tours & Education
 * 14. UI Panels
 */

/* ==========================================================================
   ES6 MODULE IMPORTS
   ========================================================================== */

import {
  CONSTELLATION_NAMES,
  getConstellationName as getConstellationNameFromData,
  getConstellationAbbrev as getConstellationAbbrevFromData,
  getConstellationInternalKey,
  getAbbrevFromInternalKey,
  getAvailableLanguages,
} from './modules/data/ConstellationNames.js';
import {ImageRenderer} from './modules/rendering/ImageRenderer.js';
import {GridRenderer} from './modules/rendering/GridRenderer.js';
import {HorizonRenderer} from './modules/rendering/HorizonRenderer.js';
import {ConstellationRenderer} from './modules/rendering/ConstellationRenderer.js';
import {PlanetRenderer} from './modules/rendering/PlanetRenderer.js';
import {StarFieldRenderer} from './modules/rendering/StarFieldRenderer.js';
import {TourHighlight} from './modules/rendering/TourHighlight.js';
import {ExtendedObjectRenderer} from './modules/rendering/ExtendedObjectRenderer.js';
import {TourController} from './modules/features/TourController.js';
import {SearchManager} from './modules/features/SearchManager.js';
import {GameController} from './modules/features/GameController.js';
import {TimeController} from './modules/features/TimeController.js';
import {SelectionManager} from './modules/features/SelectionManager.js';
import {VisibilityCalculator} from './modules/features/VisibilityCalculator.js';
import {panelManager} from './modules/ui/PanelManager.js';
import {eventsCalendar} from './modules/features/EventsCalendar.js';
import {locationManager} from './modules/services/LocationManager.js';
import {CompassController} from './modules/interaction/CompassController.js';
import {DynamicObjectManager} from './modules/rendering/DynamicObjectManager.js';
import {initializeInputController} from './modules/interaction/InputController.js';
import {initializeClickHandler} from './modules/interaction/ClickHandler.js';
import {PowerManager} from './modules/core/PowerManager.js';
import {globalEventBus, Events} from './modules/core/EventBus.js';
import {
  raDecToCartesian,
  cartesianToRaDec,
  calculateLST,
  formatAngle,
} from './modules/core/CoordinateUtils.js';
import {CAMERA, STARS, CONSTELLATIONS} from './modules/core/Constants.js';
import {domCache} from './modules/ui/DOMCache.js';
import {dataLoader} from './modules/services/DataLoader.js';
import {astronomyCalculator} from './modules/core/AstronomyCalculator.js';
import {clamp} from './modules/core/Utils.js';
import {createLogger} from './modules/core/Logger.js';

const logger = createLogger('Astrapedia');

/* ==========================================================================
   2. ASTRAPEDIA APPLICATION CLASS
   ========================================================================== */

/**
 * Main Astrapedia Application class.
 * Manages the 3D celestial sphere visualization, star rendering,
 * user interactions, and astronomical calculations.
 */
export class AstrapediaApp {
  /* ======================================================================
     CONSTRUCTOR & STATE VARIABLES
     ====================================================================== */

  /** Creates a new AstrapediaApp instance. */
  constructor() {
    // Three.js core components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.celestialSphere = null;
    this.starField = null;
    this.constellationLines = null;

    // Module instances (initialized after Three.js setup)
    this.imageRenderer_ = null;
    this.gridRenderer_ = null;
    this.horizonRenderer_ = null;
    this.constellationRenderer_ = null;
    this.planetRenderer_ = null;
    this.starFieldRenderer_ = null;
    this.tourController_ = null;
    this.searchManager_ = null;
    this.gameController_ = null;
    this.timeController_ = null;
    this.selectionManager_ = null;
    this.visibilityCalculator_ = null;
    this.compassController_ = null;
    this.extendedObjectRenderer_ = null;
    this.powerManager_ = null;
    this.inputController_ = null;
    this.clickHandler_ = null;

    // Data
    this.stars = [];
    this.deepSkyObjects = [];
    this.constellations = {};
    this.namedObjects = {};
    this.extendedObjectSprites = [];

    // State
    this.currentMagnitude = STARS.DEFAULT_MAGNITUDE;

    // Observer location is managed by LocationManager singleton
    this.observerLocation = locationManager.getLocation();
    astronomyCalculator.setObserverLocation(
      this.observerLocation.lat,
      this.observerLocation.lon,
      this.observerLocation.height
    );

    this.latitudeTiltGroup = null;
    this.planets = [];
    this.planetSprites = [];
    this.constellationLinesGroup = null;
    this.constellationLinesMode = CONSTELLATIONS.MODE_ALL;
    // Default language from browser locale (e.g., 'fr-FR' -> 'fr')
    // Validate against supported languages, fallback to English
    const browserLang = (navigator.language || 'en').split('-')[0];
    const supportedLangs = getAvailableLanguages();
    this.constellationLanguage = supportedLangs.includes(browserLang)
      ? browserLang
      : 'en';
    this.telescopeModeActive = false;  // Telescope simulation mode blocks zoom
    /**
     * Leaves telescope mode. Assigned by main.js, which owns
     * TelescopeController, alongside the lockZoom/unlockZoom wiring that sets
     * telescopeModeActive.
     * @type {?function(): void}
     */
    this.exitTelescopeMode = null;

    // Time simulation (state managed by TimeController)

    // Search (state managed by SearchManager)

    // Tours and education (tour state managed by TourController)
    this.tourHighlightModule_ = null;  // TourHighlight module instance

    // Camera control (input handled by InputController)
    this.cameraRotation = {theta: CAMERA.DEFAULT_THETA, phi: CAMERA.DEFAULT_PHI};
    this.cameraDistance = CAMERA.INITIAL_DISTANCE;
    this.minDistance = CAMERA.MIN_DISTANCE;
    this.maxDistance = CAMERA.MAX_DISTANCE;

    // Smooth zoom targets
    this.targetFov = null;  // Will be set after camera init
    this.targetTheta = null;
    this.targetPhi = null;
    this.zoomLerpSpeed = CAMERA.ZOOM_LERP_SPEED;

    // Dynamic star/DSO loading (delegated to DynamicObjectManager)
    this.dynamicObjectManager_ = null;

    // UI module instances
    this.gameUI_ = null;

    // === PERFORMANCE OPTIMIZATIONS ===
    // Reusable TextureLoader (avoid creating new instances per image)
    this._textureLoader = null;

    // Cached bound function for animation loop (prevents new function creation each frame)
    this._boundAnimate = this.animate.bind(this);

    // Reusable vectors will be initialized after THREE is confirmed loaded
    this._tempVec3 = null;
    this._tempVec3B = null;
    this._tempMatrix4 = null;
    this._tempMatrix3 = null;

    // Dirty flags to skip unnecessary updates
    this._fovDirty = true;
    this._lastFov = null;
    this._lastCanvasHeight = null;
    this._frameCount = 0;

    // Throttling for expensive operations
    this._lastImageVisUpdate = 0;
    this._lastDynamicCheck = 0;

    // Animation loop state (synced with PowerManager via callbacks)
    this._isAnimating = false;

    // === DEVICE DETECTION ===
    // Detect mobile/touch devices for UX adjustments
    this.isMobile = this.detectMobile_();

    // Initialize
    this.init();
  }

  /**
   * Detect if the device is mobile/touch-based.
   * Uses multiple signals: touch capability, user agent, and screen size.
   * @returns {boolean} True if mobile device detected
   * @private
   */
  detectMobile_() {
    // Check for touch capability
    const hasTouch = 'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0;

    // Check user agent for mobile keywords
    const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
      .test(navigator.userAgent);

    // Check screen size (small screens are likely mobile)
    const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 768;

    // Consider mobile if: (has touch AND mobile UA) OR (has touch AND small screen)
    return (hasTouch && mobileUA) || (hasTouch && smallScreen);
  }

  /**
   * Initialize reusable Three.js objects (called after THREE is loaded)
   */
  initTempObjects() {
    this._tempVec3 = new THREE.Vector3();
    this._tempVec3B = new THREE.Vector3();
    this._tempMatrix4 = new THREE.Matrix4();
    this._tempMatrix4B = new THREE.Matrix4();
    this._tempMatrix3 = new THREE.Matrix3();

    // Initialize reusable TextureLoader
    this._textureLoader = new THREE.TextureLoader();
    this._textureLoader.setCrossOrigin('anonymous');
  }

  /**
   * Initialize the ImageRenderer module.
   * Must be called after celestialSphere, camera, and renderer are ready.
   * @private
   */
  initImageRenderer_() {
    this.imageRenderer_ = new ImageRenderer({
      celestialSphere: this.celestialSphere,
      getDSOs: () => this.deepSkyObjects,
      camera: this.camera,
      renderer: this.renderer,
      isMobile: this.isMobile,
      requestRender: () => this.requestRender(),
    });
  }

  /**
   * Initialize the GridRenderer module.
   * Must be called after celestialSphere is ready.
   * @private
   */
  initGridRenderer_() {
    this.gridRenderer_ = new GridRenderer({
      celestialSphere: this.celestialSphere,
      requestRender: () => this.requestRender(),
    });
  }

  /**
   * Initialize the HorizonRenderer module.
   * Must be called after scene and camera are ready.
   * @private
   */
  initHorizonRenderer_() {
    this.horizonRenderer_ = new HorizonRenderer({
      scene: this.scene,
      camera: this.camera,
      requestRender: () => this.requestRender(),
    });
  }

  /**
   * Initialize the ConstellationRenderer module.
   * Must be called after celestialSphere is ready.
   * @private
   */
  initConstellationRenderer_() {
    this.constellationRenderer_ = new ConstellationRenderer({
      celestialSphere: this.celestialSphere,
      getStars: () => this.stars,
      getConstellations: () => this.constellations,
      requestRender: () => this.requestRender(),
    });
  }

  /**
   * Initialize the PlanetRenderer module.
   * Must be called after celestialSphere is ready.
   * @private
   */
  initPlanetRenderer_() {
    this.planetRenderer_ = new PlanetRenderer({
      celestialSphere: this.celestialSphere,
      getSimulationTime: () => this.timeController_?.getTime() ?? new Date(),
      getObserverLocation: () => this.observerLocation,
      requestRender: () => this.requestRender(),
    });
  }

  /**
   * Initialize the StarFieldRenderer module.
   * Must be called after celestialSphere and data are ready.
   * @private
   */
  initStarFieldRenderer_() {
    this.starFieldRenderer_ = new StarFieldRenderer({
      celestialSphere: this.celestialSphere,
      getStars: () => this.stars,
      getDSOs: () => this.deepSkyObjects,
      requestRender: () => this.requestRender(),
    });
  }

  /**
   * Initialize the TourController module.
   * @private
   */
  initTourController_() {
    this.tourController_ = new TourController({
      navigateToRaDec: (ra, dec) => this.animateCameraTo(ra, dec),
      highlightConstellation: (name) => this.highlightConstellation(name),
      unhighlightConstellation: () => this.unhighlightConstellation(),
      showObjectInfo: (obj) => this.showObjectInfo(obj),
      showConstellationInfo: (abbrev) => this.showConstellationInfo(abbrev),
      getLST: () => calculateLST(
        this.timeController_?.getTime() ?? new Date(),
        this.observerLocation?.lon || 0
      ),
      getLocation: () => this.observerLocation || {lat: 45, lon: 0},
      getPlanets: () => this.planets || [],
      getDeepSkyObjects: () => this.deepSkyObjects || [],
      getStars: () => this.stars || [],
      getFOV: () => this.targetFov || CAMERA.DEFAULT_FOV,
      setFOV: (fov) => { this.targetFov = fov; },
      getConstellationName: (name) => this.getConstellationName(name),
      showHighlight: (ra, dec, size) => this.showTourHighlight(ra, dec, size),
      hideHighlight: () => this.hideTourHighlight(),
      getBestVisibleObjectsTonight: () => this.getBestVisibleObjectsTonight(),
    });
  }

  /**
   * Initialize the SearchManager module.
   * @private
   */
  initSearchManager_() {
    this.searchManager_ = new SearchManager();
    this.searchManager_.setLanguage(this.constellationLanguage);
  }

  /**
   * Initialize the GameController module.
   * @private
   */
  initGameController_() {
    this.gameController_ = new GameController();
    this.gameController_.setData({
      constellations: this.constellations,
      namedObjects: this.namedObjects,
      stars: this.stars,
      deepSkyObjects: this.deepSkyObjects,
    });

    // Set language to match the constellation language setting
    this.gameController_.setLanguage(this.constellationLanguage);

    this.gameController_.setNavigateCallback((ra, dec) => this.animateCameraTo(ra, dec));
    this.gameController_.setHighlightCallbacks(
      (name) => this.highlightConstellation(name),
      () => this.unhighlightConstellation()
    );
    this.gameController_.setTourHighlightCallbacks(
      (ra, dec, size) => this.showTourHighlight(ra, dec, size),
      () => this.hideTourHighlight()
    );
  }

  /**
   * Initialize the TimeController module.
   * @private
   */
  initTimeController_() {
    this.timeController_ = new TimeController({
      // Reposition rather than rebuild. createPlanets() disposes and recreates
      // all nine sprites, which at 1000x speed ran every ~3.6 real seconds and
      // re-fetched every planet photo from the CDN each time.
      updatePlanets: () => this.updatePlanetPositions(),
      rotateCelestialSphere: (angle) => {
        if (this.celestialSphere) {
          this.celestialSphere.rotation.y += angle;
        }
      },
      setCelestialRotation: (angle) => {
        if (this.celestialSphere) {
          this.celestialSphere.rotation.y = angle;
        }
      },
      calculateLST: (time, lon) => calculateLST(time, lon),
      getLongitude: () => this.observerLocation?.lon || 0,
    });
  }

  /**
   * Initialize the SelectionManager module.
   * @private
   */
  initSelectionManager_() {
    this.selectionManager_ = new SelectionManager({
      getConstellationFullName: (name) => this.getConstellationFullName(name),
      fetchBestImage: (name, ra, dec, type, size, forPanel) =>
        this.fetchBestImage(name, ra, dec, type, size, forPanel),
      navigateToRaDec: (ra, dec) => this.animateCameraTo(ra, dec),
      highlightConstellation: (name) => this.highlightConstellation(name),
      unhighlightConstellation: () => this.unhighlightConstellation(),
      showHighlight: (ra, dec, size) => this.showTourHighlight(ra, dec, size),
      hideHighlight: () => this.hideTourHighlight(),
      getImageUrl: (obj) => this.getObjectImageUrl(obj),
      openPanel: (id) => panelManager.open(id),
      closeAllPanels: () => panelManager.closeAll(),
      // Constellation info callbacks
      getConstellationAbbrev: (name) => this.getConstellationAbbrev(name),
      getConstellationName: (abbrev) => this.getConstellationName(abbrev),
      getEnglishConstellationName: (abbrev) => CONSTELLATION_NAMES['en'][abbrev],
      getConstellationLanguage: () => this.constellationLanguage,
      // Image callback
      getSkyViewImageUrl: (ra, dec, type) => this.getSkyViewImageUrl(ra, dec, type),
    });
  }

  /**
   * Initialize the VisibilityCalculator module.
   * @private
   */
  initVisibilityCalculator_() {
    this.visibilityCalculator_ = new VisibilityCalculator({
      getLocation: () => this.observerLocation || {lat: 45, lon: 0},
      getLST: () => {
        const lon = this.observerLocation?.lon || 0;
        return calculateLST(this.timeController_.getTime(), lon);
      },
      getPlanets: () => this.planets || [],
      getDSOs: () => this.deepSkyObjects || [],
      getStars: () => this.stars || [],
    });
  }

  /**
   * Initialize the CompassController module.
   * @private
   */
  initCompassController_() {
    this.compassController_ = new CompassController({
      requestRender: () => this.requestRender(),
      updateCameraPosition: () => {
        // Sync compass values to camera rotation
        if (this.compassController_) {
          this.cameraRotation.theta = this.compassController_.getHeading();
          this.cameraRotation.phi = this.compassController_.getTilt();
          this.targetTheta = this.cameraRotation.theta;
          this.targetPhi = this.cameraRotation.phi;
          this.updateCameraPosition();
        }
      },
    });
  }

  /**
   * Initialize TourHighlight module for tour and search highlights.
   * @private
   */
  initTourHighlight_() {
    this.tourHighlightModule_ = new TourHighlight(this.celestialSphere);
  }

  /**
   * Initialize ExtendedObjectRenderer module for DSOs with angular sizes.
   * @private
   */
  initExtendedObjectRenderer_() {
    this.extendedObjectRenderer_ = new ExtendedObjectRenderer({
      celestialSphere: this.celestialSphere,
      getDSOs: () => this.deepSkyObjects,
      requestRender: () => this.requestRender(),
    });
  }

  /**
   * Initialize PowerManager module for power-saving features.
   * @private
   */
  initPowerManager_() {
    this.powerManager_ = new PowerManager({
      onStartAnimating: () => {
        if (!this._isAnimating) {
          this._isAnimating = true;
          requestAnimationFrame(this._boundAnimate);
        }
      },
      onStopAnimating: () => {
        this._isAnimating = false;
      },
      shouldKeepAnimating: () =>
        this.timeController_.isPlaying() || this.isCameraConverging_(),
    });
    this.powerManager_.initialize();
  }

  /**
   * Initialize DynamicObjectManager for loading stars/DSOs from VizieR.
   * Must be called after celestialSphere and starFieldRenderer are ready.
   * @private
   */
  initDynamicObjectManager_() {
    this.dynamicObjectManager_ = new DynamicObjectManager({
      getCelestialSphere: () => this.celestialSphere,
      getCamera: () => this.camera,
      getStarFieldRenderer: () => this.starFieldRenderer_,
      getExtendedObjectSprites: () => this.extendedObjectSprites,
      addExtendedSprite: (sprite) => {
        this.extendedObjectSprites.push(sprite);
        // Newly loaded halos start at their base size; mark dirty so the next
        // frame scales them for the current field of view.
        this._fovDirty = true;
      },
      removeExtendedSprite: (sprite) => {
        const idx = this.extendedObjectSprites.indexOf(sprite);
        if (idx > -1) this.extendedObjectSprites.splice(idx, 1);
      },
      getMagnitude: () => this.currentMagnitude,
      requestRender: () => this.requestRender(),
    });
  }

  /**
   * Initialize InputController module for mouse/touch input handling.
   * Must be called after renderer and camera are ready.
   * @private
   */
  initInputController_() {
    this.inputController_ = initializeInputController({
      canvas: this.renderer.domElement,
      getFov: () => this.targetFov || this.camera.fov,
      getRotation: () => this.cameraRotation,
      setRotation: (theta, phi) => {
        this.cameraRotation.theta = theta;
        this.cameraRotation.phi = phi;
      },
      setTargetFov: (fov) => {
        this.targetFov = fov;
      },
      setTargetRotation: (theta, phi) => {
        this.targetTheta = theta;
        this.targetPhi = phi;
      },
      updateCamera: () => this.updateCameraPosition(),
      requestRender: () => this.requestRender(),
      getCanvasHeight: () => this.renderer.domElement.clientHeight,
      getAspect: () => this.camera.aspect,
      isZoomLocked: () => this.telescopeModeActive,
      onDragStart: () => {
        // Disable compass mode when user manually drags
        if (this.isCompassModeEnabled()) {
          this.disableCompassMode();
        }
      },
      onDragEnd: () => {
        // Could add inertia handling here if needed
      },
      onClick: (coords) => this.clickHandler_?.handleClick(coords.x, coords.y),
    });
  }

  /**
   * Initialize the ClickHandler module for celestial object selection.
   * Must be called after renderer, camera, and celestial objects are ready.
   * @private
   */
  initClickHandler_() {
    this.clickHandler_ = initializeClickHandler({
      camera: this.camera,
      renderer: this.renderer,
      getCelestialSphere: () => this.celestialSphere,
      getStarField: () => this.starField,
      getPlanetSprites: () => this.planetSprites || [],
      getExtendedObjectSprites: () => this.extendedObjectSprites || [],
      getConstellationLinesGroup: () => this.constellationLinesGroup,
      getDynamicObjectManager: () => this.dynamicObjectManager_,
      isConstellationLinesVisible: () => this.constellationLinesMode !== CONSTELLATIONS.MODE_OFF,
      isGameActive: () => this.isGameActive(),
      checkGameAnswer: (obj) => this.checkGameAnswer(obj),
      checkGameAnswerByName: (name) => this.checkGameAnswerByName(name),
      selectObject: (obj) => this.selectObject(obj),
      showConstellationInfo: (name) => this.showConstellationInfo(name),
      unhighlightConstellation: () => this.unhighlightConstellation(),
      clearSelection: () => this.selectionManager_?.clearSelection(),
      getMagnitudeLimit: () => this.currentMagnitude,
      getConstellationName: (key) => this.getConstellationName(key),
    });
  }

  /**
   * Set up command event listeners for decoupled UI communication.
   * UI components emit command events instead of calling window.app directly.
   * @private
   */
  setupCommandListeners_() {
    // Time commands
    globalEventBus.on(Events.CMD_SET_TIME_SPEED, (data) => {
      this.setTimeSpeed(data?.speed || 0);
    });

    globalEventBus.on(Events.CMD_JUMP_TO_TIME, (data) => {
      if (data?.time) {
        this.jumpToTime(data.time);
      }
    });

    globalEventBus.on(Events.CMD_TOGGLE_PLAYBACK, () => {
      this.timeController_?.togglePlayback();
      // Update UI
      if (domCache.timeSpeedDisplay) {
        domCache.timeSpeedDisplay.textContent = this.timeController_.getSpeedDisplayString();
      }
      // Ensure animation is running when playing
      if (this.timeController_?.isPlaying()) {
        this.startAnimating();
      }
    });

    // Game commands
    globalEventBus.on(Events.CMD_SHOW_GAME_SELECT, () => {
      const modal = domCache.gameSelectModal;
      if (modal) {
        modal.classList.add('visible');
        history.pushState({gameModalOpen: true}, '');
      }
    });

    globalEventBus.on(Events.CMD_START_GAME, () => {
      if (!this.gameController_) return;
      const category = this.gameController_.getCategory() || 'known-constellations';
      this.gameController_.setCategory(category);
      this.gameController_.start();
    });

    globalEventBus.on(Events.CMD_STOP_GAME, () => {
      this.gameController_?.stop();
    });

    globalEventBus.on(Events.CMD_PASS_QUESTION, () => {
      this.gameController_?.passQuestion();
    });

    // Tour commands - delegate directly to TourController
    globalEventBus.on(Events.CMD_START_TOUR, (data) => {
      logger.debug('CMD_START_TOUR received:', data?.tourName);
      if (data?.tourName) {
        this.tourController_.start(data.tourName);
      } else {
        logger.warn('CMD_START_TOUR received with no tourName');
      }
    });

    globalEventBus.on(Events.CMD_NEXT_TOUR_STEP, () => {
      logger.debug('CMD_NEXT_TOUR_STEP received');
      this.tourController_.next();
    });

    globalEventBus.on(Events.CMD_PREV_TOUR_STEP, () => {
      this.tourController_.previous();
    });

    globalEventBus.on(Events.CMD_STOP_TOUR, () => {
      this.tourController_.stop();
    });

    // Listen for location changes to update sky rotation
    globalEventBus.on(Events.LOCATION_CHANGED, (data) => {
      if (data?.location) {
        this.observerLocation = data.location;
        astronomyCalculator.setObserverLocation(
          this.observerLocation.lat,
          this.observerLocation.lon,
          this.observerLocation.height
        );
        // Update all sky elements for new location
        this.updateLatitudeTilt();
        this.timeController_.refreshCelestialRotation();
        this.createPlanets();
        // Update horizon renderer if needed
        this.horizonRenderer_?.updateForLocation?.(this.observerLocation.lat);
        // Request a re-render
        this.requestRender();
        logger.info(`Location updated: ${this.observerLocation.lat.toFixed(2)}°, ${this.observerLocation.lon.toFixed(2)}°`);
      }
    });
  }

  /* ======================================================================
     INITIALIZATION METHODS
     ====================================================================== */

  /**
   * Initialize the application: load data, setup scene, start animation
   */
  async init() {
    const loadingText = document.querySelector('.loading-text');
    const updateStatus = (msg) => {
      logger.info(msg);
      if (loadingText) loadingText.textContent = msg;
    };

    try {
      // Load data
      updateStatus('Loading star data...');
      await this.loadData();

      // Planet positions are calculated using Keplerian orbital mechanics
      // (JPL Horizons API doesn't support CORS for browser requests)

      // Setup Three.js
      updateStatus('Setting up 3D scene...');
      this.setupScene();

      // Initialize reusable objects for performance (must be before setupCamera
      // since updateCameraPosition uses temp vectors)
      this.initTempObjects();

      this.setupCamera();
      this.setupRenderer();
      this.setupLights();

      // Initialize DOM cache for frequently-accessed elements
      domCache.initialize();

      // Create celestial objects
      updateStatus('Creating celestial sphere...');
      this.createCelestialSphere();

      // Initialize StarFieldRenderer module after celestialSphere is ready
      updateStatus('Rendering stars...');
      this.initStarFieldRenderer_();
      this.createStarField();  // Delegated to StarFieldRenderer

      // Initialize GridRenderer module after celestialSphere is ready
      this.initGridRenderer_();
      this.createGrid();  // Delegated to GridRenderer

      // Initialize ConstellationRenderer module after celestialSphere is ready
      updateStatus('Drawing constellations...');
      this.initConstellationRenderer_();
      this.createConstellationLines();  // Delegated to ConstellationRenderer

      // Initialize HorizonRenderer module after scene and camera are ready
      this.initHorizonRenderer_();
      this.createCardinalLabels();  // Delegated to HorizonRenderer
      this.createHorizonLine();  // Delegated to HorizonRenderer

      // Initialize ImageRenderer module after celestialSphere is ready
      this.initImageRenderer_();
      this.createObjectImages();  // Create image sprites for DSOs (delegated to ImageRenderer)

      // Initialize ExtendedObjectRenderer module for DSOs with angular sizes
      this.initExtendedObjectRenderer_();
      this.createExtendedObjects();  // Delegated to ExtendedObjectRenderer

      // Initialize DynamicObjectManager for loading stars/DSOs from VizieR when zoomed in
      this.initDynamicObjectManager_();

      // Initialize PlanetRenderer module after celestialSphere is ready
      this.initPlanetRenderer_();
      this.createPlanets();  // Delegated to PlanetRenderer

      // Initialize TourHighlight module for object selection highlights
      this.initTourHighlight_();

      // Initialize feature modules
      updateStatus('Initializing features...');
      this.initSearchManager_();
      this.initTourController_();
      this.initGameController_();
      this.initTimeController_();
      this.initSelectionManager_();
      this.initVisibilityCalculator_();
      this.initCompassController_();

      // Initialize search index (Feature 5)
      this.buildSearchIndex();

      // Set initial celestial rotation based on current time and location
      this.timeController_.refreshCelestialRotation();

      // Update time display to show current time (instead of "Loading...")
      this.updateSimulationTime(0);

      // Setup command event listeners for decoupled UI communication
      // Must be before requestLocation() so LOCATION_CHANGED events are handled
      this.setupCommandListeners_();

      // Auto-detect location (Feature 4)
      this.requestLocation();

      // Setup event listeners (UI controls only, input handled by InputController)
      this.setupEventListeners();

      // Initialize InputController for mouse/touch handling
      this.initInputController_();

      // Initialize ClickHandler for celestial object selection
      this.initClickHandler_();

      // Initialize PowerManager module for power-saving features
      this.initPowerManager_();

      // Start animation loop
      this.startAnimating();

      // Hide loading screen
      domCache.loading?.classList.add('hidden');

    } catch (error) {
      logger.error('Initialization error:', error);
      const loadingEl = document.getElementById('loading');
      if (loadingEl) {
        loadingEl.innerHTML = `
          <div style="color: #ff6b6b; text-align: center; padding: 20px;">
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <div style="font-size: 18px; margin-bottom: 8px;">Failed to load</div>
            <div style="font-size: 14px; color: #999; max-width: 300px;">
              ${error.message || 'Unknown error'}
            </div>
            <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #3B82F6; color: white; border: none; border-radius: 8px; cursor: pointer;">
              Retry
            </button>
          </div>
        `;
      }
    }
  }

  async loadData() {
    try {
      logger.info('Starting data load...');
      const data = await dataLoader.loadAppData('stars_medium.json');

      this.stars = data.stars;
      this.constellations = data.constellations;
      this.deepSkyObjects = data.deepSkyObjects;
      this.namedObjects = data.namedObjects;

      logger.info(`Loaded ${this.stars.length} stars`);
      logger.info(`Loaded ${Object.keys(this.constellations).length} constellations`);
      logger.info(`Loaded ${this.deepSkyObjects.length} DSOs`);
      logger.info(`Loaded ${Object.keys(this.namedObjects).length} named objects`);
      logger.info('All data loaded successfully!');
    } catch (error) {
      logger.error('Error loading data:', error);
      const loadingText = domCache.get('loading')?.querySelector('.loading-text');
      if (loadingText) loadingText.textContent = 'Error loading data. Check console for details.';
      throw error;
    }
  }

  // TODO: Extract scene setup, camera, and renderer into a SceneManager module
  // to reduce skymap.js size and improve modularity.
  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);  // Pure black night sky
    // Fog removed - was creating dark shadow in center
  }

  /**
   * Computes the FOV for a given camera distance, matching the zoom mapping.
   * @param {number} distance Camera distance in scene units.
   * @return {number} Field of view in degrees.
   * @private
   */
  computeFovForDistance_(distance) {
    const normalizedDistance = Math.log(distance / this.minDistance) /
        Math.log(this.maxDistance / this.minDistance);
    return 5 + normalizedDistance * 115;
  }

  setupCamera() {
    // Calculate initial FOV based on camera distance (using same formula as zoom)
    const initialFov = this.computeFovForDistance_(this.cameraDistance);

    this.camera = new THREE.PerspectiveCamera(
      initialFov,
      window.innerWidth / window.innerHeight,
      0.01,  // Very close near plane - prevent stars from disappearing when zoomed in
      200    // Far plane - just beyond sphere
    );

    // Initialize smooth zoom targets to current values
    this.targetFov = initialFov;
    this.targetTheta = this.cameraRotation.theta;
    this.targetPhi = this.cameraRotation.phi;

    this.updateCameraPosition();
  }

  setupRenderer() {
    const container = domCache.canvasContainer;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);
  }

  setupLights() {
    // Full ambient light - no shadows on stars
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambientLight);
  }

  /* ======================================================================
     CELESTIAL OBJECT CREATION
     Methods for creating visual representations of celestial objects
     ====================================================================== */

  /**
   * Create the celestial sphere container with proper rotation groups
   */
  createCelestialSphere() {
    // Create nested groups for proper Earth rotation simulation:
    // 1. latitudeTiltGroup - tilts the sky based on observer's latitude
    // 2. celestialSphere - rotates for Earth's daily rotation (sidereal time)

    // Outer group: tilts based on latitude
    // At the equator (lat=0), pole is on horizon, so tilt 90°
    // At north pole (lat=90), pole is at zenith, so tilt 0°
    // Formula: tilt = 90° - latitude
    this.latitudeTiltGroup = new THREE.Group();
    this.scene.add(this.latitudeTiltGroup);

    // Inner group: rotates for Earth's rotation
    this.celestialSphere = new THREE.Group();
    this.latitudeTiltGroup.add(this.celestialSphere);

    // Apply initial latitude tilt (default at equator)
    this.updateLatitudeTilt();
  }

  updateLatitudeTilt() {
    // Tilt the sky based on observer's latitude
    // At latitude L, the celestial pole appears at altitude L above the north horizon
    // We tilt around the X axis to achieve this
    const latitude = this.observerLocation?.lat || 0;
    const tiltAngle = THREE.MathUtils.degToRad(90 - latitude);
    this.latitudeTiltGroup.rotation.x = tiltAngle;
  }

  /**
   * Create star field visualization.
   * Delegates to StarFieldRenderer module.
   */
  createStarField() {
    const result = this.starFieldRenderer_.create();
    this.starField = this.starFieldRenderer_.getStarField();
    this.updateVisibleCount(result.starCount + result.dsoCount);
  }

  /**
   * Create coordinate grid and equator line.
   * Delegates to GridRenderer module.
   */
  createGrid() {
    this.gridRenderer_?.create();
  }

  /**
   * Set the visibility of the equator line.
   * Delegates to GridRenderer module.
   * @param {boolean} visible - Whether the equator line should be visible
   */
  setEquatorLineVisible(visible) {
    this.gridRenderer_?.setEquatorVisible(visible);
  }

  /**
   * Set the visibility of the coordinate grid.
   * Delegates to GridRenderer module.
   * @param {boolean} visible - Whether the grid should be visible
   */
  setGridVisible(visible) {
    this.gridRenderer_?.setGridVisible(visible);
  }

  // Feature 1: Constellation Lines
  /**
   * Create constellation lines from star data.
   * Delegates to ConstellationRenderer module.
   */
  createConstellationLines() {
    this.constellationRenderer_.createLines();
    this.constellationLinesGroup = this.constellationRenderer_.getLinesGroup();
    if (this.constellationLinesGroup) {
      this.constellationLinesGroup.visible =
        this.constellationLinesMode !== CONSTELLATIONS.MODE_OFF;
    }
  }

  /**
   * Set constellation lines display mode (off/focus/all).
   * @param {string} mode - One of CONSTELLATIONS.MODE_OFF/MODE_FOCUS/MODE_ALL
   */
  setConstellationLinesMode(mode) {
    this.constellationLinesMode = mode;
    this.constellationRenderer_?.setMode(mode);
    if (!this.constellationLinesGroup) return;

    if (mode === CONSTELLATIONS.MODE_OFF) {
      this.constellationLinesGroup.visible = false;
    } else {
      this.constellationLinesGroup.visible = true;
      if (mode === CONSTELLATIONS.MODE_ALL) {
        this.constellationRenderer_?.resetOpacities();
      }
    }
    this.requestRender();
  }

  /**
   * Get the RA/Dec coordinates of the current view center.
   * @returns {{ra: number, dec: number}} View center in degrees
   */
  getViewCenterRaDec() {
    this.camera.getWorldDirection(this._tempVec3);
    this._tempVec3B.copy(this._tempVec3);
    if (this.celestialSphere) {
      this.celestialSphere.updateMatrixWorld();
      this._tempMatrix4.copy(this.celestialSphere.matrixWorld);
      this._tempMatrix4B.copy(this._tempMatrix4).invert();
      this._tempMatrix3.setFromMatrix4(this._tempMatrix4B);
      this._tempVec3B.applyMatrix3(this._tempMatrix3);
    }
    return cartesianToRaDec(this._tempVec3B.x, this._tempVec3B.y, this._tempVec3B.z);
  }

  // Feature 3: Cardinal Direction Labels
  /**
   * Create cardinal direction labels (N/S/E/W).
   * Delegates to HorizonRenderer module.
   */
  createCardinalLabels() {
    this.horizonRenderer_?.createCardinalLabels();
  }

  /**
   * Update cardinal label sizes based on FOV.
   * Delegates to HorizonRenderer module.
   */
  updateCardinalLabelSizes() {
    this.horizonRenderer_?.updateCardinalLabelSizes();
  }

  /**
   * Create local horizon line.
   * Delegates to HorizonRenderer module.
   */
  createHorizonLine() {
    this.horizonRenderer_?.createHorizon();
  }

  /**
   * Create planet sprites for Sun, Moon, and planets.
   * Delegates to PlanetRenderer module.
   * Note: this.planets and this.planetSprites are kept as references
   * for click handling in ClickHandler module and for other modules.
   */
  createPlanets() {
    this.planetRenderer_.create();
    this.planets = this.planetRenderer_.getPlanets();
    this.planetSprites = this.planetRenderer_.getSprites();
    // Update search index with new planet positions
    this.searchManager_?.updatePlanets(this.planets);
    // Mark FOV dirty to trigger updatePlanetSizes() on next frame
    this._fovDirty = true;
    // Emit event for subscribers (e.g., SkyConditionsHandler)
    globalEventBus.emit(Events.PLANETS_UPDATED, {
      planets: this.planets,
      moon: this.planetRenderer_.getPlanetByName('Moon'),
    });
  }

  /**
   * Update planet positions without recreating sprites.
   * Delegates to PlanetRenderer module.
   */
  updatePlanetPositions() {
    if (!this.planetSprites || this.planetSprites.length === 0) {
      // No sprites yet, need full creation
      this.createPlanets();
      return;
    }

    // Delegate position updates to PlanetRenderer
    this.planetRenderer_?.updatePositions();

    // Update search index
    this.searchManager_?.updatePlanets(this.planets);

    // Emit event for subscribers (e.g., SkyConditionsHandler)
    globalEventBus.emit(Events.PLANETS_UPDATED, {
      planets: this.planets,
      moon: this.planetRenderer_.getPlanetByName('Moon'),
    });
  }

  /**
   * Update planet sizes based on FOV.
   * Delegates to PlanetRenderer module.
   */
  updatePlanetSizes() {
    if (this.planetRenderer_ && this.camera && this.renderer) {
      this.planetRenderer_.updateSizes(this.camera.fov, this.renderer.domElement.height);
    }
  }

  /* ======================================================================
     COORDINATE SYSTEMS
     Conversion between astronomical and 3D coordinate systems
     ====================================================================== */

  /**
   * Update magnitude limit for star visibility.
   * Delegates to StarFieldRenderer module.
   * @param {number} magLimit - New magnitude limit
   */
  setMagnitudeLimit(magLimit) {
    const previousMag = this.currentMagnitude;
    this.currentMagnitude = magLimit;

    // Delegate to StarFieldRenderer for main star field
    this.starFieldRenderer_.setMagnitudeLimit(magLimit);

    // Deep sky object halos follow the same limit, so what is drawn matches
    // what can be clicked.
    this.extendedObjectRenderer_?.setMagnitudeLimit(magLimit);
    // updateSizes skips hidden halos, so anything the new limit reveals still
    // carries the scale it had when it was last visible. Re-run the pass.
    this._fovDirty = true;
    this.updateVisibleCount(this.starFieldRenderer_.getVisibleCount());

    // Update dynamic star field uniform via DynamicObjectManager
    this.dynamicObjectManager_?.setMagnitudeLimit(magLimit);

    // If magnitude increased significantly and zoomed in, trigger new dynamic star query
    if (magLimit > previousMag && this.camera && this.camera.fov < 10) {
      // Debounce to avoid excessive queries while sliding
      clearTimeout(this._magQueryTimeout);
      this._magQueryTimeout = setTimeout(() => {
        this.dynamicObjectManager_?.checkLoading();
      }, 500);
    }

    // Request render to show the change
    this.requestRender();
  }

  updateCameraPosition() {
    const x = this.cameraDistance * Math.sin(this.cameraRotation.phi) * Math.cos(this.cameraRotation.theta);
    const y = this.cameraDistance * Math.cos(this.cameraRotation.phi);
    const z = this.cameraDistance * Math.sin(this.cameraRotation.phi) * Math.sin(this.cameraRotation.theta);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);

    // Update camera info display
    const raDec = this.getViewCenterRaDec();

    if (domCache.raDisplay) domCache.raDisplay.textContent = `${raDec.ra.toFixed(1)}°`;
    if (domCache.decDisplay) domCache.decDisplay.textContent = `${raDec.dec.toFixed(1)}°`;
    if (domCache.fovDisplay) domCache.fovDisplay.textContent = formatAngle(this.camera.fov);
  }

  /**
   * Shortest signed distance from the current theta to the target, taking the
   * 2*PI wraparound into account.
   * @return {number} Difference in radians, in [-PI, PI].
   * @private
   */
  thetaDiffToTarget_() {
    let diff = this.targetTheta - this.cameraRotation.theta;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
  }

  /**
   * Whether the FOV lerp has yet to settle.
   * Uses a proportional threshold so deep zooms (FOV far below 1 degree) still
   * converge rather than stopping at a fixed absolute epsilon.
   * @return {boolean}
   * @private
   */
  isFovConverging_() {
    if (this.targetFov === null) return false;
    const threshold = Math.min(0.001, this.camera.fov * 0.001);
    return Math.abs(this.targetFov - this.camera.fov) > threshold;
  }

  /**
   * Whether the camera rotation lerp has yet to settle.
   * @return {boolean}
   * @private
   */
  isRotationConverging_() {
    return Math.abs(this.thetaDiffToTarget_()) > 0.0001 ||
           Math.abs(this.targetPhi - this.cameraRotation.phi) > 0.0001;
  }

  /**
   * Whether the camera is still animating toward a target.
   *
   * PowerManager consults this to decide whether it may stop the render loop
   * when the user goes idle. It shares its thresholds with updateSmoothZoom so
   * the two cannot disagree — if the gate were laxer than the lerp, the loop
   * would stop mid-animation and freeze the camera partway; if it were
   * stricter, the loop would never idle and drain the battery.
   * @return {boolean}
   * @private
   */
  isCameraConverging_() {
    if (this.targetFov === null) return false;
    return this.isFovConverging_() || this.isRotationConverging_();
  }

  updateSmoothZoom() {
    if (this.targetFov === null) return false;

    let changed = false;

    // Smoothly interpolate FOV
    if (this.isFovConverging_()) {
      this.camera.fov += (this.targetFov - this.camera.fov) * this.zoomLerpSpeed;
      this.camera.updateProjectionMatrix();
      changed = true;

      // Update grid density based on new FOV
      this.gridRenderer_?.updateForFov(this.camera.fov);
    }

    // Smoothly interpolate rotation
    if (this.isRotationConverging_()) {
      this.cameraRotation.theta += this.thetaDiffToTarget_() * this.zoomLerpSpeed;
      this.cameraRotation.phi +=
          (this.targetPhi - this.cameraRotation.phi) * this.zoomLerpSpeed;

      // Clamp phi
      this.cameraRotation.phi = clamp(this.cameraRotation.phi, 0.1, Math.PI - 0.1);

      this.updateCameraPosition();
      changed = true;
    }

    return changed;
  }

  updateVisibleCount(count) {
    if (domCache.visibleCount) {
      domCache.visibleCount.textContent = count;
    }
  }

  // Feature 4: Location Services

  /**
   * Check and request location permission on startup.
   * Delegates to LocationManager module. Location changes are handled via
   * LOCATION_CHANGED EventBus listener in setupCommandListeners_().
   */
  async requestLocation() {
    locationManager.requestLocationOnStartup();
  }

  /**
   * Request geolocation from the device.
   * Called by UIController when user clicks location button.
   * Delegates to LocationManager module. Location changes are handled via
   * LOCATION_CHANGED EventBus listener in setupCommandListeners_().
   */
  requestGeolocation() {
    locationManager.requestGeolocationInteractive();
  }

  /* ======================================================================
     SEARCH & SELECTION
     Object search functionality and navigation
     ====================================================================== */

  /**
   * Build the search index from all loaded celestial objects
   */
  buildSearchIndex() {
    if (this.searchManager_) {
      this.searchManager_.buildIndex({
        stars: this.stars,
        deepSkyObjects: this.deepSkyObjects,
        constellations: this.constellations,
        namedObjects: this.namedObjects,
        planets: this.planets,
      });
    }
  }

  /**
   * Perform a search query.
   * @param {string} query - Search query
   * @returns {!Array} Search results
   */
  performSearch(query) {
    if (this.searchManager_) {
      return this.searchManager_.search(query);
    }
    return [];
  }

  // Feature 6: Object Information Panel
  selectObject(obj) {
    // Delegate fully to SelectionManager
    this.selectionManager_.selectObject(obj);
  }

  showObjectInfo(obj) {
    // Fully delegated to SelectionManager (handles extra info, image loading, description)
    this.selectionManager_.showObjectInfo_(obj);
  }

  /**
   * Get constellation name in current language.
   * @param {string} abbrev - IAU constellation abbreviation
   * @returns {string} Translated constellation name
   */
  getConstellationName(abbrev) {
    return getConstellationNameFromData(abbrev, this.constellationLanguage);
  }

  /**
   * Set constellation display language
   */
  setConstellationLanguage(lang) {
    this.constellationLanguage = lang;
    logger.info(`Constellation language set to: ${lang}`);

    // Update search filter to show only relevant language results
    this.searchManager_?.setLanguage(lang);

    // Update game controller language so game questions use the selected language
    this.gameController_?.setLanguage(lang);

    // Refresh tour panel if a constellation tour is active
    const currentTour = this.tourController_.getCurrentTour();
    if (currentTour && currentTour.type === 'constellation') {
      const tourPanel = domCache.tourPanel;
      if (tourPanel && tourPanel.style.display !== 'none') {
        const stepIndex = this.tourController_.getCurrentStep();
        const step = currentTour.steps[stepIndex];
        if (step) {
          // Emit event to trigger TourUI to rebuild panel with new language
          globalEventBus.emit(Events.TOUR_STEP_CHANGED, {
            tour: currentTour,
            step,
            stepIndex,
            totalSteps: currentTour.steps.length,
          });
        }
      }
    }
  }

  /**
   * Get full constellation name from abbreviation (for line highlighting).
   * Maps "Ori" -> "Orion", "UMa" -> "UrsaMajor", etc.
   * Delegates to ConstellationNames module.
   * @param {string} abbrevOrName - IAU abbreviation or existing key
   * @returns {string} Internal key for constellation data
   */
  getConstellationFullName(abbrevOrName) {
    // If it already matches a constellation key, return as-is
    if (this.constellations && this.constellations[abbrevOrName]) {
      return abbrevOrName;
    }
    return getConstellationInternalKey(abbrevOrName);
  }

  /**
   * Get constellation abbreviation from full name.
   * Maps "Orion" -> "Ori", "UrsaMajor" -> "UMa", etc.
   * Delegates to ConstellationNames module.
   * @param {string} fullNameOrAbbrev - Full name or existing abbreviation
   * @returns {string} IAU abbreviation
   */
  getConstellationAbbrev(fullNameOrAbbrev) {
    // If it's already an abbreviation (3 letters or less), return as-is
    if (fullNameOrAbbrev.length <= 3) {
      return fullNameOrAbbrev;
    }
    // Try internal key reverse lookup first, then fall back to data module
    const fromInternalKey = getAbbrevFromInternalKey(fullNameOrAbbrev);
    if (fromInternalKey !== fullNameOrAbbrev) {
      return fromInternalKey;
    }
    return getConstellationAbbrevFromData(fullNameOrAbbrev, this.constellationLanguage) || fullNameOrAbbrev;
  }

  showConstellationInfo(constName) {
    // Fully delegated to SelectionManager (handles highlighting, description fetch, and panel)
    this.selectionManager_.showConstellationInfo_(constName);
  }

  getSkyViewImageUrl(ra, dec, type, angularSizeArcmin = null) {
    return this.imageRenderer_.getSkyViewImageUrl(ra, dec, type, angularSizeArcmin);
  }

  getObjectImageUrl(obj) {
    return this.imageRenderer_.getObjectImageUrl(obj);
  }

  animateCameraTo(ra, dec) {
    // Stop any ongoing inertia so it doesn't fight the animation
    this.inputController_?.stopInertia();

    // Get the object position in celestial (local) coordinates
    const localPos = raDecToCartesian(ra, dec, 100);

    // Transform to world coordinates using celestialSphere's world matrix
    const worldPos = localPos.clone();
    if (this.celestialSphere) {
      this.celestialSphere.updateMatrixWorld();
      worldPos.applyMatrix4(this.celestialSphere.matrixWorld);
    }

    // Direction from origin to object in world coordinates
    const dir = worldPos.clone().normalize();

    // Camera is at position P looking at origin
    // View direction = -P, we want view direction = dir
    // So P = -dir * cameraDistance
    //
    // Camera position formula: P = (sin(phi)*cos(theta), cos(phi), sin(phi)*sin(theta)) * distance
    // We need P = -dir * distance
    // So: sin(phi)*cos(theta) = -dir.x
    //     cos(phi) = -dir.y
    //     sin(phi)*sin(theta) = -dir.z

    const targetPhi = Math.acos(clamp(-dir.y, -1, 1));
    const targetTheta = Math.atan2(-dir.z, -dir.x);

    // Use smooth animation via the existing target system
    this.targetTheta = targetTheta;
    this.targetPhi = targetPhi;

    // Also zoom in a bit if we're zoomed out too far
    if (this.camera.fov > 30) {
      this.targetFov = 30;
    }

    // Wake up animation loop to perform the camera movement
    this.requestRender();
  }

  // Feature 7: Time Machine Controls
  updateSimulationTime(deltaMs) {
    // Delegate time updates to TimeController
    if (deltaMs > 0) {
      this.timeController_.update(deltaMs);
    }

    // Update UI using cached DOM reference
    const displayTime = this.timeController_.getTime();
    if (domCache.timeDisplay) {
      domCache.timeDisplay.textContent = displayTime.toLocaleString();
    }
  }

  /* ======================================================================
     TIME CONTROLS
     Time simulation and playback controls
     ====================================================================== */

  /**
   * Set the time simulation speed
   * @param {number} speed - Multiplier for time (0=paused, 1=realtime, etc.)
   */
  setTimeSpeed(speed) {
    // Delegate to TimeController
    this.timeController_.setSpeed(speed);
    // Update UI using TimeController's display string
    if (domCache.timeSpeedDisplay) {
      domCache.timeSpeedDisplay.textContent = this.timeController_.getSpeedDisplayString();
    }
    // Ensure animation is running when speed is set
    if (speed !== 0 && this.timeController_.isPlaying()) {
      this.startAnimating();
    }
  }

  jumpToTime(date) {
    // Delegate to TimeController (handles celestial rotation and planet updates)
    this.timeController_.jumpToTime(date);

    // Update UI
    this.updateSimulationTime(0);

    // Re-navigate to selected object if any (so it stays centered after rotation)
    const selectedObj = this.selectionManager_?.getSelectedObject();
    if (selectedObj) {
      this.animateCameraTo(selectedObj.ra, selectedObj.dec);
    }

    // Wake up rendering
    this.requestRender();
  }

  /**
   * Get the current simulated time.
   *
   * Public because main.js wires it into the UI dependency graph; TimeUI uses
   * it to prefill the date and time pickers, which must open showing where the
   * user has travelled to rather than the wall clock.
   *
   * @returns {!Date} The simulated time.
   */
  getSimulationTime() {
    return this.timeController_?.getTime() ?? new Date();
  }

  /* ======================================================================
     TOURS & EDUCATION
     Guided tours and constellation stories
     ====================================================================== */

  /**
   * Get available tours.
   * @returns {!Object<string, !Object>} Available tours
   */
  getAvailableTours() {
    return this.tourController_.getAvailableTours();
  }

  /**
   * Get description for a planet.
   * @param {string} planetName - Planet name
   * @returns {string} Description
   */
  getPlanetDescription(planetName) {
    return this.tourController_.getPlanetDescription(planetName);
  }

  /**
   * Calculate if an object at given RA/Dec is above the horizon.
   * Delegates to AstronomyCalculator module.
   * @param {number} ra - Right Ascension in degrees
   * @param {number} dec - Declination in degrees
   * @returns {number} Altitude in degrees (positive = above horizon)
   */
  calculateAltitude(ra, dec) {
    const simTime = this.timeController_.getTime();
    return astronomyCalculator.calculateAltitude(ra, dec, simTime);
  }

  /**
   * Get the best visible deep sky objects for tonight, sorted by magnitude.
   * Delegates to VisibilityCalculator module and enhances with custom descriptions.
   */
  getBestVisibleObjectsTonight() {
    const results = this.visibilityCalculator_.getBestVisibleObjectsTonight(15, 10, 50);
    // The calculator labels deep sky objects; planets need an app-level
    // description, which is the only thing left to add here.
    return results.map((obj) => obj.type !== 'Planet' ? obj : {
      ...obj,
      description: `${this.getPlanetDescription(obj.name)} - ` +
        `Currently ${obj.altitude.toFixed(0)}° above horizon`,
    });
  }

  /**
   * Show a pulsing highlight ring around the current tour object.
   * Delegates to TourHighlight module.
   * @param {number} ra - Right ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {number=} angularSizeArcmin - Object's angular size in arcminutes
   */
  showTourHighlight(ra, dec, angularSizeArcmin = 10) {
    logger.debug('showTourHighlight called, module exists:', !!this.tourHighlightModule_);
    this.tourHighlightModule_?.show(ra, dec, angularSizeArcmin);
  }

  /**
   * Hide the tour highlight.
   * Delegates to TourHighlight module.
   */
  hideTourHighlight() {
    this.tourHighlightModule_?.hide();
  }

  /**
   * Update tour highlight animation.
   * Delegates to TourHighlight module.
   * Called from animate loop.
   */
  updateTourHighlight() {
    if (this.tourHighlightModule_ && this.tourHighlightModule_.isActive()) {
      this.tourHighlightModule_.update(this.camera.fov, this.renderer.domElement.height);
    }
  }

  /**
   * Show events calendar panel.
   * Delegates to EventsCalendar module.
   */
  showEventsCalendar() {
    eventsCalendar.showEventsCalendar();
  }

  /* ======================================================================
     CAMERA & INTERACTION
     Mouse, touch, and keyboard event handling
     ====================================================================== */

  /**
   * Set up UI event listeners (input handled by InputController).
   * Note: Most UI handlers are in UIController module. This method only sets up
   * handlers that need direct access to skymap internals.
   */
  setupEventListeners() {
    // The start-game button is bound by GameUI, which routes through
    // CMD_SHOW_GAME_SELECT so the modal is opened together with its history
    // entry. A second listener here would open it without one, leaving the
    // popstate handler below to consume a real history entry instead — on
    // Android that navigates the WebView out of the app.

    // Game selection modal buttons and events
    const gameModal = domCache.gameSelectModal;
    if (gameModal) {
      const gameSelectBtns = gameModal.querySelectorAll('.game-select-btn');
      gameSelectBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const category = btn.getAttribute('data-category');
          if (category && this.gameController_) {
            this.gameController_.setCategory(category);
            gameModal.classList.remove('visible');
            this.gameController_.start();
          }
        });
      });

      // Game selection cancel button
      const gameSelectCancel = gameModal.querySelector('#game-select-cancel');
      if (gameSelectCancel) {
        gameSelectCancel.addEventListener('click', () => {
          gameModal.classList.remove('visible');
        });
      }

      // Close modal when clicking backdrop
      gameModal.addEventListener('click', (e) => {
        if (e.target === gameModal) {
          gameModal.classList.remove('visible');
        }
      });

      // Handle back button for game modal
      window.addEventListener('popstate', (e) => {
        if (gameModal.classList.contains('visible')) {
          gameModal.classList.remove('visible');
        }
      });
    }

    // Window resize
    window.addEventListener('resize', this.onWindowResize.bind(this));

    // Note: GameUI is initialized by UIController in main.js
    // Note: Magnitude slider, dynamic stars slider, location button, reset view,
    // and constellation toggle are handled by UIController module
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Sprite sizes are derived from the canvas height, so a resize needs the
    // same recalculation a zoom does.
    this._fovDirty = true;
    this.requestRender();
  }

  setObserverLocation() {
    // Cancelling either prompt aborts; note the explicit null checks — the
    // previous `if (lat && lon)` also rejected "0", so nobody on the equator
    // or the prime meridian could set their location.
    const lat = prompt('Enter latitude (degrees, -90 to 90):', '48.8566');
    if (lat === null) return;
    const lon = prompt('Enter longitude (degrees, -180 to 180):', '2.3522');
    if (lon === null) return;

    const latValue = parseFloat(lat);
    const lonValue = parseFloat(lon);
    if (!Number.isFinite(latValue) || !Number.isFinite(lonValue)) {
      alert('Please enter numeric coordinates, for example 48.8566 and 2.3522.');
      return;
    }

    // LocationManager is the owner: it clamps latitude, normalizes longitude,
    // persists to localStorage and emits LOCATION_CHANGED. The handler in
    // setupCommandListeners_ then applies it to the scene — including the
    // horizon renderer and a re-render, which this method used to omit.
    locationManager.setLocation(latValue, lonValue);

    const applied = locationManager.getLocation();
    alert(`Observer location set to: ${applied.lat}°, ${applied.lon}°\n` +
        'Sky now shows correct position for your location and time.');
  }

  /* ======================================================================
     COMPASS MODE - DELEGATED TO CompassController
     ====================================================================== */

  /**
   * Toggle compass mode on/off.
   * Delegates to CompassController module.
   */
  async toggleCompassMode() {
    if (this.compassController_) {
      await this.compassController_.toggle();
    }
  }

  /**
   * Enable compass mode with device orientation.
   * Delegates to CompassController module.
   */
  async enableCompassMode() {
    if (this.compassController_) {
      await this.compassController_.enable();
    }
  }

  /**
   * Disable compass mode and return to manual control.
   * Delegates to CompassController module.
   */
  disableCompassMode() {
    if (this.compassController_) {
      this.compassController_.disable();
    }
  }

  /**
   * Check if compass mode is currently enabled.
   * @returns {boolean} True if compass mode is active
   */
  isCompassModeEnabled() {
    return this.compassController_?.isEnabled() || false;
  }

  /* ======================================================================
     GAME MODE
     Interactive object identification game
     ====================================================================== */

  /**
   * Check if game is currently active.
   * @returns {boolean} True if game is active
   */
  isGameActive() {
    return this.gameController_?.isActive() || false;
  }

  /**
   * Check game answer by clicked star coordinates.
   * Delegates to GameController module.
   * @param {Object} clickedStar - Object with ra and dec properties
   */
  checkGameAnswer(clickedStar) {
    if (!this.gameController_) return;
    this.gameController_.checkAnswer(clickedStar.ra, clickedStar.dec);
  }

  /**
   * Check game answer by name (for constellation line clicks).
   * Delegates to GameController module.
   * @param {string} clickedName - The name of the clicked constellation
   */
  checkGameAnswerByName(clickedName) {
    if (!this.gameController_) return;
    this.gameController_.checkAnswerByName(clickedName);
  }

  /**
   * Highlight a specific constellation by name.
   * Delegates to ConstellationRenderer module.
   * @param {string} constellationName - Name of the constellation to highlight
   */
  highlightConstellation(constellationName) {
    // Normalize spaced/display names (e.g. "Ursa Major") to the internal
    // CamelCase key the renderer matches on. An existing key passes through
    // unchanged, so this is safe for the already-normalized click path.
    const key = this.getConstellationFullName(constellationName);
    this.constellationRenderer_?.highlight(key);
  }

  /**
   * Remove constellation highlighting.
   * Delegates to ConstellationRenderer module.
   */
  unhighlightConstellation() {
    this.constellationRenderer_?.unhighlight();
  }

  resetView() {
    // Telescope mode locks zoom (InputController.isZoomLocked), so resetting
    // the FOV underneath it would leave the user at ~106 degrees with the
    // reticle still up, the magnitude slider still disabled, and no way to
    // zoom back in. Leave the telescope first — "reset view" plainly means
    // "give me the default sky back".
    if (this.telescopeModeActive) {
      this.exitTelescopeMode?.();
    }

    this.cameraRotation = {theta: CAMERA.DEFAULT_THETA, phi: CAMERA.DEFAULT_PHI};
    this.cameraDistance = CAMERA.INITIAL_DISTANCE;
    // Sync smooth-zoom targets and FOV so updateSmoothZoom() converges to the
    // reset state instead of lerping the camera back to the pre-reset view.
    this.targetTheta = CAMERA.DEFAULT_THETA;
    this.targetPhi = CAMERA.DEFAULT_PHI;
    this.targetFov = this.computeFovForDistance_(this.cameraDistance);
    this.camera.fov = this.targetFov;
    this.camera.updateProjectionMatrix();
    this.updateCameraPosition();
    this.requestRender();
  }

  /* ======================================================================
     POWER SAVING
     Optimizations to reduce battery usage on mobile devices
     ====================================================================== */

  /**
   * Request a render - call this when something changes.
   * Delegated to PowerManager module.
   */
  requestRender() {
    if (this.powerManager_) {
      this.powerManager_.requestRender();
    } else {
      // Fallback for early initialization - ensure animation is running
      this.startAnimating();
    }
  }

  /**
   * Start the animation loop.
   * Delegated to PowerManager module.
   */
  startAnimating() {
    if (this.powerManager_) {
      this.powerManager_.startAnimating();
    } else {
      // Fallback for early initialization
      if (!this._isAnimating) {
        this._isAnimating = true;
        requestAnimationFrame(this._boundAnimate);
      }
    }
  }

  /**
   * Stop the animation loop (power saving).
   * Delegated to PowerManager module.
   */
  stopAnimating() {
    if (this.powerManager_) {
      this.powerManager_.stopAnimating();
    } else {
      this._isAnimating = false;
    }
  }

  /* ======================================================================
     RENDERING & UPDATES
     Animation loop and visual updates
     ====================================================================== */

  // TODO: Extract animation loop into a RenderLoop module
  // to decouple frame scheduling from application logic.
  /**
   * Main animation loop - called every frame
   * Optimized to skip unnecessary updates using dirty flags and throttling
   */
  animate() {
    // Only continue animation if enabled (power saving)
    if (!this._isAnimating) return;

    requestAnimationFrame(this._boundAnimate);

    this._frameCount++;
    const now = performance.now();

    // Feature 7: Update time simulation if playing (delegate to TimeController)
    if (this.timeController_.isPlaying()) {
      const deltaMs = now - (this._lastFrameTime || now);
      this._lastFrameTime = now;
      this.updateSimulationTime(deltaMs);
    } else {
      this._lastFrameTime = now;
    }

    // Smooth zoom interpolation
    const zoomChanged = this.updateSmoothZoom();

    // Check if FOV changed (for dirty flag)
    const fovChanged = this._lastFov !== this.camera.fov;
    if (fovChanged) {
      this._lastFov = this.camera.fov;
      this._fovDirty = true;
      // Update FOV display immediately when it changes (using cached DOM ref)
      if (domCache.fovDisplay) {
        domCache.fovDisplay.textContent = formatAngle(this.camera.fov);
      }
    }

    // Update visibility functions only when needed or throttled
    // Image visibility - throttled to every 500ms (reduced from 100ms to avoid excessive loading)
    if (this._fovDirty || (now - this._lastImageVisUpdate > 500)) {
      this.updateImageVisibility();
      this._lastImageVisUpdate = now;
    }

    // Extended objects - only when something they depend on changed.
    // updateSizes reads the field of view and the canvas height and nothing
    // else, so the old 10Hz timer recomputed an identical result over every
    // halo ten times a second: ~17,000 wasted iterations per second for the
    // bundled catalog, and four times that once dynamic objects load.
    if (this._fovDirty) {
      this.updateExtendedObjectSizes();
    }

    // Planet sizes - only when FOV changes
    if (this._fovDirty) {
      this.updatePlanetSizes();
      this.updateCardinalLabelSizes();
    }

    // Clear FOV dirty flag
    this._fovDirty = false;

    // Dynamic star loading - throttled to every 500ms to reduce API calls
    if (now - this._lastDynamicCheck > 1000) {
      this.dynamicObjectManager_?.checkLoading();
      this.dynamicObjectManager_?.checkCleanup();
      this._lastDynamicCheck = now;
    }

    // Update tour highlight animation (cheap, runs every frame when active)
    if (this.tourHighlightModule_?.isActive()) {
      this.updateTourHighlight();
    }

    // Constellation focus mode - fade nearest constellation
    if (this.constellationLinesMode === CONSTELLATIONS.MODE_FOCUS) {
      const viewCenter = this.getViewCenterRaDec();
      const stillFading = this.constellationRenderer_?.updateFocusMode(
        viewCenter.ra, viewCenter.dec
      );
      if (stillFading) {
        this.requestRender();
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Create image sprites for deep sky objects.
   * Delegates to ImageRenderer module.
   */
  createObjectImages() {
    this.imageRenderer_?.create();
  }

  /**
   * Unified image fetching from multiple astronomical sources.
   * Delegates to ImageRenderer module.
   * @param {string} objectName - Object identifier (e.g., "M42", "NGC2024")
   * @param {number} ra - Right ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {string} type - Object type for field sizing
   * @param {number} angularSizeArcmin - Angular size in arcminutes
   * @param {boolean} forPanel - Whether this is for panel display (enables DSS for stars)
   * @returns {Promise<{url: string, source: string, tier: string}|null>}
   */
  async fetchBestImage(objectName, ra, dec, type, angularSizeArcmin = null, forPanel = false) {
    this.imageRenderer_.setFetchingForPanel(forPanel);
    return this.imageRenderer_.fetchBestImage(objectName, ra, dec, type, angularSizeArcmin);
  }

  /**
   * Create extended objects with real angular sizes.
   * Delegated to ExtendedObjectRenderer module.
   * Note: this.extendedObjectSprites is kept as reference for click handling
   * in ClickHandler module and for dynamic DSO management.
   */
  createExtendedObjects() {
    const count = this.extendedObjectRenderer_.create();
    this.extendedObjectSprites = this.extendedObjectRenderer_.getSprites();
  }

  /**
   * Update visibility of extended objects based on current FOV.
   * Delegated to ExtendedObjectRenderer module.
   */
  updateExtendedObjectSizes() {
    const fov = this.camera.fov;
    const canvasHeight = this.renderer.domElement.height;
    this.extendedObjectRenderer_.updateSizes(fov, canvasHeight);
  }

  /**
   * Update visibility of object images based on zoom level.
   * Delegates to ImageRenderer module.
   */
  updateImageVisibility() {
    this.imageRenderer_?.updateVisibility();
  }

}
