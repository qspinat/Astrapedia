/**
 * @fileoverview Interactive Sky Map Application.
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
import {initializeGameUI} from './modules/features/GameUI.js';
import {TimeController} from './modules/features/TimeController.js';
import {SelectionManager} from './modules/features/SelectionManager.js';
import {VisibilityCalculator} from './modules/features/VisibilityCalculator.js';
import {eventsCalendar} from './modules/features/EventsCalendar.js';
import {locationManager} from './modules/services/LocationManager.js';
import {CompassController} from './modules/interaction/CompassController.js';
import {DynamicObjectManager} from './modules/rendering/DynamicObjectManager.js';
import {initializeInputController} from './modules/interaction/InputController.js';
import {PowerManager} from './modules/core/PowerManager.js';
import {globalEventBus, Events} from './modules/core/EventBus.js';
import {
  raDecToCartesian,
  cartesianToRaDec,
  calculateLST,
  formatAngle,
} from './modules/core/CoordinateUtils.js';
import {getDsoTypeName} from './modules/core/TypeMappings.js';
import {SHADERS, CAMERA, SPHERE, DYNAMIC_DATA} from './modules/core/Constants.js';
import {domCache} from './modules/ui/DOMCache.js';
import {dataLoader} from './modules/services/DataLoader.js';
import {astronomyCalculator} from './modules/core/AstronomyCalculator.js';
import {clamp} from './modules/core/Utils.js';
import {magnitudeToSize} from './modules/core/MagnitudeUtils.js';

/* ==========================================================================
   2. SKYMAP APPLICATION CLASS
   ========================================================================== */

/**
 * Main Sky Map Application class.
 * Manages the 3D celestial sphere visualization, star rendering,
 * user interactions, and astronomical calculations.
 */
export class SkyMapApp {
  /* ======================================================================
     CONSTRUCTOR & STATE VARIABLES
     ====================================================================== */

  /** Creates a new SkyMapApp instance. */
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

    // Data
    this.stars = [];
    this.deepSkyObjects = [];
    this.constellations = {};
    this.namedObjects = {};
    this.extendedObjectSprites = [];

    // State
    this.currentMagnitude = 8.0;
    this.currentLevel = 3;

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
    this.showConstellationLines = true;
    this.constellationLanguage = 'en';  // Default to English
    this.forceNightMode = true;  // Force night mode by default
    this.telescopeModeActive = false;  // Telescope simulation mode blocks zoom

    // Time simulation (state managed by TimeController)

