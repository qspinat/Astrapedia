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
  CURATED_IMAGES,
  getCuratedImage,
  hasCuratedImage,
  getCuratedImageKeys,
} from './modules/data/CuratedImages.js';
import {
  raDecToCartesian as _raDecToCartesian,
  cartesianToRaDec as _cartesianToRaDec,
  angularDistance,
  dateToJulianDate as _dateToJulianDate,
  calculateLST as _calculateLST,
} from './modules/core/CoordinateUtils.js';

/* ==========================================================================
   1. SHARED CONSTANTS
   Shader code used by multiple star field renderers
   ========================================================================== */

const STAR_VERTEX_SHADER = `
  attribute float size;
  attribute float magnitude;
  uniform float magLimit;
  uniform float magFadeRange;
  varying vec3 vColor;
  varying float vVisibility;
  void main() {
    vColor = color;

    // Calculate visibility based on magnitude vs threshold
    // Stars brighter than limit are fully visible
    // Stars within fadeRange of limit fade out smoothly
    // Stars beyond limit + fadeRange are invisible
    float magDiff = magnitude - magLimit;

    // Scale intensity range based on magnitude limit
    // Use magLimit + 2 as the range, so faint stars remain visible at high mag settings
    float intensityRange = max(12.0, magLimit + 2.0);

    if (magDiff <= 0.0) {
      // Brighter than limit - use magnitude-based intensity
      // Scale from -2 (brightest) to magLimit (faintest visible)
      float magIntensity = 1.0 - (magnitude + 2.0) / intensityRange;
      // Ensure minimum visibility of 0.35 for faint stars (was 0.2)
      vVisibility = clamp(0.35 + 0.65 * magIntensity, 0.35, 1.0);
    } else if (magDiff < magFadeRange) {
      // In fade range - smoothly fade out
      float fadeProgress = magDiff / magFadeRange;
      float baseMagIntensity = 1.0 - (magnitude + 2.0) / intensityRange;
      float baseVis = clamp(0.35 + 0.65 * baseMagIntensity, 0.35, 1.0);
      vVisibility = baseVis * (1.0 - smoothstep(0.0, 1.0, fadeProgress));
    } else {
      // Beyond fade range - invisible
      vVisibility = 0.0;
    }

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z) * (vVisibility > 0.01 ? 1.0 : 0.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const STAR_FRAGMENT_SHADER = `
  uniform float opacity;
  varying vec3 vColor;
  varying float vVisibility;
  void main() {
    if (vVisibility < 0.01) discard;
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
    // Apply visibility to both color brightness and alpha
    vec3 brightColor = vColor * (0.5 + 0.5 * vVisibility);
    gl_FragColor = vec4(brightColor, alpha * opacity * vVisibility);
  }
