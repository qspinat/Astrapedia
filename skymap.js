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
  getCuratedImage,
} from './modules/data/CuratedImages.js';
import {descriptionGenerator} from './modules/data/DescriptionGenerator.js';
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
import {TimeController} from './modules/features/TimeController.js';
import {SelectionManager} from './modules/features/SelectionManager.js';
import {eventsCalendar} from './modules/features/EventsCalendar.js';
import {locationManager} from './modules/services/LocationManager.js';
import {dynamicDataLoader} from './modules/services/DynamicDataLoader.js';
import {CompassController} from './modules/interaction/CompassController.js';
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
import {escapeHtml, fetchWikipedia} from './modules/core/SecurityUtils.js';
import {SHADERS, CAMERA} from './modules/core/Constants.js';
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

    // Time simulation
    this.simulationTime = new Date();
    this.timeSpeed = 0;  // 0 = paused, 1 = real-time, 60 = 1 hour per minute
    this.isTimePlaying = false;

    // Search and selection
    this.searchIndex = [];
    this.selectedObject = null;

    // Tours and education
    this.currentTour = null;
    this.tourStep = 0;
    this.tourHighlight = null;
    this.tourHighlightModule_ = null;  // TourHighlight module instance
    this.searchHighlightTimeout_ = null;  // Timeout for auto-hiding search highlight

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

    // Dynamic star loading (Gaia/SIMBAD)
    this.dynamicStars = [];  // Stars loaded from API
    this.dynamicStarField = null;  // THREE.Points for dynamic stars
    this.dynamicDSOs = [];  // DSOs loaded from API
    this.queriedRegions = new Set();  // Cache of already queried regions
    this.lastQueryFov = null;
    this.lastQueryRa = null;
    this.lastQueryDec = null;
    this.isQueryingGaia = false;
    this.isQueryingDSO = false;

    // Game panel drag state
    this.gamePanelDragging = false;
    this.gamePanelDragSetup_ = false;  // Guard against multiple setup calls

    // Dynamic image loading for nebulae/clusters
    this.dynamicImageCache = new Map();    // Cache: objectName -> { url: string | null, loading: boolean }

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

    // === POWER SAVING (managed by PowerManager, kept for early init fallback) ===
    this._needsRender = true;    // Dirty flag for render-on-demand (fallback)
    this._isAnimating = false;   // Animation loop running state (synced via callbacks)

    // === DEVICE DETECTION ===
    // Detect mobile/touch devices for UX adjustments
    this.isMobile = this.detectMobile_();

    // Limits for dynamic data
    this.maxDynamicStars = 30000;  // Cap for dynamic stars
    this.maxDynamicDSOs = 5000;   // Cap for dynamic DSOs (galaxies, nebulae, clusters)
    this.maxQueriedRegions = 100;  // Limit cached regions

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
      getSimulationTime: () => this.simulationTime || new Date(),
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
        this.simulationTime || new Date(),
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
      fetchBestImage: (name, ra, dec, type, size) => this.fetchBestImage(name, ra, dec, type, size),
      fetchObjectDescription: (obj) => this.fetchObjectDescription(obj),
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
      shouldKeepAnimating: () => this.isTimePlaying || !!this._targetFov,
    });
    this.powerManager_.initialize();
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
      if (this.timeController_) {
        this.timeController_.togglePlayback();
        // Sync local state as fallback
        this.isTimePlaying = this.timeController_.isPlaying();
        this.timeSpeed = this.timeController_.getSpeed();
        // Update UI
        if (domCache.timeSpeedDisplay) {
          domCache.timeSpeedDisplay.textContent = this.timeController_.getSpeedDisplayString();
        }
      } else {
        this.isTimePlaying = !this.isTimePlaying;
        this.setTimeSpeed(this.isTimePlaying ? 1 : 0);
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
      document.getElementById('loading').classList.add('hidden');

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
      document.querySelector('.loading-text').textContent = 'Error loading data. Check console for details.';
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
    const container = document.getElementById('canvas-container');
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
    if (this.starFieldRenderer_) {
      const result = this.starFieldRenderer_.create();
      this.starField = this.starFieldRenderer_.getStarField();
      this.updateVisibleCount(result.starCount + result.dsoCount);
    }
  }

  /**
   * Create coordinate grid and equator line.
   * Delegates to GridRenderer module.
   */
  createGrid() {
    if (this.gridRenderer_) {
      this.gridRenderer_.create();
    }
  }

  /**
   * Set the visibility of the equator line.
   * Delegates to GridRenderer module.
   * @param {boolean} visible - Whether the equator line should be visible
   */
  setEquatorLineVisible(visible) {
    if (this.gridRenderer_) {
      this.gridRenderer_.setEquatorVisible(visible);
    }
  }

  // Feature 1: Constellation Lines
  /**
   * Create constellation lines from star data.
   * Delegates to ConstellationRenderer module.
   */
  createConstellationLines() {
    if (this.constellationRenderer_) {
      this.constellationRenderer_.createLines();
      this.constellationLinesGroup = this.constellationRenderer_.getLinesGroup();
      if (this.constellationLinesGroup) {
        this.constellationLinesGroup.visible = this.showConstellationLines;
      }
    }
  }

  // Feature 3: Cardinal Direction Labels
  /**
   * Create cardinal direction labels (N/S/E/W).
   * Delegates to HorizonRenderer module.
   */
  createCardinalLabels() {
    if (this.horizonRenderer_) {
      this.horizonRenderer_.createCardinalLabels();
    }
  }

  /**
   * Update cardinal label sizes based on FOV.
   * Delegates to HorizonRenderer module.
   */
  updateCardinalLabelSizes() {
    if (this.horizonRenderer_) {
      this.horizonRenderer_.updateCardinalLabelSizes();
    }
  }

  /**
   * Create local horizon line.
   * Delegates to HorizonRenderer module.
   */
  createHorizonLine() {
    if (this.horizonRenderer_) {
      this.horizonRenderer_.createHorizon();
    }
  }

  /**
   * Create planet sprites for Sun, Moon, and planets.
   * Delegates to PlanetRenderer module.
   */
  createPlanets() {
    if (this.planetRenderer_) {
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
    if (this.planetRenderer_) {
      this.planetRenderer_.updatePositions();
    }

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
    if (this.starFieldRenderer_) {
      this.starFieldRenderer_.setMagnitudeLimit(magLimit);
      // Update visible count
      this.updateVisibleCount(this.starFieldRenderer_.getVisibleCount());
    }

    // Update dynamic star field uniform if exists (VizieR loaded stars)
    if (this.dynamicStarField && this.dynamicStarField.material) {
      if (this.dynamicStarField.material.uniforms && this.dynamicStarField.material.uniforms.magLimit) {
        this.dynamicStarField.material.uniforms.magLimit.value = magLimit;
      }
    }

    // If magnitude increased significantly and zoomed in, trigger new dynamic star query
    if (magLimit > previousMag && this.camera && this.camera.fov < 10) {
      // Debounce to avoid excessive queries while sliding
      clearTimeout(this._magQueryTimeout);
      this._magQueryTimeout = setTimeout(() => {
        this.checkDynamicStarLoading();
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
    // The view direction in world coordinates
    this._tempVec3.set(0, 0, 0).sub(this.camera.position).normalize();

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
    this.selectedObject = obj;

    // Clear any existing search highlight timeout
    if (this.searchHighlightTimeout_) {
      clearTimeout(this.searchHighlightTimeout_);
      this.searchHighlightTimeout_ = null;
    }

    const panel = document.getElementById('info-panel');
    if (!panel) return;

    if (!obj) {
      // Hide info panel and any highlight
      this.unhighlightConstellation();
      this.hideTourHighlight();
      if (window.closeAllPanels) {
        window.closeAllPanels();
      } else {
        panel.classList.remove('visible');
      }
      return;
    }

    // Navigate camera to object
    this.animateCameraTo(obj.ra, obj.dec);

    // Handle constellations specially
    if (obj.type === 'Constellation') {
      this.hideTourHighlight();
      this.highlightConstellation(obj.name);
      this.showConstellationInfo(obj.name);
      if (window.openPanel) {
        window.openPanel('info-panel');
      } else {
        panel.classList.add('visible');
      }
      return;
    }

    // Unhighlight any previously highlighted constellation
    this.unhighlightConstellation();

    // Show temporary highlight ring around the object
    const angularSize = obj.size_major || obj.angularSize || 20;
    this.showTourHighlight(obj.ra, obj.dec, angularSize);

    // Auto-hide the highlight after 4 seconds
    this.searchHighlightTimeout_ = setTimeout(() => {
      this.hideTourHighlight();
      this.searchHighlightTimeout_ = null;
    }, 4000);

    // Show info panel
    this.showObjectInfo(obj);
    if (window.openPanel) {
      window.openPanel('info-panel');
    } else {
      panel.classList.add('visible');
    }
  }

  showObjectInfo(obj) {
    const panel = document.getElementById('info-panel');
    if (!panel) return;

    const content = document.getElementById('info-content');
    if (!content) return;

    // Get curated image URL if available (beautiful processed images)
    const curatedImageUrl = this.getObjectImageUrl(obj);

    // Get display name with fallbacks
    const displayName = obj.name || obj.proper || 'Unknown Object';

    // Update panel header title
    const titleEl = document.getElementById('object-title');
    if (titleEl) titleEl.textContent = displayName;

    let html = '';

    // Image container - will be populated with best available image
    html += `<div class="object-images">`;
    html += `<div class="object-image-container" id="main-image">`;
    html += `<div class="image-loading">Loading image...</div>`;
    html += `</div>`;
    html += `</div>`;

    // Convert type abbreviation to full name (using TypeMappings)
    const typeFullName = getDsoTypeName(obj.type);
    html += `<p><strong>Type:</strong> ${escapeHtml(typeFullName)}</p>`;
    if (obj.subtype) html += `<p><strong>Subtype:</strong> ${escapeHtml(getDsoTypeName(obj.subtype))}</p>`;
    html += `<p><strong>RA:</strong> ${obj.ra.toFixed(4)}°</p>`;
    html += `<p><strong>Dec:</strong> ${obj.dec.toFixed(4)}°</p>`;
    if (obj.mag !== undefined && obj.mag !== null) html += `<p><strong>Magnitude:</strong> ${obj.mag.toFixed(1)}</p>`;

    // Add angular size if available
    if (obj.size_major) {
      // size_major is in arcminutes
      let sizeStr;
      if (obj.size_major >= 60) {
        sizeStr = `${(obj.size_major / 60).toFixed(1)}°`;
      } else if (obj.size_major >= 1) {
        sizeStr = `${obj.size_major.toFixed(1)}'`;
      } else {
        sizeStr = `${(obj.size_major * 60).toFixed(1)}"`;
      }
      // Add minor axis if available (for elliptical objects)
      if (obj.size_minor && obj.size_minor !== obj.size_major) {
        let minorStr;
        if (obj.size_minor >= 60) {
          minorStr = `${(obj.size_minor / 60).toFixed(1)}°`;
        } else if (obj.size_minor >= 1) {
          minorStr = `${obj.size_minor.toFixed(1)}'`;
        } else {
          minorStr = `${(obj.size_minor * 60).toFixed(1)}"`;
        }
        sizeStr += ` × ${minorStr}`;
      }
      html += `<p><strong>Angular Size:</strong> ${sizeStr}</p>`;
    } else if (obj.angularSize) {
      // angularSize is in arcminutes for planets/Sun/Moon
      html += `<p><strong>Angular Size:</strong> ${obj.angularSize.toFixed(1)}'</p>`;
    } else if (obj.type === 'Star') {
      // Stars appear as unresolved point sources
      html += `<p><strong>Angular Size:</strong> &lt;0.001" (point source)</p>`;
    }

    // Add Moon phase information
    if (obj.name === 'Moon' && obj.phase !== undefined) {
      const phasePercent = (obj.phase * 100).toFixed(0);
      let phaseName;
      if (obj.phase < 0.03) phaseName = 'New Moon';
      else if (obj.phase < 0.22) phaseName = 'Waxing Crescent';
      else if (obj.phase < 0.28) phaseName = 'First Quarter';
      else if (obj.phase < 0.47) phaseName = 'Waxing Gibbous';
      else if (obj.phase < 0.53) phaseName = 'Full Moon';
      else if (obj.phase < 0.72) phaseName = 'Waning Gibbous';
      else if (obj.phase < 0.78) phaseName = 'Last Quarter';
      else if (obj.phase < 0.97) phaseName = 'Waning Crescent';
      else phaseName = 'New Moon';
      html += `<p><strong>Phase:</strong> ${phaseName} (${phasePercent}% illuminated)</p>`;
    }

    // Add constellation info if available
    const constName = this.getConstellation(obj.ra, obj.dec);
    if (constName) {
      html += `<p><strong>Constellation:</strong> ${escapeHtml(constName)}</p>`;

      // Feature 12: Add constellation story
      const story = this.getConstellationStory(constName);
      if (story) {
        html += `<div class="constellation-story">`;
        html += `<h3>About ${escapeHtml(constName)}</h3>`;
        html += `<p>${escapeHtml(story.mythology)}</p>`;
        html += `<p><strong>Best Seen:</strong> ${escapeHtml(story.bestSeen)}</p>`;
        html += `</div>`;
      }
    }

    // Add placeholder for Wikipedia description
    html += `<div id="object-description" class="object-description"><em>Loading description...</em></div>`;

    content.innerHTML = html;

    // Load best available image asynchronously
    this.loadBestImage(obj, curatedImageUrl);

    // Fetch Wikipedia description asynchronously
    this.fetchObjectDescription(obj);
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
    if (this.currentTour && this.currentTour.type === 'constellation') {
      const tourPanel = document.getElementById('tour-panel');
      if (tourPanel && tourPanel.style.display !== 'none') {
        const step = this.currentTour.steps[this.tourStep];
        if (step) {
          const displayName = step.abbrev ? this.getConstellationName(step.abbrev) : step.name;

          // Use DOM methods to prevent XSS and avoid inline handlers
          tourPanel.textContent = '';

          const h2 = document.createElement('h2');
          h2.textContent = this.currentTour.name;
          tourPanel.appendChild(h2);

          const h3 = document.createElement('h3');
          h3.textContent = displayName;
          tourPanel.appendChild(h3);

          const desc = document.createElement('p');
          desc.textContent = step.description;
          tourPanel.appendChild(desc);

          const progress = document.createElement('p');
          progress.textContent = `Step ${this.tourStep + 1} of ${this.currentTour.steps.length}`;
          tourPanel.appendChild(progress);

          const nextBtn = document.createElement('button');
          nextBtn.textContent = 'Next';
          nextBtn.addEventListener('click', () => this.nextTourStep());
          tourPanel.appendChild(nextBtn);

          const endBtn = document.createElement('button');
          endBtn.textContent = 'End Tour';
          endBtn.addEventListener('click', () => this.endTour());
          tourPanel.appendChild(endBtn);
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
    const panel = document.getElementById('info-panel');
    if (!panel) return;

    const content = document.getElementById('info-content');
    if (!content) return;

    // Convert full name to abbreviation if needed
    const abbrev = this.getConstellationAbbrev(constName);

    // Get the full constellation name in current language
    const fullName = this.getConstellationName(abbrev);

    // Also get English name for Wikipedia lookup
    const englishName = CONSTELLATION_NAMES['en'][abbrev] || constName;

    let html = `<h2>${escapeHtml(fullName)}</h2>`;
    html += `<p><strong>Abbreviation:</strong> ${escapeHtml(abbrev)}</p>`;

    // Show Latin name if current language is not English/Latin
    if (this.constellationLanguage !== 'en' && this.constellationLanguage !== 'la') {
      html += `<p><strong>Latin:</strong> ${escapeHtml(englishName)}</p>`;
    }

    // Get constellation story if available (try both abbrev and original name)
    const story = this.getConstellationStory(abbrev) || this.getConstellationStory(constName);
    if (story) {
      html += `<div class="constellation-story">`;
      html += `<p>${escapeHtml(story.mythology)}</p>`;
      html += `<p><strong>Best Seen:</strong> ${escapeHtml(story.bestSeen)}</p>`;
      html += `</div>`;
    }

    // Add placeholder for Wikipedia description
    html += `<div id="object-description" class="object-description"><em>Loading description...</em></div>`;

    // Update panel header title
    const titleEl = document.getElementById('object-title');
    if (titleEl) titleEl.textContent = fullName;

    content.innerHTML = html;

    // Open panel using panel manager
    if (window.openPanel) {
      window.openPanel('info-panel');
    } else {
      panel.classList.add('visible');
    }

    // Highlight the clicked constellation (use English/full name for matching)
    // Map abbreviation to full name if needed
    const fullConstName = this.getConstellationFullName(constName) || constName;
    this.highlightConstellation(fullConstName);

    // Fetch Wikipedia description for constellation (use English name for lookup)
    this.fetchConstellationDescription(englishName);
  }

  async fetchConstellationDescription(constellationName) {
    const descContainer = document.getElementById('object-description');
    if (!descContainer) return;

    try {
      const searchName = `${constellationName} (constellation)`;
      const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchName)}`;
      const response = await fetchWikipedia(searchUrl);

      if (response.ok) {
        const data = await response.json();
        if (data.extract) {
          // Use textContent to prevent XSS from API response
          descContainer.textContent = '';
          const p = document.createElement('p');
          p.textContent = data.extract;
          descContainer.appendChild(p);
          return;
        }
      }

      // Fallback: search without "(constellation)"
      const fallbackUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(constellationName)}`;
      const fallbackResponse = await fetchWikipedia(fallbackUrl);

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        if (fallbackData.extract) {
          // Use textContent to prevent XSS from API response
          descContainer.textContent = '';
          const p = document.createElement('p');
          p.textContent = fallbackData.extract;
          descContainer.appendChild(p);
          return;
        }
      }

      descContainer.textContent = '';
    } catch (error) {
      console.warn('Failed to fetch constellation description:', error);
      descContainer.textContent = '';
    }
  }

  async loadBestImage(obj, curatedImageUrl) {
    const container = document.getElementById('main-image');
    if (!container) return;

    // Show loading state
    container.innerHTML = '<div class="image-loading">Loading best available image...</div>';

    // Get object identifier
    const objectName = obj.messier ? `M${Math.floor(obj.messier)}` :
              (obj.name?.match(/^(NGC|IC)\s*\d+/)?.[0]?.replace(/\s+/g, '') || obj.name);

    // Use unified image fetcher to get the best available image
    // Set flag to allow DSS fallback (works in panel via img tag, not for 3D textures)
    this._fetchingForPanel = true;
    const result = await this.fetchBestImage(
      objectName,
      obj.ra,
      obj.dec,
      obj.type,
      obj.size_major || obj.angularSize
    );
    this._fetchingForPanel = false;

    if (result?.url) {
      // Skip size check for trusted sources (already optimized)
      const trustedSources = ['ESA/Hubble', 'NASA', 'NASA/Webb', 'NASA/Hubble', 'Curated', 'DSS'];
      const isTrusted = trustedSources.includes(result.source) ||
                result.url?.includes('esahubble.org') ||
                result.url?.includes('nasa.gov') ||
                result.url?.includes('alasky.cds.unistra.fr');

      let skipDueToSize = false;
      if (!isTrusted) {
        // Check file size before loading (max 1MB) - only for untrusted sources
        const maxSize = 1024 * 1024;
        try {
          const headResponse = await fetch(result.url, { method: 'HEAD' });
          const contentLength = parseInt(headResponse.headers.get('content-length') || '0', 10);
          if (contentLength > maxSize) {
            console.log(`⚠️ Skipping panel image: ${(contentLength / 1024 / 1024).toFixed(2)}MB exceeds 1MB limit`);
            skipDueToSize = true;
          }
        } catch (e) {
          // If HEAD fails, proceed anyway
        }
      }

      if (skipDueToSize) {
        // Try DSS fallback instead of showing nothing
        console.log(`⬇️ Trying DSS fallback for ${objectName}`);
        const dssUrl = this.getSkyViewImageUrl(obj.ra, obj.dec, obj.type);
        if (dssUrl) {
          container.textContent = '';
          const img = document.createElement('img');
          img.src = dssUrl;
          img.alt = obj.name || 'Celestial object';
          img.className = 'object-image tier-vintage';
          img.onerror = () => {
            container.textContent = '';
            const fallbackDiv = document.createElement('div');
            fallbackDiv.className = 'image-unavailable';
            fallbackDiv.textContent = 'Image unavailable';
            container.appendChild(fallbackDiv);
          };
          container.appendChild(img);
          const sourceDiv = document.createElement('div');
          sourceDiv.className = 'image-source tier-vintage';
          sourceDiv.textContent = '📜 Digitized Sky Survey (fallback)';
          container.appendChild(sourceDiv);
          return;
        }
        container.textContent = '';
        const fallbackDiv = document.createElement('div');
        fallbackDiv.className = 'image-unavailable';
        fallbackDiv.textContent = 'Image unavailable';
        container.appendChild(fallbackDiv);
        return;
      }

      // Map tier to display name
      const sourceDisplay = {
        'ESA/Hubble': '🔭 ESA/Hubble Space Telescope',
        'NASA/Webb': '🌟 James Webb Space Telescope',
        'NASA/Hubble': '🔭 Hubble Space Telescope',
        'NASA/SDO': '☀️ NASA Solar Dynamics Observatory',
        'NASA': '🚀 NASA Image Archive',
        'Wikimedia/ESO': '🌌 ESO/ESA via Wikimedia',
        'Wikimedia/Subaru': '🔭 Subaru Telescope (NAOJ)',
        'Wikimedia/Astrophoto': '📷 Astrophotography',
        'Wikimedia': '📷 Wikimedia Commons',
        'DSS': '📜 Digitized Sky Survey'
      };

      const tierClass = result.tier === 'iconic' ? 'tier-iconic' :
               result.tier === 'high' ? 'tier-high' :
               result.tier === 'survey' ? 'tier-survey' : 'tier-vintage';

      // Use DOM methods to prevent XSS
      container.textContent = '';

      const img = document.createElement('img');
      img.src = result.url;
      img.alt = obj.name || 'Celestial object';
      img.className = `object-image ${tierClass}`;
      img.onerror = () => {
        container.textContent = '';
        const fallbackDiv = document.createElement('div');
        fallbackDiv.className = 'image-unavailable';
        fallbackDiv.textContent = 'Image unavailable';
        container.appendChild(fallbackDiv);
      };
      container.appendChild(img);

      const sourceDiv = document.createElement('div');
      sourceDiv.className = `image-source ${tierClass}`;
      sourceDiv.textContent = sourceDisplay[result.source] || result.source || 'Unknown source';
      container.appendChild(sourceDiv);
    } else {
      container.textContent = '';
      const fallbackDiv = document.createElement('div');
      fallbackDiv.className = 'image-unavailable';
      fallbackDiv.textContent = 'No image available';
      container.appendChild(fallbackDiv);
    }
  }

  async tryLoadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
      // Timeout after 5 seconds
      setTimeout(() => resolve(false), 5000);
    });
  }

  getSkyViewImageUrl(ra, dec, type, angularSizeArcmin = null) {
    if (this.imageRenderer_) {
      return this.imageRenderer_.getSkyViewImageUrl(ra, dec, type, angularSizeArcmin);
    }
    // Fallback to CDS Aladin HiPS service if imageRenderer not available
    const fov = 0.25;
    const sizePixels = 512;
    return `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=CDS%2FP%2FDSS2%2Fcolor&ra=${ra.toFixed(5)}&dec=${dec.toFixed(5)}&fov=${fov.toFixed(4)}&width=${sizePixels}&height=${sizePixels}&format=jpg`;
  }

  getObjectImageUrl(obj) {
    if (this.imageRenderer_) {
      return this.imageRenderer_.getObjectImageUrl(obj);
    }
    // Fallback: try getCuratedImage directly
    const name = obj.name || obj.proper || '';
    if (!name) return null;
    const curatedImage = getCuratedImage(name);
    return curatedImage ? curatedImage.url : null;
  }

  async fetchObjectDescription(obj) {
    const descDiv = document.getElementById('object-description');
    if (!descDiv) return;

    // Build search terms for Wikipedia
    const searchTerms = this.getWikipediaSearchTerms(obj);

    // For catalog stars without Wikipedia articles, generate a description from data
    if (searchTerms.length === 0) {
      const generated = this.generateStarDescription_(obj);
      if (generated) {
        descDiv.textContent = '';
        const p = document.createElement('p');
        p.className = 'wiki-description generated';
        p.textContent = generated;
        descDiv.appendChild(p);
        return;
      }
      const em = document.createElement('em');
      em.textContent = 'No description available for this catalog object.';
      descDiv.textContent = '';
      descDiv.appendChild(em);
      return;
    }

    for (const term of searchTerms) {
      try {
        const response = await fetchWikipedia(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`
        );

        if (response.ok) {
          const data = await response.json();
          if (data.extract) {
            // Truncate to reasonable length
            let description = data.extract;
            if (description.length > 500) {
              description = description.substring(0, 500) + '...';
            }
            // Use DOM methods to prevent XSS from API response
            descDiv.textContent = '';
            const p = document.createElement('p');
            p.className = 'wiki-description';
            p.textContent = description;
            descDiv.appendChild(p);

            const wikiUrl = data.content_urls?.desktop?.page;
            if (wikiUrl) {
              const a = document.createElement('a');
              a.href = wikiUrl;
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              a.className = 'wiki-link';
              a.textContent = 'Read more on Wikipedia';
              descDiv.appendChild(a);
            }
            return;
          }
        }
      } catch (e) {
        console.warn(`Wikipedia fetch failed for ${term}:`, e);
      }
    }

    // No description found - try generating one for stars
    const generated = this.generateStarDescription_(obj);
    if (generated) {
      descDiv.textContent = '';
      const p = document.createElement('p');
      p.className = 'wiki-description generated';
      p.textContent = generated;
      descDiv.appendChild(p);
      return;
    }

    const em = document.createElement('em');
    em.textContent = 'No description available.';
    descDiv.textContent = '';
    descDiv.appendChild(em);
  }

  /**
   * Generate a description for stars based on their catalog data.
   * Delegates to DescriptionGenerator module.
   * @param {Object} obj - Star object with properties like mag, spect, ci, hip
   * @returns {string|null} Generated description or null if not enough data
   * @private
   */
  generateStarDescription_(obj) {
    return descriptionGenerator.generateStarDescription(obj);
  }

  /**
   * Get Wikipedia search terms for an object.
   * Delegates to DescriptionGenerator module.
   * @param {Object} obj - Object with name property
   * @returns {Array<string>} Array of potential Wikipedia article names
   */
  getWikipediaSearchTerms(obj) {
    return descriptionGenerator.getWikipediaSearchTerms(obj);
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
    this.simulationTime = new Date(this.simulationTime.getTime() + deltaMs);

    // Update UI using cached DOM reference
    if (domCache.timeDisplay) {
      domCache.timeDisplay.textContent = this.simulationTime.toLocaleString();
    }

    // Rotate celestial sphere to simulate Earth's rotation
    // Earth rotates 360° per sidereal day (23h 56m 4s = 86164 seconds)
    // Rotation rate: 360° / 86164s = 0.00417807°/s = 7.2921e-5 rad/s
    if (this.celestialSphere) {
      const siderealRotationRate = (2 * Math.PI) / 86164; // radians per second
      const deltaSeconds = deltaMs / 1000;
      const rotationAngle = siderealRotationRate * deltaSeconds;

      // Rotate around Y axis (polar axis)
      // Negative because stars appear to move westward (opposite to Earth's rotation)
      this.celestialSphere.rotation.y -= rotationAngle;
    }

    // Update Sun and Moon positions periodically
    // Moon moves ~13°/day (~0.5°/hour), so update frequently for smooth motion:
    // - Every 10 simulated seconds at high speeds for visible movement
    // - Every 2 seconds of real time to keep display in sync
    if (!this.lastPlanetUpdate) {
      this.lastPlanetUpdate = this.simulationTime.getTime();
      this.lastPlanetUpdateRealTime = Date.now();
    }
    const simTimeSinceUpdate = Math.abs(this.simulationTime.getTime() - this.lastPlanetUpdate);
    const realTimeSinceUpdate = Date.now() - (this.lastPlanetUpdateRealTime || 0);
    if (simTimeSinceUpdate > 10000 || realTimeSinceUpdate > 2000) {
      // Use updatePlanetPositions() for efficiency (no image reload)
      this.updatePlanetPositions();
      this.lastPlanetUpdate = this.simulationTime.getTime();
      this.lastPlanetUpdateRealTime = Date.now();
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
    if (this.timeController_) {
      this.timeController_.setSpeed(speed);
      // Update UI using TimeController's display string
      if (domCache.timeSpeedDisplay) {
        domCache.timeSpeedDisplay.textContent = this.timeController_.getSpeedDisplayString();
      }
    } else {
      // Fallback before TimeController is initialized
      this.timeSpeed = speed;
      if (domCache.timeSpeedDisplay) {
        if (speed === 0) {
          domCache.timeSpeedDisplay.textContent = 'Paused';
        } else if (speed === 1) {
          domCache.timeSpeedDisplay.textContent = 'Real-time';
        } else {
          domCache.timeSpeedDisplay.textContent = `${speed}x`;
        }
      }
    }
    // Ensure animation is running when speed is set
    const isPlaying = this.timeController_?.isPlaying() ?? this.isTimePlaying;
    if (speed !== 0 && isPlaying) {
      this.startAnimating();
    }
  }

  jumpToTime(date) {
    // Delegate to TimeController (handles celestial rotation and planet updates)
    if (this.timeController_) {
      this.timeController_.jumpToTime(date);
    } else {
      // Fallback before TimeController is initialized
      this.simulationTime = new Date(date);
    }

    // Update UI
    this.updateSimulationTime(0);

    // Re-navigate to selected object if any (so it stays centered after rotation)
    if (this.selectedObject) {
      this.animateCameraTo(this.selectedObject.ra, this.selectedObject.dec);
    }

    // Wake up rendering
    this.requestRender();
  }

  // Calculate Local Sidereal Time and set celestial sphere rotation
  updateCelestialRotation() {
    if (!this.celestialSphere) return;

    const lst = calculateLST(this.simulationTime, this.observerLocation?.lon || 0);

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

  // Feature 8: Visible Tonight
  getVisibleTonight() {
    const now = new Date();
    const results = {
      planets: [],
      brightStars: [],
      messierObjects: [],
      specialEvents: []
    };

    // Get bright stars above horizon
    // (Simplified - would need Alt/Az calculation based on location and time)
    const brightStars = this.stars
      .filter(s => s.mag < 2.0 && s.proper)
      .slice(0, 10);

    results.brightStars = brightStars.map(s => ({
      name: s.proper,
      magnitude: s.mag,
      ra: s.ra,
      dec: s.dec
    }));

    // Get visible Messier objects
    const messierObjects = this.deepSkyObjects
      .filter(dso => dso.messier && dso.mag && dso.mag < 9)
      .slice(0, 10);

    results.messierObjects = messierObjects.map(dso => ({
      name: `M${Math.floor(dso.messier)}`,
      type: dso.type,
      magnitude: dso.mag,
      ra: dso.ra,
      dec: dso.dec
    }));

    return results;
  }

  /* ======================================================================
     UI PANELS
     Methods for displaying information panels
     ====================================================================== */

  /**
   * Show the "Visible Tonight" panel with recommended objects
   */
  showVisibleTonight() {
    const visible = this.getVisibleTonight();
    const panel = document.getElementById('visible-tonight-panel');
    if (!panel) return;

    let html = '<h2>Visible Tonight</h2>';

    html += '<h3>Bright Stars</h3><ul>';
    visible.brightStars.forEach(star => {
      html += `<li><a href="#" data-ra="${star.ra}" data-dec="${star.dec}">${escapeHtml(star.name)}</a> (mag ${star.magnitude.toFixed(1)})</li>`;
    });
    html += '</ul>';

    html += '<h3>Messier Objects</h3><ul>';
    visible.messierObjects.forEach(obj => {
      html += `<li><a href="#" data-ra="${obj.ra}" data-dec="${obj.dec}">${escapeHtml(obj.name)}</a> - ${escapeHtml(obj.type)} (mag ${obj.magnitude.toFixed(1)})</li>`;
    });
    html += '</ul>';

    const content = panel.querySelector('.panel-content');
    if (content) {
      content.innerHTML = html;

      // Add click handlers for navigation
      content.querySelectorAll('a[data-ra]').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const ra = parseFloat(link.dataset.ra);
          const dec = parseFloat(link.dataset.dec);
          this.animateCameraTo(ra, dec);
        });
      });
    }

    // Use global panel manager if available, otherwise fallback
    if (window.openPanel) {
      window.openPanel('visible-tonight-panel');
    } else {
      panel.classList.add('visible');
    }
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
    const hour = this.simulationTime.getHours();
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
    const btn = document.getElementById('night-mode-btn');
    if (btn) {
      btn.textContent = this.forceNightMode ? '🌙 Night Mode: ON' : '☀️ Day/Night: AUTO';
    }

    console.log(`Night mode: ${this.forceNightMode ? 'ON (forced)' : 'OFF (automatic)'}`);
  }

  // Feature 12: Constellation Stories
  getConstellationStory(constellationName) {
    // This would normally load from a data file
    // For now, include a few examples
    const stories = {
      'Orion': {
        mythology: 'Orion was a giant huntsman in Greek mythology, placed among the stars by Zeus. He is depicted hunting with his club and shield.',
        bestSeen: 'Winter (Northern Hemisphere)',
        brightestStar: 'Rigel',
        notableObjects: ['M42 (Orion Nebula)', 'Horsehead Nebula']
      },
      'UMa': {
        mythology: 'Ursa Major, the Great Bear, was once the nymph Callisto who was transformed into a bear by Zeus\' jealous wife Hera.',
        bestSeen: 'Spring (Northern Hemisphere)',
        brightestStar: 'Alioth',
        notableObjects: ['The Big Dipper asterism', 'M81 & M82 galaxies']
      },
      'Cas': {
        mythology: 'Cassiopeia was a vain queen in Greek mythology who boasted about her beauty, angering the sea gods.',
        bestSeen: 'Autumn (Northern Hemisphere)',
        brightestStar: 'Schedar',
        notableObjects: ['M52 open cluster', 'NGC 7789']
      }
    };

    return stories[constellationName] || null;
  }

  getConstellation(ra, dec) {
    // Simplified constellation identification
    // Would need proper constellation boundary data
    // For now, return null
    return null;
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
    if (this.tourController_) {
      this.tourController_.start(tourName);
      this.currentTour = this.tourController_.getCurrentTour();
      this.tourStep = 0;
    }
  }

  /**
   * Get available tours.
   * @returns {!Object<string, !Object>} Available tours
   */
  getAvailableTours() {
    if (this.tourController_) {
      return this.tourController_.getAvailableTours();
    }
    return {};
  }

  /**
   * Get description for a planet.
   * @param {string} planetName - Planet name
   * @returns {string} Description
   */
  getPlanetDescription(planetName) {
    if (this.tourController_) {
      return this.tourController_.getPlanetDescription(planetName);
    }
    return 'Solar System object';
  }

  /**
   * Calculate if an object at given RA/Dec is above the horizon.
   * Delegates to AstronomyCalculator module.
   * @param {number} ra - Right Ascension in degrees
   * @param {number} dec - Declination in degrees
   * @returns {number} Altitude in degrees (positive = above horizon)
   */
  calculateAltitude(ra, dec) {
    return astronomyCalculator.calculateAltitude(ra, dec, this.simulationTime || new Date());
  }

  /**
   * Get the best visible deep sky objects for tonight, sorted by magnitude
   * Actually checks visibility based on observer location and current time
   */
  getBestVisibleObjectsTonight() {
    const objects = [];
    const lat = this.observerLocation?.lat || 45;
    const lon = this.observerLocation?.lon || 0;
    const lst = calculateLST(this.simulationTime || new Date(), lon);

    // Minimum altitude for good viewing (degrees above horizon)
    const minAltitude = 15;

    // Add visible planets (exclude Sun and Moon)
    if (this.planets) {
      this.planets.forEach(planet => {
        if (planet.name !== 'Sun' && planet.name !== 'Moon') {
          const altitude = this.calculateAltitude(planet.ra, planet.dec, lat, lst);
          if (altitude > minAltitude && planet.mag < 6) {
            objects.push({
              name: planet.name,
              ra: planet.ra,
              dec: planet.dec,
              mag: planet.mag,
              altitude: altitude,
              description: `${this.getPlanetDescription(planet.name)} - Currently ${altitude.toFixed(0)}° above horizon`
            });
          }
        }
      });
    }

    // Add visible deep sky objects (galaxies, nebulae, clusters) - NO STARS
    if (this.deepSkyObjects) {
      const typeDesc = {
        'G': 'Galaxy', 'Neb': 'Nebula', 'PN': 'Planetary Nebula',
        'EmN': 'Emission Nebula', 'HII': 'HII Region', 'RfN': 'Reflection Nebula',
        'SNR': 'Supernova Remnant', 'GCl': 'Globular Cluster',
        'OCl': 'Open Cluster', 'Cl+N': 'Cluster with Nebulosity'
      };

      // Types to exclude (stars and stellar objects)
      const excludeTypes = ['*', '**', '*Ass', 'Star', 'Nova', 'SNR?'];

      this.deepSkyObjects.forEach(dso => {
        // Skip star-type objects
        if (excludeTypes.includes(dso.type)) return;

        if (dso.mag && dso.mag < 10) {
          const altitude = this.calculateAltitude(dso.ra, dso.dec, lat, lst);
          if (altitude > minAltitude) {
            const name = dso.messier ? `M${Math.floor(dso.messier)}` :
                  (dso.name?.match(/^(NGC|IC)\d+/)?.[0] || dso.name);
            const typeName = typeDesc[dso.type] || dso.type || 'Deep Sky Object';
            const commonName = dso.common_names ? ` (${dso.common_names})` : '';

            objects.push({
              name: name,
              ra: dso.ra,
              dec: dso.dec,
              mag: dso.mag,
              altitude: altitude,
              description: `${typeName}${commonName} - Mag ${dso.mag.toFixed(1)}, Alt ${altitude.toFixed(0)}°`
            });
          }
        }
      });
    }

    // Sort by magnitude (brightest first) and take top 50
    return objects
      .sort((a, b) => a.mag - b.mag)
      .slice(0, 50);
  }

  showTourStep() {
    if (!this.currentTour || this.tourStep >= this.currentTour.steps.length) {
      this.endTour();
      return;
    }

    const step = this.currentTour.steps[this.tourStep];

    // Get object's angular size to ensure FOV is large enough to show it fully
    let requiredFov = null;
    if (this.currentTour.type === 'constellation') {
      // Constellations need wide FOV (at least 30°)
      requiredFov = 30;
    } else {
      // For DSOs/planets, get angular size and ensure FOV shows the full object with margin
      const planet = this.planets?.find(p => p.name === step.name);
      const obj = !planet ? this.findObjectByNameOrCoords(step.name, step.ra, step.dec) : null;
      const angularSizeArcmin = planet?.angularSize || obj?.size_major || step.angularSize || 10;
      // Convert arcmin to degrees and add 50% margin so object isn't edge-to-edge
      requiredFov = (angularSizeArcmin / 60) * 1.5;
      // Minimum FOV of 1° for small objects, max 60° for large ones
      requiredFov = clamp(requiredFov, 1, 60);
    }

    // If current FOV is smaller than required, zoom out smoothly
    if (requiredFov && this.camera.fov < requiredFov) {
      this.targetFov = requiredFov;
    }

    // Navigate to the target
    this.animateCameraTo(step.ra, step.dec);

    // Handle constellation tours differently
    if (this.currentTour.type === 'constellation') {
      // For constellation tour, highlight the constellation lines and show constellation info
      this.hideTourHighlight(); // Hide any existing highlight ring
      // Use full name for highlighting (matches constellation data keys)
      this.highlightConstellation(step.name);
      // Use abbreviation for info panel (if available)
      this.showConstellationInfo(step.abbrev || step.name);
      // No highlight ring for constellations - the line highlighting is enough
    } else if (this.currentTour.type === 'planets') {
      // For planet tour, find the planet and show its info
      const planet = this.planets?.find(p => p.name === step.name);
      if (planet) {
        const clickedObject = {
          name: planet.name,
          type: planet.name === 'Sun' ? 'Star' : (planet.name === 'Moon' ? 'Natural Satellite' : 'Planet'),
          subtype: planet.name === 'Sun' ? 'Star (G2V)' : (planet.name === 'Moon' ? 'Natural Satellite' : 'Planet'),
          ra: planet.ra,
          dec: planet.dec,
          mag: planet.mag,
          angularSize: planet.angularSize,
          phase: planet.phase
        };
        this.showObjectInfo(clickedObject);
      }
      // Use the planet's angular size for highlight
      const angularSizeArcmin = step.angularSize || 30;
      this.showTourHighlight(step.ra, step.dec, angularSizeArcmin);
    } else {
      // Regular tour (stars, DSOs, or planets in mixed tours like "tonight")
      // First check if this is a planet (for mixed tours that include planets)
      const planet = this.planets?.find(p => p.name === step.name);
      if (planet) {
        // Handle planet in regular tour (same as planets tour)
        const clickedObject = {
          name: planet.name,
          type: planet.name === 'Sun' ? 'Star' : (planet.name === 'Moon' ? 'Natural Satellite' : 'Planet'),
          subtype: planet.name === 'Sun' ? 'Star (G2V)' : (planet.name === 'Moon' ? 'Natural Satellite' : 'Planet'),
          ra: planet.ra,
          dec: planet.dec,
          mag: planet.mag,
          angularSize: planet.angularSize,
          phase: planet.phase
        };
        this.showObjectInfo(clickedObject);
        const angularSizeArcmin = planet.angularSize || 30;
        this.showTourHighlight(step.ra, step.dec, angularSizeArcmin);
      } else {
        // Find the actual object (DSO or star) to get its properties
        const obj = this.findObjectByNameOrCoords(step.name, step.ra, step.dec);

        // Get object's angular size (in arcminutes), default to 10 arcmin for stars/unknown
        const angularSizeArcmin = obj?.size_major || obj?.angularSize || step.angularSize || 10;

        // Show highlight on the current tour object
        this.showTourHighlight(step.ra, step.dec, angularSizeArcmin);

        // Show object info panel if object found
        if (obj) {
          this.showObjectInfo(obj);
          const infoPanel = document.getElementById('info-panel');
          if (infoPanel) infoPanel.classList.add('visible');
        }
      }
    }

    // Show tour UI
    const tourPanel = document.getElementById('tour-panel');
    if (tourPanel) {
      // Use translated name for constellation tours
      const displayName = (this.currentTour.type === 'constellation' && step.abbrev)
        ? this.getConstellationName(step.abbrev)
        : step.name;

      // Use DOM methods to prevent XSS and avoid inline handlers
      tourPanel.textContent = '';

      const h2 = document.createElement('h2');
      h2.textContent = this.currentTour.name;
      tourPanel.appendChild(h2);

      const h3 = document.createElement('h3');
      h3.textContent = displayName;
      tourPanel.appendChild(h3);

      const desc = document.createElement('p');
      desc.textContent = step.description;
      tourPanel.appendChild(desc);

      const progress = document.createElement('p');
      progress.textContent = `Step ${this.tourStep + 1} of ${this.currentTour.steps.length}`;
      tourPanel.appendChild(progress);

      const btnContainer = document.createElement('div');
      btnContainer.className = 'tour-buttons';

      const prevBtn = document.createElement('button');
      prevBtn.textContent = '← Previous';
      prevBtn.disabled = this.tourStep === 0;
      prevBtn.addEventListener('click', () => this.previousTourStep());
      btnContainer.appendChild(prevBtn);

      const nextBtn = document.createElement('button');
      nextBtn.textContent = 'Next →';
      nextBtn.addEventListener('click', () => this.nextTourStep());
      btnContainer.appendChild(nextBtn);

      tourPanel.appendChild(btnContainer);

      const endBtn = document.createElement('button');
      endBtn.textContent = 'End Tour';
      endBtn.className = 'tour-end-btn';
      endBtn.addEventListener('click', () => this.endTour());
      tourPanel.appendChild(endBtn);

      tourPanel.style.display = 'block';
    }
  }

  /**
   * Find an object by name or coordinates
   */
  findObjectByNameOrCoords(name, ra, dec) {
    // Try to find in planets first (highest priority for named planets)
    if (this.planets) {
      const planet = this.planets.find(p => p.name === name);
      if (planet) {
        return {
          name: planet.name,
          type: planet.name === 'Sun' ? 'Star' : (planet.name === 'Moon' ? 'Natural Satellite' : 'Planet'),
          subtype: planet.name === 'Sun' ? 'Star (G2V)' : (planet.name === 'Moon' ? 'Natural Satellite' : 'Planet'),
          ra: planet.ra,
          dec: planet.dec,
          mag: planet.mag,
          angularSize: planet.angularSize,
          phase: planet.phase
        };
      }
    }

    // Try to find in DSOs (by Messier name or common name)
    if (name.startsWith('M') && /^M\d+$/.test(name)) {
      const messierNum = parseInt(name.substring(1));
      const dso = this.deepSkyObjects.find(d => d.messier && Math.floor(d.messier) === messierNum);
      if (dso) return { ...dso, name: name };
    }

    // Try to find by name in DSOs
    let obj = this.deepSkyObjects.find(d =>
      d.name === name ||
      (d.common_names && d.common_names.toLowerCase().includes(name.toLowerCase()))
    );
    if (obj) return obj;

    // Try to find in stars
    obj = this.stars.find(s =>
      s.proper === name ||
      s.name === name ||
      (s.bayer && s.bayer === name)
    );
    if (obj) return { ...obj, type: 'Star' };

    // Try to find by coordinates (within 0.5 degrees)
    obj = this.deepSkyObjects.find(d =>
      Math.abs(d.ra - ra) < 0.5 && Math.abs(d.dec - dec) < 0.5
    );
    if (obj) return obj;

    obj = this.stars.find(s =>
      Math.abs(s.ra - ra) < 0.5 && Math.abs(s.dec - dec) < 0.5
    );
    if (obj) return { ...obj, type: 'Star' };

    // Return a basic object with the tour step info
    return { name, ra, dec, type: 'Unknown' };
  }

  nextTourStep() {
    if (this.tourController_) {
      this.tourController_.next();
      this.tourStep = this.tourController_.getCurrentStep();
    }
  }

  previousTourStep() {
    if (this.tourController_) {
      this.tourController_.previous();
      this.tourStep = this.tourController_.getCurrentStep();
    }
  }

  endTour() {
    if (this.tourController_) {
      this.tourController_.stop();
    }
    this.currentTour = null;
    this.tourStep = 0;
    this.hideTourHighlight();
    // Reset constellation highlighting
    this.unhighlightConstellation();
    const tourPanel = document.getElementById('tour-panel');
    if (tourPanel) tourPanel.style.display = 'none';
  }

  /**
   * Show a pulsing highlight ring around the current tour object
   * @param {number} ra - Right ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {number} angularSizeArcmin - Object's angular size in arcminutes
   */
  /**
   * Show a pulsing highlight ring around the current tour object.
   * Delegates to TourHighlight module.
   * @param {number} ra - Right ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {number=} angularSizeArcmin - Object's angular size in arcminutes
   */
  showTourHighlight(ra, dec, angularSizeArcmin = 10) {
    if (this.tourHighlightModule_) {
      this.tourHighlightModule_.show(ra, dec, angularSizeArcmin);
      this.tourHighlight = this.tourHighlightModule_.getSprite();
    }
  }

  /**
   * Hide the tour highlight.
   * Delegates to TourHighlight module.
   */
  hideTourHighlight() {
    if (this.tourHighlightModule_) {
      this.tourHighlightModule_.hide();
      this.tourHighlight = null;
    }
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
    const magSlider = document.getElementById('magnitude-slider');
    if (magSlider) {
      magSlider.addEventListener('input', (e) => {
        this.currentMagnitude = parseFloat(e.target.value);
        const magVal = document.getElementById('mag-value');
        if (magVal) magVal.textContent = this.currentMagnitude.toFixed(1);
        this.setMagnitudeLimit(this.currentMagnitude);
        this.requestRender();
      });
    }

    // Max dynamic objects setting (stars + DSOs)
    const maxDynamicSlider = document.getElementById('max-dynamic-stars');
    if (maxDynamicSlider) {
      maxDynamicSlider.addEventListener('input', (e) => {
        this.maxDynamicStars = parseInt(e.target.value);
        // DSOs limit is ~1/6 of stars limit
        this.maxDynamicDSOs = Math.max(1000, Math.floor(this.maxDynamicStars / 6));
        const valueEl = document.getElementById('max-dynamic-stars-value');
        if (valueEl) {
          valueEl.textContent = (this.maxDynamicStars / 1000).toFixed(0) + 'K';
        }
      });
    }

    const difficultySelect = document.getElementById('difficulty-select');
    if (difficultySelect) {
      difficultySelect.addEventListener('change', (e) => {
        this.currentLevel = parseInt(e.target.value);
        this.applyDifficultyLevel();
      });
    }

    const setLocationBtn = document.getElementById('set-location-btn');
    if (setLocationBtn) {
      setLocationBtn.addEventListener('click', () => {
        this.setObserverLocation();
      });
    }

    const startGameBtn = document.getElementById('start-game-btn');
    if (startGameBtn) {
      startGameBtn.addEventListener('click', () => {
        // Show game selection modal
        const modal = document.getElementById('game-select-modal');
        if (modal) {
          modal.classList.add('visible');
        }
      });
    }

    // Game selection modal buttons
    const gameSelectBtns = document.querySelectorAll('.game-select-btn');
    gameSelectBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const category = btn.getAttribute('data-category');
        if (category && this.gameController_) {
          this.gameController_.setCategory(category);
          // Hide modal and start game
          const modal = document.getElementById('game-select-modal');
          if (modal) {
            modal.classList.remove('visible');
          }
          this.startGame();
        }
      });
    });

    // Game selection cancel button
    const gameSelectCancel = document.getElementById('game-select-cancel');
    if (gameSelectCancel) {
      gameSelectCancel.addEventListener('click', () => {
        const modal = document.getElementById('game-select-modal');
        if (modal) {
          modal.classList.remove('visible');
        }
      });
    }

    // Close modal when clicking backdrop
    const gameSelectModal = document.getElementById('game-select-modal');
    if (gameSelectModal) {
      gameSelectModal.addEventListener('click', (e) => {
        if (e.target === gameSelectModal) {
          gameSelectModal.classList.remove('visible');
        }
      });
    }

    const stopGameBtn = document.getElementById('stop-game-btn');
    if (stopGameBtn) {
      stopGameBtn.addEventListener('click', () => {
        this.stopGame();
      });
    }

    const passBtn = document.getElementById('pass-btn');
    if (passBtn) {
      passBtn.addEventListener('click', () => {
        this.passQuestion();
      });
    }

    const resetViewBtn = document.getElementById('reset-view-btn');
    if (resetViewBtn) {
      resetViewBtn.addEventListener('click', () => {
        this.resetView();
      });
    }

    // Constellation lines toggle
    const constellationToggle = document.getElementById('constellation-lines-toggle');
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

    // Setup game panel drag functionality
    this.setupGamePanelDrag();
  }

  /**
   * Setup drag functionality for the game panel.
   * Only draggable by the header (h2 element).
   * Uses dynamic listener attachment to avoid memory leaks.
   */
  setupGamePanelDrag() {
    // Guard against multiple setup calls
    if (this.gamePanelDragSetup_) return;

    const gamePanel = document.getElementById('game-panel');
    if (!gamePanel) return;

    const header = gamePanel.querySelector('h2');
    if (!header) return;

    this.gamePanelDragSetup_ = true;

    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    // Define handlers as arrow functions to preserve 'this' context
    const onDragMove = (e) => {
      let clientX, clientY;
      if (e.type === 'touchmove') {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const deltaX = clientX - startX;
      const deltaY = clientY - startY;

      let newLeft = startLeft + deltaX;
      let newTop = startTop + deltaY;

      // Constrain to viewport bounds
      const panelRect = gamePanel.getBoundingClientRect();
      const maxLeft = window.innerWidth - panelRect.width;
      const maxTop = window.innerHeight - panelRect.height;

      newLeft = clamp(newLeft, 0, maxLeft);
      newTop = clamp(newTop, 0, maxTop);

      gamePanel.style.left = `${newLeft}px`;
      gamePanel.style.top = `${newTop}px`;

      e.preventDefault();
    };

    const onDragEnd = () => {
      this.gamePanelDragging = false;

      // Remove document-level listeners to prevent memory leaks
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
      document.removeEventListener('touchmove', onDragMove);
      document.removeEventListener('touchend', onDragEnd);
    };

    const onDragStart = (e) => {
      this.gamePanelDragging = true;

      // Get current position (use computed style if not set)
      const rect = gamePanel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      // Get pointer position
      if (e.type === 'touchstart') {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      } else {
        startX = e.clientX;
        startY = e.clientY;
      }

      // Add document-level listeners only when dragging starts
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
      document.addEventListener('touchmove', onDragMove, {passive: false});
      document.addEventListener('touchend', onDragEnd);

      e.preventDefault();
    };

    // Only attach start listeners to header
    header.addEventListener('mousedown', onDragStart);
    header.addEventListener('touchstart', onDragStart, {passive: false});
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
    if (!clickedObject && this.dynamicStarField) {
      const dynamicIntersects = raycaster.intersectObject(this.dynamicStarField);
      if (dynamicIntersects.length > 0) {
        const visibleIndex = dynamicIntersects[0].index;
        // Map visible index back to original dynamicStars array
        const originalIndex = this.visibleDynamicStarIndices
          ? this.visibleDynamicStarIndices[visibleIndex]
          : visibleIndex;

        if (originalIndex !== undefined && originalIndex < this.dynamicStars.length) {
          const star = this.dynamicStars[originalIndex];
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

    document.getElementById('magnitude-slider').value = this.currentMagnitude;
    document.getElementById('mag-value').textContent = this.currentMagnitude.toFixed(1);
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
    if (this.constellationRenderer_) {
      this.constellationRenderer_.highlight(constellationName);
    }
  }

  /**
   * Remove constellation highlighting.
   * Delegates to ConstellationRenderer module.
   */
  unhighlightConstellation() {
    if (this.constellationRenderer_) {
      this.constellationRenderer_.unhighlight();
    }
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
      // Fallback for early initialization before PowerManager is created
      this._needsRender = true;
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

    // Feature 7: Update time simulation if playing
    if (this.isTimePlaying && this.timeSpeed !== 0) {
      const deltaMs = this.timeSpeed * 16.67; // ~60 FPS
      this.updateSimulationTime(deltaMs);
    }

    // Feature 9: Update atmosphere (throttled - every 10 frames)
    if (this.simulationTime && this._frameCount % 10 === 0) {
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
      this.checkDynamicStarLoading();
      this.checkDynamicStarCleanup();
      this._lastDynamicCheck = now;
    }

    // Update tour highlight animation (cheap, runs every frame when active)
    if (this.tourHighlight) {
      this.updateTourHighlight();
    }

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Create image sprites for deep sky objects.
   * Delegates to ImageRenderer module.
   */
  createObjectImages() {
    if (this.imageRenderer_) {
      this.imageRenderer_.create();
    }
  }

  /**
   * Unified image fetching from multiple astronomical sources.
   * Delegates to ImageRenderer module.
   * @param {string} objectName - Object identifier (e.g., "M42", "NGC2024")
   * @param {number} ra - Right ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {string} type - Object type for field sizing
   * @param {number} angularSizeArcmin - Angular size in arcminutes
   * @returns {Promise<{url: string, source: string, tier: string}|null>}
   */
  async fetchBestImage(objectName, ra, dec, type, angularSizeArcmin = null) {
    if (this.imageRenderer_) {
      this.imageRenderer_.setFetchingForPanel(this._fetchingForPanel);
      return this.imageRenderer_.fetchBestImage(objectName, ra, dec, type, angularSizeArcmin);
    }
    return null;
  }

  /**
   * Create extended objects with real angular sizes.
   * Delegated to ExtendedObjectRenderer module.
   */
  createExtendedObjects() {
    if (this.extendedObjectRenderer_) {
      const count = this.extendedObjectRenderer_.create();
      this.extendedObjectSprites = this.extendedObjectRenderer_.getSprites();
      console.log(`✓ Created ${count} extended objects with real angular sizes`);
    }
  }

  /**
   * Update visibility of extended objects based on current FOV.
   * Delegated to ExtendedObjectRenderer module.
   */
  updateExtendedObjectSizes() {
    if (this.extendedObjectRenderer_) {
      const fov = this.camera.fov;
      const canvasHeight = this.renderer.domElement.height;
      this.extendedObjectRenderer_.updateSizes(fov, canvasHeight);
    }
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
    if (this.imageRenderer_) {
      this.imageRenderer_.updateVisibility();
    }
  }

  /**
   * Check if we need to load more stars for the current view
   * Called from animate loop
   */
  /**
   * Dynamically update which stars are visible based on FOV
   * Fainter stars disappear first when zooming out
   */
  checkDynamicStarCleanup() {
    if (this.dynamicStars.length === 0) return;

    const fov = this.camera.fov;

    // If zoomed out (FOV > 15°), clear all dynamic stars
    if (fov > 15) {
      if (this.dynamicStarField) {
        // Properly dispose GPU resources
        if (this.dynamicStarField.geometry) this.dynamicStarField.geometry.dispose();
        if (this.dynamicStarField.material) this.dynamicStarField.material.dispose();
        this.celestialSphere.remove(this.dynamicStarField);
        this.dynamicStarField = null;
      }
      // Remove dynamic DSO sprites and dispose their resources
      if (this.dynamicDSOs && this.extendedObjectSprites) {
        const spritesToRemove = this.extendedObjectSprites.filter(sprite =>
          sprite.userData && sprite.userData.isDynamic
        );
        spritesToRemove.forEach(sprite => {
          if (sprite.material) {
            if (sprite.material.map) sprite.material.map.dispose();
            sprite.material.dispose();
          }
          this.celestialSphere.remove(sprite);
          const idx = this.extendedObjectSprites.indexOf(sprite);
          if (idx > -1) this.extendedObjectSprites.splice(idx, 1);
        });
      }
      this.dynamicStars = [];
      this.dynamicDSOs = [];
      this.queriedRegions.clear();

      const statusEl = document.getElementById('dynamic-stars-count');
      if (statusEl) statusEl.textContent = '0';
      return;
    }

    // When zoomed in, filter out stars outside the current FOV
    // Get view direction in celestial coordinates
    const viewDirWorld = new THREE.Vector3(0, 0, 0).sub(this.camera.position).normalize();
    const viewDirCelestial = viewDirWorld.clone();
    if (this.celestialSphere) {
      this.celestialSphere.updateMatrixWorld();
      const worldMatrix = new THREE.Matrix4().copy(this.celestialSphere.matrixWorld);
      const inverseMatrix = new THREE.Matrix4().copy(worldMatrix).invert();
      const rotationMatrix = new THREE.Matrix3().setFromMatrix4(inverseMatrix);
      viewDirCelestial.applyMatrix3(rotationMatrix);
    }
    const viewRaDec = cartesianToRaDec(viewDirCelestial.x, viewDirCelestial.y, viewDirCelestial.z);

    // Filter radius relative to zoom: tighter filter when more zoomed in
    // At FOV 10° keep stars within 20°, at FOV 1° keep within 3°
    const filterRadius = Math.max(fov * 1.5, fov + 2);
    const filterRadiusRad = THREE.MathUtils.degToRad(filterRadius);
    const cosFilterRadius = Math.cos(filterRadiusRad);

    const initialCount = this.dynamicStars.length;

    // Filter stars within angular distance of view center
    this.dynamicStars = this.dynamicStars.filter(star => {
      const starRaRad = THREE.MathUtils.degToRad(star.ra);
      const starDecRad = THREE.MathUtils.degToRad(star.dec);
      const viewRaRad = THREE.MathUtils.degToRad(viewRaDec.ra);
      const viewDecRad = THREE.MathUtils.degToRad(viewRaDec.dec);

      // Spherical law of cosines for angular distance
      const cosDist = Math.sin(viewDecRad) * Math.sin(starDecRad) +
               Math.cos(viewDecRad) * Math.cos(starDecRad) * Math.cos(starRaRad - viewRaRad);

      return cosDist >= cosFilterRadius;
    });

    const removed = initialCount - this.dynamicStars.length;
    if (removed > 0) {
      console.log(`Filtered ${removed} dynamic stars outside FOV`);
      // Only rebuild the star field if stars were actually removed
      this.createDynamicStarField();
    }
  }

  /**
   * Rebuild dynamic star field with magnitude filtering
   */
  rebuildDynamicStarField(magLimit) {
    // Remove old field and dispose GPU resources
    if (this.dynamicStarField) {
      if (this.dynamicStarField.geometry) this.dynamicStarField.geometry.dispose();
      if (this.dynamicStarField.material) this.dynamicStarField.material.dispose();
      this.celestialSphere.remove(this.dynamicStarField);
    }

    if (this.dynamicStars.length === 0) {
      this.dynamicStarField = null;
      const statusEl = document.getElementById('dynamic-stars-count');
      if (statusEl) statusEl.textContent = `0`;
      return;
    }

    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const sizes = [];
    const magnitudes = [];
    const radius = 100;

    // Build index mapping - include ALL dynamic stars
    this.visibleDynamicStarIndices = [];

    this.dynamicStars.forEach((star, originalIndex) => {
      this.visibleDynamicStarIndices.push(originalIndex);

      const pos = raDecToCartesian(star.ra, star.dec, radius);
      positions.push(pos.x, pos.y, pos.z);

      // Use color index for realistic star colors (same as main stars)
      const color = this.starFieldRenderer_.spectralTypeToColor(null, star.ci);
      colors.push(color[0], color[1], color[2]);

      // Use same size calculation as main stars
      const size = magnitudeToSize(star.mag);
      sizes.push(size);

      // Store magnitude for shader-based visibility
      magnitudes.push(star.mag);
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('magnitude', new THREE.Float32BufferAttribute(magnitudes, 1));

    // Use shared star field shader with magnitude uniforms
    const material = new THREE.ShaderMaterial({
      uniforms: {
        opacity: { value: 0.9 },
        magLimit: { value: this.currentMagnitude },
        magFadeRange: { value: 1.5 }
      },
      vertexShader: SHADERS.VERTEX,
      fragmentShader: SHADERS.FRAGMENT,
      transparent: true,
      vertexColors: true,
      depthWrite: false
    });

    this.dynamicStarField = new THREE.Points(geometry, material);
    this.celestialSphere.add(this.dynamicStarField);

    // Update status
    const statusEl = document.getElementById('dynamic-stars-count');
    if (statusEl) {
      statusEl.textContent = `${this.dynamicStars.length}`;
    }
  }

  /* ======================================================================
     DYNAMIC DATA LOADING
     Load additional stars and DSOs from VizieR when zoomed in
     ====================================================================== */

  /**
   * Check if we need to load more stars for the current view
   */
  checkDynamicStarLoading() {
    // Start loading when zoomed in (FOV < 10°)
    if (this.camera.fov > 10) return;
    if (this.isQueryingGaia || this.isQueryingDSO) return;

    // Get view direction: camera looks at center (0,0,0)
    // View direction in world space is from camera toward center
    // Reuse temporary vectors/matrices to avoid allocations
    this._tempVec3.set(0, 0, 0).sub(this.camera.position).normalize();

    // Transform view direction from world coords to celestial coords
    // by applying the INVERSE of the celestialSphere's world transformation
    this._tempVec3B.copy(this._tempVec3);
    if (this.celestialSphere) {
      // Update the matrix first!
      this.celestialSphere.updateMatrixWorld();
      this._tempMatrix4.copy(this.celestialSphere.matrixWorld);
      this._tempMatrix4B.copy(this._tempMatrix4).invert();
      this._tempMatrix3.setFromMatrix4(this._tempMatrix4B);
      this._tempVec3B.applyMatrix3(this._tempMatrix3);
    }

    const raDec = cartesianToRaDec(this._tempVec3B.x, this._tempVec3B.y, this._tempVec3B.z);

    // Create region key for caching (finer grid for deeper zoom)
    const gridSize = Math.max(1, this.camera.fov);
    const raBucket = Math.floor(raDec.ra / gridSize) * gridSize;
    const decBucket = Math.floor(raDec.dec / gridSize) * gridSize;
    const fovBucket = this.camera.fov < 1 ? 'deep' : (this.camera.fov < 5 ? 'medium' : 'wide');
    // Include magnitude bucket in key so changing magnitude triggers new queries
    const magBucket = Math.floor(this.currentMagnitude / 2) * 2; // Buckets: 6, 8, 10, 12, etc.
    const regionKey = `${raBucket.toFixed(0)}_${decBucket.toFixed(0)}_${fovBucket}_mag${magBucket}`;

    // Skip if already queried this region at this magnitude
    if (this.queriedRegions.has(regionKey)) return;

    console.log(`🔭 Dynamic loading triggered: FOV=${this.camera.fov.toFixed(2)}°, RA=${raDec.ra.toFixed(1)}°, Dec=${raDec.dec.toFixed(1)}°`);

    // Query for stars and DSOs in this region (independently)
    this.queryGaiaStars(raDec.ra, raDec.dec, this.camera.fov);
    this.queryVizierDSOs(raDec.ra, raDec.dec, this.camera.fov);
    this.queriedRegions.add(regionKey);
  }

  /* ======================================================================
     DYNAMIC DATA LOADING - DELEGATED TO DynamicDataLoader
     ====================================================================== */

  /**
   * Query and load stars for a region - delegates to DynamicDataLoader
   */
  async queryGaiaStars(ra, dec, fov) {
    const stars = await dynamicDataLoader.queryStars(ra, dec, fov, this.currentMagnitude);
    if (stars && stars.length > 0) {
      // Convert to array format expected by addDynamicStars
      const starArrays = stars.map(s => [s.ra, s.dec, s.mag, s.ci || 0]);
      this.addDynamicStars(starArrays, false);
    }
  }

  /**
   * Query and load DSOs for a region - delegates to DynamicDataLoader
   */
  async queryVizierDSOs(ra, dec, fov) {
    if (fov > 10) return; // Only query when zoomed in enough
    const dsos = await dynamicDataLoader.queryDSOs(ra, dec, fov, this.currentMagnitude);
    if (dsos && dsos.length > 0) {
      this.addDynamicDSOs(dsos);
    }
  }

  /**
   * Add dynamically loaded DSOs to the scene
   */
  addDynamicDSOs(dsoData) {
    if (!this.dynamicDSOs) this.dynamicDSOs = [];

    const radius = 99.5;
    const maxDynamicDSOs = this.maxDynamicDSOs || 5000;  // Use instance setting
    let addedCount = 0;

    // Parse all DSOs first
    const newDSOs = [];
    dsoData.forEach(row => {
      const ra = parseFloat(row[0]);
      const dec = parseFloat(row[1]);
      const mag = parseFloat(row[2]) || 12;
      const sizeMajor = parseFloat(row[3]) || 1; // arcmin
      const sizeMinor = parseFloat(row[4]) || sizeMajor;
      const ngc = row[5];
      const ic = row[6];
      const name = row[7];
      const type = row[8];

      if (isNaN(ra) || isNaN(dec)) return;

      // Check for duplicates
      const isDuplicate = this.dynamicDSOs.some(d =>
        Math.abs(d.ra - ra) < 0.01 && Math.abs(d.dec - dec) < 0.01
      );
      if (isDuplicate) return;

      newDSOs.push({
        ra, dec, mag,
        size_major: sizeMajor,
        size_minor: sizeMinor,
        name: ngc ? `NGC ${ngc}` : (ic ? `IC ${ic}` : name),
        type: type || 'DSO'
      });
    });

    // Add new DSOs
    this.dynamicDSOs.push(...newDSOs);

    // Enforce limit - prioritize by size (larger first) then brightness
    if (this.dynamicDSOs.length > maxDynamicDSOs) {
      // Sort by size (descending) first, then by magnitude (ascending/brighter)
      this.dynamicDSOs.sort((a, b) => {
        // Primary: larger objects first
        const sizeDiff = (b.size_major || 1) - (a.size_major || 1);
        if (Math.abs(sizeDiff) > 0.5) return sizeDiff;
        // Secondary: brighter objects first
        return (a.mag || 15) - (b.mag || 15);
      });
      const excess = this.dynamicDSOs.length - maxDynamicDSOs;
      this.dynamicDSOs = this.dynamicDSOs.slice(0, maxDynamicDSOs);
      console.log(`Dynamic DSOs trimmed: removed ${excess} smallest/faintest, keeping ${maxDynamicDSOs}`);
    }

    // Create sprites for new DSOs
    newDSOs.forEach(dso => {
      // Only create sprite if it's still in the list after trimming
      if (this.dynamicDSOs.includes(dso)) {
        this.createDynamicDSOSprite(dso, radius);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      console.log(`Added ${addedCount} new DSO sprites`);
    }
  }

  /**
   * Create a sprite for a dynamically loaded DSO
   */
  createDynamicDSOSprite(dso, radius) {
    const pos = raDecToCartesian(dso.ra, dso.dec, radius);

    // Calculate magnitude-based intensity (brighter = more visible halo)
    const mag = dso.mag || 10;
    const magIntensity = clamp((10 - mag) / 24, 0.02, 0.25);

    // Create halo texture
    const canvas = document.createElement('canvas');
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);

    // Color based on type with magnitude-based intensity
    let r, g, b;
    if (dso.type && (dso.type.includes('Gx') || dso.type.includes('G'))) {
      r = 255; g = 240; b = 200;  // Galaxy - yellowish
    } else if (dso.type && (dso.type.includes('Nb') || dso.type.includes('PN'))) {
      r = 200; g = 255; b = 220;  // Nebula - greenish
    } else {
      r = 200; g = 220; b = 255;  // Default - pale blue
    }

    const color1 = `rgba(${r}, ${g}, ${b}, ${magIntensity})`;
    const color2 = `rgba(${r}, ${g}, ${b}, 0)`;

    gradient.addColorStop(0, color1);
    gradient.addColorStop(0.7, color2);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    const baseOpacity = clamp((10 - mag) / 10, 0.1, 0.6);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: baseOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(pos);
    sprite.renderOrder = 5;

    sprite.userData = {
      dso: dso,
      angularSizeArcmin: dso.size_major,
      baseOpacity: baseOpacity,
      isDynamic: true  // Mark as dynamically loaded for cleanup
    };

    // Initial size (will be updated by updateExtendedObjectSizes)
    sprite.scale.set(1, 1, 1);

    if (!this.extendedObjectSprites) this.extendedObjectSprites = [];
    this.extendedObjectSprites.push(sprite);
    this.celestialSphere.add(sprite);
  }

  /**
   * Add dynamically loaded stars to the scene
   */
  addDynamicStars(starData, isSimbad = false) {
    const radius = 100;
    const newStars = [];

    starData.forEach(row => {
      // Parse data based on source
      const ra = parseFloat(isSimbad ? row[0] : row[0]);
      const dec = parseFloat(isSimbad ? row[1] : row[1]);
      const mag = parseFloat(isSimbad ? row[2] : row[2]);
      const colorIndex = isSimbad ? 0 : parseFloat(row[3]) || 0;

      // Skip if invalid
      if (isNaN(ra) || isNaN(dec) || isNaN(mag)) return;

      // Check if we already have this star (simple coordinate check)
      const isDuplicate = this.dynamicStars.some(s =>
        Math.abs(s.ra - ra) < 0.001 && Math.abs(s.dec - dec) < 0.001
      );
      if (isDuplicate) return;

      newStars.push({
        ra: ra,
        dec: dec,
        mag: mag,
        ci: colorIndex
      });
    });

    if (newStars.length === 0) return;

    // Add to our list with limit check
    this.dynamicStars.push(...newStars);

    // Enforce maximum dynamic stars limit to prevent memory issues
    if (this.dynamicStars.length > this.maxDynamicStars) {
      // Sort by magnitude (brightest first - lower magnitude = brighter)
      // Keep the brightest stars
      this.dynamicStars.sort((a, b) => a.mag - b.mag);
      const excess = this.dynamicStars.length - this.maxDynamicStars;
      this.dynamicStars = this.dynamicStars.slice(0, this.maxDynamicStars);
      console.log(`Dynamic stars trimmed: removed ${excess} faintest stars, keeping ${this.maxDynamicStars} brightest`);
    }

    // Limit queried regions cache size
    if (this.queriedRegions.size > this.maxQueriedRegions) {
      // Convert to array, remove oldest half
      const regionsArray = Array.from(this.queriedRegions);
      const toRemove = Math.floor(regionsArray.length / 2);
      for (let i = 0; i < toRemove; i++) {
        this.queriedRegions.delete(regionsArray[i]);
      }
      console.log(`Queried regions cache trimmed: removed ${toRemove} regions`);
    }

    // Recreate the dynamic star field
    this.createDynamicStarField();
  }

  /**
   * Create/update the dynamic star field from loaded stars
   */
  createDynamicStarField() {
    // Remove old field and dispose GPU resources
    if (this.dynamicStarField) {
      if (this.dynamicStarField.geometry) this.dynamicStarField.geometry.dispose();
      if (this.dynamicStarField.material) this.dynamicStarField.material.dispose();
      this.celestialSphere.remove(this.dynamicStarField);
    }

    if (this.dynamicStars.length === 0) return;

    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const sizes = [];
    const magnitudes = [];
    const radius = 100;

    this.dynamicStars.forEach(star => {
      const pos = raDecToCartesian(star.ra, star.dec, radius);
      positions.push(pos.x, pos.y, pos.z);

      const color = this.starFieldRenderer_.spectralTypeToColor(null, star.ci);
      colors.push(color[0], color[1], color[2]);

      const size = magnitudeToSize(star.mag);
      sizes.push(size);

      // Store magnitude for shader-based visibility
      magnitudes.push(star.mag);
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('magnitude', new THREE.Float32BufferAttribute(magnitudes, 1));

    // Use shared star field shader with magnitude uniforms
    const material = new THREE.ShaderMaterial({
      uniforms: {
        opacity: { value: 0.9 },
        magLimit: { value: this.currentMagnitude },
        magFadeRange: { value: 1.5 }
      },
      vertexShader: SHADERS.VERTEX,
      fragmentShader: SHADERS.FRAGMENT,
      transparent: true,
      vertexColors: true,
      depthWrite: false
    });

    this.dynamicStarField = new THREE.Points(geometry, material);
    this.celestialSphere.add(this.dynamicStarField);

    // Initialize index mapping
    this.visibleDynamicStarIndices = this.dynamicStars.map((_, i) => i);

    // Update status display
    const statusEl = document.getElementById('dynamic-stars-count');
    if (statusEl) {
      statusEl.textContent = this.dynamicStars.length;
    }

    console.log(`Dynamic star field: ${this.dynamicStars.length} stars`);
  }

}
