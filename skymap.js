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
import {renderBodyImage} from './modules/rendering/BodyImage.js';
import {StarFieldRenderer} from './modules/rendering/StarFieldRenderer.js';
import {TourHighlight} from './modules/rendering/TourHighlight.js';
import {ExtendedObjectRenderer} from './modules/rendering/ExtendedObjectRenderer.js';
import {TourController} from './modules/features/TourController.js';
import {SearchManager} from './modules/features/SearchManager.js';
import {GameController} from './modules/features/GameController.js';
import {TimeController} from './modules/features/TimeController.js';
import {SelectionManager} from './modules/features/SelectionManager.js';
import {VisibilityCalculator} from './modules/features/VisibilityCalculator.js';
import {initializeDailyHighlight} from './modules/features/DailyHighlight.js';
import {panelManager} from './modules/ui/PanelManager.js';
import {eventsCalendar} from './modules/features/EventsCalendar.js';
import {locationManager} from './modules/services/LocationManager.js';
import {getLocationDialog} from './modules/ui/LocationDialog.js';
import {CompassController} from './modules/interaction/CompassController.js';
import {DynamicObjectManager} from './modules/rendering/DynamicObjectManager.js';
import {initializeInputController} from './modules/interaction/InputController.js';
import {
  initializeClickHandler,
  toSelectableDso,
  toSelectableStar,
} from './modules/interaction/ClickHandler.js';
import {CenterIdentifier} from './modules/features/CenterIdentify.js';
import {isWithinMagnitudeLimit} from './modules/core/MagnitudeUtils.js';
import {toSelectablePlanet} from './modules/astronomy/SolarSystem.js';
import {PowerManager} from './modules/core/PowerManager.js';
import {globalEventBus, Events} from './modules/core/EventBus.js';
import {
  raDecToCartesian,
  calculateLST,
  formatAngle,
  cameraToSkyAngle,
  orbitAnglesFor,
  slerpDirection,
  viewDirection,
} from './modules/core/CoordinateUtils.js';
import {CAMERA, STARS, CONSTELLATIONS, SKY} from './modules/core/Constants.js';
import {domCache} from './modules/ui/DOMCache.js';
import {dataLoader} from './modules/services/DataLoader.js';
import {
  MAX_FRAME_MS, REFERENCE_FRAME_MS, clamp, easeFactor, setTextIfChanged, smoothstep,
} from './modules/core/Utils.js';
import {getRenderPixelRatio, worldDirectionToRaDec} from './modules/rendering/SceneUtils.js';
import {updateStarScreen} from './modules/rendering/StarPoints.js';
import {SkyBackground} from './modules/rendering/SkyBackground.js';
import {sunAndMoon} from './modules/astronomy/Observability.js';
import {createLogger} from './modules/core/Logger.js';

const logger = createLogger('Astrapedia');

/** @const {number} Slots in the view-state snapshot: 3 quaternions, fov, aspect */
const VIEW_STATE_SIZE = 14;

/**
 * @const {number} Longest the loop goes without drawing while it runs, so
 * scene changes that never request a render still appear promptly.
 */