`;

/* ==========================================================================
   2. SKYMAP APPLICATION CLASS
   ========================================================================== */

/**
 * Main Sky Map Application class.
 * Manages the 3D celestial sphere visualization, star rendering,
 * user interactions, and astronomical calculations.
 */
class SkyMapApp {
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

    // Data
    this.stars = [];
    this.deepSkyObjects = [];
    this.constellations = {};
    this.namedObjects = {};
    this.objectImages = {};  // Store loaded images
    this.imageSprites = [];  // Store THREE.js sprites for images
    this.extendedObjectSprites = [];  // Store sprites for objects with real angular size

    // State
    this.currentMagnitude = 8.0;  // Default magnitude limit
    this.currentLevel = 3;
    this.gameCategory = 'known-constellations';  // Selected game category
    this.observerLocation = { lat: 45, lon: 0, height: 0 };  // Default to 45°N latitude
    this.horizonLine = null;
    this.localHorizon = null;  // Local horizon line (fixed, green)
    this.latitudeTiltGroup = null;  // Group for latitude-based sky tilt
    this.gridLines = null;
    this.planets = [];  // Planet objects
    this.planetSprites = [];  // Planet sprites for rendering
    this.cardinalLabels = [];
    this.constellationLinesGroup = null;
    this.showConstellationLines = true;
    this.constellationLanguage = 'en';  // Default to English
    this.forceNightMode = true;  // Force night mode by default

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
    this.tourHighlight = null;  // Highlight sprite for current tour object

    // Camera control
    this.isDragging = false;
    this.previousMousePosition = { x: 0, y: 0 };
    this.cameraRotation = { theta: 0, phi: Math.PI / 2 };
    this.cameraDistance = 50;  // Start further out for better view
    this.minDistance = 0.5;    // Allow zooming close to stars
    this.maxDistance = 95;     // Stay inside sphere (radius 100)

    // Smooth zoom targets
    this.targetFov = null;  // Will be set after camera init
    this.targetTheta = null;
    this.targetPhi = null;
    this.zoomLerpSpeed = 0.12;  // Smoothing factor (0-1, higher = faster)

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

    // Game state
    this.gameActive = false;
    this.currentQuestion = null;
    this.gameScore = 0;
    this.gameCorrect = 0;
    this.gameStartTime = null;
    this.passedQuestions = [];

    // Dynamic image loading for nebulae/clusters
    this.dynamicImageCache = new Map();    // Cache: objectName -> { url: string | null, loading: boolean }

    // === PERFORMANCE OPTIMIZATIONS ===
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

    // === POWER SAVING ===
    this._isPageVisible = true;    // Page visibility state
    this._needsRender = true;    // Dirty flag for render-on-demand
    this._isAnimating = false;     // Animation loop running state
    this._idleTimeout = null;    // Timeout for stopping animation when idle
    this._lastInteractionTime = 0;   // Track last user interaction

    // === COMPASS MODE (Device Orientation) ===
    this.compassMode = false;      // Whether compass mode is active
    this.compassHeading = 0;       // Current compass heading in radians
    this.compassTilt = Math.PI / 2; // Current tilt (beta) in radians
    this._lastOrientationTime = 0; // Timestamp of last orientation event
    this._orientationTimeout = null; // Timeout to detect stale compass
    this._deviceOrientationHandler = null; // Bound handler for cleanup

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
    this._tempMatrix3 = new THREE.Matrix3();
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
      this.setupCamera();
      this.setupRenderer();
      this.setupLights();

      // Initialize reusable objects for performance
      this.initTempObjects();

      // Create celestial objects
      this.createCelestialSphere();
      this.createStarField();
      this.createGrid();
      this.createConstellationLines();  // Feature 1
      this.createCardinalLabels();  // Feature 3
      this.createHorizonLine();  // Local horizon (fixed, doesn't rotate with stars)
      this.createObjectImages();  // Create image sprites for DSOs
      this.createExtendedObjects();  // Create sprites for objects with real angular size
      this.createPlanets();  // Add planets to the sky

      // Initialize search index (Feature 5)
      this.buildSearchIndex();

      // Set initial celestial rotation based on current time and location
      this.updateCelestialRotation();

      // Update time display to show current time (instead of "Loading...")
      this.updateSimulationTime(0);

      // Auto-detect location (Feature 4)
      this.requestLocation();

      // Setup event listeners
      this.setupEventListeners();

      // Setup power-saving features
      this.setupPowerSaving();

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

      // Load stars (use medium file for more stars by default)
      console.log('Loading stars...');
      const starsResponse = await fetch('data/stars_medium.json');
      if (!starsResponse.ok) {
        throw new Error(`HTTP error! status: ${starsResponse.status}`);
      }
      this.stars = await starsResponse.json();
      console.log(`✓ Loaded ${this.stars.length} stars`);

      // Load constellations
      console.log('Loading constellations...');
      const constResponse = await fetch('data/constellations.json');
      if (!constResponse.ok) {
        throw new Error(`HTTP error! status: ${constResponse.status}`);
      }
      this.constellations = await constResponse.json();
      console.log(`✓ Loaded ${Object.keys(this.constellations).length} constellations`);

      // Load deep sky objects
      console.log('Loading deep sky objects...');
      const dsoResponse = await fetch('data/deep_sky_objects.json');
      if (!dsoResponse.ok) {
        throw new Error(`HTTP error! status: ${dsoResponse.status}`);
      }
      this.deepSkyObjects = await dsoResponse.json();
      console.log(`✓ Loaded ${this.deepSkyObjects.length} DSOs`);

      // Load named objects
      console.log('Loading named objects...');
      const namedResponse = await fetch('data/named_objects.json');
      if (!namedResponse.ok) {
        throw new Error(`HTTP error! status: ${namedResponse.status}`);
      }
      this.namedObjects = await namedResponse.json();
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

  createStarField() {
    // Include ALL stars up to max magnitude (no filtering - shader handles visibility)
    const maxMagnitude = 20;
    const allStars = this.stars.filter(s => s.mag <= maxMagnitude);
    const allDSOs = this.deepSkyObjects.filter(dso => dso.mag && dso.mag <= maxMagnitude);

    // Create geometry for stars and DSOs
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const sizes = [];
    const magnitudes = [];

    const radius = 100; // Celestial sphere radius

    // Add stars
    allStars.forEach(star => {
      // Convert RA/Dec to Cartesian coordinates
      const pos = this.raDecToCartesian(star.ra, star.dec, radius);
      positions.push(pos.x, pos.y, pos.z);

      // Calculate color from spectral type (Feature 2)
      const starColor = this.spectralTypeToColor(star.spect, star.ci);
      colors.push(starColor[0], starColor[1], starColor[2]);

      // Calculate size based on magnitude
      const size = this.magnitudeToSize(star.mag);
      sizes.push(size);

      // Store magnitude for shader-based visibility
      magnitudes.push(star.mag);
    });

    // Add DSOs with distinct colors
    allDSOs.forEach(dso => {
      // Convert RA/Dec to Cartesian coordinates
      const pos = this.raDecToCartesian(dso.ra, dso.dec, radius);
      positions.push(pos.x, pos.y, pos.z);

      // Color based on DSO type
      let color = [0.5, 0.8, 1.0]; // Default: light blue
      if (dso.type === 'G') {
        color = [1.0, 0.9, 0.6]; // Galaxies: yellowish
      } else if (dso.type === 'PN') {
        color = [0.6, 1.0, 0.6]; // Planetary nebulae: greenish
      } else if (dso.type === 'Neb' || dso.type === 'Cl+N' || dso.type === 'EmN' || dso.type === 'HII') {
        color = [1.0, 0.6, 0.8]; // Nebulae: pinkish
      } else if (dso.type === 'GCl') {
        color = [1.0, 1.0, 0.8]; // Globular clusters: pale yellow
      } else if (dso.type === 'OCl') {
        color = [0.8, 0.9, 1.0]; // Open clusters: pale blue
      }
      colors.push(color[0], color[1], color[2]);

      // Calculate size based purely on magnitude (like stars) for realistic appearance
      const size = this.magnitudeToSize(dso.mag);
      sizes.push(size);

      // Store magnitude for shader-based visibility
      magnitudes.push(dso.mag);
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('magnitude', new THREE.Float32BufferAttribute(magnitudes, 1));

    // Create custom shader material with magnitude-based visibility
    const material = new THREE.ShaderMaterial({
      uniforms: {
        opacity: { value: 0.9 },
        magLimit: { value: this.currentMagnitude },
        magFadeRange: { value: 1.5 }  // Stars fade over 1.5 magnitudes
      },
      vertexShader: STAR_VERTEX_SHADER,
      fragmentShader: STAR_FRAGMENT_SHADER,
      transparent: true,
      vertexColors: true,
      depthWrite: false
    });

    // Remove old star field if exists
    if (this.starField) {
      this.celestialSphere.remove(this.starField);
    }

    this.starField = new THREE.Points(geometry, material);
    this.starFieldMaterial = material;  // Store reference for updating magLimit
    this.celestialSphere.add(this.starField);

    // Store star data for interaction (all stars, filtering done at click time)
    this.starField.userData.stars = allStars;
    this.starField.userData.dsos = allDSOs;

    console.log(`Created star field with ${allStars.length} stars and ${allDSOs.length} DSOs`);

    // Update visible count (approximate based on magnitude limit)
    this.updateVisibleCount(allStars.filter(s => s.mag <= this.currentMagnitude).length +
                 allDSOs.filter(d => d.mag <= this.currentMagnitude).length);
  }

  createGrid() {
    // Remove old grid if exists
    if (this.gridLines) {
      this.celestialSphere.remove(this.gridLines);
    }

    const gridGroup = new THREE.Group();
    const radius = 99; // Slightly smaller than celestial sphere

    // RA lines (meridians) - every 15 degrees (1 hour)
    for (let ra = 0; ra < 360; ra += 15) {
      const points = [];
      for (let dec = -90; dec <= 90; dec += 5) {
        const pos = this.raDecToCartesian(ra, dec, radius);
        points.push(pos);
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0x1A2535,
        transparent: true,
        opacity: 0.2,  // More subtle for realism
        depthWrite: false
      });
      const line = new THREE.Line(geometry, material);
      gridGroup.add(line);
    }

    // Dec lines (parallels)
    for (let dec = -75; dec <= 75; dec += 15) {
      const points = [];
      for (let ra = 0; ra <= 360; ra += 3) {
        const pos = this.raDecToCartesian(ra, dec, radius);
        points.push(pos);
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0x1A2535,
        transparent: true,
        opacity: 0.2,  // More subtle for realism
        depthWrite: false
      });
      const line = new THREE.Line(geometry, material);
      gridGroup.add(line);
    }

    // Add horizon line (dec = 0) - subtle orange color
    const horizonPoints = [];
    for (let ra = 0; ra <= 360; ra += 2) {
      const pos = this.raDecToCartesian(ra, 0, radius + 0.5);
      horizonPoints.push(pos);
    }
    const horizonGeometry = new THREE.BufferGeometry().setFromPoints(horizonPoints);
    const horizonMaterial = new THREE.LineBasicMaterial({
      color: 0xCC5530,  // Subtle orange for horizon
      transparent: true,
      opacity: 0.5,
      linewidth: 2,
      depthWrite: false
    });
    const horizonLine = new THREE.Line(horizonGeometry, horizonMaterial);
    gridGroup.add(horizonLine);

    this.gridLines = gridGroup;
    this.celestialSphere.add(this.gridLines);
  }

  // Feature 1: Constellation Lines
  createConstellationLines() {
    // Remove old lines if they exist
    if (this.constellationLinesGroup) {
      this.celestialSphere.remove(this.constellationLinesGroup);
    }

    this.constellationLinesGroup = new THREE.Group();
    const radius = 98.5; // Between grid and stars

    let linesCreated = 0;
    Object.entries(this.constellations).forEach(([constName, constellation]) => {
      // Create a unique material for each line so we can highlight individually
      // Subtle color for realistic night sky appearance
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x3366AA,  // Subtle blue
        transparent: true,
        opacity: 0.35,  // More transparent for realism
        linewidth: 1,
        depthWrite: false
      });

      constellation.lines.forEach(([hip1, hip2]) => {
        // Find stars by HIP number
        const star1 = this.stars.find(s => s.hip === hip1);
        const star2 = this.stars.find(s => s.hip === hip2);

        if (star1 && star2) {
          const points = [
            this.raDecToCartesian(star1.ra, star1.dec, radius),
            this.raDecToCartesian(star2.ra, star2.dec, radius)
          ];
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(geometry, lineMaterial.clone());
          // Store constellation name for highlighting
          line.userData = { constellation: constName };
          this.constellationLinesGroup.add(line);
          linesCreated++;
        }
      });
    });

    this.constellationLinesGroup.visible = this.showConstellationLines;
    this.celestialSphere.add(this.constellationLinesGroup);
    console.log(`✓ Created ${linesCreated} constellation lines`);
  }

  // Feature 2: Star Colors by Spectral Type (subtle, realistic)
  spectralTypeToColor(spectralType, colorIndex) {
    // Human eye sees most stars as white/pale
    // Only very bright or extreme temperature stars show noticeable color

    // Use color index if available (B-V color)
    if (colorIndex !== null && colorIndex !== undefined) {
      // Color index range: -0.4 (blue) to +2.0 (red)
      // Apply very subtle color tint - most stars look white to human eye
      let r, g, b;

      if (colorIndex < -0.1) {
        // Hot blue stars (O, B) - subtle blue tint
        r = 0.9 + colorIndex * 0.2;
        g = 0.95 + colorIndex * 0.1;
        b = 1.0;
      } else if (colorIndex < 0.4) {
        // White stars (A, F) - nearly pure white
        r = 1.0;
        g = 1.0;
        b = 1.0 - colorIndex * 0.1;
      } else if (colorIndex < 1.0) {
        // Yellow-white stars (G) - very subtle yellow
        r = 1.0;
        g = 1.0 - (colorIndex - 0.4) * 0.15;
        b = 0.95 - (colorIndex - 0.4) * 0.25;
      } else if (colorIndex < 1.5) {
        // Orange stars (K) - subtle orange tint
        r = 1.0;
        g = 0.9 - (colorIndex - 1.0) * 0.15;
        b = 0.85 - (colorIndex - 1.0) * 0.2;
      } else {
        // Red stars (M) - noticeable but not extreme red
        r = 1.0;
        g = Math.max(0.7, 0.85 - (colorIndex - 1.5) * 0.2);
        b = Math.max(0.6, 0.75 - (colorIndex - 1.5) * 0.2);
      }
      return [r, g, b];
    }

    // Fallback to spectral type parsing - subtle colors
    if (spectralType && spectralType.length > 0) {
      const type = spectralType.charAt(0).toUpperCase();
      switch (type) {
        case 'O': case 'B': return [0.9, 0.95, 1.0];  // Pale blue
        case 'A': return [0.98, 0.98, 1.0];       // Blue-white
        case 'F': return [1.0, 1.0, 0.98];        // White
        case 'G': return [1.0, 1.0, 0.95];        // Pale yellow-white
        case 'K': return [1.0, 0.95, 0.85];       // Pale orange
        case 'M': return [1.0, 0.85, 0.75];       // Pale red
        default: return [1.0, 1.0, 1.0];        // White default
      }
    }

    return [1.0, 1.0, 1.0]; // Default white
  }

  // Feature 3: Cardinal Direction Labels
  createCardinalLabels() {
    // Remove old labels
    this.cardinalLabels.forEach(label => this.scene.remove(label));
    this.cardinalLabels = [];

    const radius = 95;
    const directions = [
      { name: 'N', az: 0 },    // North: +Z direction
      { name: 'W', az: 90 },     // West: +X direction
      { name: 'S', az: 180 },    // South: -Z direction
      { name: 'E', az: 270 }     // East: -X direction
    ];

    directions.forEach(dir => {
      // Create canvas for text
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      // Draw text with green color to match horizon
      ctx.fillStyle = '#22C55E';
      ctx.font = 'bold 80px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dir.name, 64, 64);

      // Create sprite
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(material);

      // Position on local horizon (Y=0 plane in scene coordinates)
      // Azimuth: N=0°, E=90°, S=180°, W=270°
      const azRad = THREE.MathUtils.degToRad(dir.az);
      // In Three.js: X is right, Y is up, Z is toward viewer
      // N (+Z), E (+X), S (-Z), W (-X)
      const x = radius * Math.sin(azRad);
      const z = radius * Math.cos(azRad);
      sprite.position.set(x, 2, z);  // Slightly above horizon for visibility
      sprite.scale.set(10, 10, 1);

      this.cardinalLabels.push(sprite);
      this.scene.add(sprite);
    });

    console.log('✓ Created cardinal direction labels (on local horizon)');
  }

  updateCardinalLabelSizes() {
    // Scale labels based on FOV to maintain constant visible size
    // Reference FOV is 60 degrees
    const referenceFov = 60;
    const scaleFactor = this.camera.fov / referenceFov;

    this.cardinalLabels.forEach(label => {
      label.scale.set(10 * scaleFactor, 10 * scaleFactor, 1);
    });
  }

  createHorizonLine() {
    // Create local horizon line - fixed in scene, doesn't rotate with stars
    // The horizon is at Y=0 in scene coordinates (the ground plane)
    // Stars rise above it and set below it as Earth rotates

    // Remove old horizon if exists
    if (this.localHorizon) {
      this.scene.remove(this.localHorizon);
    }

    const horizonGroup = new THREE.Group();
    const radius = 99; // Slightly inside the celestial sphere

    // Create the main horizon circle (at Y=0 plane)
    const segments = 128;
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      points.push(new THREE.Vector3(x, 0, z));
    }

    const horizonGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const horizonMaterial = new THREE.LineBasicMaterial({
      color: 0x22C55E,  // Green color for horizon
      transparent: true,
      opacity: 0.9,
      linewidth: 2,
      depthWrite: false
    });
    const horizonCircle = new THREE.Line(horizonGeometry, horizonMaterial);
    horizonGroup.add(horizonCircle);

    this.localHorizon = horizonGroup;
    this.scene.add(this.localHorizon);

    console.log('✓ Created local horizon line (green)');
  }

  /* ======================================================================
     ASTRONOMICAL CALCULATIONS
     Ephemeris and position calculations for celestial bodies
     ====================================================================== */

  /**
   * Calculate Sun's position based on date (simplified solar position algorithm)
   * @param {Date} date - The date for calculation
   * @returns {Object} RA/Dec coordinates in degrees
   */
  calculateSunPosition(date) {
    // Days since J2000.0 (January 1, 2000, 12:00 TT)
    const jd = this.dateToJulianDate(date);
    const n = jd - 2451545.0;

    // Mean longitude of the Sun (degrees)
    let L = (280.460 + 0.9856474 * n) % 360;
    if (L < 0) L += 360;

    // Mean anomaly of the Sun (degrees)
    let g = (357.528 + 0.9856003 * n) % 360;
    if (g < 0) g += 360;
    const gRad = THREE.MathUtils.degToRad(g);

    // Ecliptic longitude of the Sun (degrees)
    const lambda = L + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad);

    // Obliquity of the ecliptic (degrees)
    const epsilon = 23.439 - 0.0000004 * n;
    const epsilonRad = THREE.MathUtils.degToRad(epsilon);
    const lambdaRad = THREE.MathUtils.degToRad(lambda);

    // Right Ascension and Declination
    const ra = THREE.MathUtils.radToDeg(Math.atan2(Math.cos(epsilonRad) * Math.sin(lambdaRad), Math.cos(lambdaRad)));
    const dec = THREE.MathUtils.radToDeg(Math.asin(Math.sin(epsilonRad) * Math.sin(lambdaRad)));

    return {
      ra: (ra + 360) % 360,
      dec: dec
    };
  }

  // Calculate Moon's position based on date (simplified lunar position algorithm)
  // The Moon has its own orbital path, inclined ~5° to the ecliptic
  calculateMoonPosition(date) {
    const jd = this.dateToJulianDate(date);
    const T = (jd - 2451545.0) / 36525; // Julian centuries since J2000.0

    // Moon's mean longitude (degrees)
    let L0 = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T;
    L0 = L0 % 360;
    if (L0 < 0) L0 += 360;

    // Moon's mean anomaly (degrees)
    let M = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T;
    M = M % 360;
    if (M < 0) M += 360;
    const Mrad = THREE.MathUtils.degToRad(M);

    // Moon's mean elongation from Sun (degrees)
    let D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T;
    D = D % 360;
    if (D < 0) D += 360;
    const Drad = THREE.MathUtils.degToRad(D);

    // Moon's argument of latitude (degrees)
    let F = 93.272095 + 483202.0175233 * T - 0.0036539 * T * T;
    F = F % 360;
    if (F < 0) F += 360;
    const Frad = THREE.MathUtils.degToRad(F);

    // Sun's mean anomaly (degrees)
    let Ms = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T;
    Ms = Ms % 360;
    if (Ms < 0) Ms += 360;
    const Msrad = THREE.MathUtils.degToRad(Ms);

    // Longitude of the ascending node (degrees)
    let Omega = 125.04452 - 1934.136261 * T;
    Omega = Omega % 360;
    if (Omega < 0) Omega += 360;

    // Main perturbations in longitude (simplified)
    let dL = 6.289 * Math.sin(Mrad)       // Equation of center
        + 1.274 * Math.sin(2 * Drad - Mrad)  // Evection
        + 0.658 * Math.sin(2 * Drad)      // Variation
        - 0.186 * Math.sin(Msrad)       // Annual equation
        - 0.114 * Math.sin(2 * Frad);     // Reduction to ecliptic

    // Ecliptic longitude
    let lambda = L0 + dL;
    lambda = lambda % 360;
    if (lambda < 0) lambda += 360;

    // Ecliptic latitude (Moon's orbit inclined ~5.1° to ecliptic)
    let beta = 5.128 * Math.sin(Frad)
         + 0.281 * Math.sin(Mrad + Frad)
         - 0.278 * Math.sin(Frad - Mrad)
         - 0.173 * Math.sin(2 * Drad - Frad);

    // Convert from ecliptic to equatorial coordinates
    const lambdaRad = THREE.MathUtils.degToRad(lambda);
    const betaRad = THREE.MathUtils.degToRad(beta);

    // Obliquity of the ecliptic
    const epsilon = 23.439 - 0.0000004 * (jd - 2451545.0);
    const epsilonRad = THREE.MathUtils.degToRad(epsilon);

    // Right Ascension
    const ra = THREE.MathUtils.radToDeg(
      Math.atan2(
        Math.sin(lambdaRad) * Math.cos(epsilonRad) - Math.tan(betaRad) * Math.sin(epsilonRad),
        Math.cos(lambdaRad)
      )
    );

    // Declination
    const dec = THREE.MathUtils.radToDeg(
      Math.asin(
        Math.sin(betaRad) * Math.cos(epsilonRad) +
        Math.cos(betaRad) * Math.sin(epsilonRad) * Math.sin(lambdaRad)
      )
    );

    // Calculate Moon phase (0-1, where 0 = new moon, 0.5 = full moon)
    // Phase angle is roughly 2*D
    const phaseAngle = (2 * D) % 360;
    const phase = (1 - Math.cos(THREE.MathUtils.degToRad(phaseAngle))) / 2;

    return {
      ra: (ra + 360) % 360,
      dec: dec,
      phase: phase  // 0 = new moon, 0.5 = first/last quarter, 1 = full moon
    };
  }

  // Cache for JPL planet positions
  planetPositionsCache = null;
  planetPositionsCacheTime = null;
  PLANET_CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours (positions don't change much)

  /**
   * Calculate planet position using astronomy-engine (VSOP87)
   * Provides arcsecond-level accuracy for dates within millennia of J2000
   * @param {string} planetName - Name of the planet
   * @param {Date} date - Date for calculation
   * @returns {{ra: number, dec: number}} Geocentric RA/Dec in degrees
   */
  calculatePlanetPosition(planetName, date) {
    // Check if astronomy-engine library is loaded
    if (typeof Astronomy === 'undefined') {
      console.warn('Astronomy library not loaded, using fallback');
      return this.calculatePlanetPositionFallback(planetName, date);
    }

    try {
      // Map planet names to astronomy-engine body names
      const bodyMap = {
        'Mercury': Astronomy.Body.Mercury,
        'Venus': Astronomy.Body.Venus,
        'Mars': Astronomy.Body.Mars,
        'Jupiter': Astronomy.Body.Jupiter,
        'Saturn': Astronomy.Body.Saturn,
        'Uranus': Astronomy.Body.Uranus,
        'Neptune': Astronomy.Body.Neptune
      };

      const body = bodyMap[planetName];
      if (!body) return null;

      // Create Astronomy date from JavaScript Date
      const astroDate = Astronomy.MakeTime(date);

      // Create observer from app's location (required by newer astronomy-engine versions)
      const observer = new Astronomy.Observer(
        this.observerLocation?.lat || 0,
        this.observerLocation?.lon || 0,
        this.observerLocation?.height || 0
      );

      // Get equatorial coordinates (RA/Dec) for the planet
      // ofdate=false means J2000 coordinates, aberration=true includes light travel time
      const equator = Astronomy.Equator(body, astroDate, observer, false, true);

      return {
        ra: equator.ra * 15, // Convert hours to degrees
        dec: equator.dec
      };
    } catch (error) {
      console.warn(`Error calculating position for ${planetName}:`, error);
      return this.calculatePlanetPositionFallback(planetName, date);
    }
  }

  /**
   * Fallback planet position calculation using simple Keplerian elements
   * Used if astronomy-engine library fails to load
   */
  calculatePlanetPositionFallback(planetName, date) {
    // Simplified orbital elements - less accurate but functional
    const approxPositions = {
      'Mercury': { period: 87.97, a: 0.387 },
      'Venus': { period: 224.7, a: 0.723 },
      'Mars': { period: 686.98, a: 1.524 },
      'Jupiter': { period: 4332.59, a: 5.203 },
      'Saturn': { period: 10759.22, a: 9.537 },
      'Uranus': { period: 30688.5, a: 19.191 },
      'Neptune': { period: 60182, a: 30.069 }
    };

    const planet = approxPositions[planetName];
    if (!planet) return null;

    // Very rough approximation based on orbital period
    const J2000 = new Date('2000-01-01T12:00:00Z');
    const daysSinceJ2000 = (date - J2000) / (1000 * 60 * 60 * 24);
    const meanAnomaly = (daysSinceJ2000 / planet.period) * 360;

    // Approximate RA (this is very rough)
    const ra = (meanAnomaly + 280) % 360;
    const dec = Math.sin(THREE.MathUtils.degToRad(meanAnomaly)) * 23.4 * (1 / planet.a);

    return { ra, dec };
  }

  /**
   * Get planet position using astronomy-engine
   */
  getPlanetPosition(planetName, date) {
    return this.calculatePlanetPosition(planetName, date);
  }

  createPlanets() {
    // Remove old planet sprites
    this.planetSprites.forEach(sprite => this.celestialSphere.remove(sprite));
    this.planetSprites = [];

    // Calculate Sun's current position based on simulation time
    const sunPos = this.calculateSunPosition(this.simulationTime);

    // Calculate Moon's current position (it has its own orbital path)
    const moonPos = this.calculateMoonPosition(this.simulationTime);

    // Get planet positions for simulation time
    // Uses JPL cache if near current time, otherwise calculates using orbital mechanics
    const simTime = this.simulationTime || new Date();

    const mercuryPos = this.getPlanetPosition('Mercury', simTime) || { ra: 0, dec: 0 };
    const venusPos = this.getPlanetPosition('Venus', simTime) || { ra: 0, dec: 0 };
    const marsPos = this.getPlanetPosition('Mars', simTime) || { ra: 0, dec: 0 };
    const jupiterPos = this.getPlanetPosition('Jupiter', simTime) || { ra: 0, dec: 0 };
    const saturnPos = this.getPlanetPosition('Saturn', simTime) || { ra: 0, dec: 0 };
    const uranusPos = this.getPlanetPosition('Uranus', simTime) || { ra: 0, dec: 0 };
    const neptunePos = this.getPlanetPosition('Neptune', simTime) || { ra: 0, dec: 0 };

    // Planet, Sun, and Moon data
    // Angular sizes in arcminutes (real apparent sizes from Earth)
    // Sun and Moon positions are calculated locally
    // Planet positions from JPL Horizons (or approximate fallback)
    // Image URLs from NASA/Wikimedia Commons (public domain)
    this.planets = [
      { name: 'Sun', ra: sunPos.ra, dec: sunPos.dec, mag: -26.7, color: 0xFFFF00, angularSize: 32,
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_-_20100819.jpg/480px-The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_-_20100819.jpg' },
      { name: 'Moon', ra: moonPos.ra, dec: moonPos.dec, mag: -12.7, color: 0xC0C0C0, angularSize: 31, phase: moonPos.phase,
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/FullMoon2010.jpg/480px-FullMoon2010.jpg' },
      { name: 'Mercury', ra: mercuryPos.ra, dec: mercuryPos.dec, mag: 0.5, color: 0xB5B5B5, angularSize: 0.1,
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Mercury_in_true_color.jpg/480px-Mercury_in_true_color.jpg' },
      { name: 'Venus', ra: venusPos.ra, dec: venusPos.dec, mag: -4.0, color: 0xFFFACD, angularSize: 0.4,
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Venus_from_Mariner_10.jpg/480px-Venus_from_Mariner_10.jpg' },
      { name: 'Mars', ra: marsPos.ra, dec: marsPos.dec, mag: 1.2, color: 0xCD5C5C, angularSize: 0.1,
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Mars_-_August_30_2021_-_Flickr_-_Kevin_M._Gill.png/480px-Mars_-_August_30_2021_-_Flickr_-_Kevin_M._Gill.png' },
      { name: 'Jupiter', ra: jupiterPos.ra, dec: jupiterPos.dec, mag: -2.5, color: 0xFFE4B5, angularSize: 0.7,
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Jupiter_and_its_shrunken_Great_Red_Spot.jpg/480px-Jupiter_and_its_shrunken_Great_Red_Spot.jpg' },
      { name: 'Saturn', ra: saturnPos.ra, dec: saturnPos.dec, mag: 0.8, color: 0xF4D03F, angularSize: 0.3,
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Saturn_during_Equinox.jpg/480px-Saturn_during_Equinox.jpg' },
      { name: 'Uranus', ra: uranusPos.ra, dec: uranusPos.dec, mag: 5.7, color: 0xAFEEEE, angularSize: 0.06,
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Uranus2.jpg/480px-Uranus2.jpg' },
      { name: 'Neptune', ra: neptunePos.ra, dec: neptunePos.dec, mag: 7.9, color: 0x4169E1, angularSize: 0.04,
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Neptune_-_Voyager_2_%2829347980845%29_flatten_crop.jpg/480px-Neptune_-_Voyager_2_%2829347980845%29_flatten_crop.jpg' }
    ];

    const radius = 99;

    this.planets.forEach(planet => {
      // Create a circular canvas texture for the planet
      const canvas = document.createElement('canvas');
      const canvasSize = 128; // Higher resolution for Sun
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext('2d');

      // Draw planet/sun disc with color
      const gradient = ctx.createRadialGradient(canvasSize/2, canvasSize/2, 0, canvasSize/2, canvasSize/2, canvasSize/2);
      const color = new THREE.Color(planet.color);

      if (planet.name === 'Sun') {
        // Sun has bright center with corona effect
        gradient.addColorStop(0, '#FFFFFF');
        gradient.addColorStop(0.3, '#FFFDE7');
        gradient.addColorStop(0.7, '#FFD54F');
        gradient.addColorStop(0.9, '#FF8F00');
        gradient.addColorStop(1, 'rgba(255, 143, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(canvasSize/2, canvasSize/2, canvasSize/2, 0, Math.PI * 2);
        ctx.fill();
      } else if (planet.name === 'Moon') {
        // Moon with phase rendering
        const cx = canvasSize / 2;
        const cy = canvasSize / 2;
        const r = canvasSize / 2 - 4;

        // Draw the full moon disc first (gray)
        ctx.fillStyle = '#D4D4D4';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Add some subtle crater texture
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

        // Draw shadow for phase (0 = new moon/dark, 1 = full moon/bright)
        const phase = planet.phase || 0.5;
        if (phase < 0.98) { // Not quite full moon
          ctx.fillStyle = 'rgba(10, 15, 28, 0.95)';
          ctx.beginPath();

          // Calculate phase terminator position
          // phase 0 = new moon (all dark), 0.5 = half, 1 = full (all lit)
          const illumination = phase;

          if (illumination < 0.5) {
            // Waning (dark on right) or new moon approaching first quarter
            const terminatorX = cx + r * (1 - illumination * 4);
            ctx.arc(cx, cy, r, -Math.PI/2, Math.PI/2, false);
            ctx.quadraticCurveTo(terminatorX, cy, cx, cy - r);
          } else {
            // Waxing (dark on left) or full moon approaching
            const terminatorX = cx - r * ((1 - illumination) * 4);
            ctx.arc(cx, cy, r, Math.PI/2, -Math.PI/2, false);
            ctx.quadraticCurveTo(terminatorX, cy, cx, cy - r);
          }
          ctx.fill();
        }

        // Soft edge glow
        const edgeGlow = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r);
        edgeGlow.addColorStop(0, 'rgba(212, 212, 212, 0)');
        edgeGlow.addColorStop(1, 'rgba(212, 212, 212, 0)');
        ctx.fillStyle = edgeGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        gradient.addColorStop(0, `rgba(${Math.floor(color.r*255)}, ${Math.floor(color.g*255)}, ${Math.floor(color.b*255)}, 1)`);
        gradient.addColorStop(0.7, `rgba(${Math.floor(color.r*255)}, ${Math.floor(color.g*255)}, ${Math.floor(color.b*255)}, 0.9)`);
        gradient.addColorStop(1, `rgba(${Math.floor(color.r*255)}, ${Math.floor(color.g*255)}, ${Math.floor(color.b*255)}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(canvasSize/2, canvasSize/2, canvasSize/2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Create sprite
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(material);

      // Position
      const pos = this.raDecToCartesian(planet.ra, planet.dec, radius);
      sprite.position.copy(pos);

      // Store planet data - size will be set by updatePlanetSizes()
      sprite.userData = {
        planet: planet,
        type: planet.name === 'Sun' ? 'Star' : (planet.name === 'Moon' ? 'Moon' : 'Planet'),
        name: planet.name,
        ra: planet.ra,
        dec: planet.dec,
        mag: planet.mag,
        angularSize: planet.angularSize,
        phase: planet.phase, // Moon phase (0-1)
        imageUrl: planet.imageUrl,
        imageLoaded: false,
        imageLoading: false
      };

      // Initial size (will be updated by updatePlanetSizes)
      sprite.scale.set(1, 1, 1);

      this.planetSprites.push(sprite);
      this.celestialSphere.add(sprite);
    });

    console.log(`✓ Created ${this.planets.length} solar system objects (Sun, Moon, and planets)`);
  }

  // Update planet sizes - use realistic magnitude-based sizing like stars
  updatePlanetSizes() {
    const fov = this.camera.fov;
    const canvasHeight = this.renderer.domElement.height;
    const pixelsPerDeg = canvasHeight / fov;

    for (const sprite of this.planetSprites) {
      const data = sprite.userData;
      if (!data) continue;

      // Calculate real angular size in pixels
      const angularSizeDeg = (data.angularSize || 0.1) / 60; // arcmin to degrees
      const realSizePixels = angularSizeDeg * pixelsPerDeg;

      // Calculate magnitude-based size like stars (realistic point-source appearance)
      // Use same formula as magnitudeToSize() for consistency
      const mag = data.mag || 0;
      const baseMag = 8;
      const baseSize = 0.8;
      const maxSize = 6;
      const magnitudeDiff = baseMag - mag;
      const magBasedSize = Math.min(maxSize, Math.max(baseSize, baseSize * Math.pow(1.15, magnitudeDiff)));

      // Convert magnitude-based size to pixels (approximate - stars use point size units)
      const magBasedPixels = magBasedSize * 1.5;

      // Use real angular size if it's larger than magnitude-based size, otherwise use magnitude
      const useRealSize = realSizePixels >= magBasedPixels;
      const displaySizePixels = useRealSize ? realSizePixels : magBasedPixels;

      // Convert pixels back to world units
      // displaySize in world = (displaySizePixels / canvasHeight) * 2 * radius * tan(fov/2)
      const radius = 99;
      const worldSize = (displaySizePixels / canvasHeight) * 2 * radius * Math.tan(THREE.MathUtils.degToRad(fov / 2));

      // Apply aspect ratio if image has been loaded
      const aspectRatio = data.aspectRatio || 1;
      if (aspectRatio >= 1) {
        sprite.scale.set(worldSize, worldSize / aspectRatio, 1);
      } else {
        sprite.scale.set(worldSize * aspectRatio, worldSize, 1);
      }

      // Load real planet image when at real size (and large enough to see detail)
      if (useRealSize && realSizePixels > 20 && !data.imageLoaded && data.imageUrl) {
        this.loadPlanetImage(sprite, data.imageUrl);
      }
    }
  }

  // Load real planet image texture
  loadPlanetImage(sprite, imageUrl) {
    const data = sprite.userData;
    if (data.imageLoading || data.imageLoaded) return;

    data.imageLoading = true;

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');

    textureLoader.load(
      imageUrl,
      (texture) => {
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        // Store aspect ratio for proper scaling
        const imgWidth = texture.image?.naturalWidth || texture.image?.width || 1;
        const imgHeight = texture.image?.naturalHeight || texture.image?.height || 1;
        data.aspectRatio = imgWidth / imgHeight;

        // Create new material with the loaded texture
        const newMaterial = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false
        });

        sprite.material.dispose();
        sprite.material = newMaterial;
        data.imageLoaded = true;
        data.imageLoading = false;

        console.log(`✓ Loaded image for ${data.name} (aspect: ${data.aspectRatio.toFixed(2)})`);
      },
      undefined,
      (error) => {
        console.warn(`Failed to load image for ${data.name}:`, error);
        data.imageLoading = false;
      }
    );
  }

  /* ======================================================================
     COORDINATE SYSTEMS
     Conversion between astronomical and 3D coordinate systems
     ====================================================================== */

  /**
   * Convert Right Ascension and Declination to 3D Cartesian coordinates
   * Delegates to CoordinateUtils module
   */
  raDecToCartesian(ra, dec, radius) {
    return _raDecToCartesian(ra, dec, radius);
  }

  /**
   * Convert Cartesian coordinates to RA/Dec
   * Delegates to CoordinateUtils module
   */
  cartesianToRaDec(x, y, z) {
    return _cartesianToRaDec(x, y, z);
  }

  magnitudeToBrightness(mag) {
    // Convert magnitude to brightness (0-1)
    // Brighter objects have lower magnitude
    const minMag = -1.5; // Sirius
    const maxMag = this.currentMagnitude;
    return Math.max(0, Math.min(1, 1 - (mag - minMag) / (maxMag - minMag)));
  }

  magnitudeToSize(mag) {
    // Convert magnitude to point size
    // Brighter objects (lower magnitude) are larger
    const baseMag = 8;  // Reference magnitude (dimmest typically visible)
    const baseSize = 0.8;  // Minimum size for faintest stars
    const maxSize = 3.5;  // Max size for brightest stars (Sirius, etc.)

    // Gentle exponential scaling for realistic appearance
    const magnitudeDiff = baseMag - mag;
    const size = baseSize * Math.pow(1.15, magnitudeDiff);

    return Math.min(maxSize, Math.max(baseSize, size));
  }

  /**
   * Convert object type abbreviation to full human-readable name
   * @param {string} type - Type abbreviation (e.g., 'G', '*', 'PN')
   * @returns {string} Full type name
   */
  getTypeFullName(type) {
    if (!type) return 'Unknown';

    const typeMap = {
      // Stars
      '*': 'Star',
      '**': 'Double Star',
      '*Ass': 'Stellar Association',
      'Star': 'Star',

      // Galaxies
      'G': 'Galaxy',
      'GGroup': 'Galaxy Group',
      'GClstr': 'Galaxy Cluster',
      'GPair': 'Galaxy Pair',
      'GTrpl': 'Galaxy Triplet',

      // Nebulae
      'Neb': 'Nebula',
      'PN': 'Planetary Nebula',
      'EmN': 'Emission Nebula',
      'RfN': 'Reflection Nebula',
      'HII': 'HII Region',
      'SNR': 'Supernova Remnant',
      'Nova': 'Nova',
      'Cl+N': 'Cluster with Nebulosity',

      // Clusters
      'GCl': 'Globular Cluster',
      'OCl': 'Open Cluster',
      'Cl': 'Star Cluster',

      // Other
      'Ast': 'Asterism',
      'Dark': 'Dark Nebula',
      'DN': 'Dark Nebula',
      'PD': 'Protoplanetary Disk',
      'QSO': 'Quasar',
      'AGN': 'Active Galactic Nucleus',

      // Planets (from our app)
      'Planet': 'Planet',
      'planet': 'Planet',
      'Dwarf': 'Dwarf Planet',

      // Solar system
      'Sun': 'Star (The Sun)',
      'Moon': 'Natural Satellite'
    };

    return typeMap[type] || type;
  }

  magnitudeToIntensity(mag) {
    // Convert magnitude to intensity (brightness/alpha)
    // Brighter objects (lower magnitude) have higher intensity
    // Magnitude scale: -1.5 (Sirius) to ~8 (faint visible)
    // Map to intensity: 1.0 (brightest) to 0.2 (faintest)
    const minMag = -2;   // Brightest possible
    const maxMag = 10;   // Faintest we render
    const minIntensity = 0.2;  // Faint stars are dim
    const maxIntensity = 1.0;  // Bright stars are fully bright

    // Linear mapping with clamping
    const normalizedMag = (mag - minMag) / (maxMag - minMag);
    const intensity = maxIntensity - normalizedMag * (maxIntensity - minIntensity);

    return Math.max(minIntensity, Math.min(maxIntensity, intensity));
  }

  /**
   * Update magnitude limit for star visibility (smooth fading via shader uniform)
   */
  setMagnitudeLimit(magLimit) {
    const previousMag = this.currentMagnitude;
    this.currentMagnitude = magLimit;

    // Update main star field uniform
    if (this.starFieldMaterial) {
      this.starFieldMaterial.uniforms.magLimit.value = magLimit;
    }

    // Update dynamic star field uniform if exists
    if (this.dynamicStarField && this.dynamicStarField.material) {
      if (this.dynamicStarField.material.uniforms && this.dynamicStarField.material.uniforms.magLimit) {
        this.dynamicStarField.material.uniforms.magLimit.value = magLimit;
      }
    }

    // Update approximate visible count
    if (this.starField && this.starField.userData.stars) {
      const visibleStars = this.starField.userData.stars.filter(s => s.mag <= magLimit).length;
      const visibleDSOs = this.starField.userData.dsos.filter(d => d.mag <= magLimit).length;
      this.updateVisibleCount(visibleStars + visibleDSOs);
    }

    // If magnitude increased significantly and zoomed in, trigger new dynamic star query
    if (magLimit > previousMag && this.camera && this.camera.fov < 10) {
      // Debounce to avoid excessive queries while sliding
      clearTimeout(this._magQueryTimeout);
      this._magQueryTimeout = setTimeout(() => {
        this.checkDynamicLoading();
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
    // The view direction in world coordinates
    const viewDirWorld = new THREE.Vector3(0, 0, 0).sub(this.camera.position).normalize();

    // Transform view direction from world coords to celestial coords
    // by applying the INVERSE of the celestialSphere's world transformation
    const viewDirCelestial = viewDirWorld.clone();
    if (this.celestialSphere) {
      // Get the inverse of the celestialSphere's world matrix
      const worldMatrix = new THREE.Matrix4();
      this.celestialSphere.updateMatrixWorld();
      worldMatrix.copy(this.celestialSphere.matrixWorld);
      const inverseMatrix = new THREE.Matrix4().copy(worldMatrix).invert();

      // Apply inverse transformation (rotation only, ignore translation)
      const rotationMatrix = new THREE.Matrix3().setFromMatrix4(inverseMatrix);
      viewDirCelestial.applyMatrix3(rotationMatrix);
    }

    const raDec = this.cartesianToRaDec(viewDirCelestial.x, viewDirCelestial.y, viewDirCelestial.z);

    document.getElementById('ra-display').textContent = `${raDec.ra.toFixed(1)}°`;
    document.getElementById('dec-display').textContent = `${raDec.dec.toFixed(1)}°`;
    document.getElementById('fov-display').textContent = this.formatAngle(this.camera.fov);
  }

  formatAngle(degrees) {
    // Format angle with degrees, arcminutes, arcseconds as appropriate
    if (degrees >= 1) {
      // Show degrees with one decimal if >= 1°
      return `${degrees.toFixed(1)}°`;
    } else if (degrees >= 1/60) {
      // Show arcminutes if >= 1'
      const arcmin = degrees * 60;
      if (arcmin >= 10) {
        return `${arcmin.toFixed(0)}'`;
      } else {
        return `${arcmin.toFixed(1)}'`;
      }
    } else {
      // Show arcseconds if < 1'
      const arcsec = degrees * 3600;
      return `${arcsec.toFixed(0)}"`;
    }
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
      this.cameraRotation.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.cameraRotation.phi));

      this.updateCameraPosition();
      changed = true;
    }

    return changed;
  }

  updateVisibleCount(count) {
    document.getElementById('visible-count').textContent = count;
  }

  // Feature 4: Location Services

  /**
   * Check and request location permission on startup.
   * Uses Permissions API to check state before prompting.
   */
  async requestLocation() {
    if (!('geolocation' in navigator)) {
      return; // Silently fail on startup if not supported
    }

    // Check permission state using Permissions API (if available)
    if ('permissions' in navigator) {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });

        if (permission.state === 'granted') {
          // Already granted - get location silently
          this.getLocationSilently();
        } else if (permission.state === 'prompt') {
          // Not yet asked - show a friendly prompt first
          this.showLocationPrompt();
        } else if (permission.state === 'denied') {
          // Previously denied - show how to enable
          console.log('Location permission was previously denied');
          this.showLocationDeniedHelp();
        }

        // Listen for permission changes
        permission.addEventListener('change', () => {
          if (permission.state === 'granted') {
            this.getLocationSilently();
          }
        });
      } catch (e) {
        // Permissions API not fully supported, try requesting directly
        this.showLocationPrompt();
      }
    } else {
      // No Permissions API, show prompt
      this.showLocationPrompt();
    }
  }

  /**
   * Show a friendly prompt asking user for location permission.
   */
  showLocationPrompt() {
    // Create a non-blocking prompt dialog
    const dialog = document.createElement('div');
    dialog.className = 'location-prompt-dialog';
    dialog.innerHTML = `
      <div class="location-prompt-content">
        <div class="location-prompt-icon">📍</div>
        <h3>Enable Location?</h3>
        <p>SkyMap can show you the exact sky visible from your location right now.</p>
        <div class="location-prompt-buttons">
          <button class="location-prompt-btn location-prompt-btn--secondary" id="location-skip">
            Not now
          </button>
          <button class="location-prompt-btn location-prompt-btn--primary" id="location-allow">
            Allow
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    // Add styles if not already present
    if (!document.getElementById('location-prompt-styles')) {
      const style = document.createElement('style');
      style.id = 'location-prompt-styles';
      style.textContent = `
        .location-prompt-dialog {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1001;
          padding: 20px;
        }
        .location-prompt-content {
          background: rgba(30, 30, 40, 0.95);
          border-radius: 16px;
          padding: 24px;
          max-width: 300px;
          text-align: center;
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .location-prompt-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }
        .location-prompt-content h3 {
          margin: 0 0 8px 0;
          color: #fff;
          font-size: 18px;
        }
        .location-prompt-content p {
          margin: 0 0 20px 0;
          color: rgba(255, 255, 255, 0.7);
          font-size: 14px;
          line-height: 1.4;
        }
        .location-prompt-buttons {
          display: flex;
          gap: 12px;
        }
        .location-prompt-btn {
          flex: 1;
          padding: 12px 16px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .location-prompt-btn--secondary {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.7);
        }
        .location-prompt-btn--primary {
          background: #3B82F6;
          color: #fff;
        }
      `;
      document.head.appendChild(style);
    }

    document.getElementById('location-skip').addEventListener('click', () => {
      dialog.remove();
    });

    document.getElementById('location-allow').addEventListener('click', () => {
      dialog.remove();
      this.requestGeolocation();
    });
  }

  /**
   * Show help dialog when location permission was denied.
   */
  showLocationDeniedHelp() {
    const dialog = document.createElement('div');
    dialog.className = 'location-prompt-dialog';
    dialog.innerHTML = `
      <div class="location-prompt-content">
        <div class="location-prompt-icon">🔒</div>
        <h3>Location Disabled</h3>
        <p>Location access was denied. To see the sky from your location, please enable location permission in your device settings.</p>
        <div class="location-prompt-buttons">
          <button class="location-prompt-btn location-prompt-btn--primary" id="location-dismiss">
            OK
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    document.getElementById('location-dismiss').addEventListener('click', () => {
      dialog.remove();
    });
  }

  /**
   * Get location silently (no alerts) - used when permission already granted.
   */
  getLocationSilently() {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.observerLocation = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          height: 0,
        };
        this.updateLatitudeTilt();
        this.updateCelestialRotation();
        this.createPlanets();
        console.log(`✓ Location detected: ${this.observerLocation.lat.toFixed(4)}°, ${this.observerLocation.lon.toFixed(4)}°`);
      },
      (error) => {
        console.warn('Could not get location:', error.message);
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 300000,
      }
    );
  }

  /**
   * Request geolocation from the device.
   * Called by ui-controller.js when user clicks location button.
   */
  requestGeolocation() {
    if (!('geolocation' in navigator)) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    // Check if permission is denied first
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
        if (permission.state === 'denied') {
          this.showLocationDeniedHelp();
          return;
        }
        this.doGeolocationRequest();
      }).catch(() => {
        this.doGeolocationRequest();
      });
    } else {
      this.doGeolocationRequest();
    }
  }

  /**
   * Perform the actual geolocation request.
   */
  doGeolocationRequest() {
    // Show loading state
    const btn = document.getElementById('auto-location-btn');
    const originalContent = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '⏳';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.observerLocation = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          height: 0,
        };
        // Update sky tilt and rotation based on new location
        this.updateLatitudeTilt();
        this.updateCelestialRotation();
        // Recalculate planet positions with new observer location
        this.createPlanets();
        console.log(`✓ Location detected: ${this.observerLocation.lat.toFixed(4)}°, ${this.observerLocation.lon.toFixed(4)}°`);
        alert(`Location set to:\n${this.observerLocation.lat.toFixed(4)}°, ${this.observerLocation.lon.toFixed(4)}°\n\nSky now shows correct position for your location and time.`);
        if (btn) btn.innerHTML = originalContent;
      },
      (error) => {
        console.warn('Location access denied:', error);
        if (btn) btn.innerHTML = originalContent;

        if (error.code === error.PERMISSION_DENIED) {
          this.showLocationDeniedHelp();
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          alert('Location unavailable.\n\nPlease check your GPS/location services are enabled.');
        } else if (error.code === error.TIMEOUT) {
          alert('Location request timed out.\n\nPlease try again.');
        } else {
          alert('Could not get your location.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // Cache location for 5 minutes
      }
    );
  }

  /* ======================================================================
     SEARCH & SELECTION
     Object search functionality and navigation
     ====================================================================== */

  /**
   * Build the search index from all loaded celestial objects
   */
  buildSearchIndex() {
    this.searchIndex = [];

    // Common names/aliases for famous objects
    const objectAliases = {
      'M31': ['Andromeda Galaxy', 'Andromeda', 'NGC 224'],
      'M42': ['Orion Nebula', 'Great Nebula in Orion'],
      'M45': ['Pleiades', 'Seven Sisters', 'Subaru'],
      'M1': ['Crab Nebula'],
      'M13': ['Hercules Cluster', 'Great Globular Cluster'],
      'M51': ['Whirlpool Galaxy', 'NGC 5194'],
      'M57': ['Ring Nebula'],
      'M27': ['Dumbbell Nebula'],
      'M101': ['Pinwheel Galaxy'],
      'M104': ['Sombrero Galaxy'],
      'M81': ["Bode's Galaxy"],
      'M82': ['Cigar Galaxy'],
      'M83': ['Southern Pinwheel Galaxy'],
      'M87': ['Virgo A'],
      'M20': ['Trifid Nebula'],
      'M8': ['Lagoon Nebula'],
      'M17': ['Omega Nebula', 'Swan Nebula'],
      'M16': ['Eagle Nebula', 'Pillars of Creation'],
      'M33': ['Triangulum Galaxy'],
      'M64': ['Black Eye Galaxy'],
      'M97': ['Owl Nebula'],
      'M74': ['Phantom Galaxy'],
      'NGC7000': ['North America Nebula'],
      'NGC7293': ['Helix Nebula'],
      'NGC2237': ['Rosette Nebula'],
      'NGC2070': ['Tarantula Nebula'],
      'NGC253': ['Sculptor Galaxy'],
      'NGC4565': ['Needle Galaxy'],
      'NGC6543': ["Cat's Eye Nebula"],
      'NGC6302': ['Butterfly Nebula']
    };

    // Index named stars
    Object.entries(this.namedObjects).forEach(([name, data]) => {
      this.searchIndex.push({
        name: name,
        type: 'Star',
        ra: data.ra,
        dec: data.dec,
        mag: data.mag,
        data: data
      });
    });

    // Index Messier objects with aliases
    this.deepSkyObjects.forEach(dso => {
      if (dso.messier) {
        const messierName = `M${Math.floor(dso.messier)}`;
        const typeName = this.getDSOTypeName(dso.type);

        // Add main Messier entry
        this.searchIndex.push({
          name: messierName,
          type: typeName,
          subtype: dso.type,
          ra: dso.ra,
          dec: dso.dec,
          mag: dso.mag,
          data: dso
        });

        // Add aliases for this object
        if (objectAliases[messierName]) {
          objectAliases[messierName].forEach(alias => {
            this.searchIndex.push({
              name: alias,
              type: typeName,
              subtype: dso.type,
              ra: dso.ra,
              dec: dso.dec,
              mag: dso.mag,
              data: dso,
              isAlias: true,
              primaryName: messierName
            });
          });
        }
      }
    });

    // Index NGC objects (bright ones and those with aliases)
    this.deepSkyObjects.filter(dso => dso.name && dso.name.startsWith('NGC')).forEach(dso => {
      if (dso.mag && dso.mag < 10) {
        const typeName = this.getDSOTypeName(dso.type);
        this.searchIndex.push({
          name: dso.name,
          type: typeName,
          subtype: dso.type,
          ra: dso.ra,
          dec: dso.dec,
          mag: dso.mag,
          data: dso
        });

        // Add aliases
        if (objectAliases[dso.name]) {
          objectAliases[dso.name].forEach(alias => {
            this.searchIndex.push({
              name: alias,
              type: typeName,
              subtype: dso.type,
              ra: dso.ra,
              dec: dso.dec,
              mag: dso.mag,
              data: dso,
              isAlias: true,
              primaryName: dso.name
            });
          });
        }
      }
    });

    // Index planets
    if (this.planets) {
      this.planets.forEach(planet => {
        this.searchIndex.push({
          name: planet.name,
          type: 'Planet',
          ra: planet.ra,
          dec: planet.dec,
          mag: planet.mag,
          data: planet
        });
      });
    }

    // Index constellations
    const constellationData = {
      'Orion': { ra: 85, dec: 0, description: 'The Hunter' },
      'Ursa Major': { ra: 165, dec: 55, description: 'The Great Bear' },
      'Ursa Minor': { ra: 225, dec: 75, description: 'The Little Bear' },
      'Cassiopeia': { ra: 15, dec: 60, description: 'The Queen' },
      'Cygnus': { ra: 310, dec: 42, description: 'The Swan' },
      'Lyra': { ra: 285, dec: 38, description: 'The Lyre' },
      'Aquila': { ra: 295, dec: 5, description: 'The Eagle' },
      'Scorpius': { ra: 255, dec: -30, description: 'The Scorpion' },
      'Sagittarius': { ra: 285, dec: -28, description: 'The Archer' },
      'Leo': { ra: 165, dec: 15, description: 'The Lion' },
      'Virgo': { ra: 200, dec: -5, description: 'The Maiden' },
      'Gemini': { ra: 105, dec: 22, description: 'The Twins' },
      'Taurus': { ra: 65, dec: 18, description: 'The Bull' },
      'Aries': { ra: 35, dec: 20, description: 'The Ram' },
      'Pisces': { ra: 10, dec: 10, description: 'The Fish' },
      'Aquarius': { ra: 335, dec: -12, description: 'The Water Bearer' },
      'Capricornus': { ra: 315, dec: -20, description: 'The Sea Goat' },
      'Libra': { ra: 230, dec: -15, description: 'The Scales' },
      'Cancer': { ra: 130, dec: 20, description: 'The Crab' },
      'Andromeda': { ra: 10, dec: 38, description: 'The Princess' },
      'Perseus': { ra: 50, dec: 42, description: 'The Hero' },
      'Pegasus': { ra: 340, dec: 18, description: 'The Winged Horse' },
      'Draco': { ra: 260, dec: 65, description: 'The Dragon' },
      'Centaurus': { ra: 200, dec: -45, description: 'The Centaur' },
      'Canis Major': { ra: 105, dec: -22, description: 'The Great Dog' },
      'Canis Minor': { ra: 115, dec: 7, description: 'The Little Dog' },
      'Bootes': { ra: 220, dec: 30, description: 'The Herdsman' },
      'Corona Borealis': { ra: 235, dec: 30, description: 'The Northern Crown' },
      'Hercules': { ra: 255, dec: 30, description: 'The Strongman' },
      'Ophiuchus': { ra: 260, dec: -5, description: 'The Serpent Bearer' },
      'Serpens': { ra: 240, dec: 5, description: 'The Serpent' },
      'Carina': { ra: 125, dec: -60, description: 'The Keel' },
      'Crux': { ra: 190, dec: -60, description: 'The Southern Cross' },
      'Puppis': { ra: 115, dec: -35, description: 'The Stern' },
      'Vela': { ra: 140, dec: -48, description: 'The Sails' }
    };

    Object.entries(constellationData).forEach(([name, data]) => {
      this.searchIndex.push({
        name: name,
        type: 'Constellation',
        ra: data.ra,
        dec: data.dec,
        description: data.description,
        mag: null
      });
    });

    console.log(`✓ Built search index with ${this.searchIndex.length} entries`);

    console.log(`✓ Search index built with ${this.searchIndex.length} objects`);
  }

  performSearch(query) {
    if (!query || query.length < 2) return [];

    const lowerQuery = query.toLowerCase();

    // Search and score results
    const results = this.searchIndex
      .map(obj => {
        const nameLower = obj.name.toLowerCase();
        let score = 0;

        // Exact match gets highest score
        if (nameLower === lowerQuery) {
          score = 1000;
        }
        // Starts with query gets high score
        else if (nameLower.startsWith(lowerQuery)) {
          score = 500;
        }
        // Contains query
        else if (nameLower.includes(lowerQuery)) {
          score = 100;
        }

        // Penalize aliases slightly so primary names show first
        if (obj.isAlias) {
          score -= 10;
        }

        // Boost by brightness (brighter = higher score)
        if (obj.mag !== null && obj.mag !== undefined) {
          score += (10 - obj.mag) * 5;
        }

        // Boost planets and constellations
        if (obj.type === 'Planet') score += 50;
        if (obj.type === 'Constellation') score += 30;

        return { ...obj, score };
      })
      .filter(obj => obj.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);  // Limit to 12 results

    return results;
  }

  // Feature 6: Object Information Panel
  selectObject(obj) {
    this.selectedObject = obj;

    const panel = document.getElementById('info-panel');
    if (!panel) return;

    if (!obj) {
      // Hide info panel
      this.unhighlightConstellation();
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

    // Convert type abbreviation to full name
    const typeFullName = this.getTypeFullName(obj.type);
    html += `<p><strong>Type:</strong> ${typeFullName}</p>`;
    if (obj.subtype) html += `<p><strong>Subtype:</strong> ${this.getTypeFullName(obj.subtype)}</p>`;
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
      html += `<p><strong>Constellation:</strong> ${constName}</p>`;

      // Feature 12: Add constellation story
      const story = this.getConstellationStory(constName);
      if (story) {
        html += `<div class="constellation-story">`;
        html += `<h3>About ${constName}</h3>`;
        html += `<p>${story.mythology}</p>`;
        html += `<p><strong>Best Seen:</strong> ${story.bestSeen}</p>`;
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
   * Get constellation names in multiple languages
   */
  getConstellationNames() {
    return {
      'en': {  // English
        'And': 'Andromeda', 'Ant': 'Antlia', 'Aps': 'Apus', 'Aqr': 'Aquarius', 'Aql': 'Aquila',
        'Ara': 'Ara', 'Ari': 'Aries', 'Aur': 'Auriga', 'Boo': 'Boötes', 'Cae': 'Caelum',
        'Cam': 'Camelopardalis', 'Cnc': 'Cancer', 'CVn': 'Canes Venatici', 'CMa': 'Canis Major',
        'CMi': 'Canis Minor', 'Cap': 'Capricornus', 'Car': 'Carina', 'Cas': 'Cassiopeia',
        'Cen': 'Centaurus', 'Cep': 'Cepheus', 'Cet': 'Cetus', 'Cha': 'Chamaeleon', 'Cir': 'Circinus',
        'Col': 'Columba', 'Com': 'Coma Berenices', 'CrA': 'Corona Australis', 'CrB': 'Corona Borealis',
        'Crv': 'Corvus', 'Crt': 'Crater', 'Cru': 'Crux', 'Cyg': 'Cygnus', 'Del': 'Delphinus',
        'Dor': 'Dorado', 'Dra': 'Draco', 'Equ': 'Equuleus', 'Eri': 'Eridanus', 'For': 'Fornax',
        'Gem': 'Gemini', 'Gru': 'Grus', 'Her': 'Hercules', 'Hor': 'Horologium', 'Hya': 'Hydra',
        'Hyi': 'Hydrus', 'Ind': 'Indus', 'Lac': 'Lacerta', 'Leo': 'Leo', 'LMi': 'Leo Minor',
        'Lep': 'Lepus', 'Lib': 'Libra', 'Lup': 'Lupus', 'Lyn': 'Lynx', 'Lyr': 'Lyra',
        'Men': 'Mensa', 'Mic': 'Microscopium', 'Mon': 'Monoceros', 'Mus': 'Musca', 'Nor': 'Norma',
        'Oct': 'Octans', 'Oph': 'Ophiuchus', 'Ori': 'Orion', 'Pav': 'Pavo', 'Peg': 'Pegasus',
        'Per': 'Perseus', 'Phe': 'Phoenix', 'Pic': 'Pictor', 'Psc': 'Pisces', 'PsA': 'Piscis Austrinus',
        'Pup': 'Puppis', 'Pyx': 'Pyxis', 'Ret': 'Reticulum', 'Sge': 'Sagitta', 'Sgr': 'Sagittarius',
        'Sco': 'Scorpius', 'Scl': 'Sculptor', 'Sct': 'Scutum', 'Ser': 'Serpens', 'Sex': 'Sextans',
        'Tau': 'Taurus', 'Tel': 'Telescopium', 'Tri': 'Triangulum', 'TrA': 'Triangulum Australe',
        'Tuc': 'Tucana', 'UMa': 'Ursa Major', 'UMi': 'Ursa Minor', 'Vel': 'Vela', 'Vir': 'Virgo',
        'Vol': 'Volans', 'Vul': 'Vulpecula'
      },
      'la': {  // Latin (same as English for most)
        'And': 'Andromeda', 'Ant': 'Antlia', 'Aps': 'Apus', 'Aqr': 'Aquarius', 'Aql': 'Aquila',
        'Ara': 'Ara', 'Ari': 'Aries', 'Aur': 'Auriga', 'Boo': 'Boötes', 'Cae': 'Caelum',
        'Cam': 'Camelopardalis', 'Cnc': 'Cancer', 'CVn': 'Canes Venatici', 'CMa': 'Canis Major',
        'CMi': 'Canis Minor', 'Cap': 'Capricornus', 'Car': 'Carina', 'Cas': 'Cassiopeia',
        'Cen': 'Centaurus', 'Cep': 'Cepheus', 'Cet': 'Cetus', 'Cha': 'Chamaeleon', 'Cir': 'Circinus',
        'Col': 'Columba', 'Com': 'Coma Berenices', 'CrA': 'Corona Australis', 'CrB': 'Corona Borealis',
        'Crv': 'Corvus', 'Crt': 'Crater', 'Cru': 'Crux', 'Cyg': 'Cygnus', 'Del': 'Delphinus',
        'Dor': 'Dorado', 'Dra': 'Draco', 'Equ': 'Equuleus', 'Eri': 'Eridanus', 'For': 'Fornax',
        'Gem': 'Gemini', 'Gru': 'Grus', 'Her': 'Hercules', 'Hor': 'Horologium', 'Hya': 'Hydra',
        'Hyi': 'Hydrus', 'Ind': 'Indus', 'Lac': 'Lacerta', 'Leo': 'Leo', 'LMi': 'Leo Minor',
        'Lep': 'Lepus', 'Lib': 'Libra', 'Lup': 'Lupus', 'Lyn': 'Lynx', 'Lyr': 'Lyra',
        'Men': 'Mensa', 'Mic': 'Microscopium', 'Mon': 'Monoceros', 'Mus': 'Musca', 'Nor': 'Norma',
        'Oct': 'Octans', 'Oph': 'Ophiuchus', 'Ori': 'Orion', 'Pav': 'Pavo', 'Peg': 'Pegasus',
        'Per': 'Perseus', 'Phe': 'Phoenix', 'Pic': 'Pictor', 'Psc': 'Pisces', 'PsA': 'Piscis Austrinus',
        'Pup': 'Puppis', 'Pyx': 'Pyxis', 'Ret': 'Reticulum', 'Sge': 'Sagitta', 'Sgr': 'Sagittarius',
        'Sco': 'Scorpius', 'Scl': 'Sculptor', 'Sct': 'Scutum', 'Ser': 'Serpens', 'Sex': 'Sextans',
        'Tau': 'Taurus', 'Tel': 'Telescopium', 'Tri': 'Triangulum', 'TrA': 'Triangulum Australe',
        'Tuc': 'Tucana', 'UMa': 'Ursa Major', 'UMi': 'Ursa Minor', 'Vel': 'Vela', 'Vir': 'Virgo',
        'Vol': 'Volans', 'Vul': 'Vulpecula'
      },
      'fr': {  // French
        'And': 'Andromède', 'Ant': 'Machine Pneumatique', 'Aps': 'Oiseau de Paradis', 'Aqr': 'Verseau', 'Aql': 'Aigle',
        'Ara': 'Autel', 'Ari': 'Bélier', 'Aur': 'Cocher', 'Boo': 'Bouvier', 'Cae': 'Burin',
        'Cam': 'Girafe', 'Cnc': 'Cancer', 'CVn': 'Chiens de Chasse', 'CMa': 'Grand Chien',
        'CMi': 'Petit Chien', 'Cap': 'Capricorne', 'Car': 'Carène', 'Cas': 'Cassiopée',
        'Cen': 'Centaure', 'Cep': 'Céphée', 'Cet': 'Baleine', 'Cha': 'Caméléon', 'Cir': 'Compas',
        'Col': 'Colombe', 'Com': 'Chevelure de Bérénice', 'CrA': 'Couronne Australe', 'CrB': 'Couronne Boréale',
        'Crv': 'Corbeau', 'Crt': 'Coupe', 'Cru': 'Croix du Sud', 'Cyg': 'Cygne', 'Del': 'Dauphin',
        'Dor': 'Dorade', 'Dra': 'Dragon', 'Equ': 'Petit Cheval', 'Eri': 'Éridan', 'For': 'Fourneau',
        'Gem': 'Gémeaux', 'Gru': 'Grue', 'Her': 'Hercule', 'Hor': 'Horloge', 'Hya': 'Hydre',
        'Hyi': 'Hydre Mâle', 'Ind': 'Indien', 'Lac': 'Lézard', 'Leo': 'Lion', 'LMi': 'Petit Lion',
        'Lep': 'Lièvre', 'Lib': 'Balance', 'Lup': 'Loup', 'Lyn': 'Lynx', 'Lyr': 'Lyre',
        'Men': 'Table', 'Mic': 'Microscope', 'Mon': 'Licorne', 'Mus': 'Mouche', 'Nor': 'Règle',
        'Oct': 'Octant', 'Oph': 'Serpentaire', 'Ori': 'Orion', 'Pav': 'Paon', 'Peg': 'Pégase',
        'Per': 'Persée', 'Phe': 'Phénix', 'Pic': 'Peintre', 'Psc': 'Poissons', 'PsA': 'Poisson Austral',
        'Pup': 'Poupe', 'Pyx': 'Boussole', 'Ret': 'Réticule', 'Sge': 'Flèche', 'Sgr': 'Sagittaire',
        'Sco': 'Scorpion', 'Scl': 'Sculpteur', 'Sct': 'Écu de Sobieski', 'Ser': 'Serpent', 'Sex': 'Sextant',
        'Tau': 'Taureau', 'Tel': 'Télescope', 'Tri': 'Triangle', 'TrA': 'Triangle Austral',
        'Tuc': 'Toucan', 'UMa': 'Grande Ourse', 'UMi': 'Petite Ourse', 'Vel': 'Voiles', 'Vir': 'Vierge',
        'Vol': 'Poisson Volant', 'Vul': 'Petit Renard'
      },
      'de': {  // German
        'And': 'Andromeda', 'Ant': 'Luftpumpe', 'Aps': 'Paradiesvogel', 'Aqr': 'Wassermann', 'Aql': 'Adler',
        'Ara': 'Altar', 'Ari': 'Widder', 'Aur': 'Fuhrmann', 'Boo': 'Bärenhüter', 'Cae': 'Grabstichel',
        'Cam': 'Giraffe', 'Cnc': 'Krebs', 'CVn': 'Jagdhunde', 'CMa': 'Großer Hund',
        'CMi': 'Kleiner Hund', 'Cap': 'Steinbock', 'Car': 'Kiel des Schiffs', 'Cas': 'Kassiopeia',
        'Cen': 'Zentaur', 'Cep': 'Kepheus', 'Cet': 'Walfisch', 'Cha': 'Chamäleon', 'Cir': 'Zirkel',
        'Col': 'Taube', 'Com': 'Haar der Berenike', 'CrA': 'Südliche Krone', 'CrB': 'Nördliche Krone',
        'Crv': 'Rabe', 'Crt': 'Becher', 'Cru': 'Kreuz des Südens', 'Cyg': 'Schwan', 'Del': 'Delfin',
        'Dor': 'Schwertfisch', 'Dra': 'Drache', 'Equ': 'Füllen', 'Eri': 'Eridanus', 'For': 'Chemischer Ofen',
        'Gem': 'Zwillinge', 'Gru': 'Kranich', 'Her': 'Herkules', 'Hor': 'Pendeluhr', 'Hya': 'Wasserschlange',
        'Hyi': 'Kleine Wasserschlange', 'Ind': 'Indianer', 'Lac': 'Eidechse', 'Leo': 'Löwe', 'LMi': 'Kleiner Löwe',
        'Lep': 'Hase', 'Lib': 'Waage', 'Lup': 'Wolf', 'Lyn': 'Luchs', 'Lyr': 'Leier',
        'Men': 'Tafelberg', 'Mic': 'Mikroskop', 'Mon': 'Einhorn', 'Mus': 'Fliege', 'Nor': 'Winkelmaß',
        'Oct': 'Oktant', 'Oph': 'Schlangenträger', 'Ori': 'Orion', 'Pav': 'Pfau', 'Peg': 'Pegasus',
        'Per': 'Perseus', 'Phe': 'Phönix', 'Pic': 'Maler', 'Psc': 'Fische', 'PsA': 'Südlicher Fisch',
        'Pup': 'Achterdeck', 'Pyx': 'Schiffskompass', 'Ret': 'Netz', 'Sge': 'Pfeil', 'Sgr': 'Schütze',
        'Sco': 'Skorpion', 'Scl': 'Bildhauer', 'Sct': 'Schild', 'Ser': 'Schlange', 'Sex': 'Sextant',
        'Tau': 'Stier', 'Tel': 'Teleskop', 'Tri': 'Dreieck', 'TrA': 'Südliches Dreieck',
        'Tuc': 'Tukan', 'UMa': 'Großer Bär', 'UMi': 'Kleiner Bär', 'Vel': 'Segel', 'Vir': 'Jungfrau',
        'Vol': 'Fliegender Fisch', 'Vul': 'Fuchs'
      },
      'es': {  // Spanish
        'And': 'Andrómeda', 'Ant': 'Máquina Neumática', 'Aps': 'Ave del Paraíso', 'Aqr': 'Acuario', 'Aql': 'Águila',
        'Ara': 'Altar', 'Ari': 'Aries', 'Aur': 'Cochero', 'Boo': 'Boyero', 'Cae': 'Cincel',
        'Cam': 'Jirafa', 'Cnc': 'Cáncer', 'CVn': 'Lebreles', 'CMa': 'Can Mayor',
        'CMi': 'Can Menor', 'Cap': 'Capricornio', 'Car': 'Quilla', 'Cas': 'Casiopea',
        'Cen': 'Centauro', 'Cep': 'Cefeo', 'Cet': 'Ballena', 'Cha': 'Camaleón', 'Cir': 'Compás',
        'Col': 'Paloma', 'Com': 'Cabellera de Berenice', 'CrA': 'Corona Austral', 'CrB': 'Corona Boreal',
        'Crv': 'Cuervo', 'Crt': 'Copa', 'Cru': 'Cruz del Sur', 'Cyg': 'Cisne', 'Del': 'Delfín',
        'Dor': 'Dorado', 'Dra': 'Dragón', 'Equ': 'Caballo Menor', 'Eri': 'Eridanus', 'For': 'Horno',
        'Gem': 'Géminis', 'Gru': 'Grulla', 'Her': 'Hércules', 'Hor': 'Reloj', 'Hya': 'Hidra',
        'Hyi': 'Hidra Macho', 'Ind': 'Indio', 'Lac': 'Lagarto', 'Leo': 'León', 'LMi': 'León Menor',
        'Lep': 'Liebre', 'Lib': 'Libra', 'Lup': 'Lobo', 'Lyn': 'Lince', 'Lyr': 'Lira',
        'Men': 'Mesa', 'Mic': 'Microscopio', 'Mon': 'Unicornio', 'Mus': 'Mosca', 'Nor': 'Escuadra',
        'Oct': 'Octante', 'Oph': 'Ofiuco', 'Ori': 'Orión', 'Pav': 'Pavo Real', 'Peg': 'Pegaso',
        'Per': 'Perseo', 'Phe': 'Fénix', 'Pic': 'Pintor', 'Psc': 'Piscis', 'PsA': 'Pez Austral',
        'Pup': 'Popa', 'Pyx': 'Brújula', 'Ret': 'Retículo', 'Sge': 'Flecha', 'Sgr': 'Sagitario',
        'Sco': 'Escorpio', 'Scl': 'Escultor', 'Sct': 'Escudo', 'Ser': 'Serpiente', 'Sex': 'Sextante',
        'Tau': 'Tauro', 'Tel': 'Telescopio', 'Tri': 'Triángulo', 'TrA': 'Triángulo Austral',
        'Tuc': 'Tucán', 'UMa': 'Osa Mayor', 'UMi': 'Osa Menor', 'Vel': 'Vela', 'Vir': 'Virgo',
        'Vol': 'Pez Volador', 'Vul': 'Zorra'
      },
      'zh': {  // Chinese (Simplified)
        'And': '仙女座', 'Ant': '唧筒座', 'Aps': '天燕座', 'Aqr': '宝瓶座', 'Aql': '天鹰座',
        'Ara': '天坛座', 'Ari': '白羊座', 'Aur': '御夫座', 'Boo': '牧夫座', 'Cae': '雕具座',
        'Cam': '鹿豹座', 'Cnc': '巨蟹座', 'CVn': '猎犬座', 'CMa': '大犬座',
        'CMi': '小犬座', 'Cap': '摩羯座', 'Car': '船底座', 'Cas': '仙后座',
        'Cen': '半人马座', 'Cep': '仙王座', 'Cet': '鲸鱼座', 'Cha': '蝘蜓座', 'Cir': '圆规座',
        'Col': '天鸽座', 'Com': '后发座', 'CrA': '南冕座', 'CrB': '北冕座',
        'Crv': '乌鸦座', 'Crt': '巨爵座', 'Cru': '南十字座', 'Cyg': '天鹅座', 'Del': '海豚座',
        'Dor': '剑鱼座', 'Dra': '天龙座', 'Equ': '小马座', 'Eri': '波江座', 'For': '天炉座',
        'Gem': '双子座', 'Gru': '天鹤座', 'Her': '武仙座', 'Hor': '时钟座', 'Hya': '长蛇座',
        'Hyi': '水蛇座', 'Ind': '印第安座', 'Lac': '蝎虎座', 'Leo': '狮子座', 'LMi': '小狮座',
        'Lep': '天兔座', 'Lib': '天秤座', 'Lup': '豺狼座', 'Lyn': '天猫座', 'Lyr': '天琴座',
        'Men': '山案座', 'Mic': '显微镜座', 'Mon': '麒麟座', 'Mus': '苍蝇座', 'Nor': '矩尺座',
        'Oct': '南极座', 'Oph': '蛇夫座', 'Ori': '猎户座', 'Pav': '孔雀座', 'Peg': '飞马座',
        'Per': '英仙座', 'Phe': '凤凰座', 'Pic': '绘架座', 'Psc': '双鱼座', 'PsA': '南鱼座',
        'Pup': '船尾座', 'Pyx': '罗盘座', 'Ret': '网罟座', 'Sge': '天箭座', 'Sgr': '人马座',
        'Sco': '天蝎座', 'Scl': '玉夫座', 'Sct': '盾牌座', 'Ser': '巨蛇座', 'Sex': '六分仪座',
        'Tau': '金牛座', 'Tel': '望远镜座', 'Tri': '三角座', 'TrA': '南三角座',
        'Tuc': '杜鹃座', 'UMa': '大熊座', 'UMi': '小熊座', 'Vel': '船帆座', 'Vir': '室女座',
        'Vol': '飞鱼座', 'Vul': '狐狸座'
      },
      'ja': {  // Japanese
        'And': 'アンドロメダ座', 'Ant': 'ポンプ座', 'Aps': 'ふうちょう座', 'Aqr': 'みずがめ座', 'Aql': 'わし座',
        'Ara': 'さいだん座', 'Ari': 'おひつじ座', 'Aur': 'ぎょしゃ座', 'Boo': 'うしかい座', 'Cae': 'ちょうこくぐ座',
        'Cam': 'きりん座', 'Cnc': 'かに座', 'CVn': 'りょうけん座', 'CMa': 'おおいぬ座',
        'CMi': 'こいぬ座', 'Cap': 'やぎ座', 'Car': 'りゅうこつ座', 'Cas': 'カシオペヤ座',
        'Cen': 'ケンタウルス座', 'Cep': 'ケフェウス座', 'Cet': 'くじら座', 'Cha': 'カメレオン座', 'Cir': 'コンパス座',
        'Col': 'はと座', 'Com': 'かみのけ座', 'CrA': 'みなみのかんむり座', 'CrB': 'かんむり座',
        'Crv': 'からす座', 'Crt': 'コップ座', 'Cru': 'みなみじゅうじ座', 'Cyg': 'はくちょう座', 'Del': 'いるか座',
        'Dor': 'かじき座', 'Dra': 'りゅう座', 'Equ': 'こうま座', 'Eri': 'エリダヌス座', 'For': 'ろ座',
        'Gem': 'ふたご座', 'Gru': 'つる座', 'Her': 'ヘルクレス座', 'Hor': 'とけい座', 'Hya': 'うみへび座',
        'Hyi': 'みずへび座', 'Ind': 'インディアン座', 'Lac': 'とかげ座', 'Leo': 'しし座', 'LMi': 'こじし座',
        'Lep': 'うさぎ座', 'Lib': 'てんびん座', 'Lup': 'おおかみ座', 'Lyn': 'やまねこ座', 'Lyr': 'こと座',
        'Men': 'テーブルさん座', 'Mic': 'けんびきょう座', 'Mon': 'いっかくじゅう座', 'Mus': 'はえ座', 'Nor': 'じょうぎ座',
        'Oct': 'はちぶんぎ座', 'Oph': 'へびつかい座', 'Ori': 'オリオン座', 'Pav': 'くじゃく座', 'Peg': 'ペガスス座',
        'Per': 'ペルセウス座', 'Phe': 'ほうおう座', 'Pic': 'がか座', 'Psc': 'うお座', 'PsA': 'みなみのうお座',
        'Pup': 'とも座', 'Pyx': 'らしんばん座', 'Ret': 'レチクル座', 'Sge': 'や座', 'Sgr': 'いて座',
        'Sco': 'さそり座', 'Scl': 'ちょうこくしつ座', 'Sct': 'たて座', 'Ser': 'へび座', 'Sex': 'ろくぶんぎ座',
        'Tau': 'おうし座', 'Tel': 'ぼうえんきょう座', 'Tri': 'さんかく座', 'TrA': 'みなみのさんかく座',
        'Tuc': 'きょしちょう座', 'UMa': 'おおぐま座', 'UMi': 'こぐま座', 'Vel': 'ほ座', 'Vir': 'おとめ座',
        'Vol': 'とびうお座', 'Vul': 'こぎつね座'
      },
      'ar': {  // Arabic
        'And': 'المرأة المسلسلة', 'Ant': 'الطلمبة', 'Aps': 'طائر الفردوس', 'Aqr': 'الدلو', 'Aql': 'العقاب',
        'Ara': 'المجمرة', 'Ari': 'الحمل', 'Aur': 'ممسك الأعنة', 'Boo': 'العواء', 'Cae': 'المنقاش',
        'Cam': 'الزرافة', 'Cnc': 'السرطان', 'CVn': 'السلوقيان', 'CMa': 'الكلب الأكبر',
        'CMi': 'الكلب الأصغر', 'Cap': 'الجدي', 'Car': 'القاعدة', 'Cas': 'ذات الكرسي',
        'Cen': 'القنطورس', 'Cep': 'الملتهب', 'Cet': 'قيطس', 'Cha': 'الحرباء', 'Cir': 'البيكار',
        'Col': 'الحمامة', 'Com': 'الهلبة', 'CrA': 'الإكليل الجنوبي', 'CrB': 'الإكليل الشمالي',
        'Crv': 'الغراب', 'Crt': 'الباطية', 'Cru': 'الصليب الجنوبي', 'Cyg': 'الدجاجة', 'Del': 'الدلفين',
        'Dor': 'أبو سيف', 'Dra': 'التنين', 'Equ': 'قطعة الفرس', 'Eri': 'النهر', 'For': 'الكور',
        'Gem': 'الجوزاء', 'Gru': 'الغرنوق', 'Her': 'الجاثي', 'Hor': 'الساعة', 'Hya': 'الشجاع',
        'Hyi': 'الشجاع الجنوبي', 'Ind': 'الهندي', 'Lac': 'العظاية', 'Leo': 'الأسد', 'LMi': 'الأسد الأصغر',
        'Lep': 'الأرنب', 'Lib': 'الميزان', 'Lup': 'السبع', 'Lyn': 'الوشق', 'Lyr': 'القيثارة',
        'Men': 'الجبل', 'Mic': 'المجهر', 'Mon': 'وحيد القرن', 'Mus': 'الذبابة', 'Nor': 'المسطرة',
        'Oct': 'الثمن', 'Oph': 'الحواء', 'Ori': 'الجبار', 'Pav': 'الطاووس', 'Peg': 'الفرس الأعظم',
        'Per': 'برشاوش', 'Phe': 'العنقاء', 'Pic': 'المرسم', 'Psc': 'الحوت', 'PsA': 'الحوت الجنوبي',
        'Pup': 'الكوثل', 'Pyx': 'البوصلة', 'Ret': 'الشبكة', 'Sge': 'السهم', 'Sgr': 'الرامي',
        'Sco': 'العقرب', 'Scl': 'النحات', 'Sct': 'الترس', 'Ser': 'الحية', 'Sex': 'السدس',
        'Tau': 'الثور', 'Tel': 'المقراب', 'Tri': 'المثلث', 'TrA': 'المثلث الجنوبي',
        'Tuc': 'الطوقان', 'UMa': 'الدب الأكبر', 'UMi': 'الدب الأصغر', 'Vel': 'الشراع', 'Vir': 'العذراء',
        'Vol': 'السمكة الطائرة', 'Vul': 'الثعلب'
      }
    };
  }

  /**
   * Get constellation name in current language
   */
  getConstellationName(abbrev) {
    const names = this.getConstellationNames();
    const langNames = names[this.constellationLanguage] || names['en'];
    return langNames[abbrev] || abbrev;
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
   * Get full constellation name from abbreviation (for line highlighting)
   * Maps "Ori" -> "Orion", "UMa" -> "UrsaMajor", etc.
   */
  getConstellationFullName(abbrevOrName) {
    // If it already matches a constellation key, return as-is
    if (this.constellations && this.constellations[abbrevOrName]) {
      return abbrevOrName;
    }

    // Map of abbreviations to full names (as they appear in constellation data)
    const abbrevMap = {
      'And': 'Andromeda', 'Ant': 'Antlia', 'Aps': 'Apus', 'Aqr': 'Aquarius',
      'Aql': 'Aquila', 'Ara': 'Ara', 'Ari': 'Aries', 'Aur': 'Auriga',
      'Boo': 'Bootes', 'Cae': 'Caelum', 'Cam': 'Camelopardalis', 'Cnc': 'Cancer',
      'CVn': 'CanesVenatici', 'CMa': 'CanisMajor', 'CMi': 'CanisMinor',
      'Cap': 'Capricornus', 'Car': 'Carina', 'Cas': 'Cassiopeia', 'Cen': 'Centaurus',
      'Cep': 'Cepheus', 'Cet': 'Cetus', 'Cha': 'Chamaeleon', 'Cir': 'Circinus',
      'Col': 'Columba', 'Com': 'ComaBerenices', 'CrA': 'CoronaAustralis',
      'CrB': 'CoronaBorealis', 'Crv': 'Corvus', 'Crt': 'Crater', 'Cru': 'Crux',
      'Cyg': 'Cygnus', 'Del': 'Delphinus', 'Dor': 'Dorado', 'Dra': 'Draco',
      'Equ': 'Equuleus', 'Eri': 'Eridanus', 'For': 'Fornax', 'Gem': 'Gemini',
      'Gru': 'Grus', 'Her': 'Hercules', 'Hor': 'Horologium', 'Hya': 'Hydra',
      'Hyi': 'Hydrus', 'Ind': 'Indus', 'Lac': 'Lacerta', 'Leo': 'Leo',
      'LMi': 'LeoMinor', 'Lep': 'Lepus', 'Lib': 'Libra', 'Lup': 'Lupus',
      'Lyn': 'Lynx', 'Lyr': 'Lyra', 'Men': 'Mensa', 'Mic': 'Microscopium',
      'Mon': 'Monoceros', 'Mus': 'Musca', 'Nor': 'Norma', 'Oct': 'Octans',
      'Oph': 'Ophiuchus', 'Ori': 'Orion', 'Pav': 'Pavo', 'Peg': 'Pegasus',
      'Per': 'Perseus', 'Phe': 'Phoenix', 'Pic': 'Pictor', 'Psc': 'Pisces',
      'PsA': 'PiscisAustrinus', 'Pup': 'Puppis', 'Pyx': 'Pyxis', 'Ret': 'Reticulum',
      'Sge': 'Sagitta', 'Sgr': 'Sagittarius', 'Sco': 'Scorpius', 'Scl': 'Sculptor',
      'Sct': 'Scutum', 'Ser': 'SerpensA', 'Sex': 'Sextans', 'Tau': 'Taurus',
      'Tel': 'Telescopium', 'Tri': 'Triangulum', 'TrA': 'TriangulumAustrale',
      'Tuc': 'Tucana', 'UMa': 'UrsaMajor', 'UMi': 'UrsaMinor', 'Vel': 'Vela',
      'Vir': 'Virgo', 'Vol': 'Volans', 'Vul': 'Vulpecula'
    };

    return abbrevMap[abbrevOrName] || abbrevOrName;
  }

  /**
   * Get constellation abbreviation from full name
   * Maps "Orion" -> "Ori", "UrsaMajor" -> "UMa", etc.
   */
  getConstellationAbbrev(fullNameOrAbbrev) {
    // If it's already an abbreviation (3 letters or less), return as-is
    if (fullNameOrAbbrev.length <= 3) {
      return fullNameOrAbbrev;
    }

    // Reverse map: full name -> abbreviation
    const fullToAbbrev = {
      'Andromeda': 'And', 'Antlia': 'Ant', 'Apus': 'Aps', 'Aquarius': 'Aqr',
      'Aquila': 'Aql', 'Ara': 'Ara', 'Aries': 'Ari', 'Auriga': 'Aur',
      'Bootes': 'Boo', 'Boötes': 'Boo', 'Caelum': 'Cae', 'Camelopardalis': 'Cam',
      'Cancer': 'Cnc', 'CanesVenatici': 'CVn', 'Canes Venatici': 'CVn',
      'CanisMajor': 'CMa', 'Canis Major': 'CMa', 'CanisMinor': 'CMi', 'Canis Minor': 'CMi',
      'Capricornus': 'Cap', 'Carina': 'Car', 'Cassiopeia': 'Cas', 'Centaurus': 'Cen',
      'Cepheus': 'Cep', 'Cetus': 'Cet', 'Chamaeleon': 'Cha', 'Circinus': 'Cir',
      'Columba': 'Col', 'ComaBerenices': 'Com', 'Coma Berenices': 'Com',
      'CoronaAustralis': 'CrA', 'Corona Australis': 'CrA',
      'CoronaBorealis': 'CrB', 'Corona Borealis': 'CrB',
      'Corvus': 'Crv', 'Crater': 'Crt', 'Crux': 'Cru',
      'Cygnus': 'Cyg', 'Delphinus': 'Del', 'Dorado': 'Dor', 'Draco': 'Dra',
      'Equuleus': 'Equ', 'Eridanus': 'Eri', 'Fornax': 'For', 'Gemini': 'Gem',
      'Grus': 'Gru', 'Hercules': 'Her', 'Horologium': 'Hor', 'Hydra': 'Hya',
      'Hydrus': 'Hyi', 'Indus': 'Ind', 'Lacerta': 'Lac', 'Leo': 'Leo',
      'LeoMinor': 'LMi', 'Leo Minor': 'LMi', 'Lepus': 'Lep', 'Libra': 'Lib',
      'Lupus': 'Lup', 'Lynx': 'Lyn', 'Lyra': 'Lyr', 'Mensa': 'Men',
      'Microscopium': 'Mic', 'Monoceros': 'Mon', 'Musca': 'Mus', 'Norma': 'Nor',
      'Octans': 'Oct', 'Ophiuchus': 'Oph', 'Orion': 'Ori', 'Pavo': 'Pav',
      'Pegasus': 'Peg', 'Perseus': 'Per', 'Phoenix': 'Phe', 'Pictor': 'Pic',
      'Pisces': 'Psc', 'PiscisAustrinus': 'PsA', 'Piscis Austrinus': 'PsA',
      'Puppis': 'Pup', 'Pyxis': 'Pyx', 'Reticulum': 'Ret',
      'Sagitta': 'Sge', 'Sagittarius': 'Sgr', 'Scorpius': 'Sco', 'Sculptor': 'Scl',
      'Scutum': 'Sct', 'SerpensA': 'Ser', 'Serpens': 'Ser', 'Sextans': 'Sex',
      'Taurus': 'Tau', 'Telescopium': 'Tel', 'Triangulum': 'Tri',
      'TriangulumAustrale': 'TrA', 'Triangulum Australe': 'TrA',
      'Tucana': 'Tuc', 'UrsaMajor': 'UMa', 'Ursa Major': 'UMa',
      'UrsaMinor': 'UMi', 'Ursa Minor': 'UMi', 'Vela': 'Vel',
      'Virgo': 'Vir', 'Volans': 'Vol', 'Vulpecula': 'Vul'
    };

    return fullToAbbrev[fullNameOrAbbrev] || fullNameOrAbbrev;
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
    const names = this.getConstellationNames();
    const englishName = names['en'][abbrev] || constName;

    let html = `<h2>${fullName}</h2>`;
    html += `<p><strong>Abbreviation:</strong> ${abbrev}</p>`;

    // Show Latin name if current language is not English/Latin
    if (this.constellationLanguage !== 'en' && this.constellationLanguage !== 'la') {
      html += `<p><strong>Latin:</strong> ${englishName}</p>`;
    }

    // Get constellation story if available (try both abbrev and original name)
    const story = this.getConstellationStory(abbrev) || this.getConstellationStory(constName);
    if (story) {
      html += `<div class="constellation-story">`;
      html += `<p>${story.mythology}</p>`;
      html += `<p><strong>Best Seen:</strong> ${story.bestSeen}</p>`;
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
      const response = await fetch(searchUrl);

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
      const fallbackResponse = await fetch(fallbackUrl);

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

  getSDSSImageUrl(ra, dec, type) {
    // SDSS (Sloan Digital Sky Survey) provides beautiful color images
    // Coverage: ~35% of sky, mostly northern hemisphere
    // DR18 is the latest data release

    // Determine scale based on object type (arcsec/pixel)
    let scale = 0.4;  // default scale
    let size = 300;   // image size in pixels

    if (type === 'Star') {
      scale = 0.2;  // closer zoom for stars
    } else if (type === 'Galaxy') {
      scale = 0.6;  // wider field for galaxies
    } else if (type === 'Nebula' || type === 'Open Cluster') {
      scale = 0.8;  // even wider for nebulae
    } else if (type === 'Globular Cluster') {
      scale = 0.5;
    }

    return `https://skyserver.sdss.org/dr18/SkyServerWS/ImgCutout/getjpeg?ra=${ra.toFixed(5)}&dec=${dec.toFixed(5)}&scale=${scale}&width=${size}&height=${size}`;
  }

  getSkyViewImageUrl(ra, dec, type, angularSizeArcmin = null) {
    // Determine appropriate field size based on object's actual angular size
    // IMPORTANT: Use the FULL object size to avoid partial images
    let fov; // in degrees

    if (angularSizeArcmin && angularSizeArcmin > 0) {
      // Use actual angular size with padding (1.3x for context, not too much)
      fov = (angularSizeArcmin * 1.3) / 60; // Convert arcmin to degrees
      // Allow large FOV for big objects like M31 (up to 5 degrees)
      // DSS can handle large cutouts
      fov = Math.max(0.05, Math.min(fov, 5.0));
    } else if (type === 'Star') {
      fov = 0.1; // 6 arcmin for stars
    } else if (type === 'Galaxy' || type === 'Nebula' || type === 'G') {
      fov = 0.5; // 30 arcmin default for extended objects
    } else if (type === 'Globular Cluster' || type === 'Open Cluster' || type === 'GCl' || type === 'OCl') {
      fov = 0.3; // 18 arcmin for clusters
    } else if (type === 'Planetary Nebula' || type === 'PN') {
      fov = 0.15; // 9 arcmin for planetary nebulae
    } else if (type === 'Neb' || type === 'EmN' || type === 'HII' || type === 'Cl+N' || type === 'RfN' || type === 'SNR') {
      fov = 0.5; // 30 arcmin for nebulae
    } else {
      fov = 0.25; // default 15 arcmin field
    }

    // Convert FOV from degrees to image pixels (512px default)
    const sizePixels = 512;

    // Use CDS Aladin HiPS service - reliable CORS support
    // hips2fits provides cutout images from various sky surveys
    // Using DSS2/color survey for good visual quality
    return `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=CDS%2FP%2FDSS2%2Fcolor&ra=${ra.toFixed(5)}&dec=${dec.toFixed(5)}&fov=${fov.toFixed(4)}&width=${sizePixels}&height=${sizePixels}&format=jpg`;
  }

  getObjectImageUrl(obj) {
    // Use the imported getCuratedImage function from CuratedImages module
    const name = obj.name || obj.proper || '';
    if (!name) return null;

    // Try to find curated image using the module's lookup function
    const curatedImage = getCuratedImage(name);
    if (curatedImage) {
      return curatedImage.url;
    }

    // Also try proper name for stars
    if (obj.proper && obj.proper !== name) {
      const properImage = getCuratedImage(obj.proper);
      if (properImage) {
        return properImage.url;
      }
    }

    return null;
  }

  /**
   * Shared curated image database - now uses imported CURATED_IMAGES module
   * Maintained for backward compatibility with existing code
   * @returns {Object} The curated images database
   */
  getCuratedImageDatabase() {
    return CURATED_IMAGES;
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
        const response = await fetch(
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
   * @param {Object} obj - Star object with properties like mag, spect, ci, hip
   * @returns {string|null} Generated description or null if not enough data
   * @private
   */
  generateStarDescription_(obj) {
    const parts = [];

    // Spectral type description
    if (obj.spect) {
      const spectralDescriptions = {
        'O': 'a very hot, blue star',
        'B': 'a hot, blue-white star',
        'A': 'a white star',
        'F': 'a yellow-white star',
        'G': 'a yellow star similar to our Sun',
        'K': 'an orange star',
        'M': 'a cool, red star',
        'L': 'a very cool, brown dwarf',
        'T': 'a cool brown dwarf',
        'Y': 'an ultra-cool brown dwarf',
        'C': 'a carbon star',
        'S': 'a red giant with zirconium oxide',
        'W': 'a Wolf-Rayet star',
      };
      const spectClass = obj.spect.charAt(0).toUpperCase();
      if (spectralDescriptions[spectClass]) {
        parts.push(`This is ${spectralDescriptions[spectClass]}`);

        // Add luminosity class description
        if (obj.spect.includes('I') && !obj.spect.includes('II') && !obj.spect.includes('III') && !obj.spect.includes('IV')) {
          parts[0] += ' (supergiant)';
        } else if (obj.spect.includes('III')) {
          parts[0] += ' (giant)';
        } else if (obj.spect.includes('V')) {
          parts[0] += ' (main sequence)';
        }
        parts[0] += '.';
      }
    }

    // Magnitude description
    if (obj.mag !== undefined && obj.mag !== null) {
      const mag = obj.mag;
      let magDesc;
      if (mag < 0) {
        magDesc = 'one of the brightest stars in the sky';
      } else if (mag < 1) {
        magDesc = 'a very bright star, easily visible to the naked eye';
      } else if (mag < 3) {
        magDesc = 'a bright star visible to the naked eye';
      } else if (mag < 6) {
        magDesc = 'visible to the naked eye under good conditions';
      } else if (mag < 8) {
        magDesc = 'visible with binoculars';
      } else {
        magDesc = 'visible with a telescope';
      }
      parts.push(`With an apparent magnitude of ${mag.toFixed(2)}, it is ${magDesc}.`);
    }

    // Catalog identifiers
    const catalogs = [];
    if (obj.hip) catalogs.push(`HIP ${obj.hip}`);
    if (obj.hd) catalogs.push(`HD ${obj.hd}`);
    if (obj.hr) catalogs.push(`HR ${obj.hr}`);
    if (catalogs.length > 0) {
      parts.push(`Catalog designation: ${catalogs.join(', ')}.`);
    }

    return parts.length > 0 ? parts.join(' ') : null;
  }

  getWikipediaSearchTerms(obj) {
    const terms = [];
    const name = obj.name;

    // Messier objects have specific Wikipedia titles
    const messierMatch = name.match(/M(\d+)/i);
    if (messierMatch) {
      terms.push(`Messier_${messierMatch[1]}`);
    }

    // NGC objects - remove leading zeros for Wikipedia (NGC0869 -> NGC_869)
    const ngcMatch = name.match(/NGC\s*0*(\d+)/i);
    if (ngcMatch) {
      terms.push(`NGC_${ngcMatch[1]}`);
    }

    // IC objects - format as IC_number for Wikipedia
    const icMatch = name.match(/IC\s*0*(\d+)/i);
    if (icMatch) {
      terms.push(`IC_${icMatch[1]}`);
    }

    // Planets
    if (['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(name)) {
      terms.push(`${name}_(planet)`);
    }

    // Famous stars/objects with common names (expanded list)
    const starMapping = {
      // Top 20 brightest
      'Sirius': 'Sirius', 'Canopus': 'Canopus', 'Vega': 'Vega', 'Arcturus': 'Arcturus',
      'Capella': 'Capella', 'Rigel': 'Rigel', 'Procyon': 'Procyon', 'Betelgeuse': 'Betelgeuse',
      'Achernar': 'Achernar', 'Hadar': 'Hadar', 'Altair': 'Altair', 'Aldebaran': 'Aldebaran',
      'Antares': 'Antares', 'Spica': 'Spica', 'Pollux': 'Pollux', 'Fomalhaut': 'Fomalhaut',
      'Deneb': 'Deneb', 'Mimosa': 'Beta_Crucis', 'Acrux': 'Alpha_Crucis', 'Regulus': 'Regulus',
      // Navigation stars
      'Polaris': 'Polaris', 'Alioth': 'Alioth', 'Dubhe': 'Dubhe', 'Alkaid': 'Alkaid',
      'Merak': 'Merak', 'Mizar': 'Mizar', 'Alcor': 'Alcor',
      // Notable stars
      'Castor': 'Castor_(star)', 'Bellatrix': 'Bellatrix', 'Alnilam': 'Alnilam',
      'Alnitak': 'Alnitak', 'Mintaka': 'Mintaka', 'Saiph': 'Saiph',
      'Algol': 'Algol', 'Mira': 'Mira_(star)', 'Denebola': 'Denebola',
      'Rasalhague': 'Rasalhague', 'Eltanin': 'Eltanin', 'Alphard': 'Alphard',
      'Schedar': 'Schedar', 'Mirach': 'Mirach', 'Alpheratz': 'Alpheratz',
      'Enif': 'Enif', 'Markab': 'Markab', 'Algenib': 'Algenib',
      'Mirfak': 'Mirfak', 'Almach': 'Almach', 'Hamal': 'Hamal',
      'Sheratan': 'Sheratan', 'Alcyone': 'Alcyone_(star)', 'Atlas': 'Atlas_(star)',
      'Electra': 'Electra_(star)', 'Maia': 'Maia_(star)', 'Merope': 'Merope_(star)',
      'Taygeta': 'Taygeta_(star)', 'Pleione': 'Pleione_(star)', 'Celaeno': 'Celaeno_(star)',
      'Vindemiatrix': 'Vindemiatrix', 'Zubenelgenubi': 'Zubenelgenubi', 'Zubeneschamali': 'Zubeneschamali',
      'Nunki': 'Nunki', 'Kaus Australis': 'Kaus_Australis', 'Shaula': 'Shaula',
      'Sargas': 'Sargas', 'Dschubba': 'Dschubba', 'Graffias': 'Graffias',
      'Atria': 'Atria', 'Peacock': 'Peacock_(star)', 'Alnair': 'Alnair',
      'Formalhaut': 'Fomalhaut', 'Diphda': 'Diphda', 'Ankaa': 'Ankaa',
      'Acamar': 'Acamar', 'Zaurak': 'Zaurak', 'Cursa': 'Cursa',
      'Arneb': 'Arneb', 'Nihal': 'Nihal', 'Wezen': 'Wezen',
      'Adhara': 'Adhara', 'Furud': 'Furud', 'Aludra': 'Aludra',
      'Naos': 'Naos_(star)', 'Suhail': 'Suhail', 'Avior': 'Avior',
      'Miaplacidus': 'Miaplacidus', 'Aspidiske': 'Aspidiske', 'Turais': 'Rho_Puppis',
      'Gacrux': 'Gacrux', 'Muhlifain': 'Gamma_Centauri', 'Menkent': 'Menkent',
      'Izar': 'Izar_(star)', 'Kochab': 'Kochab', 'Pherkad': 'Pherkad',
      'Thuban': 'Thuban', 'Rastaban': 'Rastaban', 'Etamin': 'Eltanin',
      'Albireo': 'Albireo', 'Sadr': 'Sadr_(star)', 'Gienah': 'Gienah',
      'Algedi': 'Algedi', 'Dabih': 'Dabih', 'Nashira': 'Nashira',
      'Deneb Algedi': 'Deneb_Algedi', 'Sadalmelik': 'Sadalmelik', 'Sadalsuud': 'Sadalsuud',
      'Skat': 'Skat_(star)', 'Ancha': 'Ancha',
    };

    if (starMapping[name]) {
      terms.push(starMapping[name]);
    }

    // Skip catalog-only names that don't have Wikipedia articles
    // (HIP, TYC, HD, HR, SAO, BD, CD, CPD are catalog prefixes without individual articles)
    const catalogPattern = /^(HIP|TYC|HD|HR|SAO|BD|CD|CPD|UCAC|2MASS|GAIA)\s*[\d\-\+]+$/i;
    if (!catalogPattern.test(name)) {
      // Only try the exact name if it's not a generic catalog ID
      terms.push(name.replace(/\s+/g, '_'));
    }

    return terms;
  }

  animateCameraTo(ra, dec) {
    // Get the object position in celestial (local) coordinates
    const localPos = this.raDecToCartesian(ra, dec, 100);

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

    const targetPhi = Math.acos(Math.max(-1, Math.min(1, -dir.y)));
    const targetTheta = Math.atan2(-dir.z, -dir.x);

    // Use smooth animation via the existing target system
    this.targetTheta = targetTheta;
    this.targetPhi = targetPhi;

    // Also zoom in a bit if we're zoomed out too far
    if (this.camera.fov > 30) {
      this.targetFov = 30;
    }
  }

  // Feature 7: Time Machine Controls
  updateSimulationTime(deltaMs) {
    this.simulationTime = new Date(this.simulationTime.getTime() + deltaMs);

    // Update UI
    const timeDisplay = document.getElementById('time-display');
    if (timeDisplay) {
      timeDisplay.textContent = this.simulationTime.toLocaleString();
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

    // Update Sun and Moon positions periodically when time is moving fast
    // Moon moves ~13°/day, so update every simulated hour for smooth motion at high speeds
    if (!this.lastPlanetUpdate) {
      this.lastPlanetUpdate = this.simulationTime.getTime();
    }
    const timeSinceUpdate = Math.abs(this.simulationTime.getTime() - this.lastPlanetUpdate);
    if (timeSinceUpdate > 3600000) { // Update every simulated hour
      this.createPlanets();
      this.lastPlanetUpdate = this.simulationTime.getTime();
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
    this.timeSpeed = speed;
    const speedDisplay = document.getElementById('time-speed-display');
    if (speedDisplay) {
      if (speed === 0) {
        speedDisplay.textContent = 'Paused';
      } else if (speed === 1) {
        speedDisplay.textContent = 'Real-time';
      } else {
        speedDisplay.textContent = `${speed}x`;
      }
    }
  }

  jumpToTime(date) {
    this.simulationTime = new Date(date);

    // Set celestial sphere rotation based on Local Sidereal Time
    this.updateCelestialRotation();

    // Recreate planets with new positions (Sun and Moon move over time)
    this.createPlanets();

    this.updateSimulationTime(0);
  }

  // Calculate Local Sidereal Time and set celestial sphere rotation
  updateCelestialRotation() {
    if (!this.celestialSphere) return;

    const lst = this.calculateLST(this.simulationTime, this.observerLocation?.lon || 0);

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

  /**
   * Calculate Local Sidereal Time in degrees (0-360)
   * Delegates to CoordinateUtils module
   */
  calculateLST(date, longitude) {
    return _calculateLST(date, longitude);
  }

  /**
   * Convert JavaScript Date to Julian Date
   * Delegates to CoordinateUtils module
   */
  dateToJulianDate(date) {
    return _dateToJulianDate(date);
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
      html += `<li><a href="#" data-ra="${star.ra}" data-dec="${star.dec}">${star.name}</a> (mag ${star.magnitude.toFixed(1)})</li>`;
    });
    html += '</ul>';

    html += '<h3>Messier Objects</h3><ul>';
    visible.messierObjects.forEach(obj => {
      html += `<li><a href="#" data-ra="${obj.ra}" data-dec="${obj.dec}">${obj.name}</a> - ${obj.type} (mag ${obj.magnitude.toFixed(1)})</li>`;
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
    const tours = this.getAvailableTours();
    this.currentTour = tours[tourName];

    if (!this.currentTour) return;

    this.tourStep = 0;
    this.showTourStep();
  }

  getAvailableTours() {
    return {
      'winter-sky': {
        name: 'Winter Sky Highlights',
        steps: [
          { name: 'Sirius', ra: 101.29, dec: -16.72, description: 'The brightest star in the night sky, Alpha Canis Majoris' },
          { name: 'Betelgeuse', ra: 88.79, dec: 7.41, description: 'Red supergiant marking Orion\'s shoulder, destined to explode as a supernova' },
          { name: 'Rigel', ra: 78.63, dec: -8.20, description: 'Blue supergiant, the 7th brightest star, Orion\'s foot' },
          { name: 'M42', ra: 83.82, dec: -5.39, description: 'Great Orion Nebula - stunning stellar nursery visible to naked eye' },
          { name: 'M45', ra: 56.87, dec: 24.12, description: 'Pleiades - the Seven Sisters, a young open cluster' },
          { name: 'Aldebaran', ra: 68.98, dec: 16.51, description: 'The fiery eye of Taurus, an orange giant star' },
          { name: 'Capella', ra: 79.17, dec: 45.99, description: 'The Goat Star in Auriga, 6th brightest in the sky' },
          { name: 'M1', ra: 83.63, dec: 22.01, description: 'Crab Nebula - remnant of the supernova of 1054 AD' },
          { name: 'Procyon', ra: 114.83, dec: 5.22, description: 'Little Dog Star, 8th brightest, with white dwarf companion' },
          { name: 'Castor', ra: 113.65, dec: 31.89, description: 'Alpha Geminorum - actually a sextuple star system' }
        ]
      },
      'messier-marathon': {
        name: 'Complete Messier Catalog',
        steps: [
          // All 110 Messier objects with descriptions
          { name: 'M1', ra: 83.63, dec: 22.01, mag: 8.4, description: 'Crab Nebula - supernova remnant from 1054 AD in Taurus' },
          { name: 'M2', ra: 323.36, dec: -0.82, mag: 6.5, description: 'Globular cluster in Aquarius, 37,000 light-years away' },
          { name: 'M3', ra: 205.55, dec: 28.38, mag: 6.2, description: 'Bright globular cluster in Canes Venatici with 500,000 stars' },
          { name: 'M4', ra: 245.90, dec: -26.53, mag: 5.6, description: 'Nearest globular cluster at 7,200 light-years in Scorpius' },
          { name: 'M5', ra: 229.64, dec: 2.08, mag: 5.7, description: 'Beautiful globular cluster in Serpens, 13 billion years old' },
          { name: 'M6', ra: 265.07, dec: -32.22, mag: 4.2, description: 'Butterfly Cluster - open cluster in Scorpius' },
          { name: 'M7', ra: 268.47, dec: -34.82, mag: 3.3, description: 'Ptolemy Cluster - bright open cluster visible to naked eye' },
          { name: 'M8', ra: 270.92, dec: -24.38, mag: 6.0, description: 'Lagoon Nebula - stunning emission nebula in Sagittarius' },
          { name: 'M9', ra: 259.80, dec: -18.52, mag: 7.7, description: 'Globular cluster near galactic center in Ophiuchus' },
          { name: 'M10', ra: 254.29, dec: -4.10, mag: 6.6, description: 'Globular cluster in Ophiuchus, 14,300 light-years distant' },
          { name: 'M11', ra: 282.77, dec: -6.27, mag: 6.3, description: 'Wild Duck Cluster - rich open cluster in Scutum' },
          { name: 'M12', ra: 251.81, dec: -1.95, mag: 6.7, description: 'Gumball Globular in Ophiuchus' },
          { name: 'M13', ra: 250.42, dec: 36.46, mag: 5.8, description: 'Great Hercules Cluster - finest globular in northern sky' },
          { name: 'M14', ra: 264.40, dec: -3.25, mag: 7.6, description: 'Globular cluster in Ophiuchus' },
          { name: 'M15', ra: 322.49, dec: 12.17, mag: 6.2, description: 'Pegasus Cluster - dense globular with planetary nebula' },
          { name: 'M16', ra: 274.70, dec: -13.81, mag: 6.4, description: 'Eagle Nebula - home of the Pillars of Creation' },
          { name: 'M17', ra: 275.20, dec: -16.18, mag: 6.0, description: 'Omega/Swan Nebula - bright emission nebula' },
          { name: 'M18', ra: 274.52, dec: -17.13, mag: 7.5, description: 'Small open cluster in Sagittarius' },
          { name: 'M19', ra: 255.66, dec: -26.27, mag: 6.8, description: 'Oblate globular cluster in Ophiuchus' },
          { name: 'M20', ra: 270.59, dec: -23.03, mag: 6.3, description: 'Trifid Nebula - emission, reflection, and dark nebula combined' },
          { name: 'M21', ra: 271.05, dec: -22.50, mag: 6.5, description: 'Open cluster near the Trifid Nebula' },
          { name: 'M22', ra: 279.10, dec: -23.90, mag: 5.1, description: 'Sagittarius Cluster - one of the nearest globulars' },
          { name: 'M23', ra: 269.27, dec: -19.02, mag: 6.9, description: 'Open cluster in Sagittarius' },
          { name: 'M24', ra: 274.73, dec: -18.42, mag: 4.6, description: 'Sagittarius Star Cloud - dense Milky Way patch' },
          { name: 'M25', ra: 277.95, dec: -19.12, mag: 6.5, description: 'Open cluster in Sagittarius with Cepheid variable' },
          { name: 'M26', ra: 281.32, dec: -9.38, mag: 8.0, description: 'Open cluster in Scutum' },
          { name: 'M27', ra: 299.90, dec: 22.72, mag: 7.5, description: 'Dumbbell Nebula - large bright planetary nebula in Vulpecula' },
          { name: 'M28', ra: 276.14, dec: -24.87, mag: 6.8, description: 'Globular cluster in Sagittarius' },
          { name: 'M29', ra: 305.98, dec: 38.53, mag: 7.1, description: 'Open cluster in Cygnus' },
          { name: 'M30', ra: 325.09, dec: -23.18, mag: 7.2, description: 'Globular cluster in Capricornus' },
          { name: 'M31', ra: 10.68, dec: 41.27, mag: 3.4, description: 'Andromeda Galaxy - nearest major galaxy, 2.5 million light-years' },
          { name: 'M32', ra: 10.67, dec: 40.87, mag: 8.1, description: 'Elliptical satellite galaxy of M31' },
          { name: 'M33', ra: 23.46, dec: 30.66, mag: 5.7, description: 'Triangulum Galaxy - third largest in Local Group' },
          { name: 'M34', ra: 40.52, dec: 42.78, mag: 5.5, description: 'Open cluster in Perseus' },
          { name: 'M35', ra: 92.27, dec: 24.33, mag: 5.3, description: 'Rich open cluster in Gemini' },
          { name: 'M36', ra: 84.07, dec: 34.13, mag: 6.3, description: 'Pinwheel Cluster in Auriga' },
          { name: 'M37', ra: 88.07, dec: 32.55, mag: 6.2, description: 'Richest of the Auriga clusters' },
          { name: 'M38', ra: 82.18, dec: 35.85, mag: 7.4, description: 'Starfish Cluster in Auriga' },
          { name: 'M39', ra: 322.33, dec: 48.43, mag: 5.5, description: 'Large open cluster in Cygnus' },
          { name: 'M40', ra: 185.55, dec: 58.08, mag: 8.4, description: 'Winnecke 4 - double star in Ursa Major' },
          { name: 'M41', ra: 101.50, dec: -20.73, mag: 4.5, description: 'Open cluster near Sirius in Canis Major' },
          { name: 'M42', ra: 83.82, dec: -5.39, mag: 4.0, description: 'Great Orion Nebula - the most famous nebula in the sky' },
          { name: 'M43', ra: 83.89, dec: -5.27, mag: 9.0, description: 'De Mairan\'s Nebula - part of Orion complex' },
          { name: 'M44', ra: 130.05, dec: 19.67, mag: 3.7, description: 'Beehive Cluster (Praesepe) - naked-eye cluster in Cancer' },
          { name: 'M45', ra: 56.87, dec: 24.12, mag: 1.6, description: 'Pleiades - the Seven Sisters, most famous star cluster' },
          { name: 'M46', ra: 115.44, dec: -14.82, mag: 6.1, description: 'Open cluster in Puppis with planetary nebula NGC2438' },
          { name: 'M47', ra: 114.15, dec: -14.50, mag: 4.2, description: 'Bright open cluster in Puppis' },
          { name: 'M48', ra: 123.43, dec: -5.73, mag: 5.5, description: 'Open cluster in Hydra' },
          { name: 'M49', ra: 187.44, dec: 8.00, mag: 8.4, description: 'Elliptical galaxy in Virgo Cluster' },
          { name: 'M50', ra: 105.68, dec: -8.37, mag: 5.9, description: 'Open cluster in Monoceros' },
          { name: 'M51', ra: 202.47, dec: 47.20, mag: 8.4, description: 'Whirlpool Galaxy - stunning face-on spiral with companion' },
          { name: 'M52', ra: 351.20, dec: 61.60, mag: 7.3, description: 'Open cluster in Cassiopeia' },
          { name: 'M53', ra: 198.23, dec: 18.17, mag: 7.6, description: 'Globular cluster in Coma Berenices' },
          { name: 'M54', ra: 283.76, dec: -30.48, mag: 7.6, description: 'Globular cluster - actually belongs to Sagittarius Dwarf Galaxy' },
          { name: 'M55', ra: 294.99, dec: -30.96, mag: 6.3, description: 'Summer Rose Star - loose globular in Sagittarius' },
          { name: 'M56', ra: 289.15, dec: 30.18, mag: 8.3, description: 'Globular cluster in Lyra' },
          { name: 'M57', ra: 283.40, dec: 33.03, mag: 8.8, description: 'Ring Nebula - famous smoke-ring planetary nebula in Lyra' },
          { name: 'M58', ra: 189.43, dec: 11.82, mag: 9.7, description: 'Barred spiral galaxy in Virgo Cluster' },
          { name: 'M59', ra: 190.51, dec: 11.65, mag: 9.6, description: 'Elliptical galaxy in Virgo Cluster' },
          { name: 'M60', ra: 190.92, dec: 11.55, mag: 8.8, description: 'Giant elliptical galaxy in Virgo Cluster' },
          { name: 'M61', ra: 185.48, dec: 4.47, mag: 9.7, description: 'Face-on spiral galaxy in Virgo Cluster' },
          { name: 'M62', ra: 255.30, dec: -30.11, mag: 6.5, description: 'Asymmetric globular cluster in Ophiuchus' },
          { name: 'M63', ra: 198.96, dec: 42.03, mag: 8.6, description: 'Sunflower Galaxy - flocculent spiral in Canes Venatici' },
          { name: 'M64', ra: 194.18, dec: 21.68, mag: 8.5, description: 'Black Eye Galaxy - spiral with distinctive dark dust band' },
          { name: 'M65', ra: 169.73, dec: 13.09, mag: 9.3, description: 'Leo Triplet member - edge-on spiral' },
          { name: 'M66', ra: 170.06, dec: 12.99, mag: 8.9, description: 'Leo Triplet member - disturbed spiral galaxy' },
          { name: 'M67', ra: 132.85, dec: 11.82, mag: 6.1, description: 'Old open cluster in Cancer, 4 billion years old' },
          { name: 'M68', ra: 189.87, dec: -26.75, mag: 7.8, description: 'Globular cluster in Hydra' },
          { name: 'M69', ra: 277.85, dec: -32.35, mag: 7.6, description: 'Globular cluster in Sagittarius' },
          { name: 'M70', ra: 280.80, dec: -32.30, mag: 7.9, description: 'Globular cluster in Sagittarius' },
          { name: 'M71', ra: 298.44, dec: 18.78, mag: 8.2, description: 'Loose globular cluster in Sagitta' },
          { name: 'M72', ra: 313.37, dec: -12.54, mag: 9.3, description: 'Remote globular cluster in Aquarius' },
          { name: 'M73', ra: 314.75, dec: -12.63, mag: 9.0, description: 'Asterism of four stars in Aquarius' },
          { name: 'M74', ra: 24.17, dec: 15.78, mag: 9.4, description: 'Phantom Galaxy - perfect face-on spiral in Pisces' },
          { name: 'M75', ra: 301.52, dec: -21.92, mag: 8.5, description: 'Compact globular cluster in Sagittarius' },
          { name: 'M76', ra: 25.58, dec: 51.58, mag: 10.1, description: 'Little Dumbbell Nebula - planetary nebula in Perseus' },
          { name: 'M77', ra: 40.67, dec: -0.01, mag: 8.9, description: 'Cetus A - Seyfert galaxy with active nucleus' },
          { name: 'M78', ra: 86.69, dec: 0.08, mag: 8.3, description: 'Brightest reflection nebula in Orion' },
          { name: 'M79', ra: 81.04, dec: -24.52, mag: 7.7, description: 'Globular cluster in Lepus - unusual winter position' },
          { name: 'M80', ra: 244.26, dec: -22.98, mag: 7.3, description: 'Dense globular cluster in Scorpius' },
          { name: 'M81', ra: 148.89, dec: 69.07, mag: 6.9, description: 'Bode\'s Galaxy - grand design spiral in Ursa Major' },
          { name: 'M82', ra: 148.97, dec: 69.68, mag: 8.4, description: 'Cigar Galaxy - starburst galaxy with dramatic outflows' },
          { name: 'M83', ra: 204.25, dec: -29.87, mag: 7.5, description: 'Southern Pinwheel - barred spiral with intense star formation' },
          { name: 'M84', ra: 186.27, dec: 12.89, mag: 9.1, description: 'Lenticular galaxy in Virgo Cluster' },
          { name: 'M85', ra: 186.35, dec: 18.19, mag: 9.1, description: 'Lenticular galaxy in Virgo Cluster' },
          { name: 'M86', ra: 186.55, dec: 12.95, mag: 8.9, description: 'Giant elliptical in Virgo Cluster, blueshifted' },
          { name: 'M87', ra: 187.71, dec: 12.39, mag: 8.6, description: 'Virgo A - giant elliptical with jet and famous black hole' },
          { name: 'M88', ra: 187.99, dec: 14.42, mag: 9.6, description: 'Spiral galaxy in Virgo Cluster' },
          { name: 'M89', ra: 188.92, dec: 12.55, mag: 9.8, description: 'Almost perfectly spherical elliptical galaxy' },
          { name: 'M90', ra: 189.21, dec: 13.16, mag: 9.5, description: 'Large spiral galaxy in Virgo Cluster' },
          { name: 'M91', ra: 188.86, dec: 14.50, mag: 10.2, description: 'Barred spiral galaxy in Virgo Cluster' },
          { name: 'M92', ra: 259.28, dec: 43.14, mag: 6.4, description: 'Ancient globular in Hercules, 14 billion years old' },
          { name: 'M93', ra: 116.15, dec: -23.87, mag: 6.0, description: 'Open cluster in Puppis' },
          { name: 'M94', ra: 192.72, dec: 41.12, mag: 8.2, description: 'Croc\'s Eye Galaxy - spiral with starburst ring' },
          { name: 'M95', ra: 160.99, dec: 11.70, mag: 9.7, description: 'Barred spiral in Leo' },
          { name: 'M96', ra: 161.69, dec: 11.82, mag: 9.2, description: 'Double-barred spiral in Leo' },
          { name: 'M97', ra: 168.70, dec: 55.02, mag: 9.9, description: 'Owl Nebula - planetary nebula in Ursa Major' },
          { name: 'M98', ra: 183.45, dec: 14.90, mag: 10.1, description: 'Edge-on spiral in Virgo Cluster' },
          { name: 'M99', ra: 184.71, dec: 14.42, mag: 9.9, description: 'Coma Pinwheel - face-on spiral' },
          { name: 'M100', ra: 185.73, dec: 15.82, mag: 9.3, description: 'Grand design spiral in Virgo Cluster' },
          { name: 'M101', ra: 210.80, dec: 54.35, mag: 7.9, description: 'Pinwheel Galaxy - stunning face-on spiral in Ursa Major' },
          { name: 'M102', ra: 226.62, dec: 55.76, mag: 9.9, description: 'Spindle Galaxy (NGC5866) - edge-on lenticular' },
          { name: 'M103', ra: 23.34, dec: 60.70, mag: 7.4, description: 'Open cluster in Cassiopeia' },
          { name: 'M104', ra: 189.99, dec: -11.62, mag: 8.0, description: 'Sombrero Galaxy - iconic edge-on with dust lane' },
          { name: 'M105', ra: 161.96, dec: 12.58, mag: 9.3, description: 'Elliptical galaxy in Leo' },
          { name: 'M106', ra: 184.74, dec: 47.30, mag: 8.4, description: 'Seyfert galaxy with water maser' },
          { name: 'M107', ra: 248.13, dec: -13.05, mag: 7.9, description: 'Loose globular cluster in Ophiuchus' },
          { name: 'M108', ra: 167.88, dec: 55.67, mag: 10.0, description: 'Surfboard Galaxy - edge-on spiral in Ursa Major' },
          { name: 'M109', ra: 179.40, dec: 53.37, mag: 9.8, description: 'Barred spiral galaxy in Ursa Major' },
          { name: 'M110', ra: 10.09, dec: 41.68, mag: 8.5, description: 'Elliptical satellite of Andromeda Galaxy' }
        ].sort((a, b) => a.mag - b.mag)
      },
      'constellations': {
        name: 'Constellation Tour',
        type: 'constellation',
        steps: [
          { name: 'Orion', abbrev: 'Ori', ra: 85.0, dec: 0.0, description: 'The Hunter - one of the most recognizable constellations' },
          { name: 'Ursa Major', abbrev: 'UMa', ra: 165.0, dec: 55.0, description: 'The Great Bear - home of the Big Dipper' },
          { name: 'Cassiopeia', abbrev: 'Cas', ra: 15.0, dec: 60.0, description: 'The Queen - distinctive W or M shape' },
          { name: 'Scorpius', abbrev: 'Sco', ra: 255.0, dec: -30.0, description: 'The Scorpion - prominent summer constellation' },
          { name: 'Leo', abbrev: 'Leo', ra: 165.0, dec: 15.0, description: 'The Lion - spring zodiac constellation' },
          { name: 'Cygnus', abbrev: 'Cyg', ra: 305.0, dec: 40.0, description: 'The Swan - contains the Northern Cross asterism' },
          { name: 'Sagittarius', abbrev: 'Sgr', ra: 285.0, dec: -30.0, description: 'The Archer - points toward galactic center' },
          { name: 'Gemini', abbrev: 'Gem', ra: 112.0, dec: 25.0, description: 'The Twins - winter zodiac constellation' },
          { name: 'Lyra', abbrev: 'Lyr', ra: 282.0, dec: 35.0, description: 'The Lyre - home of bright star Vega' },
          { name: 'Taurus', abbrev: 'Tau', ra: 65.0, dec: 15.0, description: 'The Bull - contains the Pleiades and Hyades' },
          { name: 'Aquila', abbrev: 'Aql', ra: 295.0, dec: 5.0, description: 'The Eagle - home of bright star Altair' },
          { name: 'Pegasus', abbrev: 'Peg', ra: 340.0, dec: 20.0, description: 'The Winged Horse - famous Great Square asterism' },
          { name: 'Andromeda', abbrev: 'And', ra: 10.0, dec: 38.0, description: 'The Chained Princess - contains M31 galaxy' },
          { name: 'Canis Major', abbrev: 'CMa', ra: 105.0, dec: -22.0, description: 'The Great Dog - home of Sirius, brightest star' },
          { name: 'Perseus', abbrev: 'Per', ra: 50.0, dec: 42.0, description: 'The Hero - home of the Perseid meteor shower radiant' },
          { name: 'Centaurus', abbrev: 'Cen', ra: 200.0, dec: -50.0, description: 'The Centaur - contains Alpha Centauri, nearest star system' },
          { name: 'Crux', abbrev: 'Cru', ra: 185.0, dec: -60.0, description: 'The Southern Cross - smallest constellation, iconic in Southern Hemisphere' },
          { name: 'Draco', abbrev: 'Dra', ra: 260.0, dec: 65.0, description: 'The Dragon - winds around the north celestial pole' }
        ]
      },
      'planets': {
        name: 'Solar System Tour',
        type: 'planets',
        steps: this.planets ? this.planets.map(planet => ({
          name: planet.name,
          ra: planet.ra,
          dec: planet.dec,
          description: this.getPlanetDescription(planet.name),
          angularSize: planet.angularSize
        })) : []
      },
      'best-messier': {
        name: 'Best Messier Objects',
        steps: [
          { name: 'M42', ra: 83.82, dec: -5.39, description: 'Orion Nebula - the brightest nebula visible to the naked eye' },
          { name: 'M31', ra: 10.68, dec: 41.27, description: 'Andromeda Galaxy - nearest major galaxy, 2.5 million light-years away' },
          { name: 'M45', ra: 56.87, dec: 24.12, description: 'Pleiades - the Seven Sisters, a stunning open cluster' },
          { name: 'M13', ra: 250.42, dec: 36.46, description: 'Hercules Cluster - finest globular cluster in northern skies' },
          { name: 'M51', ra: 202.47, dec: 47.20, description: 'Whirlpool Galaxy - beautiful face-on spiral with companion' },
          { name: 'M8', ra: 270.92, dec: -24.38, description: 'Lagoon Nebula - bright emission nebula in Sagittarius' },
          { name: 'M57', ra: 283.40, dec: 33.03, description: 'Ring Nebula - classic planetary nebula in Lyra' },
          { name: 'M1', ra: 83.63, dec: 22.01, description: 'Crab Nebula - supernova remnant from 1054 AD' },
          { name: 'M104', ra: 189.99, dec: -11.62, description: 'Sombrero Galaxy - distinctive edge-on spiral with dust lane' },
          { name: 'M27', ra: 299.90, dec: 22.72, description: 'Dumbbell Nebula - large, bright planetary nebula' },
          { name: 'M16', ra: 274.70, dec: -13.81, description: 'Eagle Nebula - home of the famous Pillars of Creation' },
          { name: 'M101', ra: 210.80, dec: 54.35, description: 'Pinwheel Galaxy - grand design face-on spiral' }
        ]
      },
      'best-ngc': {
        name: 'Best NGC Objects',
        steps: [
          { name: 'NGC7000', ra: 314.75, dec: 44.53, description: 'North America Nebula - distinctive continent-shaped emission nebula' },
          { name: 'NGC6992', ra: 312.75, dec: 31.72, description: 'Veil Nebula (Eastern) - stunning supernova remnant' },
          { name: 'NGC2237', ra: 97.97, dec: 5.05, description: 'Rosette Nebula - beautiful flower-shaped emission nebula' },
          { name: 'NGC7293', ra: 337.41, dec: -20.84, description: 'Helix Nebula - largest planetary nebula, the "Eye of God"' },
          { name: 'NGC6543', ra: 269.64, dec: 66.63, description: 'Cat\'s Eye Nebula - complex planetary nebula with intricate structure' },
          { name: 'NGC2070', ra: 84.68, dec: -69.10, description: 'Tarantula Nebula - largest emission nebula known, in the LMC' },
          { name: 'NGC3372', ra: 161.27, dec: -59.87, description: 'Carina Nebula - massive star-forming region with Eta Carinae' },
          { name: 'NGC6888', ra: 303.06, dec: 38.35, description: 'Crescent Nebula - emission nebula shaped by stellar winds' },
          { name: 'NGC1499', ra: 60.21, dec: 36.39, description: 'California Nebula - long emission nebula near Xi Persei' },
          { name: 'NGC6826', ra: 295.37, dec: 50.53, description: 'Blinking Planetary - appears to "blink" when viewed' },
          { name: 'NGC2392', ra: 112.29, dec: 20.91, description: 'Eskimo Nebula - planetary nebula resembling a face in a parka' },
          { name: 'NGC891', ra: 35.64, dec: 42.35, description: 'Edge-on Galaxy - perfect example of an edge-on spiral galaxy' }
        ]
      },
      'best-nebulae': {
        name: 'Nebulae Tour',
        steps: [
          // Emission Nebulae (stellar nurseries)
          { name: 'M42', ra: 83.82, dec: -5.39, mag: 4.0, description: 'Orion Nebula - the crown jewel, brightest diffuse nebula in the sky' },
          { name: 'M8', ra: 270.92, dec: -24.38, mag: 6.0, description: 'Lagoon Nebula - stunning emission nebula with newborn stars' },
          { name: 'M20', ra: 270.59, dec: -23.03, mag: 6.3, description: 'Trifid Nebula - emission, reflection, and dark nebula in one' },
          { name: 'M17', ra: 275.20, dec: -16.18, mag: 6.0, description: 'Swan/Omega Nebula - bright nebula resembling a swan' },
          { name: 'M16', ra: 274.70, dec: -13.81, mag: 6.4, description: 'Eagle Nebula - home of the iconic Pillars of Creation' },
          { name: 'NGC7000', ra: 314.75, dec: 44.53, mag: 4.0, description: 'North America Nebula - continent-shaped in Cygnus' },
          { name: 'NGC2237', ra: 97.97, dec: 5.05, mag: 6.0, description: 'Rosette Nebula - flower-shaped around open cluster' },
          { name: 'NGC3372', ra: 161.27, dec: -59.87, mag: 1.0, description: 'Carina Nebula - one of the largest and brightest nebulae' },
          { name: 'NGC2070', ra: 84.68, dec: -69.10, mag: 5.0, description: 'Tarantula Nebula - largest known emission nebula in LMC' },
          { name: 'NGC2024', ra: 85.42, dec: -1.85, mag: 7.5, description: 'Flame Nebula - dramatic nebula by Alnitak in Orion\'s Belt' },
          { name: 'NGC1499', ra: 60.21, dec: 36.39, mag: 5.0, description: 'California Nebula - elongated near Xi Persei' },
          { name: 'IC1396', ra: 324.75, dec: 57.50, mag: 3.5, description: 'Elephant Trunk Nebula region - massive star-forming complex' },
          { name: 'NGC6888', ra: 303.06, dec: 38.35, mag: 7.4, description: 'Crescent Nebula - wind-blown bubble from Wolf-Rayet star' },
          // Planetary Nebulae (dying stars)
          { name: 'M57', ra: 283.40, dec: 33.03, mag: 8.8, description: 'Ring Nebula - perfect smoke-ring, the classic planetary nebula' },
          { name: 'M27', ra: 299.90, dec: 22.72, mag: 7.5, description: 'Dumbbell Nebula - large and bright apple-core shape' },
          { name: 'NGC7293', ra: 337.41, dec: -20.84, mag: 7.6, description: 'Helix Nebula - "Eye of God", nearest bright planetary' },
          { name: 'NGC6543', ra: 269.64, dec: 66.63, mag: 8.1, description: 'Cat\'s Eye Nebula - intricate shells revealed by Hubble' },
          { name: 'M76', ra: 25.58, dec: 51.58, mag: 10.1, description: 'Little Dumbbell - miniature version of M27' },
          { name: 'NGC6826', ra: 295.37, dec: 50.53, mag: 8.8, description: 'Blinking Planetary - appears to blink when observed' },
          { name: 'NGC2392', ra: 112.29, dec: 20.91, mag: 9.2, description: 'Eskimo Nebula - face in a parka appearance' },
          { name: 'M97', ra: 168.70, dec: 55.02, mag: 9.9, description: 'Owl Nebula - two dark "eyes" in circular glow' },
          { name: 'NGC6302', ra: 258.05, dec: -37.10, mag: 7.1, description: 'Butterfly Nebula - bipolar shape from hot central star' },
          { name: 'NGC3132', ra: 151.76, dec: -40.44, mag: 9.2, description: 'Eight-Burst/Southern Ring Nebula - twin shells' },
          // Supernova Remnants
          { name: 'M1', ra: 83.63, dec: 22.01, mag: 8.4, description: 'Crab Nebula - expanding debris from 1054 AD supernova' },
          { name: 'NGC6992', ra: 312.75, dec: 31.72, mag: 7.0, description: 'Eastern Veil Nebula - delicate filaments from ancient explosion' },
          { name: 'NGC6960', ra: 312.25, dec: 30.72, mag: 7.0, description: 'Western Veil (Witch\'s Broom) - other half of the Veil' },
          // Reflection Nebulae
          { name: 'M78', ra: 86.69, dec: 0.08, mag: 8.3, description: 'Brightest reflection nebula - blue light near Orion' },
          { name: 'NGC7023', ra: 315.39, dec: 68.17, mag: 6.8, description: 'Iris Nebula - beautiful blue reflection nebula in Cepheus' },
          { name: 'IC2118', ra: 79.00, dec: -7.20, mag: 8.0, description: 'Witch Head Nebula - eerie reflection near Rigel' }
        ].sort((a, b) => a.mag - b.mag)
      },
      'best-galaxies': {
        name: 'Galaxies Tour',
        steps: [
          // Local Group Members
          { name: 'M31', ra: 10.68, dec: 41.27, mag: 3.4, description: 'Andromeda Galaxy - nearest major galaxy at 2.5 million light-years' },
          { name: 'M33', ra: 23.46, dec: 30.66, mag: 5.7, description: 'Triangulum Galaxy - third largest Local Group member, face-on spiral' },
          { name: 'M32', ra: 10.67, dec: 40.87, mag: 8.1, description: 'Compact elliptical satellite of Andromeda' },
          { name: 'M110', ra: 10.09, dec: 41.68, mag: 8.5, description: 'Elliptical dwarf satellite of Andromeda' },
          // Spiral Galaxies - Face-on
          { name: 'M51', ra: 202.47, dec: 47.20, mag: 8.4, description: 'Whirlpool Galaxy - stunning spiral arms interacting with NGC5195' },
          { name: 'M101', ra: 210.80, dec: 54.35, mag: 7.9, description: 'Pinwheel Galaxy - enormous face-on spiral, twice Milky Way size' },
          { name: 'M74', ra: 24.17, dec: 15.78, mag: 9.4, description: 'Phantom Galaxy - perfect grand design spiral, hard to see' },
          { name: 'M83', ra: 204.25, dec: -29.87, mag: 7.5, description: 'Southern Pinwheel - barred spiral with intense star formation' },
          { name: 'M100', ra: 185.73, dec: 15.82, mag: 9.3, description: 'Grand design spiral in Virgo Cluster' },
          { name: 'M99', ra: 184.71, dec: 14.42, mag: 9.9, description: 'Coma Pinwheel - asymmetric spiral from interaction' },
          { name: 'M61', ra: 185.48, dec: 4.47, mag: 9.7, description: 'Starburst spiral with recent supernovae' },
          { name: 'M63', ra: 198.96, dec: 42.03, mag: 8.6, description: 'Sunflower Galaxy - flocculent spiral with patchy arms' },
          { name: 'NGC628', ra: 24.17, dec: 15.78, mag: 9.5, description: 'Perfect face-on spiral, James Webb target' },
          // Spiral Galaxies - Edge-on
          { name: 'M104', ra: 189.99, dec: -11.62, mag: 8.0, description: 'Sombrero Galaxy - iconic dust lane and bright bulge' },
          { name: 'NGC891', ra: 35.64, dec: 42.35, mag: 9.9, description: 'Silver Sliver - perfect edge-on, Milky Way analog' },
          { name: 'NGC4565', ra: 189.09, dec: 25.99, mag: 9.6, description: 'Needle Galaxy - extremely thin edge-on spiral' },
          { name: 'NGC4631', ra: 190.53, dec: 32.54, mag: 9.2, description: 'Whale Galaxy - distorted spiral with companion' },
          { name: 'NGC253', ra: 11.89, dec: -25.29, mag: 7.2, description: 'Sculptor Galaxy - bright starburst, nearly edge-on' },
          { name: 'M98', ra: 183.45, dec: 14.90, mag: 10.1, description: 'Edge-on spiral in Virgo with dark dust lanes' },
          // Barred Spirals
          { name: 'M81', ra: 148.89, dec: 69.07, mag: 6.9, description: 'Bode\'s Galaxy - grand design spiral interacting with M82' },
          { name: 'NGC1300', ra: 49.92, dec: -19.41, mag: 10.4, description: 'Quintessential barred spiral with perfect bar structure' },
          { name: 'M109', ra: 179.40, dec: 53.37, mag: 9.8, description: 'Barred spiral with three satellite galaxies' },
          { name: 'M95', ra: 160.99, dec: 11.70, mag: 9.7, description: 'Barred spiral in Leo with ring structure' },
          // Interacting/Starburst
          { name: 'M82', ra: 148.97, dec: 69.68, mag: 8.4, description: 'Cigar Galaxy - starburst with dramatic outflows from M81 interaction' },
          { name: 'NGC4038', ra: 180.47, dec: -18.87, mag: 10.3, description: 'Antennae Galaxies - spectacular merger in progress' },
          { name: 'M64', ra: 194.18, dec: 21.68, mag: 8.5, description: 'Black Eye Galaxy - dust band from ancient merger' },
          { name: 'NGC5195', ra: 202.50, dec: 47.27, mag: 9.6, description: 'Whirlpool companion - dwarf being absorbed by M51' },
          // Elliptical/Lenticular
          { name: 'M87', ra: 187.71, dec: 12.39, mag: 8.6, description: 'Virgo A - giant elliptical with famous black hole and jet' },
          { name: 'M49', ra: 187.44, dec: 8.00, mag: 8.4, description: 'Brightest galaxy in Virgo Cluster' },
          { name: 'M60', ra: 190.92, dec: 11.55, mag: 8.8, description: 'Giant elliptical with ultra-compact dwarf companion' },
          { name: 'M84', ra: 186.27, dec: 12.89, mag: 9.1, description: 'Lenticular galaxy in Virgo Cluster core' },
          { name: 'M86', ra: 186.55, dec: 12.95, mag: 8.9, description: 'Falling into Virgo Cluster at 1,500 km/s' },
          { name: 'NGC5128', ra: 201.37, dec: -43.02, mag: 6.8, description: 'Centaurus A - peculiar elliptical with dramatic dust lane and radio jets' },
          // Galaxy Groups
          { name: 'M65', ra: 169.73, dec: 13.09, mag: 9.3, description: 'Leo Triplet member - edge-on spiral' },
          { name: 'M66', ra: 170.06, dec: 12.99, mag: 8.9, description: 'Leo Triplet member - disrupted spiral arms' },
          { name: 'NGC3628', ra: 170.07, dec: 13.59, mag: 9.5, description: 'Hamburger Galaxy - third Leo Triplet member' }
        ].sort((a, b) => a.mag - b.mag)
      },
      'tonight-best': {
        name: 'Best Objects Tonight',
        steps: this.getBestVisibleObjectsTonight()
      },
      'best-clusters': {
        name: 'Star Clusters Tour',
        steps: [
          // Open Clusters (younger, disk of galaxy)
          { name: 'M45', ra: 56.87, dec: 24.12, mag: 1.6, description: 'Pleiades - the Seven Sisters, most famous cluster in the sky' },
          { name: 'Hyades', ra: 66.75, dec: 15.87, mag: 0.5, description: 'Hyades - V-shaped face of Taurus, nearest open cluster' },
          { name: 'M7', ra: 268.47, dec: -34.82, mag: 3.3, description: 'Ptolemy Cluster - ancient Greeks saw it naked-eye' },
          { name: 'M44', ra: 130.05, dec: 19.67, mag: 3.7, description: 'Beehive Cluster/Praesepe - swarm of 1,000 stars in Cancer' },
          { name: 'NGC869', ra: 34.75, dec: 57.13, mag: 4.3, description: 'h Persei - half of stunning Double Cluster' },
          { name: 'NGC884', ra: 35.60, dec: 57.15, mag: 4.4, description: 'χ Persei - companion to h Persei, 7,500 light-years' },
          { name: 'M35', ra: 92.27, dec: 24.33, mag: 5.3, description: 'Rich cluster in Gemini with 2,500 stars' },
          { name: 'M6', ra: 265.07, dec: -32.22, mag: 4.2, description: 'Butterfly Cluster - star pattern like a butterfly' },
          { name: 'M47', ra: 114.15, dec: -14.50, mag: 4.2, description: 'Bright scattered cluster in Puppis' },
          { name: 'M41', ra: 101.50, dec: -20.73, mag: 4.5, description: 'Open cluster 4° south of Sirius' },
          { name: 'M36', ra: 84.07, dec: 34.13, mag: 6.3, description: 'Pinwheel Cluster in Auriga' },
          { name: 'M37', ra: 88.07, dec: 32.55, mag: 6.2, description: 'Richest Auriga cluster with 500+ stars' },
          { name: 'M38', ra: 82.18, dec: 35.85, mag: 7.4, description: 'Starfish Cluster - cross-shaped pattern' },
          { name: 'M11', ra: 282.77, dec: -6.27, mag: 6.3, description: 'Wild Duck Cluster - V-formation like flying ducks' },
          { name: 'M46', ra: 115.44, dec: -14.82, mag: 6.1, description: 'Rich cluster with planetary nebula NGC2438 superimposed' },
          { name: 'M67', ra: 132.85, dec: 11.82, mag: 6.1, description: 'Ancient open cluster, 4 billion years old like our Sun' },
          { name: 'NGC2244', ra: 97.97, dec: 4.95, mag: 4.8, description: 'Heart of the Rosette Nebula' },
          { name: 'M34', ra: 40.52, dec: 42.78, mag: 5.5, description: 'Loose cluster in Perseus, 1,500 light-years distant' },
          { name: 'M52', ra: 351.20, dec: 61.60, mag: 7.3, description: 'Rich cluster in Cassiopeia near NGC7635' },
          { name: 'NGC457', ra: 19.90, dec: 58.28, mag: 6.4, description: 'Owl/ET Cluster - looks like an owl or alien' },
          // Globular Clusters (ancient, halo of galaxy)
          { name: 'M13', ra: 250.42, dec: 36.46, mag: 5.8, description: 'Great Hercules Cluster - northern sky\'s finest globular' },
          { name: 'NGC104', ra: 6.02, dec: -72.08, mag: 4.1, description: '47 Tucanae - rival to M13, southern hemisphere gem' },
          { name: 'M22', ra: 279.10, dec: -23.90, mag: 5.1, description: 'One of nearest globulars at 10,000 light-years' },
          { name: 'M5', ra: 229.64, dec: 2.08, mag: 5.7, description: 'One of oldest globulars, 13 billion years' },
          { name: 'M4', ra: 245.90, dec: -26.53, mag: 5.6, description: 'Nearest globular at 7,200 light-years, easy to resolve' },
          { name: 'M3', ra: 205.55, dec: 28.38, mag: 6.2, description: '500,000 stars in a perfect sphere' },
          { name: 'M15', ra: 322.49, dec: 12.17, mag: 6.2, description: 'Dense core may harbor black hole, contains planetary nebula' },
          { name: 'M92', ra: 259.28, dec: 43.14, mag: 6.4, description: 'Often overlooked neighbor of M13, 14 billion years old' },
          { name: 'M2', ra: 323.36, dec: -0.82, mag: 6.5, description: 'Rich globular in Aquarius, 37,000 light-years distant' },
          { name: 'M10', ra: 254.29, dec: -4.10, mag: 6.6, description: 'Loose globular in Ophiuchus' },
          { name: 'M12', ra: 251.81, dec: -1.95, mag: 6.7, description: 'Gumball Globular - lost many faint stars to galaxy' },
          { name: 'M80', ra: 244.26, dec: -22.98, mag: 7.3, description: 'Dense globular, site of nova in 1860' },
          { name: 'M55', ra: 294.99, dec: -30.96, mag: 6.3, description: 'Large, loose globular, Summer Rose Star' },
          { name: 'NGC5139', ra: 201.70, dec: -47.48, mag: 3.7, description: 'Omega Centauri - largest Milky Way globular, may be dwarf galaxy core' },
          { name: 'NGC6752', ra: 287.72, dec: -59.98, mag: 5.4, description: 'Third brightest globular, excellent for southern observers' }
        ].sort((a, b) => a.mag - b.mag)
      }
    };
  }

  getPlanetDescription(planetName) {
    const descriptions = {
      'Sun': 'Our star - a G-type main-sequence star at the center of the Solar System',
      'Moon': 'Earth\'s only natural satellite - the fifth largest moon in the Solar System',
      'Mercury': 'The smallest planet and closest to the Sun - heavily cratered surface',
      'Venus': 'Second planet from the Sun - hottest planet due to thick atmosphere',
      'Mars': 'The Red Planet - most explored planet, potential for future colonization',
      'Jupiter': 'Largest planet - gas giant with the famous Great Red Spot storm',
      'Saturn': 'Second largest planet - known for its spectacular ring system',
      'Uranus': 'Ice giant - tilted on its side, rotates at 98 degree angle',
      'Neptune': 'Most distant planet - ice giant with the strongest winds in the Solar System'
    };
    return descriptions[planetName] || 'Solar System object';
  }

  /**
   * Calculate if an object at given RA/Dec is above the horizon
   * @param {number} ra - Right Ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {number} lat - Observer latitude in degrees
   * @param {number} lst - Local Sidereal Time in degrees
   * @returns {number} Altitude in degrees (positive = above horizon)
   */
  calculateAltitude(ra, dec, lat, lst) {
    const latRad = lat * Math.PI / 180;
    const decRad = dec * Math.PI / 180;
    const haRad = (lst - ra) * Math.PI / 180; // Hour angle

    // Calculate altitude using standard formula
    const sinAlt = Math.sin(latRad) * Math.sin(decRad) +
             Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
    return Math.asin(sinAlt) * 180 / Math.PI;
  }

  /**
   * Get the best visible deep sky objects for tonight, sorted by magnitude
   * Actually checks visibility based on observer location and current time
   */
  getBestVisibleObjectsTonight() {
    const objects = [];
    const lat = this.observerLocation?.lat || 45;
    const lon = this.observerLocation?.lon || 0;
    const lst = this.calculateLST(this.simulationTime || new Date(), lon);

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
      requiredFov = Math.max(1, Math.min(60, requiredFov));
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

      const nextBtn = document.createElement('button');
      nextBtn.textContent = 'Next';
      nextBtn.addEventListener('click', () => this.nextTourStep());
      tourPanel.appendChild(nextBtn);

      const endBtn = document.createElement('button');
      endBtn.textContent = 'End Tour';
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
    // Reset constellation highlighting before moving to next step
    this.unhighlightConstellation();
    this.tourStep++;
    this.showTourStep();
  }

  endTour() {
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
  showTourHighlight(ra, dec, angularSizeArcmin = 10) {
    // Remove existing highlight if any
    this.hideTourHighlight();

    // Create a ring texture for the highlight
    const canvas = document.createElement('canvas');
    const size = 128;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Draw a glowing ring
    ctx.clearRect(0, 0, size, size);
    const centerX = size / 2;
    const centerY = size / 2;
    const outerRadius = size / 2 - 4;
    const innerRadius = outerRadius - 12;

    // Outer glow
    const gradient = ctx.createRadialGradient(centerX, centerY, innerRadius - 10, centerX, centerY, outerRadius + 10);
    gradient.addColorStop(0, 'rgba(255, 215, 0, 0)');
    gradient.addColorStop(0.4, 'rgba(255, 215, 0, 0.8)');
    gradient.addColorStop(0.6, 'rgba(255, 215, 0, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');

    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
    ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2, true);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Create sprite
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });

    this.tourHighlight = new THREE.Sprite(material);
    const radius = 98; // Slightly in front of stars
    const pos = this.raDecToCartesian(ra, dec, radius);
    this.tourHighlight.position.copy(pos);

    // Calculate the real world size based on angular size
    const angularSizeRad = THREE.MathUtils.degToRad(angularSizeArcmin / 60);
    const realWorldSize = radius * angularSizeRad * 2;

    this.tourHighlight.renderOrder = 100; // Render on top
    this.tourHighlight.userData = {
      ra,
      dec,
      startTime: Date.now(),
      angularSizeArcmin,
      realWorldSize,
      maxWorldSize: 15  // Maximum size when zoomed out
    };

    this.celestialSphere.add(this.tourHighlight);
  }

  /**
   * Hide the tour highlight
   */
  hideTourHighlight() {
    if (this.tourHighlight) {
      this.celestialSphere.remove(this.tourHighlight);
      if (this.tourHighlight.material.map) {
        this.tourHighlight.material.map.dispose();
      }
      this.tourHighlight.material.dispose();
      this.tourHighlight = null;
    }
  }

  /**
   * Update tour highlight animation (call from animate loop)
   * Scales the highlight based on FOV - starts large, shrinks to real object size when zoomed in
   */
  updateTourHighlight() {
    if (!this.tourHighlight) return;

    const userData = this.tourHighlight.userData;
    const elapsed = (Date.now() - userData.startTime) / 1000;

    // Pulsing opacity animation
    const pulse = 0.7 + 0.3 * Math.sin(elapsed * 3);
    this.tourHighlight.material.opacity = pulse;

    // Calculate size based on FOV
    // When zoomed out (large FOV), show large highlight
    // When zoomed in (small FOV), shrink to real object size
    const fov = this.camera.fov;
    const canvasHeight = this.renderer.domElement.height;
    const pixelsPerDeg = canvasHeight / fov;

    // Calculate how many pixels the real object would be
    const angularSizeDeg = userData.angularSizeArcmin / 60;
    const realSizePixels = angularSizeDeg * pixelsPerDeg;

    // Target: when object is small on screen, use large highlight
    // When object is large on screen, use real size
    // Transition: highlight shrinks as you zoom in
    const minHighlightPixels = 80;  // Minimum highlight size in pixels
    const targetPixels = Math.max(realSizePixels * 1.5, minHighlightPixels);

    // Convert target pixels back to world size
    const radius = 98;
    const worldSize = (targetPixels / canvasHeight) * 2 * radius * Math.tan(THREE.MathUtils.degToRad(fov / 2));

    // Clamp to reasonable range and add slight pulse
    const clampedSize = Math.min(Math.max(worldSize, userData.realWorldSize * 1.2), userData.maxWorldSize);
    const pulsedSize = clampedSize * (1 + 0.1 * Math.sin(elapsed * 2));

    this.tourHighlight.scale.set(pulsedSize, pulsedSize, 1);
  }

  // Feature 14: Astronomical Events Calendar

  // Cache for fetched events
  astronomyEventsCache = null;
  astronomyEventsCacheTime = null;
  EVENTS_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Parse iCal format data into event objects
   * @param {string} icalData - Raw iCal text data
   * @returns {Array} Array of event objects
   */
  parseICalEvents(icalData) {
    const events = [];
    const lines = icalData.split(/\r?\n/);

    let currentEvent = null;
    let currentField = '';
    let currentValue = '';

    for (const line of lines) {
      // Handle line continuation (lines starting with space or tab)
      if (line.startsWith(' ') || line.startsWith('\t')) {
        currentValue += line.substring(1);
        continue;
      }

      // Process previous field if we have one
      if (currentEvent && currentField) {
        this.processICalField(currentEvent, currentField, currentValue);
      }

      // Check for event boundaries
      if (line === 'BEGIN:VEVENT') {
        currentEvent = {};
      } else if (line === 'END:VEVENT' && currentEvent) {
        if (currentEvent.name && currentEvent.date) {
          events.push(currentEvent);
        }
        currentEvent = null;
      } else if (currentEvent && line.includes(':')) {
        const colonIndex = line.indexOf(':');
        currentField = line.substring(0, colonIndex).split(';')[0]; // Remove parameters
        currentValue = line.substring(colonIndex + 1);
      }
    }

    return events;
  }

  /**
   * Process a single iCal field
   */
  processICalField(event, field, value) {
    switch (field) {
      case 'SUMMARY':
        event.name = value;
        // Determine event type from name
        const nameLower = value.toLowerCase();
        if (nameLower.includes('meteor') || nameLower.includes('shower')) {
          event.type = 'meteor';
        } else if (nameLower.includes('eclipse')) {
          event.type = 'eclipse';
        } else if (nameLower.includes('solstice')) {
          event.type = 'solstice';
        } else if (nameLower.includes('equinox')) {
          event.type = 'equinox';
        } else if (nameLower.includes('opposition') || nameLower.includes('conjunction') ||
               nameLower.includes('venus') || nameLower.includes('mars') ||
               nameLower.includes('jupiter') || nameLower.includes('saturn') ||
               nameLower.includes('mercury') || nameLower.includes('uranus') ||
               nameLower.includes('neptune')) {
          event.type = 'planet';
        } else if (nameLower.includes('moon') || nameLower.includes('lunar')) {
          event.type = 'moon';
        } else {
          event.type = 'other';
        }
        break;
      case 'DTSTART':
      case 'DTSTART;VALUE=DATE':
        // Parse date format: YYYYMMDD or YYYYMMDDTHHMMSSZ
        const dateStr = value.replace(/[TZ]/g, '');
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        event.date = new Date(year, month, day);
        break;
      case 'DESCRIPTION':
        event.description = value
          .replace(/\\n/g, ' ')
          .replace(/\\,/g, ',')
          .replace(/\s+/g, ' ')
          .trim();
        break;
    }
  }

  /**
   * Fetch astronomy events from online iCal calendar
   * @returns {Promise<Array>} Array of event objects
   */
  async fetchAstronomyEvents() {
    // Check cache first
    if (this.astronomyEventsCache &&
      this.astronomyEventsCacheTime &&
      (Date.now() - this.astronomyEventsCacheTime) < this.EVENTS_CACHE_DURATION) {
      return this.astronomyEventsCache;
    }

    const ICAL_URL = 'https://raw.githubusercontent.com/toupeira/AstroCalendar/master/AstroCalendar.ics';

    try {
      const response = await fetch(ICAL_URL);
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const icalData = await response.text();
      const events = this.parseICalEvents(icalData);

      // Cache the results
      this.astronomyEventsCache = events;
      this.astronomyEventsCacheTime = Date.now();

      console.log(`✓ Fetched ${events.length} astronomy events from online calendar`);
      return events;
    } catch (error) {
      console.warn('Failed to fetch astronomy events:', error);
      return null; // Return null to trigger fallback
    }
  }

  /**
   * Get fallback events (used when online fetch fails)
   */
  getFallbackEvents() {
    const now = new Date();
    const year = now.getFullYear();
    const nextYear = year + 1;

    return [
      // Meteor Showers (annual recurring)
      { name: 'Quadrantids Meteor Shower', date: new Date(year, 0, 3), type: 'meteor', description: 'Up to 120 meteors/hour. Best viewed from Northern Hemisphere.' },
      { name: 'Lyrids Meteor Shower', date: new Date(year, 3, 22), type: 'meteor', description: 'Up to 20 meteors/hour. Active April 16-25.' },
      { name: 'Eta Aquarids Meteor Shower', date: new Date(year, 4, 6), type: 'meteor', description: 'Up to 60 meteors/hour. Debris from Halley\'s Comet.' },
      { name: 'Delta Aquarids Meteor Shower', date: new Date(year, 6, 30), type: 'meteor', description: 'Up to 20 meteors/hour. Best from Southern Hemisphere.' },
      { name: 'Perseids Meteor Shower', date: new Date(year, 7, 12), type: 'meteor', description: 'Up to 100 meteors/hour. One of the best annual showers.' },
      { name: 'Orionids Meteor Shower', date: new Date(year, 9, 21), type: 'meteor', description: 'Up to 20 meteors/hour. Debris from Halley\'s Comet.' },
      { name: 'Leonids Meteor Shower', date: new Date(year, 10, 17), type: 'meteor', description: 'Up to 15 meteors/hour. Produces meteor storms every 33 years.' },
      { name: 'Geminids Meteor Shower', date: new Date(year, 11, 14), type: 'meteor', description: 'Up to 150 meteors/hour. Best meteor shower of the year.' },
      { name: 'Ursids Meteor Shower', date: new Date(year, 11, 22), type: 'meteor', description: 'Up to 10 meteors/hour. Often overlooked due to holidays.' },
      // Solstices and Equinoxes
      { name: 'Vernal Equinox', date: new Date(year, 2, 20), type: 'equinox', description: 'Spring begins in Northern Hemisphere.' },
      { name: 'Summer Solstice', date: new Date(year, 5, 21), type: 'solstice', description: 'Longest day of the year in Northern Hemisphere.' },
      { name: 'Autumnal Equinox', date: new Date(year, 8, 22), type: 'equinox', description: 'Fall begins in Northern Hemisphere.' },
      { name: 'Winter Solstice', date: new Date(year, 11, 21), type: 'solstice', description: 'Shortest day of the year in Northern Hemisphere.' },
      // Next year
      { name: 'Quadrantids Meteor Shower', date: new Date(nextYear, 0, 3), type: 'meteor', description: 'Up to 120 meteors/hour.' },
    ];
  }

  /**
   * Get upcoming events - fetches from online or uses fallback
   * This is now async but kept for compatibility
   */
  getUpcomingEvents() {
    const now = new Date();

    // If we have cached events, use them
    if (this.astronomyEventsCache) {
      return this.astronomyEventsCache
        .filter(event => event.date > now)
        .sort((a, b) => a.date - b.date)
        .slice(0, 20);
    }

    // Return fallback events
    return this.getFallbackEvents()
      .filter(event => event.date > now)
      .sort((a, b) => a.date - b.date)
      .slice(0, 20);
  }

  async showEventsCalendar() {
    const panel = document.getElementById('events-panel');
    if (!panel) return;

    const content = panel.querySelector('.panel-content');

    // Open panel first with loading state
    if (window.openPanel) {
      window.openPanel('events-panel');
    } else {
      panel.classList.add('visible');
    }

    // Show loading state
    if (content) {
      content.innerHTML = '<div class="events-loading">Loading astronomy events...</div>';
    }

    // Try to fetch online events (will use cache if available)
    await this.fetchAstronomyEvents();

    // Get events (will use cache or fallback)
    const events = this.getUpcomingEvents();

    const typeIcons = {
      'meteor': '☄️',
      'eclipse': '🌑',
      'planet': '🪐',
      'solstice': '☀️',
      'equinox': '🌗',
      'moon': '🌙',
      'other': '⭐'
    };

    let html = '<div class="events-list">';
    events.forEach(event => {
      const daysUntil = Math.ceil((event.date - new Date()) / (1000 * 60 * 60 * 24));
      const icon = typeIcons[event.type] || '⭐';
      const dateStr = event.date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      let daysText;
      if (daysUntil <= 0) {
        daysText = 'today';
      } else if (daysUntil === 1) {
        daysText = 'tomorrow';
      } else {
        daysText = `in ${daysUntil} days`;
      }

      const description = event.description || 'Astronomical event';

      html += `<div class="event-item">`;
      html += `<span class="event-icon">${icon}</span>`;
      html += `<div class="event-details">`;
      html += `<div class="event-name">${event.name}</div>`;
      html += `<div class="event-date">${dateStr} (${daysText})</div>`;
      html += `<div class="event-desc">${description}</div>`;
      html += `</div></div>`;
    });
    html += '</div>';

    if (events.length === 0) {
      html = '<p>No upcoming events found.</p>';
    }

    // Add source attribution
    if (this.astronomyEventsCache) {
      html += '<div class="events-source">Data from AstroCalendar (GitHub)</div>';
    }

    if (content) content.innerHTML = html;
  }

  /* ======================================================================
     CAMERA & INTERACTION
     Mouse, touch, and keyboard event handling
     ====================================================================== */

  /**
   * Set up all event listeners for user interaction
   */
  setupEventListeners() {
    // Mouse/touch controls
    const canvas = this.renderer.domElement;

    canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    canvas.addEventListener('wheel', this.onMouseWheel.bind(this));
    canvas.addEventListener('click', this.onMouseClick.bind(this));

    // Touch controls
    canvas.addEventListener('touchstart', this.onTouchStart.bind(this));
    canvas.addEventListener('touchmove', this.onTouchMove.bind(this));
    canvas.addEventListener('touchend', this.onTouchEnd.bind(this));

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
        if (category) {
          this.gameCategory = category;
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
  }

  onMouseDown(event) {
    this.isDragging = true;
    this.dragMoved = false;  // Track if mouse actually moved
    this.mouseDownPosition = {
      x: event.clientX,
      y: event.clientY
    };
    this.previousMousePosition = {
      x: event.clientX,
      y: event.clientY
    };
    this.requestRender();  // Wake up animation
  }

  onMouseMove(event) {
    if (!this.isDragging) return;

    const deltaX = event.clientX - this.previousMousePosition.x;
    const deltaY = event.clientY - this.previousMousePosition.y;

    // Mark as dragged if moved more than 5 pixels from start
    if (this.mouseDownPosition) {
      const totalDeltaX = event.clientX - this.mouseDownPosition.x;
      const totalDeltaY = event.clientY - this.mouseDownPosition.y;
      if (Math.abs(totalDeltaX) > 5 || Math.abs(totalDeltaY) > 5) {
        this.dragMoved = true;
        // Disable compass mode when user manually drags
        if (this.compassMode) {
          this.disableCompassMode();
        }
      }
    }

    // Scale rotation sensitivity based on FOV so stars follow finger
    // At FOV 60°, we want roughly 1:1 screen-to-sky tracking
    const fovRad = this.camera.fov * Math.PI / 180;
    const screenHeight = this.renderer.domElement.clientHeight;

    // Calculate how many radians per pixel at current FOV
    // This makes the sphere surface track 1:1 with finger movement
    const radiansPerPixel = fovRad / screenHeight;

    // Negate theta so dragging right moves stars right (inside sphere looking out)
    this.cameraRotation.theta -= deltaX * radiansPerPixel;
    this.cameraRotation.phi += deltaY * radiansPerPixel;

    // Clamp phi to prevent flipping
    this.cameraRotation.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.cameraRotation.phi));

    // Sync target rotation with current (so smooth zoom doesn't fight dragging)
    this.targetTheta = this.cameraRotation.theta;
    this.targetPhi = this.cameraRotation.phi;

    this.previousMousePosition = {
      x: event.clientX,
      y: event.clientY
    };

    this.updateCameraPosition();
    this.requestRender();
  }

  onMouseUp(event) {
    this.isDragging = false;
    // Note: dragMoved is checked in click handler, then reset for next interaction
  }

  onMouseWheel(event) {
    event.preventDefault();

    // Sync targets with current state if not already animating
    if (Math.abs(this.targetFov - this.camera.fov) < 0.1) {
      this.targetFov = this.camera.fov;
      this.targetTheta = this.cameraRotation.theta;
      this.targetPhi = this.cameraRotation.phi;
    }

    // Get mouse position in normalized device coordinates (-1 to +1)
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Calculate zoom using multiplicative scaling for consistent feel at all zoom levels
    const delta = event.deltaY > 0 ? 1 : -1;
    const oldFov = this.targetFov;

    // Use multiplicative zoom: multiply/divide FOV by a factor
    // This ensures zooming out is just as easy as zooming in
    const zoomFactor = 1.15; // 15% per scroll step
    if (delta > 0) {
      // Zoom out (increase FOV)
      this.targetFov = Math.min(120, this.targetFov * zoomFactor);
    } else {
      // Zoom in (decrease FOV)
      this.targetFov = Math.max(0.0001, this.targetFov / zoomFactor);  // Min ~0.36 arcsec
    }

    // Zoom toward cursor: adjust rotation based on cursor offset from center
    const fovRatio = oldFov / this.targetFov;

    if (Math.abs(fovRatio - 1) > 0.001) {
      const oldFovRad = oldFov * Math.PI / 180;
      const newFovRad = this.targetFov * Math.PI / 180;

      // Angular offset of cursor from screen center
      const aspect = this.camera.aspect;
      const oldAngleX = mouseX * Math.tan(oldFovRad / 2) * aspect;
      const oldAngleY = mouseY * Math.tan(oldFovRad / 2);
      const newAngleX = mouseX * Math.tan(newFovRad / 2) * aspect;
      const newAngleY = mouseY * Math.tan(newFovRad / 2);

      // Rotate to keep point under cursor (add instead of subtract)
      const rotateTheta = oldAngleX - newAngleX;
      const rotatePhi = oldAngleY - newAngleY;

      this.targetTheta += rotateTheta;
      this.targetPhi += rotatePhi;

      this.targetPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.targetPhi));
    }

    this.requestRender();
  }

  onMouseClick(event) {
    // Ignore if we were dragging (mouse moved significantly)
    if (this.dragMoved) {
      this.dragMoved = false;  // Reset for next click
      return;
    }
    this.dragMoved = false;  // Reset for next click

    // Raycasting to detect clicked star
    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );

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

      const clickRaDec = this.cartesianToRaDec(clickDirCelestial.x, clickDirCelestial.y, clickDirCelestial.z);

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
        const magBasedSize = Math.min(maxSize, Math.max(baseSize, baseSize * Math.pow(1.15, magnitudeDiff)));
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
        if (this.gameActive) {
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
            type: this.getDSOTypeName(dso.type),
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
      const clickRaDec = this.cartesianToRaDec(clickDirCelestial.x, clickDirCelestial.y, clickDirCelestial.z);

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
          type: this.getDSOTypeName(closestDSO.type),
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
      if (this.gameActive) {
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
          if (this.gameActive) {
            // During game mode, check if this constellation is the answer
            this.checkGameAnswerByName(constName);
          } else {
            this.showConstellationInfo(constAbbrev);
          }
          return;
        }
      } else if (!this.gameActive) {
        // Clicked on empty space - unhighlight any selected constellation
        this.unhighlightConstellation();
      }
    } else if (!this.gameActive) {
      // Constellation lines not shown - still unhighlight on empty click
      this.unhighlightConstellation();
    }
  }

  getDSOTypeName(type) {
    const types = {
      'G': 'Galaxy',
      'GCl': 'Globular Cluster',
      'OCl': 'Open Cluster',
      'Neb': 'Nebula',
      'PN': 'Planetary Nebula',
      'EmN': 'Emission Nebula',
      'HII': 'HII Region',
      'Cl+N': 'Cluster with Nebulosity',
      'RfN': 'Reflection Nebula',
      'SNR': 'Supernova Remnant'
    };
    return types[type] || 'Deep Sky Object';
  }

  onTouchStart(event) {
    event.preventDefault();
    this.requestRender();  // Wake up animation

    if (event.touches.length === 1) {
      this.isDragging = true;
      this.touchMoved = false;  // Track if touch actually moved (for tap detection)
      this.touchDownPosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
      this.previousMousePosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
      this.lastTouchTime = performance.now();
      this.lastTouchDelta = { x: 0, y: 0 };
    } else if (event.touches.length === 2) {
      // Pinch-to-zoom: store initial distance between fingers
      this.isDragging = false;
      this.touchMoved = true;  // Pinch counts as movement
      const dx = event.touches[1].clientX - event.touches[0].clientX;
      const dy = event.touches[1].clientY - event.touches[0].clientY;
      this.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
      this.initialPinchFov = this.targetFov;
    }
  }

  onTouchMove(event) {
    event.preventDefault();

    if (event.touches.length === 2 && this.initialPinchDistance) {
      // Pinch-to-zoom: calculate new distance and adjust FOV
      const dx = event.touches[1].clientX - event.touches[0].clientX;
      const dy = event.touches[1].clientY - event.touches[0].clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);

      // Pinch ratio: > 1 means fingers spread apart (zoom in), < 1 means pinch together (zoom out)
      const pinchRatio = currentDistance / this.initialPinchDistance;

      // Inverse relationship: spreading fingers decreases FOV (zooms in)
      this.targetFov = Math.max(0.0001, Math.min(120, this.initialPinchFov / pinchRatio));
    } else if (event.touches.length === 1 && this.isDragging) {
      const deltaX = event.touches[0].clientX - this.previousMousePosition.x;
      const deltaY = event.touches[0].clientY - this.previousMousePosition.y;

      // Mark as moved if touch moved more than 10 pixels from start (tap threshold)
      if (this.touchDownPosition) {
        const totalDeltaX = event.touches[0].clientX - this.touchDownPosition.x;
        const totalDeltaY = event.touches[0].clientY - this.touchDownPosition.y;
        if (Math.abs(totalDeltaX) > 10 || Math.abs(totalDeltaY) > 10) {
          this.touchMoved = true;
          // Disable compass mode when user manually drags
          if (this.compassMode) {
            this.disableCompassMode();
          }
        }
      }

      // Track velocity for inertia (pixels per ms)
      if (true) {
        const now = performance.now();
        const dt = now - (this.lastTouchTime || now);
        if (dt > 0) {
          // Exponential moving average for smooth velocity
          const alpha = 0.3;
          this.lastTouchDelta = {
            x: alpha * (deltaX / dt) + (1 - alpha) * (this.lastTouchDelta?.x || 0),
            y: alpha * (deltaY / dt) + (1 - alpha) * (this.lastTouchDelta?.y || 0),
          };
        }
        this.lastTouchTime = now;

        // Scale rotation sensitivity based on FOV so stars follow finger
        const fovRad = this.camera.fov * Math.PI / 180;
        const screenHeight = this.renderer.domElement.clientHeight;
        const radiansPerPixel = fovRad / screenHeight;

        // Negate theta so dragging right moves stars right (inside sphere looking out)
        this.cameraRotation.theta -= deltaX * radiansPerPixel;
        this.cameraRotation.phi += deltaY * radiansPerPixel;

        this.cameraRotation.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.cameraRotation.phi));

        // Sync target rotation with current (so smooth zoom doesn't fight dragging)
        this.targetTheta = this.cameraRotation.theta;
        this.targetPhi = this.cameraRotation.phi;

        this.updateCameraPosition();
      }

      this.previousMousePosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
    }

    this.requestRender();
  }

  onTouchEnd(event) {
    const wasDragging = this.isDragging;
    this.isDragging = false;
    this.initialPinchDistance = null;
    this.initialPinchFov = null;

    // Handle tap (touch without significant movement)
    if (!this.touchMoved && this.touchDownPosition && wasDragging) {
      this.handleTap(this.touchDownPosition.x, this.touchDownPosition.y);
      this.touchDownPosition = null;
      this.lastTouchDelta = null;
      return;
    }

    // Apply inertia if we were dragging with velocity (skip in compass mode)
    if (this.touchMoved && this.lastTouchDelta && wasDragging && !this.compassMode) {
      const vx = this.lastTouchDelta.x || 0;
      const vy = this.lastTouchDelta.y || 0;
      const speed = Math.sqrt(vx * vx + vy * vy);

      // Only apply inertia if velocity is significant (> 0.3 px/ms)
      if (speed > 0.3) {
        const fovRad = this.camera.fov * Math.PI / 180;
        const screenHeight = this.renderer.domElement.clientHeight;
        const radiansPerPixel = fovRad / screenHeight;

        // Project velocity into radians, apply for ~500ms worth of motion
        const inertiaMs = 500;
        const deltaTheta = -vx * radiansPerPixel * inertiaMs;
        const deltaPhi = vy * radiansPerPixel * inertiaMs;

        // Set target position with inertia offset (smooth zoom will animate to it)
        this.targetTheta = this.cameraRotation.theta + deltaTheta;
        this.targetPhi = this.cameraRotation.phi + deltaPhi;
        this.targetPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.targetPhi));

        this.requestRender();
      }
    }

    this.touchDownPosition = null;
    this.lastTouchDelta = null;
  }

  /**
   * Handle a tap at the given screen coordinates (for touch devices).
   * @param {number} clientX - X coordinate in screen pixels
   * @param {number} clientY - Y coordinate in screen pixels
   */
  handleTap(clientX, clientY) {
    // Raycasting to detect tapped object (same logic as onMouseClick)
    const mouse = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    // Larger threshold for easier tapping, scaled by FOV
    raycaster.params.Points.threshold = 8 * (this.camera.fov / 60);
    raycaster.setFromCamera(mouse, this.camera);

    // First check for planet/sun taps using angular distance
    if (this.planetSprites && this.planetSprites.length > 0) {
      const clickDir = new THREE.Vector3();
      raycaster.ray.direction.normalize();
      clickDir.copy(raycaster.ray.direction);

      const clickDirCelestial = clickDir.clone();
      if (this.celestialSphere) {
        const inverseMatrix = new THREE.Matrix4()
          .copy(this.celestialSphere.matrixWorld).invert();
        const rotationMatrix = new THREE.Matrix3().setFromMatrix4(inverseMatrix);
        clickDirCelestial.applyMatrix3(rotationMatrix);
      }

      const clickRaDec = this.cartesianToRaDec(
        clickDirCelestial.x, clickDirCelestial.y, clickDirCelestial.z
      );

      let closestPlanet = null;
      let closestDistance = Infinity;

      for (const sprite of this.planetSprites) {
        const planetData = sprite.userData;
        if (!planetData || !planetData.ra) continue;

        const dRa = (planetData.ra - clickRaDec.ra) *
          Math.cos(THREE.MathUtils.degToRad(planetData.dec));
        const dDec = planetData.dec - clickRaDec.dec;
        const angularDist = Math.sqrt(dRa * dRa + dDec * dDec);

        const angularSizeDeg = (planetData.angularSize || 0.1) / 60;
        const fov = this.camera.fov;
        const canvasHeight = this.renderer.domElement.height;
        const pixelsPerDeg = canvasHeight / fov;

        const realSizePixels = angularSizeDeg * pixelsPerDeg;
        const mag = planetData.mag || 0;
        const baseMag = 8;
        const baseSize = 0.8;
        const maxSize = 6;
        const magnitudeDiff = baseMag - mag;
        const magBasedSize = Math.min(
          maxSize, Math.max(baseSize, baseSize * Math.pow(1.15, magnitudeDiff))
        );
        const magBasedPixels = magBasedSize * 1.5;
        const displaySizePixels = Math.max(realSizePixels, magBasedPixels);

        const visibleSizeDeg = displaySizePixels / pixelsPerDeg;
        const clickThreshold = visibleSizeDeg * 2.5;  // Larger margin for touch

        if (angularDist < clickThreshold && angularDist < closestDistance) {
          closestDistance = angularDist;
          closestPlanet = planetData;
        }
      }

      if (closestPlanet) {
        const clickedObject = {
          name: closestPlanet.name,
          type: closestPlanet.type || 'Planet',
          subtype: closestPlanet.name === 'Sun' ? 'Star (G2V)' :
            (closestPlanet.name === 'Moon' ? 'Natural Satellite' : 'Planet'),
          ra: closestPlanet.ra,
          dec: closestPlanet.dec,
          mag: closestPlanet.mag,
          angularSize: closestPlanet.angularSize,
          phase: closestPlanet.phase,
        };
        this.unhighlightConstellation();
        if (this.gameActive) {
          this.checkGameAnswer({ ra: closestPlanet.ra, dec: closestPlanet.dec });
        } else {
          this.selectObject(clickedObject);
        }
        return;
      }
    }

    // Check stars and DSOs (combined in starField, same as mouse handler)
    const intersects = raycaster.intersectObjects([
      this.starField,
      this.dynamicStarField,
      this.dynamicDSOField,
    ].filter(Boolean));

    if (intersects.length > 0) {
      const intersect = intersects[0];
      const index = intersect.index;
      let clickedObject = null;

      if (intersect.object === this.starField) {
        // Main star field contains both stars and DSOs
        const stars = this.starField.userData.stars;
        const dsos = this.starField.userData.dsos;

        if (index < stars.length) {
          const star = stars[index];
          clickedObject = {
            name: star.proper || star.bf || (star.hip ? `HIP ${star.hip}` : 'Unknown Star'),
            type: 'Star',
            subtype: star.spect ? `Spectral type ${star.spect}` : null,
            ra: star.ra,
            dec: star.dec,
            mag: star.mag,
            distance: star.dist ? `${star.dist.toFixed(1)} ly` : null,
            angularSize: null,
          };
        } else {
          const dsoIndex = index - stars.length;
          if (dsoIndex < dsos.length) {
            const dso = dsos[dsoIndex];
            clickedObject = {
              name: dso.messier ? `M${Math.floor(dso.messier)}` :
                (dso.ngc ? `NGC ${dso.ngc}` : dso.name || 'Unknown Object'),
              type: this.getDSOTypeName(dso.type),
              subtype: dso.type,
              ra: dso.ra,
              dec: dso.dec,
              mag: dso.mag,
              size_major: dso.size_major,
              size_minor: dso.size_minor,
            };
          }
        }
      } else if (intersect.object === this.dynamicStarField) {
        // Dynamic star field
        const visibleIndex = index;
        const originalIndex = this.visibleDynamicStarIndices
          ? this.visibleDynamicStarIndices[visibleIndex]
          : visibleIndex;

        if (originalIndex !== undefined && originalIndex < this.dynamicStars.length) {
          const star = this.dynamicStars[originalIndex];
          clickedObject = {
            name: star.name || `Star at RA ${star.ra.toFixed(4)}°`,
            type: 'Star',
            subtype: 'Catalog star (VizieR)',
            ra: star.ra,
            dec: star.dec,
            mag: star.mag,
          };
        }
      } else if (intersect.object === this.dynamicDSOField) {
        // Dynamic DSO field
        const visibleIndex = index;
        const originalIndex = this.visibleDynamicDSOIndices
          ? this.visibleDynamicDSOIndices[visibleIndex]
          : visibleIndex;

        if (originalIndex !== undefined && originalIndex < this.dynamicDSOs.length) {
          const dso = this.dynamicDSOs[originalIndex];
          clickedObject = {
            name: dso.name || 'Unknown Object',
            type: this.getDSOTypeName(dso.type),
            subtype: dso.type,
            ra: dso.ra,
            dec: dso.dec,
            mag: dso.mag,
            size_major: dso.size_major,
            size_minor: dso.size_minor,
          };
        }
      }

      if (clickedObject) {
        this.unhighlightConstellation();
        if (this.gameActive) {
          this.checkGameAnswer(clickedObject);
        } else {
          this.selectObject(clickedObject);
        }
        return;
      }
    }

    // Check constellation labels
    if (this.constellationLabels) {
      const labelIntersects = raycaster.intersectObjects(
        this.constellationLabels.children
      );
      if (labelIntersects.length > 0) {
        const label = labelIntersects[0].object;
        if (label.userData && label.userData.abbrev) {
          this.highlightConstellation(label.userData.abbrev);
          return;
        }
      }
    }

    // Check for constellation line taps (with larger threshold for touch)
    if (this.constellationLinesGroup && this.showConstellationLines) {
      // Use larger threshold for touch - 3x the mouse threshold
      const touchMultiplier = this.isMobile ? 3 : 1.5;
      raycaster.params.Line = { threshold: touchMultiplier * (this.camera.fov / 60) };

      const lineIntersects = raycaster.intersectObjects(
        this.constellationLinesGroup.children,
        false,
      );

      if (lineIntersects.length > 0) {
        const clickedLine = lineIntersects[0].object;
        const constAbbrev = clickedLine.userData.constellation;
        if (constAbbrev) {
          const constName = this.getConstellationName(constAbbrev);
          console.log('Tapped constellation line:', constName);
          if (this.gameActive) {
            // During game mode, check if this constellation is the answer
            this.checkGameAnswerByName(constName);
          } else {
            this.showConstellationInfo(constAbbrev);
          }
          return;
        }
      }
    }

    // No object tapped - deselect
    this.selectedObject = null;
    this.hideInfoPanel();
    this.unhighlightConstellation();
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

      // Update sky tilt and rotation based on new location
      this.updateLatitudeTilt();
      this.updateCelestialRotation();
      // Recalculate planet positions with new observer location
      this.createPlanets();

      alert(`Observer location set to: ${lat}°, ${lon}°\nSky now shows correct position for your location and time.`);
    }
  }

  /* ======================================================================
     COMPASS MODE (Device Orientation)
     Uses device magnetometer and gyroscope to orient the sky map
     ====================================================================== */

  /**
   * Toggle compass mode on/off.
   * When enabled, device orientation controls camera direction.
   */
  async toggleCompassMode() {
    if (this.compassMode) {
      this.disableCompassMode();
    } else {
      await this.enableCompassMode();
    }
  }

  /**
   * Enable compass mode with device orientation.
   * Requests permission on iOS 13+ and starts listening for orientation events.
   */
  async enableCompassMode() {
    // Check if DeviceOrientationEvent is available
    if (!window.DeviceOrientationEvent) {
      alert('Device orientation is not supported on this device.');
      return;
    }

    // Request permission on iOS 13+ (requires user gesture)
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          alert('Compass mode requires device orientation permission.');
          return;
        }
      } catch (err) {
        console.error('Error requesting device orientation permission:', err);
        alert('Could not enable compass mode. Please try again.');
        return;
      }
    }

    // Create bound handler for cleanup
    this._deviceOrientationHandler = this.handleDeviceOrientation.bind(this);

    // Listen for device orientation events
    // Prefer deviceorientationabsolute for true compass heading
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener(
        'deviceorientationabsolute',
        this._deviceOrientationHandler,
        true
      );
    } else {
      // Fallback to regular deviceorientation (may be relative, not absolute)
      window.addEventListener(
        'deviceorientation',
        this._deviceOrientationHandler,
        true
      );
    }

    this.compassMode = true;
    this._lastOrientationTime = performance.now();

    // Update button visual state
    const btn = document.getElementById('compass-toggle');
    if (btn) btn.classList.add('active');

    // Start timeout to detect if orientation events stop firing
    this._startOrientationTimeout();

    console.log('Compass mode enabled');
    this.requestRender();
  }

  /**
   * Start a timeout to detect stale orientation data.
   * If no orientation events received for 3 seconds, disable compass mode.
   */
  _startOrientationTimeout() {
    this._clearOrientationTimeout();
    this._orientationTimeout = setInterval(() => {
      if (!this.compassMode) {
        this._clearOrientationTimeout();
        return;
      }
      const elapsed = performance.now() - this._lastOrientationTime;
      if (elapsed > 3000) {
        console.warn('No orientation data received for 3s, disabling compass');
        this.disableCompassMode();
      }
    }, 1000);
  }

  /**
   * Clear the orientation timeout.
   */
  _clearOrientationTimeout() {
    if (this._orientationTimeout) {
      clearInterval(this._orientationTimeout);
      this._orientationTimeout = null;
    }
  }

  /**
   * Disable compass mode and return to manual control.
   */
  disableCompassMode() {
    // Clear the stale data timeout
    this._clearOrientationTimeout();

    if (this._deviceOrientationHandler) {
      window.removeEventListener(
        'deviceorientationabsolute',
        this._deviceOrientationHandler,
        true
      );
      window.removeEventListener(
        'deviceorientation',
        this._deviceOrientationHandler,
        true
      );
      this._deviceOrientationHandler = null;
    }

    this.compassMode = false;

    // Update button visual state - be aggressive about removing active state
    const btn = document.getElementById('compass-toggle');
    if (btn) {
      btn.classList.remove('active');
      btn.blur(); // Remove focus state on mobile
      // Force style recalculation
      btn.offsetHeight;
    }

    console.log('Compass mode disabled');
  }

  /**
   * Handle device orientation events for AR sky viewing.
   * Uses W3C DeviceOrientation spec formulas for AR mode.
   * Device held vertically, looking through the back camera at the sky.
   * @param {DeviceOrientationEvent} event - The orientation event
   */
  handleDeviceOrientation(event) {
    if (!this.compassMode) return;

    // Update timestamp for stale data detection
    this._lastOrientationTime = performance.now();

    let alpha = event.alpha; // Compass direction (0-360)
    const beta = event.beta;   // Front/back tilt (-180 to 180)
    const gamma = event.gamma; // Left/right tilt (-90 to 90)

    if (alpha === null || beta === null || gamma === null) return;

    // Adjust for screen orientation
    const screenOrientation = window.orientation || 0;
    alpha = alpha - screenOrientation;
    if (alpha < 0) alpha += 360;

    // Convert to radians
    const a = THREE.MathUtils.degToRad(alpha);
    const b = THREE.MathUtils.degToRad(beta);
    const g = THREE.MathUtils.degToRad(gamma);

    // W3C spec: AR compass heading formula for device held vertically
    // https://w3c.github.io/deviceorientation/spec-source-orientation.html
    // θ = atan2((-cos(α)sin(γ) - sin(α)sin(β)cos(γ)),
    //           (-sin(α)sin(γ) + cos(α)sin(β)cos(γ)))
    const cA = Math.cos(a);
    const sA = Math.sin(a);
    const cB = Math.cos(b);
    const sB = Math.sin(b);
    const cG = Math.cos(g);
    const sG = Math.sin(g);

    // Compute the direction vector v' pointing out of back of device
    // v = [0, 0, -1] in device frame, rotated by ZXY euler angles
    const vx = -cA * sG - sA * sB * cG;
    const vy = -cB * cG;
    const vz = sA * sG - cA * sB * cG;

    // Compass heading (azimuth) from horizontal components
    // Note: In Earth frame, X=East, Y=Up, Z=North
    // Negate theta for correct left/right, add PI/2 for correct compass alignment
    const targetTheta = -Math.atan2(vx, vz) + Math.PI / 2;

    // Altitude angle from vertical component
    // vy is the vertical component: vy=1 means pointing up, vy=-1 means down
    // phi in our system: 0 = zenith (up), PI = nadir (down), PI/2 = horizon
    const targetPhi = Math.acos(Math.max(-1, Math.min(1, -vy)));

    // Clamp phi to prevent flipping at poles
    const clampedPhi = Math.max(0.1, Math.min(Math.PI - 0.1, targetPhi));

    // Handle theta wraparound for smooth interpolation
    let thetaDiff = targetTheta - this.compassHeading;
    if (thetaDiff > Math.PI) thetaDiff -= 2 * Math.PI;
    if (thetaDiff < -Math.PI) thetaDiff += 2 * Math.PI;

    const phiDiff = clampedPhi - this.compassTilt;

    // Dead zone: ignore tiny movements to reduce jitter
    const deadZone = 0.009;
    if (Math.abs(thetaDiff) < deadZone && Math.abs(phiDiff) < deadZone) {
      return;
    }

    // Smooth the compass values to reduce jitter
    const smoothFactor = 0.1;

    this.compassHeading += thetaDiff * smoothFactor;
    this.compassTilt += phiDiff * smoothFactor;

    // Apply compass values to camera rotation
    this.cameraRotation.theta = this.compassHeading;
    this.cameraRotation.phi = this.compassTilt;

    // Sync targets to prevent smooth zoom from fighting
    this.targetTheta = this.cameraRotation.theta;
    this.targetPhi = this.cameraRotation.phi;

    this.updateCameraPosition();
    this.requestRender();
  }

  /* ======================================================================
     GAME MODE
     Interactive object identification game
     ====================================================================== */

  /**
   * Game categories with predefined object sets
   */
  getGameCategories() {
    return {
      'known-constellations': {
        name: 'Known Constellations',
        type: 'constellation',
        objects: [
          'Orion', 'Ursa Major', 'Cassiopeia', 'Leo', 'Scorpius',
          'Cygnus', 'Taurus', 'Gemini', 'Virgo', 'Sagittarius',
          'Canis Major', 'Pegasus'
        ]
      },
      'north-constellations': {
        name: 'North Constellations',
        type: 'constellation',
        filter: (c) => c.dec > -30,  // Visible from northern latitudes
        objects: null  // Will be filled from constellation data
      },
      'south-constellations': {
        name: 'South Constellations',
        type: 'constellation',
        filter: (c) => c.dec < 30,  // Visible from southern latitudes
        objects: null
      },
      'all-constellations': {
        name: 'All Constellations',
        type: 'constellation',
        objects: null  // All 88 constellations
      },
      'famous-objects': {
        name: 'Famous Objects',
        type: 'dso',
        objects: [
          'M31', 'M42', 'M45', 'M1', 'M13', 'M51', 'M57', 'M27',
          'M101', 'M104', 'M81', 'M82', 'M8', 'M20', 'M17',
          'M16', 'M33', 'NGC7000', 'NGC7293', 'NGC869'
        ]
      },
      'star-clusters': {
        name: 'Star Clusters',
        type: 'dso',
        objects: [
          'M45', 'M13', 'M44', 'M7', 'M6', 'M11', 'M35', 'M37',
          'M36', 'M38', 'M41', 'M47', 'M67', 'NGC869', 'NGC884'
        ]
      },
      'nebulae': {
        name: 'Nebulae',
        type: 'dso',
        objects: [
          'M42', 'M1', 'M57', 'M27', 'M8', 'M20', 'M17', 'M16',
          'M78', 'M97', 'NGC7000', 'NGC7293', 'NGC2237', 'IC434', 'NGC6992'
        ]
      },
      'galaxies': {
        name: 'Galaxies',
        type: 'dso',
        objects: [
          'M31', 'M51', 'M101', 'M104', 'M81', 'M82', 'M33',
          'M64', 'M87', 'M74', 'M83', 'M63', 'M106', 'NGC253', 'NGC4565'
        ]
      },
      'bright-stars': {
        name: 'Bright Stars',
        type: 'star',
        objects: [
          'Sirius', 'Canopus', 'Arcturus', 'Vega', 'Capella',
          'Rigel', 'Procyon', 'Betelgeuse', 'Altair', 'Aldebaran',
          'Antares', 'Spica', 'Pollux', 'Fomalhaut', 'Deneb',
          'Regulus', 'Castor', 'Polaris', 'Bellatrix', 'Alnilam',
          'Alnitak', 'Mintaka', 'Mizar', 'Dubhe', 'Merak'
        ]
      },
      'messier-objects': {
        name: 'Messier Objects',
        type: 'dso',
        filter: (obj) => obj.name && obj.name.startsWith('M') && /^M\d+$/.test(obj.name),
        objects: null  // All Messier objects from data
      }
    };
  }

  /**
   * Build question pool for the selected game category
   */
  buildGameQuestionPool() {
    const categories = this.getGameCategories();
    const category = categories[this.gameCategory];
    if (!category) return [];

    let questionPool = [];

    if (category.type === 'constellation') {
      // Get constellations from search index
      const constellations = this.searchIndex ?
        this.searchIndex.filter(obj => obj.type === 'Constellation') : [];

      if (category.objects) {
        // Specific constellation list
        category.objects.forEach(name => {
          const found = constellations.find(c =>
            c.name.toLowerCase() === name.toLowerCase() ||
            c.name.toLowerCase().includes(name.toLowerCase())
          );
          if (found) {
            questionPool.push({ name: found.name, data: found });
          }
        });
      } else if (category.filter) {
        // Filter-based selection
        constellations.forEach(c => {
          if (category.filter(c)) {
            questionPool.push({ name: c.name, data: c });
          }
        });
      } else {
        // All constellations
        constellations.forEach(c => {
          questionPool.push({ name: c.name, data: c });
        });
      }
    } else if (category.type === 'dso') {
      // Deep sky objects
      if (category.objects) {
        category.objects.forEach(name => {
          // Check in DSO data
          const dso = this.deepSkyObjects?.find(d =>
            d.name === name || d.name === name.replace(' ', '')
          );
          if (dso) {
            questionPool.push({
              name: dso.name,
              data: { ...dso, type: dso.type || 'DSO' }
            });
          }
          // Also check named objects
          if (this.namedObjects && this.namedObjects[name]) {
            const obj = this.namedObjects[name];
            questionPool.push({
              name: name,
              data: { ...obj, type: obj.type || 'DSO' }
            });
          }
        });
      } else if (category.filter) {
        // Filter Messier objects
        this.deepSkyObjects?.forEach(dso => {
          if (category.filter(dso)) {
            questionPool.push({
              name: dso.name,
              data: { ...dso, type: dso.type || 'DSO' }
            });
          }
        });
      }
    } else if (category.type === 'star') {
      // Named stars
      if (category.objects && this.namedObjects) {
        category.objects.forEach(name => {
          if (this.namedObjects[name]) {
            const star = this.namedObjects[name];
            questionPool.push({
              name: name,
              data: { ...star, type: 'Star' }
            });
          }
        });
      }
    }

    return questionPool;
  }

  /**
   * Start the object identification game
   */
  startGame() {
    // gameCategory is set by the game selection modal before calling this method
    // Default to known-constellations if not set
    if (!this.gameCategory) {
      this.gameCategory = 'known-constellations';
    }

    // Build question pool for this category
    this.gameQuestionPool = this.buildGameQuestionPool();

    if (this.gameQuestionPool.length === 0) {
      alert('No objects found for this category!');
      return;
    }

    this.gameActive = true;
    this.gameScore = 0;
    this.gameCorrect = 0;
    this.gameStartTime = Date.now();
    this.passedQuestions = [];
    this.askedQuestions = [];  // Track which questions have been asked

    document.getElementById('game-panel').classList.add('active');
    document.getElementById('game-score').textContent = '0';
    document.getElementById('game-correct').textContent = '0';

    this.nextQuestion();
    this.updateGameTime();
  }

  stopGame() {
    this.gameActive = false;
    document.getElementById('game-panel').classList.remove('active');

    const duration = Math.floor((Date.now() - this.gameStartTime) / 1000);
    const total = this.gameQuestionPool ? this.gameQuestionPool.length : 0;
    alert(`Game Over!\n\nScore: ${this.gameScore}\nCorrect: ${this.gameCorrect}/${total}\nTime: ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`);
  }

  nextQuestion() {
    if (!this.gameActive) return;

    // Get remaining questions (not yet asked)
    const remaining = this.gameQuestionPool.filter(q =>
      !this.askedQuestions.includes(q.name)
    );

    if (remaining.length === 0) {
      // All questions answered - game complete!
      this.gameActive = false;
      document.getElementById('game-panel').classList.remove('active');
      const duration = Math.floor((Date.now() - this.gameStartTime) / 1000);
      alert(`🎉 Category Complete!\n\nScore: ${this.gameScore}\nCorrect: ${this.gameCorrect}/${this.gameQuestionPool.length}\nTime: ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`);
      return;
    }

    // Pick random question from remaining
    const randomQuestion = remaining[Math.floor(Math.random() * remaining.length)];
    this.currentQuestion = randomQuestion;
    this.askedQuestions.push(randomQuestion.name);

    // Update display
    const questionEl = document.getElementById('game-question');
    questionEl.textContent = randomQuestion.name;
    questionEl.style.color = '#60A5FA';

    // Show progress
    const progress = `${this.askedQuestions.length}/${this.gameQuestionPool.length}`;
    document.getElementById('game-score').textContent = `${this.gameScore} (${progress})`;
  }

  checkGameAnswer(clickedStar) {
    if (!this.currentQuestion) return;

    // Check if clicked star matches the question
    const targetData = this.currentQuestion.data;

    // Calculate angular distance between clicked and target
    const angularDistance = this.calculateAngularDistance(
      clickedStar.ra, clickedStar.dec,
      targetData.ra, targetData.dec
    );

    // Use larger tolerance for constellations (they cover bigger areas)
    const tolerance = targetData.type === 'Constellation' ? 15 : 5;

    // Accept if within tolerance
    if (angularDistance < tolerance) {
      this.markGameAnswerCorrect_();
    }
  }

  /**
   * Check game answer by name (for constellation line clicks).
   * @param {string} clickedName - The name of the clicked constellation
   */
  checkGameAnswerByName(clickedName) {
    if (!this.currentQuestion) return;

    const targetName = this.currentQuestion.name;

    // Check if names match (case-insensitive)
    if (clickedName.toLowerCase() === targetName.toLowerCase()) {
      this.markGameAnswerCorrect_();
    }
  }

  /**
   * Mark the current game answer as correct.
   * @private
   */
  markGameAnswerCorrect_() {
    this.gameScore += 100;
    this.gameCorrect += 1;
    document.getElementById('game-score').textContent = this.gameScore;
    document.getElementById('game-correct').textContent = this.gameCorrect;

    // Visual feedback
    document.getElementById('game-question').style.color = '#10B981';

    // For constellation games, briefly highlight the found constellation
    const questionData = this.currentQuestion?.data;
    const questionName = this.currentQuestion?.name;
    let wasLinesHidden = false;

    if (questionData?.type === 'Constellation' && this.constellations) {
      // Temporarily show constellation lines if they're hidden
      if (this.constellationLinesGroup && !this.constellationLinesGroup.visible) {
        this.constellationLinesGroup.visible = true;
        wasLinesHidden = true;
      }
      this.highlightConstellation(questionName);
    }

    setTimeout(() => {
      document.getElementById('game-question').style.color = '#60A5FA';
      // Remove constellation highlight
      if (questionData?.type === 'Constellation') {
        this.unhighlightConstellation();
        if (wasLinesHidden && this.constellationLinesGroup) {
          this.constellationLinesGroup.visible = false;
        }
      }
      this.nextQuestion();
    }, 500);
  }

  passQuestion() {
    if (!this.currentQuestion) return;

    // Add to passed questions to ask again later
    this.passedQuestions.push(this.currentQuestion);

    // Show the solution - navigate to the object and display info
    const questionData = this.currentQuestion.data;
    const questionName = this.currentQuestion.name;

    // Visual feedback - show the answer in yellow
    const questionEl = document.getElementById('game-question');
    questionEl.style.color = '#F59E0B'; // Yellow/orange for "passed"
    questionEl.textContent = `${questionName} (Answer shown)`;

    // Navigate to the object
    this.animateCameraTo(questionData.ra, questionData.dec);

    // Show yellow highlight ring around the answer
    const angularSize = questionData.size_major || questionData.angularSize || 30;
    this.showTourHighlight(questionData.ra, questionData.dec, angularSize);

    // Check if this is a constellation and highlight its lines
    // Temporarily show constellation lines if they're hidden
    let wasLinesHidden = false;
    if (questionData.type === 'Constellation' && this.constellations) {
      if (this.constellationLinesGroup && !this.constellationLinesGroup.visible) {
        this.constellationLinesGroup.visible = true;
        wasLinesHidden = true;
      }
      this.highlightConstellation(questionName);
    }

    // Wait 3 seconds to let user see the answer, then continue
    setTimeout(() => {
      questionEl.style.color = '#60A5FA'; // Reset to blue
      // Remove highlight ring
      this.hideTourHighlight();
      // Remove highlight if constellation
      if (questionData.type === 'Constellation') {
        this.unhighlightConstellation();
        // Restore constellation lines visibility if we temporarily showed them
        if (wasLinesHidden && this.constellationLinesGroup) {
          this.constellationLinesGroup.visible = false;
        }
      }
      this.nextQuestion();
    }, 3000);
  }

  highlightConstellation(constellationName) {
    // Find and highlight the constellation lines
    if (!this.constellationLinesGroup) {
      console.warn('highlightConstellation: constellationLinesGroup does not exist!');
      return;
    }

    console.log(`highlightConstellation called with: "${constellationName}"`);
    console.log(`constellationLinesGroup has ${this.constellationLinesGroup.children.length} children`);

    // Remove any existing glow lines
    if (this.glowLines) {
      this.glowLines.forEach(line => this.constellationLinesGroup.remove(line));
      this.glowLines = [];
    }
    this.glowLines = [];

    // Only store original opacities if not already stored (prevents double-highlight issue)
    const alreadyHighlighting = this.originalLineOpacities && this.originalLineOpacities.length > 0;

    if (!alreadyHighlighting) {
      // Store original opacities and colors
      this.originalLineOpacities = [];
      this.originalLineColors = [];

      // First, dim all constellation lines significantly
      this.constellationLinesGroup.children.forEach(line => {
        if (!line.userData?.isGlow) {
          this.originalLineOpacities.push(line.material.opacity);
          this.originalLineColors.push(line.material.color.getHex());
          line.material.opacity = 0.05; // Very dim
          line.material.color.setHex(0x222244); // Darker color
        }
      });
    } else {
      // Already highlighting - just dim all non-glow lines again
      this.constellationLinesGroup.children.forEach(line => {
        if (!line.userData?.isGlow) {
          line.material.opacity = 0.05;
          line.material.color.setHex(0x222244);
        }
      });
    }

    // Then, find the lines for this constellation and make them very prominent
    // Normalize name: lowercase and remove spaces for matching (e.g., "Ursa Major" -> "ursamajor")
    const normalizedName = constellationName.toLowerCase().replace(/\s+/g, '');

    // Debug: log unique constellation names in the lines
    const uniqueNames = new Set();
    this.constellationLinesGroup.children.forEach(line => {
      if (line.userData?.constellation) uniqueNames.add(line.userData.constellation);
    });
    console.log(`Available constellations in lines:`, Array.from(uniqueNames).slice(0, 10), '...');
    console.log(`Looking for: "${constellationName}" -> normalized: "${normalizedName}"`);

    let matchCount = 0;
    this.constellationLinesGroup.children.forEach(line => {
      const lineConstName = line.userData?.constellation?.toLowerCase().replace(/\s+/g, '') || '';
      if (line.userData && line.userData.constellation &&
        lineConstName === normalizedName &&
        !line.userData.isGlow) {
        matchCount++;
        // Main line - bright cyan
        line.material.opacity = 1.0;
        line.material.color.setHex(0x00FFFF); // Bright cyan
        line.renderOrder = 100;

        // Create glow effect - outer glow line
        const glowMaterial = new THREE.LineBasicMaterial({
          color: 0x00FFFF,
          transparent: true,
          opacity: 0.4,
          depthWrite: false
        });
        const glowLine = new THREE.Line(line.geometry.clone(), glowMaterial);
        glowLine.position.copy(line.position);
        glowLine.scale.set(1.02, 1.02, 1.02); // Slightly larger
        glowLine.renderOrder = 99;
        glowLine.userData = { isGlow: true };
        this.constellationLinesGroup.add(glowLine);
        this.glowLines.push(glowLine);

        // Create second glow layer - even larger and more diffuse
        const glowMaterial2 = new THREE.LineBasicMaterial({
          color: 0x0088FF,
          transparent: true,
          opacity: 0.2,
          depthWrite: false
        });
        const glowLine2 = new THREE.Line(line.geometry.clone(), glowMaterial2);
        glowLine2.position.copy(line.position);
        glowLine2.scale.set(1.05, 1.05, 1.05);
        glowLine2.renderOrder = 98;
        glowLine2.userData = { isGlow: true };
        this.constellationLinesGroup.add(glowLine2);
        this.glowLines.push(glowLine2);
      }
    });
    console.log(`Highlighted ${matchCount} lines for constellation "${constellationName}"`);
  }

  unhighlightConstellation() {
    // Remove glow lines first
    if (this.glowLines) {
      this.glowLines.forEach(line => {
        if (line.parent) line.parent.remove(line);
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
      });
      this.glowLines = [];
    }

    // Restore original opacities and colors
    if (!this.constellationLinesGroup || !this.originalLineOpacities) return;

    let i = 0;
    this.constellationLinesGroup.children.forEach(line => {
      // Skip glow lines (shouldn't exist anymore but just in case)
      if (line.userData?.isGlow) return;

      if (i < this.originalLineOpacities.length) {
        line.material.opacity = this.originalLineOpacities[i];
        line.material.color.setHex(this.originalLineColors?.[i] || 0x3366AA); // Reset to original color
        line.renderOrder = 0; // Reset render order
      }
      i++;
    });
    this.originalLineOpacities = null;
    this.originalLineColors = null;
  }

  calculateAngularDistance(ra1, dec1, ra2, dec2) {
    // Calculate angular distance between two points on celestial sphere
    const ra1Rad = THREE.MathUtils.degToRad(ra1);
    const dec1Rad = THREE.MathUtils.degToRad(dec1);
    const ra2Rad = THREE.MathUtils.degToRad(ra2);
    const dec2Rad = THREE.MathUtils.degToRad(dec2);

    // Haversine formula
    const dRa = ra2Rad - ra1Rad;
    const dDec = dec2Rad - dec1Rad;

    const a = Math.sin(dDec / 2) ** 2 +
          Math.cos(dec1Rad) * Math.cos(dec2Rad) *
          Math.sin(dRa / 2) ** 2;

    const c = 2 * Math.asin(Math.sqrt(a));

    return THREE.MathUtils.radToDeg(c);
  }

  updateGameTime() {
    if (!this.gameActive) return;

    const duration = Math.floor((Date.now() - this.gameStartTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    document.getElementById('game-time').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    setTimeout(() => this.updateGameTime(), 1000);
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
   * Setup power-saving features
   */
  setupPowerSaving() {
    // Page Visibility API - pause when tab/app is hidden
    document.addEventListener('visibilitychange', () => {
      this._isPageVisible = !document.hidden;
      if (this._isPageVisible) {
        console.log('Page visible - resuming rendering');
        this.startAnimating();
      } else {
        console.log('Page hidden - pausing rendering');
        this.stopAnimating();
      }
    });

    // Also handle window blur/focus for better mobile support
    window.addEventListener('blur', () => {
      // Don't immediately stop - user might be switching apps briefly
    });

    window.addEventListener('focus', () => {
      if (this._isPageVisible && !this._isAnimating) {
        this.startAnimating();
      }
    });
  }

  /**
   * Request a render - call this when something changes
   */
  requestRender() {
    this._needsRender = true;
    this._lastInteractionTime = performance.now();

    // Restart animation if stopped
    if (!this._isAnimating && this._isPageVisible) {
      this.startAnimating();
    }

    // Reset idle timeout
    this.resetIdleTimeout();
  }

  /**
   * Reset the idle timeout that stops animation
   */
  resetIdleTimeout() {
    if (this._idleTimeout) {
      clearTimeout(this._idleTimeout);
    }

    // Stop animation after 3 seconds of no interaction (if time is not playing)
    this._idleTimeout = setTimeout(() => {
      if (!this.isTimePlaying && !this._targetFov) {
        this.stopAnimating();
      }
    }, 3000);
  }

  /**
   * Start the animation loop
   */
  startAnimating() {
    if (this._isAnimating) return;

    this._isAnimating = true;
    this._needsRender = true;
    this.resetIdleTimeout();
    requestAnimationFrame(this._boundAnimate);
    // console.log('Animation started');
  }

  /**
   * Stop the animation loop (power saving)
   */
  stopAnimating() {
    this._isAnimating = false;
    if (this._idleTimeout) {
      clearTimeout(this._idleTimeout);
      this._idleTimeout = null;
    }
    // console.log('Animation stopped (power saving)');
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
      // Update FOV display immediately when it changes
      document.getElementById('fov-display').textContent = this.formatAngle(this.camera.fov);
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
   * Create image sprites for deep sky objects
   */
  createObjectImages() {
    // Clear existing sprites
    this.imageSprites.forEach(sprite => {
      this.celestialSphere.remove(sprite);
    });
    this.imageSprites = [];

    // Place images slightly closer than stars (99 vs 100) so they render in front
    const radius = 99;

    // Use the shared curated image database
    const curatedDb = this.getCuratedImageDatabase();

    // Debug: log curated Messier objects
    const messierKeys = Object.keys(curatedDb).filter(k => k.startsWith('M') && /^M\d+$/.test(k)).sort((a,b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
    console.log('📚 Curated Messier objects:', messierKeys.join(', '));

    // Helper to get URL from curated entry (handles both string and object formats)
    const getImageUrl = (key) => {
      const entry = curatedDb[key];
      if (!entry) return null;
      return typeof entry === 'string' ? entry : entry.url;
    };

    // Types that should try dynamic image loading from Wikimedia Commons
    const dynamicTargetTypes = ['Neb', 'PN', 'EmN', 'HII', 'Cl+N', 'RfN', 'SNR', 'GCl', 'OCl', 'G'];

    // Create sprites for objects with images
    this.deepSkyObjects.forEach(dso => {
      // Check for Messier, NGC or IC name (messier may be float like 1.0, convert to int)
      const messierName = dso.messier ? `M${Math.floor(dso.messier)}` : null;
      // Extract NGC number from name field (e.g., "NGC7000" -> "NGC7000")
      const ngcMatch = dso.name && dso.name.match(/^NGC(\d+)/);
      const ngcName = ngcMatch ? `NGC${parseInt(ngcMatch[1])}` : null;  // Remove leading zeros
      // Extract IC number from name field
      const icMatch = dso.name && dso.name.match(/^IC(\d+)/);
      const icName = icMatch ? `IC${parseInt(icMatch[1])}` : null;

      // Determine which name to use (priority: Messier > NGC > IC)
      const staticObjectName = (messierName && getImageUrl(messierName)) ? messierName :
                (ngcName && getImageUrl(ngcName)) ? ngcName :
                (icName && getImageUrl(icName)) ? icName : null;
      const staticImageUrl = staticObjectName ? getImageUrl(staticObjectName) : null;
      const dynamicObjectName = messierName || ngcName || icName;
      const isTargetType = dynamicTargetTypes.includes(dso.type);

      if (staticObjectName && staticImageUrl) {
        // Static image exists in database - load it directly
        const pos = this.raDecToCartesian(dso.ra, dso.dec, radius);

        // Create sprite with CORS-enabled texture loading
        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin('anonymous');
        textureLoader.load(
          staticImageUrl,
          (texture) => {
            // Improve texture quality
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;

            // Calculate aspect ratio from loaded image
            const imgWidth = texture.image?.naturalWidth || texture.image?.width || 1;
            const imgHeight = texture.image?.naturalHeight || texture.image?.height || 1;
            const aspectRatio = imgWidth / imgHeight;

            const material = new THREE.SpriteMaterial({
              map: texture,
              transparent: true,
              opacity: 0.8,  // Start more visible
              depthWrite: false,  // Prevent depth buffer issues
              depthTest: false,  // Always render on top
              sizeAttenuation: true
            });
            const sprite = new THREE.Sprite(material);
            sprite.position.copy(pos);

            // Render images in front of extended object sprites
            sprite.renderOrder = 10;

            // Store object data including real angular size
            const angularSizeArcmin = dso.size_major || 10;

            // Calculate base size using same formula as planets
            // Multiply by 3 to make images more visible (they're usually shown larger than actual size)
            const angularSizeRad = THREE.MathUtils.degToRad(angularSizeArcmin / 60);
            const baseSize = radius * angularSizeRad * 2 * 3;

            sprite.userData = {
              object: dso,
              objectName: staticObjectName,
              angularSizeArcmin: angularSizeArcmin,
              baseSize: baseSize,
              aspectRatio: aspectRatio,  // Store aspect ratio for proper scaling
              needsDynamicLoad: false  // Already has static image
            };

            // Set initial scale preserving aspect ratio
            if (aspectRatio >= 1) {
              sprite.scale.set(baseSize, baseSize / aspectRatio, 1);
            } else {
              sprite.scale.set(baseSize * aspectRatio, baseSize, 1);
            }

            // Apply position angle rotation if available
            // Position angle is measured from North through East (counterclockwise)
            // Standard astronomical images have North up, so we rotate by the position angle
            if (dso.pos_angle !== undefined && dso.pos_angle !== null) {
              // Convert to radians and apply (negative because sprite rotation is clockwise)
              sprite.material.rotation = -THREE.MathUtils.degToRad(dso.pos_angle);
            }

            // Start visible with low opacity - will be adjusted by updateImageVisibility
            sprite.visible = true;
            sprite.material.opacity = 0.1;

            this.celestialSphere.add(sprite);
            this.imageSprites.push(sprite);

            console.log(`✓ Loaded image for ${staticObjectName} (size: ${angularSizeArcmin.toFixed(1)}', baseSize: ${baseSize.toFixed(3)})`);
          },
          undefined,
          (error) => {
            // Static URL failed (403 from Wikimedia) - create placeholder for dynamic loading instead
            console.warn(`Static image failed for ${staticObjectName}, will try dynamic loading`);

            const angularSizeArcmin = dso.size_major || 10;
            const angularSizeRad = THREE.MathUtils.degToRad(angularSizeArcmin / 60);
            const baseSize = radius * angularSizeRad * 2 * 3;

            const fallbackMaterial = new THREE.SpriteMaterial({
              transparent: true,
              opacity: 0,
              depthWrite: false,
              depthTest: false,
              sizeAttenuation: true
            });
            const fallbackSprite = new THREE.Sprite(fallbackMaterial);
            fallbackSprite.position.copy(pos);
            fallbackSprite.renderOrder = 10;
            fallbackSprite.scale.set(baseSize, baseSize, 1);
            fallbackSprite.visible = false;

            fallbackSprite.userData = {
              object: dso,
              objectName: staticObjectName,
              angularSizeArcmin: angularSizeArcmin,
              baseSize: baseSize,
              needsDynamicLoad: true,
              dynamicLoadAttempted: false
            };

            // Apply position angle rotation if available
            if (dso.pos_angle !== undefined && dso.pos_angle !== null) {
              fallbackSprite.material.rotation = -THREE.MathUtils.degToRad(dso.pos_angle);
            }

            this.celestialSphere.add(fallbackSprite);
            this.imageSprites.push(fallbackSprite);
          }
        );
      } else if (dynamicObjectName && isTargetType) {
        // No static image, but this is a nebula/cluster - create placeholder for dynamic loading
        const pos = this.raDecToCartesian(dso.ra, dso.dec, radius);
        const angularSizeArcmin = dso.size_major || 10;
        const angularSizeRad = THREE.MathUtils.degToRad(angularSizeArcmin / 60);
        const baseSize = radius * angularSizeRad * 2 * 3;

        // Create sprite without texture (will be loaded dynamically)
        const material = new THREE.SpriteMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: false,
          sizeAttenuation: true
        });
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(pos);
        sprite.renderOrder = 10;
        sprite.scale.set(baseSize, baseSize, 1);
        sprite.visible = false;

        sprite.userData = {
          object: dso,
          objectName: dynamicObjectName,
          angularSizeArcmin: angularSizeArcmin,
          baseSize: baseSize,
          needsDynamicLoad: true,
          dynamicLoadAttempted: false
        };

        // Apply position angle rotation if available
        if (dso.pos_angle !== undefined && dso.pos_angle !== null) {
          sprite.material.rotation = -THREE.MathUtils.degToRad(dso.pos_angle);
        }

        this.celestialSphere.add(sprite);
        this.imageSprites.push(sprite);
      }
    });
  }

  /**
   * Unified image fetching from multiple astronomical sources
   * Tries sources in decreasing quality order:
   * 1. NASA Images API (includes Webb/Hubble) - iconic/high tier
   * 2. Wikimedia Commons (curated astronomy images) - high/medium tier
   * 3. DSS (Digitized Sky Survey - vintage but complete) - vintage tier
   *
   * @param {string} objectName - Object identifier (e.g., "M42", "NGC2024")
   * @param {number} ra - Right ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {string} type - Object type for field sizing
   * @param {number} angularSizeArcmin - Angular size in arcminutes
   * @returns {Promise<{url: string, source: string, tier: string}|null>}
   */
  async fetchBestImage(objectName, ra, dec, type, angularSizeArcmin = null) {
    console.log(`fetchBestImage called: name=${objectName}, ra=${ra}, dec=${dec}, type=${type}`);

    const normalizedName = objectName?.trim();
    const cacheKey = normalizedName || (ra !== undefined && dec !== undefined ? `${ra.toFixed(3)}_${dec.toFixed(3)}` : 'unknown');

    // === TIER 0: Curated images - ALWAYS check first, before cache ===
    // Curated images are static and should always take priority
    // Use getCuratedImage() which handles name normalization (e.g., NGC0869 -> NGC869)
    // Track if object is marked as "skip to fallback" (no higher-tier images exist)
    let skipToFallback = false;

    const curatedImage = getCuratedImage(normalizedName);
    if (curatedImage) {
      const url = typeof curatedImage === 'string' ? curatedImage : curatedImage.url;
      // If url is null, this object has been marked as "no higher-tier image available"
      // Skip to DSS fallback instead of returning null
      if (url === null) {
        console.log(`⊘ No curated image for ${normalizedName}, will try DSS fallback`);
        skipToFallback = true;
      } else {
        const source = typeof curatedImage === 'string' ? 'Curated' : (curatedImage.source || 'Curated');
        const tier = typeof curatedImage === 'string' ? 'high' : (curatedImage.tier || 'high');
        const result = { url: url, loading: false, source: source, tier: tier };
        this.dynamicImageCache.set(cacheKey, result);  // Cache curated result too
        console.log(`✓ Using curated image for ${normalizedName}`);
        return result;
      }
    }

    // Check cache for non-curated objects
    // Skip cache if object is marked for fallback (needs fresh DSS lookup)
    if (this.dynamicImageCache.has(cacheKey) && !skipToFallback) {
      const cached = this.dynamicImageCache.get(cacheKey);
      if (!cached.loading) {
        console.log(`Cache hit for ${cacheKey}: ${cached.source || 'no image'}`);
        return cached;
      }
      return null; // Still loading
    } else if (skipToFallback && this.dynamicImageCache.has(cacheKey)) {
      // Clear stale cache for objects that now need DSS fallback
      this.dynamicImageCache.delete(cacheKey);
    }

    // Limit cache size to prevent memory growth
    if (this.dynamicImageCache.size > 200) {
      const keysToRemove = Array.from(this.dynamicImageCache.keys()).slice(0, 50);
      keysToRemove.forEach(key => this.dynamicImageCache.delete(key));
    }

    // Mark as loading
    this.dynamicImageCache.set(cacheKey, { url: null, loading: true, source: null });

    // === SPECIAL CASES: Planets (dynamically calculated objects) ===
    // These need dedicated handling to avoid wrong search results
    // Note: "Sol" is NOT the Sun - it's a star at RA 0, Dec 0 in the database
    const specialObjects = {
      'Sun': { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_-_20100819.jpg/400px-The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_-_20100819.jpg', source: 'NASA/SDO', tier: 'iconic' },
      'Moon': { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/FullMoon2010.jpg/400px-FullMoon2010.jpg', source: 'NASA/Wikimedia', tier: 'high' },
      'Mercury': { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Mercury_in_true_color.jpg/400px-Mercury_in_true_color.jpg', source: 'NASA/MESSENGER', tier: 'iconic' },
      'Venus': { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/PIA23791-Venus-NewlyProcessedView-20200608.jpg/400px-PIA23791-Venus-NewlyProcessedView-20200608.jpg', source: 'NASA/Mariner', tier: 'iconic' },
      'Mars': { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Mars_-_August_30_2021_-_Flickr_-_Kevin_M._Gill.png/400px-Mars_-_August_30_2021_-_Flickr_-_Kevin_M._Gill.png', source: 'NASA/Hubble', tier: 'iconic' },
      'Jupiter': { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Jupiter_New_Horizons.jpg/400px-Jupiter_New_Horizons.jpg', source: 'NASA/New Horizons', tier: 'iconic' },
      'Saturn': { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Saturn_during_Equinox.jpg/400px-Saturn_during_Equinox.jpg', source: 'NASA/Cassini', tier: 'iconic' },
      'Uranus': { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Uranus_as_seen_by_NASA%27s_Voyager_2_%28reprocessed%29_-_JPEG_converted.jpg/400px-Uranus_as_seen_by_NASA%27s_Voyager_2_%28reprocessed%29_-_JPEG_converted.jpg', source: 'NASA/Voyager', tier: 'iconic' },
      'Neptune': { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Neptune_Voyager2_color_calibrated.png/400px-Neptune_Voyager2_color_calibrated.png', source: 'NASA/Voyager', tier: 'iconic' },
      'Pluto': { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Pluto_in_True_Color_-_High-Res.jpg/400px-Pluto_in_True_Color_-_High-Res.jpg', source: 'NASA/New Horizons', tier: 'iconic' }
    };

    // Check if this is a special object (case-insensitive)
    if (normalizedName && specialObjects[normalizedName]) {
      const special = specialObjects[normalizedName];
      const result = { url: special.url, loading: false, source: special.source, tier: special.tier };
      this.dynamicImageCache.set(cacheKey, result);
      console.log(`Using dedicated image for ${normalizedName}`);
      return result;
    }

    // Log curated misses for catalog objects (M/NGC/IC) - curated check already done above
    // Skip this log for objects marked with url:null (they're intentionally set to use fallback)
    if (/^(M|NGC|IC)\d+$/i.test(normalizedName) && !skipToFallback) {
      console.log(`⚠️ No curated image for "${normalizedName}" (${getCuratedImageKeys().length} total curated images)`);
    }

    // Determine object category for smarter searching
    const isCatalogObject = objectName?.match(/^(IC|NGC|M)\d+$/i);
    const isDeepSkyObject = type && ['G', 'Neb', 'PN', 'EmN', 'HII', 'Cl+N', 'RfN', 'SNR', 'GCl', 'OCl'].includes(type);
    const isStar = type === 'Star' || type === '*' || (!type && !isCatalogObject);
    const isPlanet = type === 'Planet';

    // For regular stars (not famous ones), skip API searches but allow DSS fallback
    // This shows the star field around the star
    const famousStars = ['Sirius', 'Betelgeuse', 'Rigel', 'Vega', 'Arcturus', 'Capella', 'Aldebaran', 'Antares', 'Polaris', 'Deneb', 'Altair', 'Procyon', 'Canopus', 'Achernar', 'Fomalhaut', 'Regulus', 'Pollux', 'Castor'];
    const isFamousStar = isStar && normalizedName && famousStars.some(s => normalizedName.toLowerCase().includes(s.toLowerCase()));
    const skipApiSearch = isStar && !isFamousStar;

    // Format search names for APIs
    let searchName = objectName || '';
    if (searchName.startsWith('M') && /^M\d+$/.test(searchName)) {
      searchName = searchName.replace(/^M(\d+)$/, 'messier $1');
    } else {
      searchName = searchName.replace(/([A-Za-z]+)(\d+)/, '$1 $2').trim();
    }

    // === TIER 1: NASA Images API (includes Webb, Hubble - THE PEAK) ===
    // Skip if object is marked as "no higher-tier image" in curated database
    if (objectName && !isStar && !skipToFallback) {
      try {
        // Add type-specific terms for better search precision
        let nasaSearchTerm = searchName;
        if (isDeepSkyObject) {
          nasaSearchTerm = `${searchName} astronomy`;
        }

        const response = await fetch(
          `https://images-api.nasa.gov/search?q=${encodeURIComponent(nasaSearchTerm)}&media_type=image`
        );
        const data = await response.json();

        if (data.collection?.items?.length > 0) {
          // Helper to check if result is relevant to our object
          const checkRelevance = (title, desc, keywords) => {
            const titleLower = title.toLowerCase();
            const descLower = desc.toLowerCase();
            const keywordsLower = keywords.toLowerCase();

            // Check for catalog number (with or without space): IC1805, IC 1805, NGC2024, NGC 2024
            const catalogMatch = objectName.match(/^(IC|NGC|M)(\d+)$/i);
            if (catalogMatch) {
              const prefix = catalogMatch[1].toLowerCase();
              const number = catalogMatch[2];
              // Check variations: "ic1805", "ic 1805", "ic-1805"
              const patterns = [
                `${prefix}${number}`,
                `${prefix} ${number}`,
                `${prefix}-${number}`
              ];
              for (const pattern of patterns) {
                if (titleLower.includes(pattern) || descLower.includes(pattern) || keywordsLower.includes(pattern)) {
                  return true;
                }
              }
            }

            // Also check without spaces for general match
            const searchLower = objectName.toLowerCase().replace(/\s+/g, '');
            const titleNoSpace = titleLower.replace(/\s+/g, '');
            const descNoSpace = descLower.replace(/\s+/g, '');

            return titleNoSpace.includes(searchLower) ||
                 descNoSpace.includes(searchLower) ||
                 keywordsLower.includes(objectName.toLowerCase());
          };

          // Look for Webb or Hubble images first
          for (const item of data.collection.items) {
            const desc = item.data?.[0]?.description || '';
            const title = item.data?.[0]?.title || '';
            const keywords = (item.data?.[0]?.keywords || []).join(' ');

            if (!checkRelevance(title, desc, keywords)) continue;

            const descLower = desc.toLowerCase();
            const titleLower = title.toLowerCase();
            const isWebb = descLower.includes('webb') || titleLower.includes('webb') || descLower.includes('jwst');
            const isHubble = descLower.includes('hubble') || titleLower.includes('hubble') || descLower.includes('hst');

            const previewLink = item.links?.find(link => link.rel === 'preview');
            if (previewLink?.href && (isWebb || isHubble)) {
              const tier = isWebb ? 'Webb' : 'Hubble';
              console.log(`✨ Found ${tier} image for ${objectName}`);
              const result = { url: previewLink.href, loading: false, source: `NASA/${tier}`, tier: 'iconic' };
              this.dynamicImageCache.set(cacheKey, result);
              return result;
            }
          }
          // Fall back to any relevant NASA image
          for (const item of data.collection.items) {
            const desc = item.data?.[0]?.description || '';
            const title = item.data?.[0]?.title || '';
            const keywords = (item.data?.[0]?.keywords || []).join(' ');

            if (!checkRelevance(title, desc, keywords)) continue;

            const previewLink = item.links?.find(link => link.rel === 'preview');
            if (previewLink?.href) {
              console.log(`Found NASA image for ${objectName}`);
              const result = { url: previewLink.href, loading: false, source: 'NASA', tier: 'high' };
              this.dynamicImageCache.set(cacheKey, result);
              return result;
            }
          }

          // Last resort: take first NASA result for catalog objects (search already filtered)
          // This helps with objects known by common names (Heart Nebula = IC1805)
          if (isCatalogObject && data.collection.items.length > 0) {
            const firstItem = data.collection.items[0];
            const previewLink = firstItem.links?.find(link => link.rel === 'preview');
            if (previewLink?.href) {
              console.log(`Found NASA image for ${objectName} (first result)`);
              const result = { url: previewLink.href, loading: false, source: 'NASA', tier: 'high' };
              this.dynamicImageCache.set(cacheKey, result);
              return result;
            }
          }
        }
      } catch (error) {
        console.warn(`NASA API failed for ${objectName}:`, error.message);
      }
    }

    // === TIER 2: Wikimedia Commons (curated astronomy images) ===
    // Skip if object is marked as "no higher-tier image" in curated database
    if (objectName && !isStar && !skipToFallback) {
      try {
        const wikiSearchName = objectName.replace(/([A-Za-z]+)(\d+)/, '$1 $2').trim();

        // Build search query based on object type (avoid "nebula OR galaxy" for non-DSO)
        let wikiSearchQuery = wikiSearchName;
        if (isDeepSkyObject) {
          // For DSOs, add specific type terms
          const typeTerms = {
            'G': 'galaxy',
            'Neb': 'nebula',
            'PN': 'planetary nebula',
            'EmN': 'emission nebula',
            'HII': 'nebula',
            'Cl+N': 'cluster nebula',
            'RfN': 'reflection nebula',
            'SNR': 'supernova remnant',
            'GCl': 'globular cluster',
            'OCl': 'open cluster'
          };
          const typeTerm = typeTerms[type] || '';
          wikiSearchQuery = `${wikiSearchName} ${typeTerm} astronomy`;
        } else {
          wikiSearchQuery = `${wikiSearchName} astronomy space`;
        }

        const wikiResponse = await fetch(
          `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
          `&gsrsearch=${encodeURIComponent(wikiSearchQuery)}&gsrlimit=10` +
          `&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=400&format=json&origin=*`
        );
        const wikiData = await wikiResponse.json();

        if (wikiData.query?.pages) {
          const pages = Object.values(wikiData.query.pages).sort((a, b) => (a.index || 0) - (b.index || 0));

          // Helper to check if page title is relevant
          const checkWikiRelevance = (pageTitle) => {
            const titleLower = pageTitle.toLowerCase();

            // Check for catalog number variations: IC1805, IC 1805, IC-1805
            const catalogMatch = objectName.match(/^(IC|NGC|M)(\d+)$/i);
            if (catalogMatch) {
              const prefix = catalogMatch[1].toLowerCase();
              const number = catalogMatch[2];
              const patterns = [
                `${prefix}${number}`,
                `${prefix} ${number}`,
                `${prefix}-${number}`,
                `${prefix}_${number}`
              ];
              for (const pattern of patterns) {
                if (titleLower.includes(pattern)) return true;
              }
            }

            // Also check without spaces
            const searchLower = objectName.toLowerCase().replace(/\s+/g, '');
            const titleNoSpace = titleLower.replace(/\s+/g, '');
            return titleNoSpace.includes(searchLower);
          };

          // Max file size: 1MB for thumbnails (original size limit ~20MB as proxy)
          const maxOriginalSize = 20 * 1024 * 1024;

          for (const page of pages) {
            const imageInfo = page.imageinfo?.[0];
            const thumbUrl = imageInfo?.thumburl;
            const originalSize = imageInfo?.size || 0;
            const metadata = imageInfo?.extmetadata;
            const artist = metadata?.Artist?.value || '';
            const pageTitle = page.title || '';

            if (!checkWikiRelevance(pageTitle)) continue;
            // Skip very large files (thumbnail would also be large)
            if (originalSize > maxOriginalSize) continue;

            if (thumbUrl && !thumbUrl.includes('.svg') && !thumbUrl.includes('Map') && !thumbUrl.includes('map')) {
              // Prioritize official observatory images
              const isSubaru = artist.includes('Subaru') || artist.includes('NAOJ') || artist.includes('National Astronomical Observatory of Japan');
              const isOfficial = artist.includes('ESO') || artist.includes('ESA') || artist.includes('NASA') || artist.includes('Hubble') || isSubaru;
              if (isOfficial) {
                const source = isSubaru ? 'Wikimedia/Subaru' : 'Wikimedia/ESO';
                console.log(`Found Wikimedia (official) image for ${objectName}`);
                const result = { url: thumbUrl, loading: false, source: source, tier: 'high' };
                this.dynamicImageCache.set(cacheKey, result);
                return result;
              }
            }
          }
          // Fall back to any relevant Wikimedia image
          for (const page of pages) {
            const imageInfo = page.imageinfo?.[0];
            const thumbUrl = imageInfo?.thumburl;
            const originalSize = imageInfo?.size || 0;
            const pageTitle = page.title || '';

            if (!checkWikiRelevance(pageTitle)) continue;
            if (originalSize > maxOriginalSize) continue;

            if (thumbUrl && !thumbUrl.includes('.svg') && !thumbUrl.includes('Map')) {
              console.log(`Found Wikimedia image for ${objectName}`);
              const result = { url: thumbUrl, loading: false, source: 'Wikimedia', tier: 'medium' };
              this.dynamicImageCache.set(cacheKey, result);
              return result;
            }
          }
        }
      } catch (error) {
        console.warn(`Wikimedia API failed for ${objectName}:`, error.message);
      }
    }

    // === TIER 3: DSS (Digitized Sky Survey via CDS HiPS) ===
    // CDS Aladin HiPS has reliable CORS support, works for 3D textures
    // Used as fallback for both info panel and 3D sprites
    // For stars: only show DSS in info panel (not as 3D sprites) to avoid clutter
    const allowDssForStar = isStar && this._fetchingForPanel;
    if (ra !== undefined && dec !== undefined && (!isStar || allowDssForStar)) {
      const dssUrl = this.getSkyViewImageUrl(ra, dec, type, angularSizeArcmin);
      console.log(`📜 Using DSS fallback for ${objectName || 'coordinates'}`);
      const result = { url: dssUrl, loading: false, source: 'DSS', tier: 'vintage' };
      this.dynamicImageCache.set(cacheKey, result);
      return result;
    }

    // No image available
    console.log(`No image available for ${objectName} (type=${type})`);
    const result = { url: null, loading: false, source: null, tier: null };
    this.dynamicImageCache.set(cacheKey, result);
    return result;
  }

  /**
   * Legacy wrapper for old code - calls fetchBestImage
   */
  async fetchDynamicImageUrl(objectName) {
    // Get object info if available
    let ra, dec, type, angularSize;
    const dso = this.deepSkyObjects?.find(d =>
      d.messier === parseInt(objectName?.replace('M', '')) ||
      d.name === objectName
    );
    if (dso) {
      ra = dso.ra;
      dec = dso.dec;
      type = dso.type;
      angularSize = dso.size_major;
    }

    return this.fetchBestImage(objectName, ra, dec, type, angularSize);
  }

  /**
   * Trigger dynamic image loading for a sprite
   * Called when sprite becomes visible at sufficient size
   * Uses unified fetchBestImage which tries all sources in quality order
   */
  async triggerDynamicLoad(sprite) {
    const objectName = sprite.userData.objectName;
    const dso = sprite.userData.object;
    sprite.userData.dynamicLoadAttempted = true;
    this._dynamicLoadInProgress = true;

    console.log(`🔍 Loading image for: ${objectName}`);

    // Use unified image fetcher with full object data
    const result = await this.fetchBestImage(
      objectName,
      dso?.ra,
      dso?.dec,
      dso?.type,
      dso?.size_major
    );

    if (!result?.url) {
      sprite.userData.needsDynamicLoad = false;
      this._dynamicLoadInProgress = false;
      return;
    }

    // Skip size check for trusted sources (already optimized)
    const trustedSources = ['ESA/Hubble', 'NASA', 'NASA/Webb', 'NASA/Hubble', 'Curated', 'DSS'];
    const isTrusted = trustedSources.includes(result.source) ||
              result.url?.includes('esahubble.org') ||
              result.url?.includes('nasa.gov');

    if (!isTrusted) {
      // Check file size before loading (max 1MB) - only for untrusted sources
      const maxSize = 1024 * 1024; // 1MB
      try {
        const headResponse = await fetch(result.url, { method: 'HEAD' });
        const contentLength = parseInt(headResponse.headers.get('content-length') || '0', 10);
        if (contentLength > maxSize) {
          console.log(`⚠️ Skipping image for ${objectName}: ${(contentLength / 1024 / 1024).toFixed(2)}MB exceeds 1MB limit`);
          sprite.userData.needsDynamicLoad = false;
          this._dynamicLoadInProgress = false;
          return;
        }
      } catch (e) {
        // If HEAD fails, proceed anyway (some servers don't support HEAD)
      }
    }

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');
    textureLoader.load(
      result.url,
      (texture) => {
        // Check if texture actually loaded (has dimensions)
        // Use width/height as fallback for GIF images that may not have naturalWidth
        const imgWidth = texture.image?.naturalWidth || texture.image?.width || 0;
        const imgHeight = texture.image?.naturalHeight || texture.image?.height || 0;

        if (imgWidth > 0 && imgHeight > 0) {
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          sprite.material.map = texture;
          sprite.material.needsUpdate = true;
          sprite.userData.needsDynamicLoad = false;
          sprite.userData.imageSource = result.source;
          sprite.userData.imageTier = result.tier;

          // Store aspect ratio for proper scaling
          sprite.userData.aspectRatio = imgWidth / imgHeight;

          console.log(`✓ Loaded image for ${objectName} (aspect: ${sprite.userData.aspectRatio.toFixed(2)})`);
        } else {
          console.warn(`⚠️ Texture has no dimensions for ${objectName}`);
          sprite.userData.needsDynamicLoad = false;
        }
        this._dynamicLoadInProgress = false;
      },
      (progress) => {
        // Progress callback - not used but required for error callback
      },
      (error) => {
        console.warn(`❌ Failed to load texture for ${objectName}:`, error?.message || 'Unknown error');

        // Try DSS/CDS HiPS fallback if primary image failed (likely CORS issue)
        if (dso?.ra !== undefined && dso?.dec !== undefined && result.source !== 'DSS') {
          console.log(`🔄 Trying DSS fallback for ${objectName}`);
          const dssUrl = this.getSkyViewImageUrl(dso.ra, dso.dec, dso.type, dso.size_major);

          textureLoader.load(
            dssUrl,
            (texture) => {
              const imgWidth = texture.image?.naturalWidth || texture.image?.width || 0;
              const imgHeight = texture.image?.naturalHeight || texture.image?.height || 0;

              if (imgWidth > 0 && imgHeight > 0) {
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                sprite.material.map = texture;
                sprite.material.needsUpdate = true;
                sprite.userData.imageSource = 'DSS';
                sprite.userData.imageTier = 'vintage';
                sprite.userData.aspectRatio = imgWidth / imgHeight;
                console.log(`✓ Loaded DSS fallback for ${objectName}`);
              }
              sprite.userData.needsDynamicLoad = false;
              this._dynamicLoadInProgress = false;
            },
            undefined,
            (dssError) => {
              console.warn(`❌ DSS fallback also failed for ${objectName}`);
              sprite.userData.needsDynamicLoad = false;
              this._dynamicLoadInProgress = false;
            }
          );
        } else {
          sprite.userData.needsDynamicLoad = false;
          this._dynamicLoadInProgress = false;
        }
      }
    );
  }

  /**
   * Create extended objects with real angular sizes
   */
  createExtendedObjects() {
    // Clear existing sprites
    this.extendedObjectSprites.forEach(sprite => {
      this.celestialSphere.remove(sprite);
    });
    this.extendedObjectSprites = [];

    const radius = 100;

    // Create sprites for DSOs with known angular sizes
    this.deepSkyObjects.forEach(dso => {
      // Only create extended objects for those with size data (in arcminutes)
      if (dso.size_major && dso.size_major > 0) {
        const pos = this.raDecToCartesian(dso.ra, dso.dec, radius);

        // Calculate magnitude-based intensity (brighter = more visible halo)
        const mag = dso.mag || 10;
        // Scale from 0.02 (mag 12+) to 0.25 (mag 4 or brighter)
        const magIntensity = Math.max(0.02, Math.min(0.25, (10 - mag) / 24));

        // Create a circular canvas texture
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Draw semi-transparent circle
        ctx.clearRect(0, 0, size, size);
        const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);

        // Color based on type - intensity based on magnitude
        let r, g, b;
        if (dso.type === 'G') {
          r = 255; g = 240; b = 200;  // Galaxy - yellowish
        } else if (dso.type === 'PN') {
          r = 180; g = 255; b = 200;  // Planetary nebula - greenish
        } else if (dso.type === 'Neb' || dso.type === 'Cl+N' || dso.type === 'EmN' || dso.type === 'HII') {
          r = 255; g = 180; b = 200;  // Nebula - pinkish
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

        // Create sprite with magnitude-based base opacity
        const texture = new THREE.CanvasTexture(canvas);
        const baseOpacity = Math.max(0.1, Math.min(0.6, (10 - mag) / 10));
        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: baseOpacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false  // Prevent depth buffer issues with transparency
        });

        const sprite = new THREE.Sprite(material);
        sprite.position.copy(pos);

        // Render behind image sprites but in front of stars
        sprite.renderOrder = 5;

        // Store angular size in arcminutes (like planets)
        sprite.userData.angularSizeArcmin = dso.size_major;
        sprite.userData.dso = dso;
        sprite.userData.baseOpacity = baseOpacity;  // Store for updateExtendedObjectSizes

        // Calculate size using same formula as planets
        // Angular size in arcminutes -> convert to scene units
        const angularSizeRad = THREE.MathUtils.degToRad(dso.size_major / 60);
        const displaySize = radius * angularSizeRad * 2;

        // Store base size for FOV scaling
        sprite.userData.baseSize = displaySize;
        sprite.scale.set(displaySize, displaySize, 1);

        this.extendedObjectSprites.push(sprite);
        this.celestialSphere.add(sprite);
      }
    });

    console.log(`✓ Created ${this.extendedObjectSprites.length} extended objects with real angular sizes`);
  }

  /**
   * Update visibility of extended objects based on current FOV
   * Objects maintain fixed angular size - perspective handles zoom
   */
  updateExtendedObjectSizes() {
    if (!this.extendedObjectSprites || this.extendedObjectSprites.length === 0) return;

    const fov = this.camera.fov;
    const canvasHeight = this.renderer.domElement.height;
    const pixelsPerDeg = canvasHeight / fov;
    const radius = 99;

    this.extendedObjectSprites.forEach(sprite => {
      if (!sprite.userData) return;

      const angularSizeArcmin = sprite.userData.angularSizeArcmin || 1;
      const dso = sprite.userData.dso;
      const mag = dso?.mag || 10;

      // Calculate real angular size in pixels
      const angularSizeDeg = angularSizeArcmin / 60;
      const realSizePixels = angularSizeDeg * pixelsPerDeg;

      // Always use real angular size for the halo
      const angularSizeRad = THREE.MathUtils.degToRad(angularSizeArcmin / 60);
      const worldSize = radius * angularSizeRad * 2;
      sprite.scale.set(worldSize, worldSize, 1);

      // Show based on magnitude limit (like stars) - hide objects fainter than current mag limit
      const magLimit = this.currentMagnitude || 6.5;
      sprite.visible = mag <= magLimit + 2; // Allow slightly fainter DSOs to show

      // Opacity based on magnitude and zoom level
      // More visible when zoomed in (halo takes up more screen space)
      if (sprite.material) {
        const baseOpacity = sprite.userData.baseOpacity || 0.3;
        // Reduce opacity when halo is very small on screen (zoomed out)
        const minVisiblePixels = 10;
        const opacityScale = Math.min(1, realSizePixels / minVisiblePixels);
        sprite.material.opacity = baseOpacity * opacityScale;
      }
    });
  }

  /**
   * Calculate the screen angle to celestial North from an object's position
   * This is needed to properly orient images on the celestial sphere
   * @param {number} ra - Right Ascension in degrees
   * @param {number} dec - Declination in degrees
   * @returns {number} Angle in radians from screen "up" to celestial North (clockwise positive)
   */
  /**
   * Update visibility of object images based on zoom level
   * Shows real images of objects at their true angular size when zoomed in enough
   */
  updateImageVisibility() {
    if (!this.imageSprites || this.imageSprites.length === 0) return;

    const fov = this.camera.fov;
    const canvasHeight = this.renderer.domElement.height;
    const pixelsPerDeg = canvasHeight / fov;
    const radius = 99;

    // Reset candidate tracking for this frame - we'll only load ONE image per check
    // We track the sprite with the largest screen size (most zoomed in)
    this._bestCandidateSprite = null;
    this._bestCandidateSize = 0;

    // Get camera direction for FOV check
    const camDir = this._tempVec3B || new THREE.Vector3();
    this.camera.getWorldDirection(camDir);

    this.imageSprites.forEach(sprite => {
      if (!sprite.userData) return;

      // First check if sprite is in the camera's field of view
      const spritePos = this._tempVec3 || new THREE.Vector3();
      sprite.getWorldPosition(spritePos);
      const toSpriteX = spritePos.x - this.camera.position.x;
      const toSpriteY = spritePos.y - this.camera.position.y;
      const toSpriteZ = spritePos.z - this.camera.position.z;
      const len = Math.sqrt(toSpriteX * toSpriteX + toSpriteY * toSpriteY + toSpriteZ * toSpriteZ);
      const dot = (toSpriteX / len) * camDir.x +
             (toSpriteY / len) * camDir.y +
             (toSpriteZ / len) * camDir.z;

      // Calculate the cosine threshold for current FOV (with proportional margin)
      // Use FOV-based margin so small FOVs have small margins, capped at 5° for large FOVs
      // For FOV=0.3°, margin=0.3° -> total check radius = 0.45° (not 5.15°!)
      const margin = Math.min(5, fov);
      const fovHalfRad = THREE.MathUtils.degToRad(fov / 2 + margin);
      const cosFovThreshold = Math.cos(fovHalfRad);

      // Skip sprites outside field of view
      if (dot < cosFovThreshold) {
        sprite.material.opacity = 0;
        sprite.visible = false;
        return;
      }

      const angularSizeArcmin = sprite.userData.angularSizeArcmin || 10;
      const angularSizeDeg = angularSizeArcmin / 60;
      const realSizePixels = angularSizeDeg * pixelsPerDeg;

      // Show image when object takes up enough of the screen
      // Use higher thresholds on mobile for better UX (images appear later, fade later)
      const screenSize = Math.min(window.innerWidth, window.innerHeight);
      // Images appear later (need more zoom), disappear later (stay visible longer)
      // Mobile has even higher thresholds for better touch UX
      const showThreshold = this.isMobile ? 0.9 : 0.65;
      const fullOpacityThreshold = this.isMobile ? 1.1 : 0.85;
      const fadeOutStartThreshold = this.isMobile ? 2.0 : 1.2;
      const fadeOutEndThreshold = this.isMobile ? 3.0 : 1.8;

      const minPixelsToShow = screenSize * showThreshold;
      const showImage = realSizePixels >= minPixelsToShow;

      if (showImage) {
        // Track this sprite as a candidate for dynamic loading
        // We only load when the object is large enough on screen AND in FOV
        // Among candidates, we pick the one with largest screen size (most zoomed in)
        if (sprite.userData.needsDynamicLoad && !sprite.userData.dynamicLoadAttempted) {
          if (!this._dynamicLoadInProgress) {
            // Track the sprite with largest screen size for loading
            if (realSizePixels > this._bestCandidateSize) {
              this._bestCandidateSprite = sprite;
              this._bestCandidateSize = realSizePixels;
            }
          }
        }

        // Calculate world size based on real angular size, preserving aspect ratio
        const worldSize = (realSizePixels / canvasHeight) * 2 * radius * Math.tan(THREE.MathUtils.degToRad(fov / 2));
        const aspectRatio = sprite.userData.aspectRatio || 1;
        if (aspectRatio >= 1) {
          sprite.scale.set(worldSize, worldSize / aspectRatio, 1);
        } else {
          sprite.scale.set(worldSize * aspectRatio, worldSize, 1);
        }

        // Fade in as it gets larger, fade out when it takes up full screen
        const fadeInStart = minPixelsToShow;
        const fadeInEnd = screenSize * fullOpacityThreshold;
        const fadeOutStart = screenSize * fadeOutStartThreshold;
        const fadeOutEnd = screenSize * fadeOutEndThreshold;

        let opacity = 0;
        if (realSizePixels < fadeInEnd) {
          // Fade in range
          opacity = (realSizePixels - fadeInStart) / (fadeInEnd - fadeInStart);
        } else if (realSizePixels < fadeOutStart) {
          // Full opacity range
          opacity = 1;
        } else {
          // Fade out range
          opacity = 1 - (realSizePixels - fadeOutStart) / (fadeOutEnd - fadeOutStart);
        }
        opacity = Math.max(0, Math.min(0.9, opacity * 0.9));

        sprite.material.opacity = opacity;
        // Only make visible if texture exists (for dynamic loading)
        sprite.visible = opacity > 0.05 && sprite.material.map !== null;
      } else {
        sprite.material.opacity = 0;
        sprite.visible = false;
      }
    });

    // After checking all sprites, load only the single most-centered object
    // Also add a 2-second cooldown between loads to prevent rapid sequential loading
    const now = performance.now();
    const cooldownMs = 2000;
    if (this._bestCandidateSprite &&
      !this._dynamicLoadInProgress &&
      (!this._lastDynamicImageLoad || now - this._lastDynamicImageLoad > cooldownMs)) {
      this._lastDynamicImageLoad = now;
      this.triggerDynamicLoad(this._bestCandidateSprite);
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
    const viewRaDec = this.cartesianToRaDec(viewDirCelestial.x, viewDirCelestial.y, viewDirCelestial.z);

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

      const pos = this.raDecToCartesian(star.ra, star.dec, radius);
      positions.push(pos.x, pos.y, pos.z);

      // Use color index for realistic star colors (same as main stars)
      const color = this.spectralTypeToColor(null, star.ci);
      colors.push(color[0], color[1], color[2]);

      // Use same size calculation as main stars
      const size = this.magnitudeToSize(star.mag);
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
      vertexShader: STAR_VERTEX_SHADER,
      fragmentShader: STAR_FRAGMENT_SHADER,
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
    const viewDirWorld = new THREE.Vector3(0, 0, 0).sub(this.camera.position).normalize();

    // Transform view direction from world coords to celestial coords
    // by applying the INVERSE of the celestialSphere's world transformation
    const viewDirCelestial = viewDirWorld.clone();
    if (this.celestialSphere) {
      // Update the matrix first!
      this.celestialSphere.updateMatrixWorld();
      const worldMatrix = new THREE.Matrix4().copy(this.celestialSphere.matrixWorld);
      const inverseMatrix = new THREE.Matrix4().copy(worldMatrix).invert();
      const rotationMatrix = new THREE.Matrix3().setFromMatrix4(inverseMatrix);
      viewDirCelestial.applyMatrix3(rotationMatrix);
    }

    const raDec = this.cartesianToRaDec(viewDirCelestial.x, viewDirCelestial.y, viewDirCelestial.z);

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

  /**
   * Query VizieR for stars in a region - uses multiple catalogs
   */
  async queryGaiaStars(ra, dec, fov) {
    if (this.isQueryingGaia) return;
    this.isQueryingGaia = true;

    console.log(`🔭 Querying stars: RA=${ra.toFixed(2)}°, Dec=${dec.toFixed(2)}°, FOV=${fov.toFixed(2)}°`);

    try {
      // Query Tycho-2 (bright stars up to ~12 mag)
      await this.queryTychoStars(ra, dec, fov);

      // Query UCAC4 for fainter stars (up to ~16 mag) only at deep zoom
      if (fov < 3) {
        await this.queryUCAC4Stars(ra, dec, fov);
      }

      // Query SIMBAD for faint stars only at very deep zoom
      if (fov < 1 && this.currentMagnitude > 16) {
        await this.querySimbadStars(ra, dec, fov);
      }
    } catch (error) {
      console.warn('Star query error:', error.message);
    }

    this.isQueryingGaia = false;
  }

  /**
   * Parse VizieR VOTable XML response
   * Columns expected: RA, Dec, Vmag, Bmag (to calculate B-V color index)
   */
  parseVizierStars(text) {
    const stars = [];
    try {
      // Extract all TR rows
      const rowMatches = text.matchAll(/<TR>([\s\S]*?)<\/TR>/g);
      for (const rowMatch of rowMatches) {
        const rowContent = rowMatch[1];
        // Extract TD values from this row
        const tdMatches = [...rowContent.matchAll(/<TD>([^<]*)<\/TD>/g)];
        if (tdMatches.length >= 3) {
          const ra = parseFloat(tdMatches[0][1]);
          const dec = parseFloat(tdMatches[1][1]);
          const vMag = parseFloat(tdMatches[2][1]);  // V magnitude
          const bMag = tdMatches.length >= 4 ? parseFloat(tdMatches[3][1]) : NaN;  // B magnitude

          // Calculate B-V color index (typical range: -0.4 to +2.0)
          // Blue stars: B-V < 0, Yellow stars: B-V ~ 0.6, Red stars: B-V > 1.4
          let colorIndex = 0.6;  // Default: sun-like yellow
          if (!isNaN(bMag) && !isNaN(vMag)) {
            colorIndex = bMag - vMag;
            // Clamp to realistic range
            colorIndex = Math.max(-0.5, Math.min(2.5, colorIndex));
          }

          if (!isNaN(ra) && !isNaN(dec) && !isNaN(vMag)) {
            stars.push([ra, dec, vMag, colorIndex]);
          }
        }
      }
      console.log(`Parsed ${stars.length} stars from VOTable`);
    } catch (e) {
      console.warn('VOTable parse error:', e);
    }
    return stars;
  }

  /**
   * Validate and sanitize query parameters for astronomical database queries.
   * Returns sanitized params object or null if invalid.
   */
  validateQueryParams(ra, dec, radius, magLimit) {
    const safeRa = parseFloat(ra);
    const safeDec = parseFloat(dec);
    const safeRadius = parseFloat(radius);
    const safeMag = parseFloat(magLimit);

    if (isNaN(safeRa) || isNaN(safeDec) || isNaN(safeRadius) || isNaN(safeMag) ||
      safeRa < 0 || safeRa > 360 || safeDec < -90 || safeDec > 90 ||
      safeRadius <= 0 || safeRadius > 180) {
      console.warn('Invalid query parameters');
      return null;
    }

    return { ra: safeRa, dec: safeDec, radius: safeRadius, mag: safeMag };
  }

  /**
   * Query Tycho-2 catalog (brighter stars up to ~11.5 mag, very reliable)
   */
  async queryTychoStars(ra, dec, fov) {
    const radius = Math.max(fov * 0.8, 0.2);
    const magLimit = Math.min(12, this.currentMagnitude);
    const starLimit = fov < 1 ? 5000 : 3000;

    const params = this.validateQueryParams(ra, dec, radius, magLimit);
    if (!params) return;

    console.log(`🌟 Querying Tycho-2: RA=${params.ra.toFixed(2)}°, Dec=${params.dec.toFixed(2)}°, radius=${params.radius.toFixed(2)}°, mag<${params.mag.toFixed(1)}`);

    const url = `https://vizier.cds.unistra.fr/viz-bin/votable?-source=I/259/tyc2&-c=${encodeURIComponent(params.ra.toFixed(6) + ' ' + params.dec.toFixed(6))}&-c.rd=${encodeURIComponent(params.radius.toFixed(4))}&-out.max=${encodeURIComponent(starLimit)}&-out=RAmdeg,DEmdeg,VTmag,BTmag&VTmag=${encodeURIComponent('<' + params.mag.toFixed(2))}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Tycho query failed: ${response.status}`);

      const text = await response.text();
      const stars = this.parseVizierStars(text);

      if (stars.length > 0) {
        console.log(`✓ Loaded ${stars.length} stars from Tycho-2`);
        this.addDynamicStars(stars, false);
      }
    } catch (error) {
      console.warn('Tycho-2 query error:', error.message);
    }
  }

  /**
   * Query UCAC4 catalog for fainter stars (up to ~16 mag)
   */
  async queryUCAC4Stars(ra, dec, fov) {
    const radius = Math.max(fov * 0.8, 0.1);
    const magLimit = Math.min(16, this.currentMagnitude);
    const starLimit = fov < 0.5 ? 8000 : 4000;

    const params = this.validateQueryParams(ra, dec, radius, magLimit);
    if (!params) return;

    console.log(`🌟 Querying UCAC4: RA=${params.ra.toFixed(2)}°, Dec=${params.dec.toFixed(2)}°, radius=${params.radius.toFixed(2)}°, mag<${params.mag.toFixed(1)}`);

    const url = `https://vizier.cds.unistra.fr/viz-bin/votable?-source=I/322A/out&-c=${encodeURIComponent(params.ra.toFixed(6) + ' ' + params.dec.toFixed(6))}&-c.rd=${encodeURIComponent(params.radius.toFixed(4))}&-out.max=${encodeURIComponent(starLimit)}&-out=RAJ2000,DEJ2000,Vmag,Bmag&Vmag=${encodeURIComponent('<' + params.mag.toFixed(2))}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`UCAC4 query failed: ${response.status}`);

      const text = await response.text();
      const stars = this.parseVizierStars(text);

      if (stars.length > 0) {
        console.log(`✓ Loaded ${stars.length} stars from UCAC4`);
        this.addDynamicStars(stars, false);
      }
    } catch (error) {
      // Silently ignore - dynamic loading is optional
    }
  }

  /**
   * Query SIMBAD for objects in a region (for fainter stars up to ~20+ mag)
   */
  async querySimbadStars(ra, dec, fov) {
    const radius = Math.max(fov * 0.7, 0.1);
    const magLimit = Math.min(25, this.currentMagnitude);
    const starLimit = 5000;

    const params = this.validateQueryParams(ra, dec, radius, magLimit);
    if (!params) return;

    console.log(`🌟 Querying SIMBAD: RA=${params.ra.toFixed(2)}°, Dec=${params.dec.toFixed(2)}°, radius=${params.radius.toFixed(2)}°, mag<${params.mag.toFixed(1)}`);

    const query = `
      SELECT TOP ${starLimit}
        ra, dec, flux as mag, main_id as name, otype as type
      FROM basic
      WHERE 1=CONTAINS(
        POINT('ICRS', ra, dec),
        CIRCLE('ICRS', ${params.ra.toFixed(6)}, ${params.dec.toFixed(6)}, ${params.radius.toFixed(6)})
      )
      AND flux < ${params.mag.toFixed(2)}
    `;

    try {
      const response = await fetch('https://simbad.u-strasbg.fr/simbad/sim-tap/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          REQUEST: 'doQuery',
          LANG: 'ADQL',
          FORMAT: 'json',
          QUERY: query
        })
      });

      if (!response.ok) {
        throw new Error(`SIMBAD query failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.data && data.data.length > 0) {
        console.log(`✓ Loaded ${data.data.length} objects from SIMBAD`);
        this.addDynamicStars(data.data, true);
      }
    } catch (error) {
      // Silently ignore - dynamic loading is optional
    }
  }

  /**
   * Query VizieR for deep sky objects (galaxies, nebulae, clusters)
   */
  async queryVizierDSOs(ra, dec, fov) {
    // Only query when zoomed in enough to see DSOs
    if (fov > 10) return;
    if (this.isQueryingDSO) return;
    this.isQueryingDSO = true;

    const radius = Math.max(fov * 0.8, 0.1);
    const magLimit = Math.min(18, this.currentMagnitude);

    // Validate parameters
    const params = this.validateQueryParams(ra, dec, radius, magLimit);
    if (!params) {
      this.isQueryingDSO = false;
      return;
    }

    console.log(`🌟 Querying VizieR DSOs: RA=${params.ra.toFixed(2)}°, Dec=${params.dec.toFixed(2)}°, radius=${params.radius.toFixed(2)}°, mag<${params.mag.toFixed(1)}`);

    // Query NGC/IC catalog via VizieR URL interface
    const url = `https://vizier.cds.unistra.fr/viz-bin/votable?-source=VII/118/ngc2000&-c=${encodeURIComponent(params.ra.toFixed(6) + ' ' + params.dec.toFixed(6))}&-c.rd=${encodeURIComponent(params.radius.toFixed(4))}&-out.max=1000&-out=RAJ2000,DEJ2000,Bmag,MajAxis,MinAxis,NGC,IC,Name,Type&Bmag=${encodeURIComponent('<' + params.mag.toFixed(2))}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`VizieR DSO query failed: ${response.status}`);

      const text = await response.text();
      const dsos = this.parseVizierDSOs(text);

      if (dsos.length > 0) {
        console.log(`✓ Loaded ${dsos.length} DSOs from VizieR`);
        this.addDynamicDSOs(dsos);
      }
    } catch (error) {
      // Silently ignore - dynamic loading is optional
    }

    this.isQueryingDSO = false;
  }

  /**
   * Parse VizieR VOTable response for DSOs
   */
  parseVizierDSOs(votableText) {
    const dsos = [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(votableText, 'text/xml');
      const rows = doc.querySelectorAll('TABLEDATA TR');

      rows.forEach(row => {
        const cells = row.querySelectorAll('TD');
        if (cells.length >= 6) {
          const ra = parseFloat(cells[0]?.textContent);
          const dec = parseFloat(cells[1]?.textContent);
          const mag = parseFloat(cells[2]?.textContent) || 15;
          const sizeMajor = parseFloat(cells[3]?.textContent) || 1;
          const sizeMinor = parseFloat(cells[4]?.textContent) || sizeMajor;
          const ngc = cells[5]?.textContent?.trim();
          const ic = cells[6]?.textContent?.trim();
          const name = cells[7]?.textContent?.trim();
          const type = cells[8]?.textContent?.trim() || 'DSO';

          if (!isNaN(ra) && !isNaN(dec) && ra >= 0 && ra <= 360 && dec >= -90 && dec <= 90) {
            dsos.push({
              ra, dec, mag,
              size_major: sizeMajor,
              size_minor: sizeMinor,
              name: ngc ? `NGC${ngc}` : (ic ? `IC${ic}` : name),
              type: type
            });
          }
        }
      });
    } catch (e) {
      // Silent fail
    }
    return dsos;
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
    const pos = this.raDecToCartesian(dso.ra, dso.dec, radius);

    // Calculate magnitude-based intensity (brighter = more visible halo)
    const mag = dso.mag || 10;
    const magIntensity = Math.max(0.02, Math.min(0.25, (10 - mag) / 24));

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
    const baseOpacity = Math.max(0.1, Math.min(0.6, (10 - mag) / 10));
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
      const pos = this.raDecToCartesian(star.ra, star.dec, radius);
      positions.push(pos.x, pos.y, pos.z);

      const color = this.spectralTypeToColor(null, star.ci);
      colors.push(color[0], color[1], color[2]);

      const size = this.magnitudeToSize(star.mag);
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
      vertexShader: STAR_VERTEX_SHADER,
      fragmentShader: STAR_FRAGMENT_SHADER,
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

// Start the application when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  window.app = new SkyMapApp();
});