    // Search (selection state managed by SelectionManager)
    this.searchIndex = [];

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
    this._lastExtendedObjUpdate = 0;
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
      getFOV: () => this.targetFov || 60,
      setFOV: (fov) => { this.targetFov = fov; },
      getConstellationName: (name) => this.getConstellationName(name),
    });
    this.tourController_.setSceneCallbacks(
      (obj) => this.celestialSphere.add(obj),
      (obj) => this.celestialSphere.remove(obj)
    );
  }

  /**
   * Initialize the SearchManager module.
   * @private
   */
  initSearchManager_() {
    this.searchManager_ = new SearchManager();
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
      dsos: this.deepSkyObjects,
    });
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
      updatePlanets: () => this.createPlanets(),
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
      openPanel: (id) => window.openPanel?.(id),
      closeAllPanels: () => window.closeAllPanels?.(),
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
      shouldKeepAnimating: () => this.timeController_.isPlaying() || !!this._targetFov,
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
      addExtendedSprite: (sprite) => this.extendedObjectSprites.push(sprite),
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
      onClick: (coords) => this.handleClick_(coords.x, coords.y),
    });
  }

  /**
   * Set up command event listeners for decoupled UI communication.
   * UI components emit command events instead of calling window.app directly.
   * @private
   */
  setupCommandListeners_() {
    // Selection commands
    globalEventBus.on(Events.CMD_SELECT_OBJECT, (data) => {
      this.selectObject(data?.object || null);
    });

    // Search commands
    globalEventBus.on(Events.CMD_SEARCH, (data) => {
      const results = this.performSearch(data?.query || '');
      globalEventBus.emit(Events.SEARCH_RESULTS, {results});
    });

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
      this.timeController_.togglePlayback();
      // Update UI
      if (domCache.timeSpeedDisplay) {
        domCache.timeSpeedDisplay.textContent = this.timeController_.getSpeedDisplayString();
      }
    });

    // Settings commands
    globalEventBus.on(Events.CMD_SET_MAGNITUDE, (data) => {
      if (typeof data?.magnitude === 'number') {
        this.setMagnitudeLimit(data.magnitude);
      }
    });

    globalEventBus.on(Events.CMD_SET_LANGUAGE, (data) => {
      if (data?.language) {
        this.setConstellationLanguage(data.language);
      }
    });

    globalEventBus.on(Events.CMD_SET_CONSTELLATION_LINES, (data) => {
      if (this.constellationLinesGroup) {
        this.showConstellationLines = !!data?.visible;
        this.constellationLinesGroup.visible = this.showConstellationLines;
        this.requestRender();
      }
    });

    // Camera commands
    globalEventBus.on(Events.CMD_RESET_CAMERA, () => {
      this.resetView();
    });

    globalEventBus.on(Events.CMD_TOGGLE_COMPASS, () => {
      this.toggleCompassMode();
    });

    globalEventBus.on(Events.CMD_REQUEST_RENDER, () => {
      this.requestRender();
    });

    // Game commands
    globalEventBus.on(Events.CMD_START_GAME, () => {
      this.startGame();
    });

    globalEventBus.on(Events.CMD_STOP_GAME, () => {
      this.stopGame();
    });

    globalEventBus.on(Events.CMD_PASS_QUESTION, () => {
      this.passQuestion();
    });

    // Tour commands
    globalEventBus.on(Events.CMD_START_TOUR, (data) => {
      if (data?.tourName) {
        this.startTour(data.tourName);
      }
    });

    globalEventBus.on(Events.CMD_NEXT_TOUR_STEP, () => {
      this.nextTourStep();
    });

    globalEventBus.on(Events.CMD_PREV_TOUR_STEP, () => {
      this.previousTourStep();
    });

    globalEventBus.on(Events.CMD_STOP_TOUR, () => {
      this.endTour();
    });

    // Location commands
    globalEventBus.on(Events.CMD_SHOW_LOCATION_DIALOG, () => {
      this.setObserverLocation();
    });

    globalEventBus.on(Events.CMD_REQUEST_GEOLOCATION, () => {
      this.requestGeolocation();
    });

    // Events calendar command
    globalEventBus.on(Events.CMD_SHOW_EVENTS, () => {
      this.showEventsCalendar();
    });
  }

  /* ======================================================================
     INITIALIZATION METHODS
     ====================================================================== */

  /**
   * Initialize the application: load data, setup scene, start animation
   */
  async init() {
    try {
      // Load data
      await this.loadData();

      // Planet positions are calculated using Keplerian orbital mechanics
      // (JPL Horizons API doesn't support CORS for browser requests)

      // Setup Three.js
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
      this.createCelestialSphere();

      // Initialize StarFieldRenderer module after celestialSphere is ready
      this.initStarFieldRenderer_();
      this.createStarField();  // Delegated to StarFieldRenderer

      // Initialize GridRenderer module after celestialSphere is ready
      this.initGridRenderer_();
      this.createGrid();  // Delegated to GridRenderer

      // Initialize ConstellationRenderer module after celestialSphere is ready
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
      this.updateCelestialRotation();

      // Update time display to show current time (instead of "Loading...")
      this.updateSimulationTime(0);

      // Auto-detect location (Feature 4)
      this.requestLocation();

      // Setup event listeners (UI controls only, input handled by InputController)
      this.setupEventListeners();

      // Initialize InputController for mouse/touch handling
      this.initInputController_();

      // Setup command event listeners for decoupled UI communication
      this.setupCommandListeners_();

      // Initialize PowerManager module for power-saving features
      this.initPowerManager_();

      // Start animation loop
      this.startAnimating();

      // Hide loading screen
      domCache.loading?.classList.add('hidden');

    } catch (error) {
      console.error('Initialization error:', error);
      alert('Failed to load sky map data. Please check the console for details.');
    }
  }

  async loadData() {
    try {
      console.log('Starting data load...');
      const data = await dataLoader.loadSkyMapData('stars_medium.json');

      this.stars = data.stars;
      this.constellations = data.constellations;
      this.deepSkyObjects = data.deepSkyObjects;
      this.namedObjects = data.namedObjects;

      console.log(`✓ Loaded ${this.stars.length} stars`);
      console.log(`✓ Loaded ${Object.keys(this.constellations).length} constellations`);
      console.log(`✓ Loaded ${this.deepSkyObjects.length} DSOs`);
      console.log(`✓ Loaded ${Object.keys(this.namedObjects).length} named objects`);
      console.log('All data loaded successfully!');
    } catch (error) {
      console.error('Error loading data:', error);
      const loadingText = domCache.get('loading')?.querySelector('.loading-text');
      if (loadingText) loadingText.textContent = 'Error loading data. Check console for details.';
      throw error;
    }
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);  // Pure black night sky
    // Fog removed - was creating dark shadow in center
  }

  setupCamera() {
    // Calculate initial FOV based on camera distance (using same formula as zoom)
    const normalizedDistance = Math.log(this.cameraDistance / this.minDistance) / Math.log(this.maxDistance / this.minDistance);
    const initialFov = 5 + normalizedDistance * 115;

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

  // Feature 1: Constellation Lines
  /**
   * Create constellation lines from star data.
   * Delegates to ConstellationRenderer module.
   */
  createConstellationLines() {
    this.constellationRenderer_.createLines();
    this.constellationLinesGroup = this.constellationRenderer_.getLinesGroup();
    if (this.constellationLinesGroup) {
      this.constellationLinesGroup.visible = this.showConstellationLines;
    }
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
   * for click handling in handleClick_() and for other modules.
   */
  createPlanets() {
    this.planetRenderer_.create();
    this.planets = this.planetRenderer_.getPlanets();
    this.planetSprites = this.planetRenderer_.getSprites();
    // Update search index with new planet positions
    this.updateSearchIndexPlanets_();
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
    this.updateSearchIndexPlanets_();

    // Emit event for subscribers (e.g., SkyConditionsHandler)
    globalEventBus.emit(Events.PLANETS_UPDATED, {
      planets: this.planets,
      moon: this.planetRenderer_.getPlanetByName('Moon'),
    });
  }

  /**
   * Update planet entries in the search index with current positions.
   * Called after createPlanets() to keep search results in sync.
   * @private
   */
  updateSearchIndexPlanets_() {
    if (!this.searchIndex || !this.planets) return;

    // Remove old planet entries from search index
    this.searchIndex = this.searchIndex.filter(entry => entry.type !== 'Planet');

    // Add updated planet entries
    this.planets.forEach(planet => {
      this.searchIndex.push({
        name: planet.name,
        type: 'Planet',
        ra: planet.ra,
        dec: planet.dec,
        mag: planet.mag,
        angularSize: planet.angularSize,
        data: planet,
      });
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
  }

  updateCameraPosition() {
    const x = this.cameraDistance * Math.sin(this.cameraRotation.phi) * Math.cos(this.cameraRotation.theta);
    const y = this.cameraDistance * Math.cos(this.cameraRotation.phi);
    const z = this.cameraDistance * Math.sin(this.cameraRotation.phi) * Math.sin(this.cameraRotation.theta);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);

    // Update camera info display - compute RA/Dec in celestial coordinates
    // Reuse temporary vectors/matrices to avoid allocations in hot path
    // Get camera's forward direction in world coordinates
    this.camera.getWorldDirection(this._tempVec3);

    // Transform view direction from world coords to celestial coords
    // by applying the INVERSE of the celestialSphere's world transformation
    this._tempVec3B.copy(this._tempVec3);
    if (this.celestialSphere) {
      // Get the inverse of the celestialSphere's world matrix
      this.celestialSphere.updateMatrixWorld();
      this._tempMatrix4.copy(this.celestialSphere.matrixWorld);
      this._tempMatrix4B.copy(this._tempMatrix4).invert();

      // Apply inverse transformation (rotation only, ignore translation)
      this._tempMatrix3.setFromMatrix4(this._tempMatrix4B);
      this._tempVec3B.applyMatrix3(this._tempMatrix3);
    }

    const raDec = cartesianToRaDec(this._tempVec3B.x, this._tempVec3B.y, this._tempVec3B.z);

    // Use optional chaining for cleaner null checks
    if (domCache.raDisplay) domCache.raDisplay.textContent = `${raDec.ra.toFixed(1)}°`;
    if (domCache.decDisplay) domCache.decDisplay.textContent = `${raDec.dec.toFixed(1)}°`;
    if (domCache.fovDisplay) domCache.fovDisplay.textContent = formatAngle(this.camera.fov);
  }

  updateSmoothZoom() {
    if (this.targetFov === null) return false;

    let changed = false;

    // Smoothly interpolate FOV
    const fovDiff = this.targetFov - this.camera.fov;
    // Use proportional threshold for deep zoom (0.1% of current FOV or 0.001, whichever is smaller)
    const fovThreshold = Math.min(0.001, this.camera.fov * 0.001);
    if (Math.abs(fovDiff) > fovThreshold) {
      this.camera.fov += fovDiff * this.zoomLerpSpeed;
      this.camera.updateProjectionMatrix();
      changed = true;
    }

    // Smoothly interpolate rotation
    let thetaDiff = this.targetTheta - this.cameraRotation.theta;
    // Handle wraparound
    if (thetaDiff > Math.PI) thetaDiff -= 2 * Math.PI;
    if (thetaDiff < -Math.PI) thetaDiff += 2 * Math.PI;

    const phiDiff = this.targetPhi - this.cameraRotation.phi;

    if (Math.abs(thetaDiff) > 0.0001 || Math.abs(phiDiff) > 0.0001) {
      this.cameraRotation.theta += thetaDiff * this.zoomLerpSpeed;
      this.cameraRotation.phi += phiDiff * this.zoomLerpSpeed;

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
   * Delegates to LocationManager module.
   */
  async requestLocation() {
    locationManager.requestLocationOnStartup(() => {
      this.onLocationChanged_();
    });
  }

  /**
   * Request geolocation from the device.
   * Called by ui-controller.js when user clicks location button.
   * Delegates to LocationManager module.
   */
  requestGeolocation() {
    // Set up callback before requesting
    locationManager.onLocationGrantedCallback_ = () => {
      this.onLocationChanged_();
    };
    locationManager.requestGeolocationInteractive();
  }

  /**
   * Handle location change from LocationManager.
   * Updates sky display for new observer location.
   * @private
   */
  onLocationChanged_() {
    this.observerLocation = locationManager.getLocation();
    astronomyCalculator.setObserverLocation(
      this.observerLocation.lat,
      this.observerLocation.lon,
      this.observerLocation.height
    );
    this.updateLatitudeTilt();
    this.updateCelestialRotation();
    this.createPlanets();
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
    console.log(`Constellation language set to: ${lang}`);

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

  // Calculate Local Sidereal Time and set celestial sphere rotation
  updateCelestialRotation() {
    if (!this.celestialSphere) return;

    const simTime = this.timeController_.getTime();
    const lst = calculateLST(simTime, this.observerLocation?.lon || 0);

    // LST is the Right Ascension currently on the meridian (due south)
    // In our coordinate system:
    // - RA=0° is along +X axis
    // - RA=90° is along -Z axis (which is "forward" in Three.js)
    // - The meridian (due south) is the -Z direction
    // To place RA=LST on the meridian, we need:
    // rotation.y = 90° - LST (in degrees), then convert to radians
    const lstRad = THREE.MathUtils.degToRad(lst);
    this.celestialSphere.rotation.y = Math.PI / 2 - lstRad;
  }

  // Feature 9: Atmosphere Rendering (simplified)
  updateAtmosphere() {
    // If force night mode is enabled, always show night sky
    if (this.forceNightMode) {
      this.scene.background = new THREE.Color(0x000000);  // Pure black night sky
      if (this.starField) {
        this.starField.material.opacity = 1.0;  // Full brightness
      }
      return;
    }

    // Otherwise, set scene background based on time of day
    const simTime = this.timeController_.getTime();
    const hour = simTime.getHours();
    let skyColor;

    if (hour >= 6 && hour < 8) {
      // Dawn - orange/pink
      skyColor = new THREE.Color(0x4A3A2A);
    } else if (hour >= 8 && hour < 18) {
      // Day - blue
      skyColor = new THREE.Color(0x87CEEB);
    } else if (hour >= 18 && hour < 20) {
      // Dusk - orange/red
      skyColor = new THREE.Color(0x4A2A3A);
    } else {
      // Night - pure black
      skyColor = new THREE.Color(0x000000);
    }

    this.scene.background = skyColor;

    // Fade stars based on time of day
    if (this.starField) {
      const isDaytime = hour >= 6 && hour < 20;
      this.starField.material.opacity = isDaytime ? 0.3 : 1.0;  // Full brightness at night
    }
  }

  // Toggle night mode
  toggleNightMode() {
    this.forceNightMode = !this.forceNightMode;
    this.updateAtmosphere();

    // Update button text
    const btn = domCache.get('night-mode-btn');
    if (btn) {
      btn.textContent = this.forceNightMode ? '🌙 Night Mode: ON' : '☀️ Day/Night: AUTO';
    }

    console.log(`Night mode: ${this.forceNightMode ? 'ON (forced)' : 'OFF (automatic)'}`);
  }

  /* ======================================================================
     TOURS & EDUCATION
     Guided tours and constellation stories
     ====================================================================== */

  /**
   * Start a guided tour of celestial objects
   * @param {string} tourName - Name of the tour to start
   */
  startTour(tourName) {
    this.tourController_.start(tourName);
  }

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
    // Enhance with custom descriptions
    const typeDesc = {
      'G': 'Galaxy', 'Neb': 'Nebula', 'PN': 'Planetary Nebula',
      'EmN': 'Emission Nebula', 'HII': 'HII Region', 'RfN': 'Reflection Nebula',
      'SNR': 'Supernova Remnant', 'GCl': 'Globular Cluster',
      'OCl': 'Open Cluster', 'Cl+N': 'Cluster with Nebulosity'
    };
    return results.map(obj => {
      if (obj.type === 'Planet') {
        return {
          ...obj,
          description: `${this.getPlanetDescription(obj.name)} - Currently ${obj.altitude.toFixed(0)}° above horizon`
        };
      }
      const typeName = typeDesc[obj.type] || obj.type || 'Deep Sky Object';
      const commonName = obj.data?.common_names ? ` (${obj.data.common_names})` : '';
      return {
        ...obj,
        description: `${typeName}${commonName} - Mag ${obj.mag.toFixed(1)}, Alt ${obj.altitude.toFixed(0)}°`
      };
    });
  }

  nextTourStep() {
    this.tourController_.next();
  }

  previousTourStep() {
    this.tourController_.previous();
  }

  endTour() {
    // Fully delegated to TourController (TourUI handles panel hiding via TOUR_ENDED event)
    this.tourController_.stop();
  }

  /**
   * Show a pulsing highlight ring around the current tour object.
   * Delegates to TourHighlight module.
   * @param {number} ra - Right ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {number=} angularSizeArcmin - Object's angular size in arcminutes
   */
  showTourHighlight(ra, dec, angularSizeArcmin = 10) {
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
  async showEventsCalendar() {
    await eventsCalendar.showEventsCalendar(window.openPanel);
  }

  /* ======================================================================
     CAMERA & INTERACTION
     Mouse, touch, and keyboard event handling
     ====================================================================== */

  /**
   * Set up UI event listeners (input handled by InputController).
   */
  setupEventListeners() {
    // UI controls - use optional chaining for elements that may not exist
    const magSlider = domCache.magnitudeSlider;
    if (magSlider) {
      magSlider.addEventListener('input', (e) => {
        this.currentMagnitude = parseFloat(e.target.value);
        const magVal = domCache.magValue;
        if (magVal) magVal.textContent = this.currentMagnitude.toFixed(1);
        this.setMagnitudeLimit(this.currentMagnitude);
        this.requestRender();
      });
    }

    // Max dynamic objects setting (stars + DSOs)
    const maxDynamicSlider = domCache.get('max-dynamic-stars');
    if (maxDynamicSlider) {
      maxDynamicSlider.addEventListener('input', (e) => {
        const maxStars = parseInt(e.target.value);
        // DSOs limit is ~1/6 of stars limit
        const maxDSOs = Math.max(1000, Math.floor(maxStars / 6));
        this.dynamicObjectManager_?.setLimits(maxStars, maxDSOs);
        const valueEl = domCache.get('max-dynamic-stars-value');
        if (valueEl) {
          valueEl.textContent = (maxStars / 1000).toFixed(0) + 'K';
        }
      });
    }

    const difficultySelect = domCache.get('difficulty-select');
    if (difficultySelect) {
      difficultySelect.addEventListener('change', (e) => {
        this.currentLevel = parseInt(e.target.value);
        this.applyDifficultyLevel();
      });
    }

    const setLocationBtn = domCache.get('set-location-btn');
    if (setLocationBtn) {
      setLocationBtn.addEventListener('click', () => {
        this.setObserverLocation();
      });
    }

    const startGameBtn = domCache.get('start-game-btn');
    if (startGameBtn) {
      startGameBtn.addEventListener('click', () => {
        // Show game selection modal
        const modal = domCache.gameSelectModal;
        if (modal) {
          modal.classList.add('visible');
        }
      });
    }

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
            this.startGame();
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
    }

    const stopGameBtn = domCache.get('stop-game-btn');
    if (stopGameBtn) {
      stopGameBtn.addEventListener('click', () => {
        this.stopGame();
      });
    }

    const passBtn = domCache.get('pass-btn');
    if (passBtn) {
      passBtn.addEventListener('click', () => {
        this.passQuestion();
      });
    }

    const resetViewBtn = domCache.get('reset-view-btn');
    if (resetViewBtn) {
      resetViewBtn.addEventListener('click', () => {
        this.resetView();
      });
    }

    // Constellation lines toggle
    const constellationToggle = domCache.get('constellation-lines-toggle');
    if (constellationToggle) {
      // Sync checkbox with actual state
      constellationToggle.checked = this.showConstellationLines;

      // Make sure lines are visible if they should be
      if (this.constellationLinesGroup) {
        this.constellationLinesGroup.visible = this.showConstellationLines;
      }

      constellationToggle.addEventListener('change', (e) => {
        this.showConstellationLines = e.target.checked;
        if (this.constellationLinesGroup) {
          this.constellationLinesGroup.visible = this.showConstellationLines;
        }
        console.log('Constellation lines:', this.showConstellationLines ? 'visible' : 'hidden');
        this.requestRender();
      });
    }

    // Window resize
    window.addEventListener('resize', this.onWindowResize.bind(this));

    // Initialize GameUI (handles panel drag and game buttons)
    this.gameUI_ = initializeGameUI({
      startGame: () => this.gameController_.start(),
      passQuestion: () => this.passQuestion(),
      stopGame: () => this.stopGame(),
    });
  }

  /**
   * Handle click/tap at normalized device coordinates.
   * Called by InputController when a click (not drag) is detected.
   * @param {number} x - X coordinate in NDC (-1 to 1)
   * @param {number} y - Y coordinate in NDC (-1 to 1)
   * @private
   */
  handleClick_(x, y) {
    // Raycasting to detect clicked star
    const mouse = new THREE.Vector2(x, y);

    const raycaster = new THREE.Raycaster();
    // Larger threshold for easier clicking, scaled by FOV
    raycaster.params.Points.threshold = 5 * (this.camera.fov / 60);
    raycaster.setFromCamera(mouse, this.camera);

    // First check for planet/sun clicks using angular distance
    // This is more reliable than raycaster for sprites in a rotated group
    if (this.planetSprites && this.planetSprites.length > 0) {
      // Get the RA/Dec of the click point
      const clickDir = new THREE.Vector3();
      raycaster.ray.direction.normalize();
      clickDir.copy(raycaster.ray.direction);

      // Transform click direction to celestial coordinates
      const clickDirCelestial = clickDir.clone();
      if (this.celestialSphere) {
        const inverseMatrix = new THREE.Matrix4().copy(this.celestialSphere.matrixWorld).invert();
        const rotationMatrix = new THREE.Matrix3().setFromMatrix4(inverseMatrix);
        clickDirCelestial.applyMatrix3(rotationMatrix);
      }

      const clickRaDec = cartesianToRaDec(clickDirCelestial.x, clickDirCelestial.y, clickDirCelestial.z);

      // Check each planet for proximity
      // Use individual thresholds based on planet's visual size
      let closestPlanet = null;
      let closestDistance = Infinity;

      for (const sprite of this.planetSprites) {
        const planetData = sprite.userData;
        if (!planetData || !planetData.ra) continue;

        // Calculate angular distance
        const dRa = (planetData.ra - clickRaDec.ra) * Math.cos(THREE.MathUtils.degToRad(planetData.dec));
        const dDec = planetData.dec - clickRaDec.dec;
        const angularDist = Math.sqrt(dRa * dRa + dDec * dDec);

        // Calculate click threshold based on displayed size
        const angularSizeDeg = (planetData.angularSize || 0.1) / 60; // arcmin to degrees
        const fov = this.camera.fov;
        const canvasHeight = this.renderer.domElement.height;
        const pixelsPerDeg = canvasHeight / fov;

        // Calculate displayed size in pixels (must match updatePlanetSizes)
        const realSizePixels = angularSizeDeg * pixelsPerDeg;
        // Use magnitude-based size like stars
        const mag = planetData.mag || 0;
        const baseMag = 8;
        const baseSize = 0.8;
        const maxSize = 6;
        const magnitudeDiff = baseMag - mag;
        const magBasedSize = clamp(baseSize * Math.pow(1.15, magnitudeDiff), baseSize, maxSize);
        const magBasedPixels = magBasedSize * 1.5;
        const displaySizePixels = Math.max(realSizePixels, magBasedPixels);

        // Click threshold based on actual displayed size with generous margin
        const visibleSizeDeg = displaySizePixels / pixelsPerDeg;
        const clickThreshold = visibleSizeDeg * 2.0;  // 100% margin for easier clicking

        if (angularDist < clickThreshold && angularDist < closestDistance) {
          closestDistance = angularDist;
          closestPlanet = planetData;
        }
      }

      if (closestPlanet) {
        const clickedObject = {
          name: closestPlanet.name,
          type: closestPlanet.type || 'Planet',
          subtype: closestPlanet.name === 'Sun' ? 'Star (G2V)' : (closestPlanet.name === 'Moon' ? 'Natural Satellite' : 'Planet'),
          ra: closestPlanet.ra,
          dec: closestPlanet.dec,
          mag: closestPlanet.mag,
          angularSize: closestPlanet.angularSize,
          phase: closestPlanet.phase
        };
        console.log('Clicked planet:', clickedObject.name, 'at distance', closestDistance.toFixed(2), 'deg');
        this.unhighlightConstellation();
        if (this.isGameActive()) {
          this.checkGameAnswer({ ra: closestPlanet.ra, dec: closestPlanet.dec });
        } else {
          this.selectObject(clickedObject);
        }
        return;
      }
    }

    // Then check for star/DSO clicks - check both main and dynamic star fields
    let clickedObject = null;

    // Check main star field
    const intersects = raycaster.intersectObject(this.starField);
    if (intersects.length > 0) {
      const index = intersects[0].index;
      const stars = this.starField.userData.stars;
      const dsos = this.starField.userData.dsos;

      if (index < stars.length) {
        const star = stars[index];
        clickedObject = {
          name: star.proper || star.bf || `HIP ${star.hip}` || 'Unknown Star',
          type: 'Star',
          subtype: star.spect ? `Spectral type ${star.spect}` : null,
          ra: star.ra,
          dec: star.dec,
          mag: star.mag,
          distance: star.dist ? `${star.dist.toFixed(1)} ly` : null,
          angularSize: null
        };
      } else {
        const dsoIndex = index - stars.length;
        if (dsoIndex < dsos.length) {
          const dso = dsos[dsoIndex];
          clickedObject = {
            name: dso.messier ? `M${Math.floor(dso.messier)}` : (dso.ngc ? `NGC ${dso.ngc}` : dso.name || 'Unknown Object'),
            type: getDsoTypeName(dso.type),
            subtype: dso.type,
            ra: dso.ra,
            dec: dso.dec,
            mag: dso.mag,
            size_major: dso.size_major,
            size_minor: dso.size_minor
          };
        }
      }
    }

    // Check dynamic star field if no main star was clicked
    const dynamicStarField = this.dynamicObjectManager_?.getDynamicStarField();
    if (!clickedObject && dynamicStarField) {
      const dynamicIntersects = raycaster.intersectObject(dynamicStarField);
      if (dynamicIntersects.length > 0) {
        const visibleIndex = dynamicIntersects[0].index;
        // Map visible index back to original dynamicStars array
        const visibleIndices = this.dynamicObjectManager_.getVisibleIndices();
        const dynamicStars = this.dynamicObjectManager_.getDynamicStars();
        const originalIndex = visibleIndices
          ? visibleIndices[visibleIndex]
          : visibleIndex;

        if (originalIndex !== undefined && originalIndex < dynamicStars.length) {
          const star = dynamicStars[originalIndex];
          clickedObject = {
            name: `Star at RA ${star.ra.toFixed(4)}°`,
            type: 'Star',
            subtype: 'Catalog star (VizieR)',
            ra: star.ra,
            dec: star.dec,
            mag: star.mag,
            angularSize: null
          };
        }
      }
    }

    // Check extended object sprites (DSO halos) if no other object was clicked
    if (!clickedObject && this.extendedObjectSprites && this.extendedObjectSprites.length > 0) {
      const clickDirCelestial = raycaster.ray.direction.clone();
      if (this.celestialSphere) {
        const inverseMatrix = new THREE.Matrix4().copy(this.celestialSphere.matrixWorld).invert();
        const rotationMatrix = new THREE.Matrix3().setFromMatrix4(inverseMatrix);
        clickDirCelestial.applyMatrix3(rotationMatrix);
      }
      const clickRaDec = cartesianToRaDec(clickDirCelestial.x, clickDirCelestial.y, clickDirCelestial.z);

      let closestDSO = null;
      let closestDistance = Infinity;

      for (const sprite of this.extendedObjectSprites) {
        const dsoData = sprite.userData?.dso;
        if (!dsoData || !dsoData.ra) continue;

        const dRa = (dsoData.ra - clickRaDec.ra) * Math.cos(THREE.MathUtils.degToRad(dsoData.dec));
        const dDec = dsoData.dec - clickRaDec.dec;
        const angularDist = Math.sqrt(dRa * dRa + dDec * dDec);

        // Calculate click threshold based on displayed size
        const angularSizeDeg = (sprite.userData.angularSizeArcmin || 1) / 60;
        const fov = this.camera.fov;
        const canvasHeight = this.renderer.domElement.height;
        const pixelsPerDeg = canvasHeight / fov;
        const realSizePixels = angularSizeDeg * pixelsPerDeg;
        const minSizePixels = 6;

        let clickThreshold;
        if (realSizePixels >= minSizePixels) {
          clickThreshold = angularSizeDeg * 1.2;
        } else {
          const visibleSizeDeg = (minSizePixels / pixelsPerDeg);
          clickThreshold = visibleSizeDeg * 1.5;
        }

        if (angularDist < clickThreshold && angularDist < closestDistance) {
          closestDistance = angularDist;
          closestDSO = dsoData;
        }
      }

      if (closestDSO) {
        clickedObject = {
          name: closestDSO.name || `DSO at RA ${closestDSO.ra.toFixed(2)}°`,
          type: getDsoTypeName(closestDSO.type),
          subtype: closestDSO.type,
          ra: closestDSO.ra,
          dec: closestDSO.dec,
          mag: closestDSO.mag,
          size_major: closestDSO.size_major,
          size_minor: closestDSO.size_minor
        };
      }
    }

    if (clickedObject) {
      console.log('Clicked object:', clickedObject.name);
      this.unhighlightConstellation();
      if (this.isGameActive()) {
        this.checkGameAnswer({ ra: clickedObject.ra, dec: clickedObject.dec });
      } else {
        this.selectObject(clickedObject);
      }
      return;
    }

    // Check for constellation line clicks (only if no other object was clicked)
    if (this.constellationLinesGroup && this.showConstellationLines) {
      // Set line threshold based on FOV for better click detection
      raycaster.params.Line = { threshold: 0.5 * (this.camera.fov / 60) };

      const lineIntersects = raycaster.intersectObjects(
          this.constellationLinesGroup.children,
          false,
      );

      if (lineIntersects.length > 0) {
        const clickedLine = lineIntersects[0].object;
        const constAbbrev = clickedLine.userData.constellation;
        if (constAbbrev) {
          const constName = this.getConstellationName(constAbbrev);
          console.log('Clicked constellation line:', constName);
          if (this.isGameActive()) {
            // During game mode, check if this constellation is the answer
            this.checkGameAnswerByName(constName);
          } else {
            this.showConstellationInfo(constAbbrev);
          }
          return;
        }
      } else if (!this.isGameActive()) {
        // Clicked on empty space - unhighlight any selected constellation
        this.unhighlightConstellation();
      }
    } else if (!this.isGameActive()) {
      // Constellation lines not shown - still unhighlight on empty click
      this.unhighlightConstellation();
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.requestRender();
  }

  applyDifficultyLevel() {
    // Apply difficulty level settings
    switch (this.currentLevel) {
      case 1: // Level 1: Only constellations
        this.currentMagnitude = 6.0;
        break;
      case 2: // Level 2: Bright objects
        this.currentMagnitude = 4.0;
        break;
      case 3: // Level 3: Custom magnitude
        // Use slider value
        break;
    }

    const slider = domCache.magnitudeSlider;
    if (slider) slider.value = this.currentMagnitude;
    const magVal = domCache.magValue;
    if (magVal) magVal.textContent = this.currentMagnitude.toFixed(1);
    // Update shader uniform for smooth fading
    this.setMagnitudeLimit(this.currentMagnitude);
  }

  setObserverLocation() {
    // Prompt for location
    const lat = prompt('Enter latitude (degrees, -90 to 90):', '48.8566');
    const lon = prompt('Enter longitude (degrees, -180 to 180):', '2.3522');

    if (lat && lon) {
      this.observerLocation = {
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        height: 0
      };
      astronomyCalculator.setObserverLocation(
        this.observerLocation.lat,
        this.observerLocation.lon,
        this.observerLocation.height
      );

      // Update sky tilt and rotation based on new location
      this.updateLatitudeTilt();
      this.updateCelestialRotation();
      // Recalculate planet positions with new observer location
      this.createPlanets();

      alert(`Observer location set to: ${lat}°, ${lon}°\nSky now shows correct position for your location and time.`);
    }
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
   * Start the object identification game.
   * Delegates to GameController module.
   */
  startGame() {
    if (!this.gameController_) return;
    const category = this.gameController_.getCategory() || 'known-constellations';
    this.gameController_.setCategory(category);
    this.gameController_.start();
  }

  /**
   * Stop the object identification game.
   * Delegates to GameController module.
   */
  stopGame() {
    if (!this.gameController_) return;
    this.gameController_.stop();
  }

  /**
   * Check if game is currently active.
   * @returns {boolean} True if game is active
   */
  isGameActive() {
    return this.gameController_?.isActive() || false;
  }

  /**
   * Move to the next game question.
   * Delegates to GameController module.
   */
  nextQuestion() {
    if (!this.gameController_) return;
    this.gameController_.nextQuestion();
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
   * Pass the current question (show answer).
   * Delegates to GameController module.
   */
  passQuestion() {
    if (!this.gameController_) return;
    this.gameController_.passQuestion();
  }

  /**
   * Highlight a specific constellation by name.
   * Delegates to ConstellationRenderer module.
   * @param {string} constellationName - Name of the constellation to highlight
   */
  highlightConstellation(constellationName) {
    this.constellationRenderer_?.highlight(constellationName);
  }

  /**
   * Remove constellation highlighting.
   * Delegates to ConstellationRenderer module.
   */
  unhighlightConstellation() {
    this.constellationRenderer_?.unhighlight();
  }

  resetView() {
    this.cameraRotation = { theta: 0, phi: Math.PI / 2 };
    this.cameraDistance = 5;
    this.updateCameraPosition();
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
      const deltaMs = this.timeController_.getSpeed() * 16.67; // ~60 FPS
      this.updateSimulationTime(deltaMs);
    }

    // Feature 9: Update atmosphere (throttled - every 10 frames)
    const simTime = this.timeController_.getTime();
    if (simTime && this._frameCount % 10 === 0) {
      this.updateAtmosphere();
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

    // Extended objects - throttled to every 100ms or when FOV changes
    if (this._fovDirty || (now - this._lastExtendedObjUpdate > 100)) {
      this.updateExtendedObjectSizes();
      this._lastExtendedObjUpdate = now;
    }

    // Planet sizes - only when FOV changes
    if (this._fovDirty) {
      this.updatePlanetSizes();
      this.updateCardinalLabelSizes();
    }

    // Clear FOV dirty flag
    this._fovDirty = false;

    // Dynamic star loading - throttled to every 200ms
    if (now - this._lastDynamicCheck > 200) {
      this.dynamicObjectManager_?.checkLoading();
      this.dynamicObjectManager_?.checkCleanup();
      this._lastDynamicCheck = now;
    }

    // Update tour highlight animation (cheap, runs every frame when active)
    if (this.tourHighlightModule_?.isActive()) {
      this.updateTourHighlight();
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
   * in handleClick_() and for dynamic DSO management.
   */
  createExtendedObjects() {
    const count = this.extendedObjectRenderer_.create();
    this.extendedObjectSprites = this.extendedObjectRenderer_.getSprites();
    console.log(`✓ Created ${count} extended objects with real angular sizes`);
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
   * Calculate the screen angle to celestial North from an object's position
   * This is needed to properly orient images on the celestial sphere
   * @param {number} ra - Right Ascension in degrees
   * @param {number} dec - Declination in degrees
   * @returns {number} Angle in radians from screen "up" to celestial North (clockwise positive)
   */
  /**
   * Update visibility of object images based on zoom level.
   * Delegates to ImageRenderer module.
   */
  updateImageVisibility() {
    this.imageRenderer_?.updateVisibility();
  }

}