const MIN_RENDER_INTERVAL_MS = 250;

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

    // State
    this.currentMagnitude = STARS.DEFAULT_MAGNITUDE;

    // Observer location is owned by the LocationManager singleton; read it
    // through the observerLocation getter below (no local copy to keep in sync).

    this.latitudeTiltGroup = null;
    // Default language from browser locale (e.g., 'fr-FR' -> 'fr')
    // Validate against supported languages, fallback to English
    const browserLang = (navigator.language || 'en').split('-')[0];
    const supportedLangs = getAvailableLanguages();
    this.constellationLanguage = supportedLangs.includes(browserLang)
      ? browserLang
      : 'en';
    /**
     * TelescopeController, owned by main.js and handed over with
     * setTelescopeController(). Queried on demand, so "is the telescope
     * active" has one source of truth rather than a mirrored flag.
     * @private {?TelescopeController}
     */
    this.telescope_ = null;

    /** @private {?number} FOV last announced with FOV_CHANGED */
    this.announcedFov_ = null;

    /** @private {?CenterIdentifier} */
    this.centerIdentifier_ = null;

    /** @private {?{limit: number, objects: !Array<!Object>}} */
    this.identifiableCache_ = null;

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
    /**
     * Fly-to in progress: the rotation follows a great circle from `from` to
     * the target over `duration` ms, instead of easing each angle on its own.
     * @private {?{from: !Array<number>, to: !Array<number>, theta: number,
     *     phi: number, elapsed: number, duration: number}}
     */
    this.flight_ = null;
    /** @private {?number} Time of the previous animate() call */
    this.lastAnimateTime_ = null;
    this.zoomLerpSpeed = CAMERA.ZOOM_LERP_SPEED;

    // Dynamic star/DSO loading (delegated to DynamicObjectManager)
    this.dynamicObjectManager_ = null;

    // === PERFORMANCE OPTIMIZATIONS ===
    // Reusable vectors will be initialized after THREE is confirmed loaded
    this._tempVec3 = null;

    // Dirty flags to skip unnecessary updates
    this._fovDirty = true;
    this._lastFov = null;

    // Frame skipping: the loop runs for an idle tail after every interaction,
    // but only draws when something visible may have changed (see animate).
    this._renderRequested = true;
    this._lastRenderTime = 0;
    this._lastViewState = new Float64Array(VIEW_STATE_SIZE);

    // Throttling for expensive operations
    this._lastImageVisUpdate = 0;
    this._lastDynamicCheck = 0;
    /** @private {?SkyBackground} */
    this.skyBackground_ = null;
    /** @private {number} When the sky background last followed the Sun */
    this.lastSkyUpdate_ = 0;

    // === DEVICE DETECTION ===
    // Detect mobile/touch devices for UX adjustments
    this.isMobile = this.detectMobile_();

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
    updateStarScreen();
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
      getPlanets: () => this.planetRenderer_?.getPlanets() || [],
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
      renderBodyImage,
      getObserverLocation: () => this.observerLocation,
      getTime: () => this.timeController_?.getTime() ?? new Date(),
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
      // IAU constellation boundaries via astronomy-engine, which takes RA in hours.
      getConstellation: (ra, dec) => (typeof Astronomy === 'undefined' ? null :
        this.getConstellationName(Astronomy.Constellation(ra / 15, dec).symbol)),
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
      getPlanets: () => this.planetRenderer_?.getPlanets() || [],
      getDSOs: () => this.deepSkyObjects || [],
      getStars: () => this.stars || [],
    });

    this.dailyHighlight_ = initializeDailyHighlight({
      getVisibleObjects: (lst) =>
        this.visibilityCalculator_.getBestVisibleObjectsTonight(20, 8, 40, lst),
      // Real location or null — null triggers the famous-object fallback,
      // rather than the calculator's {45,0} placeholder.
      getLocation: () => this.observerLocation || null,
      getFamousObjects: () => (this.deepSkyObjects || []).filter((d) =>
        d.mag != null && d.mag < 8 &&
        (d.common_names || (d.messier !== null && d.messier !== undefined))),
      calculateLST,
    });
  }

  /**
   * The day's featured object (Tonight's Highlight), or null.
   * @returns {?{object: !Object, name: string, label: string}}
   */
  getDailyHighlight() {
    return this.dailyHighlight_?.getHighlight();
  }

  /**
   * Initialize the CompassController module.
   * @private
   */
  initCompassController_() {
    this.compassController_ = new CompassController({
      requestRender: () => this.requestRender(),
      notify: (message, ms) => panelManager.showNotification(message, ms),
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
   * Name what the phone points at while compass mode follows it.
   * @private
   */
  initCenterIdentifier_() {
    this.centerIdentifier_ = new CenterIdentifier({
      getViewCenterRaDec: () => this.getViewCenterRaDec(),
      getFov: () => this.camera.fov,
      getCandidates: () => this.identifiableObjects_(),
      selectObject: (obj) => this.selectObject(obj),
    });
    this.centerIdentifier_.initialize();
  }

  /**
   * Objects worth naming at the screen centre: planets, named stars and
   * deep-sky objects within the magnitude limit.
   * @returns {!Iterable<!Object>} Selectable objects
   * @private
   */
  identifiableObjects_() {
    const limit = this.currentMagnitude;
    if (this.identifiableCache_?.limit !== limit) {
      this.identifiableCache_ = {
        limit,
        objects: [
          ...this.stars.filter((s) => s.proper && isWithinMagnitudeLimit(s.mag, limit))
              .map(toSelectableStar),
          ...this.deepSkyObjects.filter((d) => isWithinMagnitudeLimit(d.mag, limit))
              .map(toSelectableDso),
        ],
      };
    }
    const planets = (this.planetRenderer_?.getPlanets() || []).map(toSelectablePlanet);
    const cached = this.identifiableCache_.objects;
    // Iterated, not concatenated: this runs on every compass update.
    return (function* () {
      yield* planets;
      yield* cached;
    })();
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
    // PowerManager owns the frame scheduling (including the Android resume
    // re-kick); the app only draws.
    this.powerManager_ = new PowerManager({
      renderFrame: () => this.animate(),
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
      getExtendedObjectSprites: () => this.extendedObjectRenderer_.getSprites(),
      addExtendedSprite: (sprite) => {
        this.extendedObjectRenderer_.addSprite(sprite);
        // Newly loaded halos start at their base size; mark dirty so the next
        // frame scales them for the current field of view.
        this._fovDirty = true;
      },
      removeExtendedSprite: (sprite) => this.extendedObjectRenderer_.removeSprite(sprite),
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
      isZoomLocked: () => this.isTelescopeActive(),
      // In compass mode a drag lines the sky up with the real one: the
      // sensor pauses during it and keeps the difference as a correction.
      onDragStart: () => this.compassController_?.beginAlignment(),
      onDragEnd: () => this.compassController_?.endAlignment(this.cameraRotation.theta),
      // A flick would carry the sky past where the user lined it up.
      allowsInertia: () => !this.isCompassModeEnabled(),
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
      getStarField: () => this.starFieldRenderer_?.getStarField(),
      getPlanetSprites: () => this.planetRenderer_?.getSprites() || [],
      getExtendedObjectSprites: () => this.extendedObjectRenderer_?.getSprites() || [],
      getConstellationLinesGroup: () => this.constellationRenderer_?.getLinesGroup(),
      getDynamicObjectManager: () => this.dynamicObjectManager_,
      isConstellationLinesVisible: () => this.constellationRenderer_?.isVisible() ?? true,
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
    });

    // Playback needs the loop running; this covers every way speed changes.
    globalEventBus.on(Events.TIME_SPEED_CHANGED, (data) => {
      if (data.isPlaying) this.startAnimating();
    });

    // Game commands. The category picker (GameUI) passes its choice.
    globalEventBus.on(Events.CMD_START_GAME, (data) => {
      if (!this.gameController_) return;
      this.gameController_.setCategory(data?.category ||
          this.gameController_.getCategory() || 'known-constellations');
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
        // LocationManager has already stored the new location (it emitted this
        // event), so this.observerLocation now reflects it.
        // Update all sky elements for new location
        this.updateLatitudeTilt();
        this.timeController_.refreshCelestialRotation();
        this.createPlanets();
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
   * Initialize the application: load data, setup scene, start animation.
   * The UI is wired before this runs, so it hears the first time, planet and
   * location events. Rejects on failure; main.js shows the error.
   * @returns {!Promise<void>}
   */
  async init() {
    const loadingText = document.querySelector('.loading-text');
    const updateStatus = (msg) => {
      logger.info(msg);
      if (loadingText) loadingText.textContent = msg;
    };

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

    // Sky colour and the Milky Way, behind everything
    this.skyBackground_ = new SkyBackground({
      scene: this.scene,
      celestialSphere: this.celestialSphere,
      requestRender: () => this.requestRender(),
    });
    this.skyBackground_.initialize();
    this.updateSkyBackground_();

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
    this.initCenterIdentifier_();

    // Initialize search index (Feature 5)
    this.buildSearchIndex();

    // Set initial celestial rotation based on current time and location
    this.timeController_.refreshCelestialRotation();

    // Show the current time (instead of "Loading...") now TimeUI listens.
    this.timeController_.announceTime();

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
    this.renderer.setPixelRatio(getRenderPixelRatio());
    container.appendChild(this.renderer.domElement);
    this.setupContextLossHandling_();
  }

  /**
   * Recover from WebGL context loss.
   *
   * On Android (Capacitor WebView) the GPU surface is reclaimed when the app
   * is backgrounded for a while or the screen sleeps, which loses the WebGL
   * context and leaves the sky black on return. Two things are needed:
   * preventDefault() on the loss event, without which the browser will not
   * restore the context at all; and, once restored, a forced repaint — the
   * render loop may have been paused, and Three.js re-uploads its GPU
   * resources lazily on the next render, so nothing reappears until we ask
   * for a frame.
   * @private
   */
  setupContextLossHandling_() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      logger.warn('WebGL context lost; pausing until it is restored');
      this.stopAnimating();
    }, false);

    canvas.addEventListener('webglcontextrestored', () => {
      logger.info('WebGL context restored; repainting the sky');
      // FOV-derived sizes (halos, images) are recomputed only when dirty, so
      // mark them stale before forcing frames back on.
      this._fovDirty = true;
      this.requestRender();
      this.startAnimating();
    }, false);
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
    // At latitude L the celestial pole sits L above the north horizon; tilt
    // around the X axis to achieve this.
    this.latitudeTiltGroup.rotation.x = locationManager.getLatitudeTilt();
  }

  /**
   * Create star field visualization.
   * Delegates to StarFieldRenderer module.
   */
  createStarField() {
    const result = this.starFieldRenderer_.create();
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
  }

  /**
   * Set constellation lines display mode (off/focus/all).
   * @param {string} mode - One of CONSTELLATIONS.MODE_OFF/MODE_FOCUS/MODE_ALL
   */
  setConstellationLinesMode(mode) {
    this.constellationRenderer_?.setMode(mode);
    this.requestRender();
  }

  /**
   * Get the RA/Dec coordinates of the current view center.
   * @returns {{ra: number, dec: number}} View center in degrees
   */
  getViewCenterRaDec() {
    this.camera.getWorldDirection(this._tempVec3);
    return worldDirectionToRaDec(this._tempVec3, this.celestialSphere);
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
   */
  createPlanets() {
    this.planetRenderer_.create();
    // Mark FOV dirty to trigger updatePlanetSizes() on next frame
    this._fovDirty = true;
    this.onPlanetsChanged_();
  }

  /**
   * Propagate new planet positions to search and PLANETS_UPDATED subscribers
   * (e.g. SkyConditionsHandler).
   * @private
   */
  onPlanetsChanged_() {
    const planets = this.planetRenderer_.getPlanets();
    this.searchManager_?.updatePlanets(planets);
    globalEventBus.emit(Events.PLANETS_UPDATED, {
      planets,
      moon: this.planetRenderer_.getPlanetByName('Moon'),
    });
  }

  /**
   * Update planet positions without recreating sprites.
   * Delegates to PlanetRenderer module.
   */
  updatePlanetPositions() {
    if (this.planetRenderer_.getSprites().length === 0) {
      // No sprites yet, need full creation
      this.createPlanets();
      return;
    }

    this.planetRenderer_.updatePositions();
    this.onPlanetsChanged_();
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
    this.constellationRenderer_?.setMagnitudeLimit(magLimit);

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
    const ra = `${raDec.ra.toFixed(1)}°`;
    const dec = `${raDec.dec.toFixed(1)}°`;
    setTextIfChanged(domCache.raDisplay, ra);
    setTextIfChanged(domCache.decDisplay, dec);
    setTextIfChanged(domCache.coordsBadge, `RA ${ra} Dec ${dec}`);
    this.updateFovReadout_();
  }

  /**
   * Write the current field of view to the readout and the info badge.
   * @private
   */
  updateFovReadout_() {
    // The sky the view spans, not the camera's own angle (see cameraToSkyAngle).
    const fov = formatAngle(cameraToSkyAngle(this.camera.fov));
    setTextIfChanged(domCache.fovDisplay, fov);
    setTextIfChanged(domCache.fovBadge, fov);
    // Pans call this on every move; only a real zoom is news.
    if (this.camera.fov !== this.announcedFov_) this.announceFov_();
  }

  /**
   * Tell overlays drawn to the sky's scale the camera's vertical FOV.
   * @private
   */
  announceFov_() {
    this.announcedFov_ = this.camera.fov;
    globalEventBus.emit(Events.FOV_CHANGED, {fov: this.camera.fov});
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

  /**
   * Ease the zoom and rotation toward their targets.
   * @param {number=} frameMs - Time since the last frame; easing is by time,
   *     not by frame, so it runs at the same speed at any refresh rate.
   * @returns {boolean} Whether the camera moved
   */
  updateSmoothZoom(frameMs = REFERENCE_FRAME_MS) {
    if (this.targetFov === null) return false;

    let changed = this.updateFlight_(frameMs);
    const ease = easeFactor(this.zoomLerpSpeed, frameMs);

    // Smoothly interpolate FOV
    if (this.isFovConverging_()) {
      this.camera.fov += (this.targetFov - this.camera.fov) * ease;
      this.camera.updateProjectionMatrix();
      changed = true;

      // Update grid density based on new FOV
      this.gridRenderer_?.updateForFov(this.camera.fov);
    }

    // Smoothly interpolate rotation (a fly-to moves it instead)
    if (!this.flight_ && this.isRotationConverging_()) {
      this.cameraRotation.theta += this.thetaDiffToTarget_() * ease;
      this.cameraRotation.phi +=
          (this.targetPhi - this.cameraRotation.phi) * ease;

      // Clamp phi
      this.cameraRotation.phi = clamp(this.cameraRotation.phi, 0.1, Math.PI - 0.1);

      this.updateCameraPosition();
      changed = true;
    }

    return changed;
  }

  /**
   * Advance a fly-to along its great circle.
   * @param {number} frameMs - Time since the last frame
   * @returns {boolean} Whether the camera moved
   * @private
   */
  updateFlight_(frameMs) {
    const flight = this.flight_;
    if (!flight) return false;
    // A drag, reset or compass reading retargeted the camera: let it.
    if (this.targetTheta !== flight.theta || this.targetPhi !== flight.phi ||
        this.isCompassModeEnabled()) {
      this.flight_ = null;
      return false;
    }
    flight.elapsed += frameMs;
    const progress = flight.elapsed / flight.duration;
    if (progress >= 1) {
      this.cameraRotation.theta = flight.theta;
      this.cameraRotation.phi = flight.phi;
      this.flight_ = null;
    } else {
      const {theta, phi} = orbitAnglesFor(slerpDirection(flight.from, flight.to, smoothstep(progress)));
      this.cameraRotation.theta = theta;
      this.cameraRotation.phi = clamp(phi, 0.1, Math.PI - 0.1);
    }
    this.updateCameraPosition();
    return true;
  }

  /**
   * Colour the sky and set the Milky Way for where the Sun and Moon stand at
   * the simulated time.
   * @private
   */
  updateSkyBackground_() {
    const location = this.observerLocation;
    if (!this.skyBackground_ || !location) return;
    this.skyBackground_.setSky(sunAndMoon(location, this.timeController_?.getTime() ?? new Date()));
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
        planets: this.planetRenderer_?.getPlanets() || [],
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

    const target = orbitAnglesFor([dir.x, dir.y, dir.z]);
    const targetTheta = target.theta;
    const targetPhi = clamp(target.phi, 0.1, Math.PI - 0.1);

    // Fly along the great circle, slowly at both ends, for longer the further
    // it goes.
    const from = viewDirection(this.cameraRotation.theta, this.cameraRotation.phi);
    const to = viewDirection(targetTheta, targetPhi);
    const travel = Math.acos(clamp(from[0] * to[0] + from[1] * to[1] + from[2] * to[2], -1, 1));
    this.flight_ = {
      from, to, theta: targetTheta, phi: targetPhi, elapsed: 0,
      duration: Math.min(CAMERA.FLIGHT_MAX_MS,
          CAMERA.FLIGHT_MIN_MS + CAMERA.FLIGHT_MS_PER_RAD * travel),
    };
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
    // TimeController emits TIME_TICK, which TimeUI renders.
    if (deltaMs > 0) {
      this.timeController_.update(deltaMs);
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
    // TIME_SPEED_CHANGED drives the display (TimeUI) and the loop.
    this.timeController_.setSpeed(speed);
  }

  jumpToTime(date) {
    // Delegate to TimeController (handles celestial rotation, planet updates
    // and the TIME_CHANGED that TimeUI renders)
    this.timeController_.setTime(date);

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
   * Get description for a planet.
   * @param {string} planetName - Planet name
   * @returns {string} Description
   */
  getPlanetDescription(planetName) {
    return this.tourController_.getPlanetDescription(planetName);
  }

  /**
   * Sun, Moon and planets at the simulated time.
   * @returns {!Array<!Object>} {name, ra, dec, mag, angularSize, phase?}
   */
  getPlanets() {
    return this.planetRenderer_?.getPlanets() || [];
  }

  /**
   * The observer location, owned by the LocationManager singleton.
   * @returns {!Object} {lat, lon, height}
   */
  get observerLocation() {
    return locationManager.getLocation();
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

  /**
   * Get the next upcoming celestial event, for the Sky-view chrome.
   * Delegates to EventsCalendar module.
   * @returns {?Object} The next event, or null if none.
   */
  getNextEvent() {
    return eventsCalendar.getNextEvent();
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
    updateStarScreen();
    // Sprite sizes are derived from the canvas height, so a resize needs the
    // same recalculation a zoom does.
    this._fovDirty = true;
    this.announceFov_();
    this.requestRender();
  }

  setObserverLocation() {
    // Open the styled dialog rather than the native prompt(), which broke the
    // visual language and ignored the night-vision palette. The dialog does
    // the parsing/validation and routes through LocationManager — the owner
    // that clamps, normalizes, persists, and emits LOCATION_CHANGED (whose
    // handler applies it to the scene, horizon renderer included).
    getLocationDialog()?.show();
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

  /**
   * Hand over the telescope simulator (owned by main.js).
   * @param {!TelescopeController} telescope
   */
  setTelescopeController(telescope) {
    this.telescope_ = telescope;
  }

  /**
   * Whether telescope mode is active (it locks zoom).
   * @returns {boolean}
   */
  isTelescopeActive() {
    return this.telescope_?.isActive() ?? false;
  }

  /**
   * Set the dynamic star limit; the DSO limit follows it.
   * @param {number} maxStars
   */
  setDynamicLimits(maxStars) {
    this.dynamicObjectManager_?.setLimits(maxStars);
  }

  resetView() {
    // Telescope mode locks zoom (InputController.isZoomLocked), so resetting
    // the FOV underneath it would leave the user at ~106 degrees with the
    // reticle still up, the magnitude slider still disabled, and no way to
    // zoom back in. Leave the telescope first — "reset view" plainly means
    // "give me the default sky back".
    if (this.isTelescopeActive()) {
      this.telescope_.deactivateTelescopeMode();
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
    this._renderRequested = true;
    // No-op until init() creates the PowerManager; init ends by starting the
    // loop, which draws anything requested before then.
    this.powerManager_?.requestRender();
  }

  /**
   * Start the animation loop.
   * Delegated to PowerManager module.
   */
  startAnimating() {
    this.powerManager_?.startAnimating();
  }

  /**
   * Stop the animation loop (power saving).
   * Delegated to PowerManager module.
   */
  stopAnimating() {
    this.powerManager_?.stopAnimating();
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
    const now = performance.now();
    // Animations step by elapsed time; a long pause (the loop idled) counts
    // as one ordinary frame rather than a jump.
    const frameMs = this.lastAnimateTime_ === null ? REFERENCE_FRAME_MS :
        Math.min(now - this.lastAnimateTime_, MAX_FRAME_MS);
    this.lastAnimateTime_ = now;
    let needsRender = this._renderRequested;
    this._renderRequested = false;

    // Feature 7: Update time simulation if playing (delegate to TimeController)
    if (this.timeController_.isPlaying()) {
      const deltaMs = now - (this._lastFrameTime || now);
      this._lastFrameTime = now;
      this.updateSimulationTime(deltaMs);
    } else {
      this._lastFrameTime = now;
    }

    // Smooth zoom interpolation
    const zoomChanged = this.updateSmoothZoom(frameMs);

    // Check if FOV changed (for dirty flag)
    const fovChanged = this._lastFov !== this.camera.fov;
    if (fovChanged) {
      this._lastFov = this.camera.fov;
      this._fovDirty = true;
      this.updateFovReadout_();
    }

    // Update visibility functions only when needed or throttled
    // Image visibility - throttled to every 500ms (reduced from 100ms to avoid excessive loading)
    if (this._fovDirty || this.imageRenderer_?.isFadingIn() ||
        (now - this._lastImageVisUpdate > 500)) {
      this.updateImageVisibility();
      this._lastImageVisUpdate = now;
      needsRender = true;
      // Keep the loop running until a picture's fade-in has finished.
      if (this.imageRenderer_?.isFadingIn()) this.requestRender();
    }

    // Extended objects - only when something they depend on changed.
    // updateSizes reads the field of view and the canvas height and nothing
    // else, so the old 10Hz timer recomputed an identical result over every
    // halo ten times a second: ~17,000 wasted iterations per second for the
    // bundled catalog, and four times that once dynamic objects load.
    // Planet and label sizes depend on the FOV too.
    if (this._fovDirty) {
      this.updateExtendedObjectSizes();
      this.updatePlanetSizes();
      this.updateCardinalLabelSizes();
    }

    if (this._fovDirty) {
      this.skyBackground_?.setViewFov(cameraToSkyAngle(this.camera.fov));
    }

    // Clear FOV dirty flag
    if (this._fovDirty) needsRender = true;
    this._fovDirty = false;

    // The Sun and Moon move slowly; their effect on the sky is updated
    // about once a second.
    if (now - this.lastSkyUpdate_ > SKY.UPDATE_MS) {
      this.updateSkyBackground_();
      this.lastSkyUpdate_ = now;
    }

    // Dynamic star loading - throttled to every 500ms to reduce API calls
    if (now - this._lastDynamicCheck > 1000) {
      this.dynamicObjectManager_?.checkLoading();
      this.dynamicObjectManager_?.checkCleanup();
      this._lastDynamicCheck = now;
    }

    // Update tour highlight animation (cheap, runs every frame when active)
    if (this.tourHighlightModule_?.isActive()) {
      this.updateTourHighlight();
      needsRender = true;
    }

    // Stars loaded while zooming fade in
    if (this.dynamicObjectManager_?.updateFadeIn(now)) {
      this.requestRender();
      needsRender = true;
    }

    // Lines fading in or out after being switched on or off
    if (this.constellationRenderer_?.update(frameMs)) {
      this.requestRender();
      needsRender = true;
    }

    // Constellation focus mode - fade nearest constellation
    if (this.constellationRenderer_?.getMode() === CONSTELLATIONS.MODE_FOCUS) {
      const viewCenter = this.getViewCenterRaDec();
      const stillFading = this.constellationRenderer_?.updateFocusMode(
        viewCenter.ra, viewCenter.dec, frameMs
      );
      if (stillFading) {
        this.requestRender();
        needsRender = true;
      }
    }

    // Skip the draw when nothing visible changed. Some scene mutations land
    // asynchronously (texture loads, dynamic catalog results) without asking
    // for a render, so still draw at a low floor rate while the loop runs.
    if (this.viewStateChanged_() || zoomChanged) needsRender = true;
    if (needsRender || now - this._lastRenderTime > MIN_RENDER_INTERVAL_MS) {
      this.renderer.render(this.scene, this.camera);
      this._lastRenderTime = now;
    }
  }

  /**
   * Whether the camera or sky orientation moved since the last call.
   * Covers drags, inertia, compass, zoom, resize, sidereal rotation and
   * latitude tilt in one comparison.
   * @returns {boolean}
   * @private
   */
  viewStateChanged_() {
    const sphere = this.celestialSphere;
    let changed = this.trackQuaternion_(0, this.camera.quaternion);
    changed = this.trackQuaternion_(4, sphere?.quaternion) || changed;
    changed = this.trackQuaternion_(8, sphere?.parent?.quaternion) || changed;
    const last = this._lastViewState;
    if (last[12] !== this.camera.fov || last[13] !== this.camera.aspect) {
      last[12] = this.camera.fov;
      last[13] = this.camera.aspect;
      changed = true;
    }
    return changed;
  }

  /**
   * Record a quaternion into the view-state snapshot, without allocating.
   * @param {number} offset - Index of its first component in the snapshot
   * @param {?THREE.Quaternion} q
   * @returns {boolean} Whether it differed from the stored value
   * @private
   */
  trackQuaternion_(offset, q) {
    if (!q) return false;
    const last = this._lastViewState;
    if (last[offset] === q.x && last[offset + 1] === q.y &&
        last[offset + 2] === q.z && last[offset + 3] === q.w) {
      return false;
    }
    last[offset] = q.x;
    last[offset + 1] = q.y;
    last[offset + 2] = q.z;
    last[offset + 3] = q.w;
    return true;
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
   */
  createExtendedObjects() {
    this.extendedObjectRenderer_.create();
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
