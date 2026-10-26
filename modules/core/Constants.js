/**
 * @fileoverview Centralized constants for the Astrapedia application.
 * All magic numbers and configuration values are defined here for
 * better maintainability and consistency.
 */

/**
 * Celestial sphere and rendering constants.
 * @const {!Object}
 */
export const SPHERE = {
  /** Radius of the celestial sphere in Three.js units. */
  RADIUS: 100,
  /** Slightly smaller radius for grid lines. */
  GRID_RADIUS: 99,
  /** Radius for constellation lines (between grid and stars). */
  CONSTELLATION_RADIUS: 98.5,
  /** Radius for cardinal direction labels. */
  CARDINAL_RADIUS: 95,
  /** Radius for dynamic DSO sprites (slightly inside stars). */
  DSO_SPRITE_RADIUS: 99.5,
};

/**
 * Camera configuration constants.
 * @const {!Object}
 */
export const CAMERA = {
  /** Initial field of view in degrees. */
  DEFAULT_FOV: 60,
  /** Minimum FOV (maximum zoom). */
  MIN_FOV: 5,
  /** Maximum FOV (minimum zoom). */
  MAX_FOV: 120,
  /** Near clipping plane distance. */
  NEAR_PLANE: 0.01,
  /** Far clipping plane distance. */
  FAR_PLANE: 200,
  /** Initial camera distance from origin. */
  INITIAL_DISTANCE: 50,
  /** Minimum camera distance (closest zoom). */
  MIN_DISTANCE: 0.5,
  /** Maximum camera distance (inside sphere). */
  MAX_DISTANCE: 95,
  /** Smoothing factor for zoom interpolation, per 60 Hz frame (0-1). */
  ZOOM_LERP_SPEED: 0.12,
  /** Shortest fly-to animation (ms), for a target already near the view. */
  FLIGHT_MIN_MS: 500,
  /** Extra fly-to time per radian of travel (ms). */
  FLIGHT_MS_PER_RAD: 350,
  /** Longest fly-to animation (ms). */
  FLIGHT_MAX_MS: 1400,
  /** Default initial theta rotation. */
  DEFAULT_THETA: 0,
  /** Default initial phi rotation (equator). */
  DEFAULT_PHI: Math.PI / 2,
};

/**
 * Star rendering constants.
 * @const {!Object}
 */
export const STARS = {
  /** Default magnitude limit for visible stars. */
  DEFAULT_MAGNITUDE: 4.0,
  /** Maximum magnitude stored in data. */
  MAX_MAGNITUDE: 20,
  /** Magnitude fade range for smooth transitions. */
  FADE_RANGE: 1.5,
};

/**
 * How stars are drawn (see StarPoints.js for the model).
 * @const {!Object}
 */
export const STAR_LOOK = {
  /** Contrast of the logarithmic tone curve: higher squeezes bright stars. */
  TONE_CONTRAST: 2.2,
  /** Magnitude drawn at full size and brightness (about Sirius). */
  REFERENCE_MAG: -1.0,
  /** Core radius (CSS px) of the reference star on a reference screen. */
  RADIUS_PX: 4.0,
  /** How fast size grows with tone-mapped brightness. */
  RADIUS_EXPONENT: 0.55,
  /** Smallest core drawn (CSS px); smaller stars dim instead. */
  MIN_RADIUS_PX: 0.6,
  /** Cores below this (CSS px) aren't drawn at all. */
  CULL_RADIUS_PX: 0.25,
  /** Largest core (CSS px). */
  MAX_RADIUS_PX: 8.0,
  /** Glow radius as a multiple of the core radius. */
  GLOW_EXTENT: 3.0,
  /** Glow brightness relative to the core. */
  GLOW_STRENGTH: 0.12,
  /** How much of the black-body colour shows (0 white, 1 full). */
  COLOR_SATURATION: 0.75,
  /** Screen's shorter side (CSS px) that gets screen scale 1. */
  REFERENCE_SCREEN_PX: 500,
  /** Screen scale bounds. */
  MIN_SCREEN_SCALE: 0.8,
  MAX_SCREEN_SCALE: 1.4,
};

/**
 * Constellation line configuration.
 * @const {!Object}
 */
export const CONSTELLATIONS = {
  /** Color for constellation lines (hex). */
  LINE_COLOR: 0x3366aa,
  /** Opacity for constellation lines. */
  LINE_OPACITY: 0.35,
  /** Color when highlighted (hex). */
  HIGHLIGHT_COLOR: 0x4A9EFF,
  /** Opacity when highlighted. */
  HIGHLIGHT_OPACITY: 0.8,
  /** Display mode: all lines hidden. */
  MODE_OFF: 'off',
  /** Display mode: only nearest constellation visible. */
  MODE_FOCUS: 'focus',
  /** Display mode: all lines visible. */
  MODE_ALL: 'all',
  /** Max angular distance (degrees) from view center to match a constellation. */
  FOCUS_RADIUS: 40,
  /** Per-frame opacity interpolation speed (~0.5s fade). */
  FOCUS_LERP_SPEED: 0.08,
};

/**
 * Time simulation constants.
 * @const {!Object}
 */
export const TIME = {
  /** Speed multiplier for fast forward. */
  FAST_FORWARD_SPEED: 100,
  /** Speed multiplier for rewind. */
  REWIND_SPEED: -100,
  /** Real-time speed (1:1). */
  REALTIME_SPEED: 1,
  /** Paused speed. */
  PAUSED_SPEED: 0,
  /** Maximum time speed multiplier. */
  MAX_SPEED: 3600,
  /** Available speed presets: real-time, 1min/s, 10min/s, 1hr/s. */
  SPEED_PRESETS: [1, 60, 600, 3600],
};

/**
 * Dynamic data loading limits.
 * @const {!Object}
 */
export const DYNAMIC_DATA = {
  /** Maximum number of dynamically loaded stars. */
  MAX_STARS: 30000,
  /** Maximum number of dynamically loaded DSOs. */
  MAX_DSOS: 5000,
  /** Maximum number of cached query regions. */
  MAX_REGIONS: 100,
  /** FOV threshold for triggering dynamic loading. */
  LOAD_FOV_THRESHOLD: 10,
  /** Minimum time between dynamic queries (ms). */
  QUERY_THROTTLE: 2000,
};

/**
 * Power saving configuration.
 * @const {!Object}
 */
export const POWER_SAVING = {
  /** Time after the last interaction before animation stops (ms). */
  IDLE_THRESHOLD: 3000,
  /** Whether to reduce framerate when idle. */
  REDUCE_FRAMERATE_WHEN_IDLE: true,
  /** Target framerate when idle. */
  IDLE_FRAMERATE: 15,
};

/**
 * Default observer location (Paris, France).
 * @const {!Object}
 */
export const DEFAULT_LOCATION = {
  /** Latitude in degrees (north positive). */
  LATITUDE: 45,
  /** Longitude in degrees (east positive). */
  LONGITUDE: 0,
  /** Height above sea level in meters. */
  HEIGHT: 0,
};

/**
 * Astronomical constants.
 * @const {!Object}
 */
export const ASTRONOMY = {
  /** Julian Date of J2000.0 epoch. */
  J2000: 2451545.0,
  /** Days per Julian century. */
  DAYS_PER_CENTURY: 36525,
  /** Julian Date of Unix epoch. */
  UNIX_EPOCH_JD: 2440587.5,
  /** Obliquity of the ecliptic at J2000 (degrees). */
  OBLIQUITY_J2000: 23.439,
  /** Hours to degrees conversion. */
  HOURS_TO_DEGREES: 15.0,
};

/**
 * API endpoints for external data sources.
 * @const {!Object}
 */
export const API_ENDPOINTS = {
  VIZIER_TAP: 'https://tapvizier.u-strasbg.fr/TAPVizieR/tap/sync',
  SIMBAD: 'https://simbad.u-strasbg.fr/simbad/sim-tap/sync',
  NASA_IMAGES: 'https://images-api.nasa.gov/search',
  WIKIMEDIA: 'https://commons.wikimedia.org/w/api.php',
  CDS_HIPS: 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits',
  VIZIER_VOTABLE: 'https://vizier.cds.unistra.fr/viz-bin/votable',
  WIKIPEDIA_SUMMARY: 'https://en.wikipedia.org/api/rest_v1/page/summary/',
};

/**
 * Finder circle overlay constants.
 * @const {!Object}
 */
export const FINDER = {
  /** Telrad reticle ring diameters in degrees. */
  TELRAD_RINGS_DEG: [0.5, 2, 4],
  /** Typical 8x50 finder scope field in degrees. */
  DEFAULT_FINDER_FOV: 5,
  /** Rings smaller than this radius (CSS px) are not drawn. */
  MIN_RING_PX: 3,
  /** Rings closer than this in radius (CSS px) share one label. */
  LABEL_GAP_PX: 18,
  /** localStorage key for the overlay settings. */
  STORAGE_KEY: 'astrapedia_finder_settings',
};

/**
 * Telescope simulation constants.
 * @const {!Object}
 */
export const TELESCOPE = {
  /** Default telescope aperture diameter in mm. */
  DEFAULT_DIAMETER: 200,
  /** Default telescope focal length in mm. */
  DEFAULT_FOCAL_LENGTH: 1000,
  /** Default eyepiece focal length in mm. */
  DEFAULT_EYEPIECE_FL: 25,
  /** Default eyepiece apparent field of view in degrees. */
  DEFAULT_EYEPIECE_AFOV: 52,
  /** Minimum telescope field of view in degrees. */
  MIN_TELESCOPE_FOV: 0.1,
  /** Reticle diameter as a fraction of the screen's short side (CSS 70vmin). */
  RETICLE_SCREEN_FRACTION: 0.7,
  /** Maximum useful magnification multiplier (times aperture in mm). */
  MAX_MAG_MULTIPLIER: 2,
  /** localStorage key for telescope settings. */
  STORAGE_KEY: 'astrapedia_telescope_settings',
  /** Dark-adapted human eye pupil diameter in mm. */
  EYE_PUPIL_DIAMETER: 7,
  /** Default sky surface brightness (mag/arcsec², typical dark sky). */
  DEFAULT_SKY_SB: 21.5,
  /** Contrast threshold for diffuse object detection (mag). */
  DIFFUSE_CONTRAST_THRESHOLD: 0.5,
  /** Interval (ms) for checking which DSO is centered in telescope view. */
  CENTERED_DSO_CHECK_INTERVAL: 500,
  /** Exit pupil categories for descriptive labels. */
  EXIT_PUPIL_CATEGORIES: [
    {min: 6, label: 'Maximum brightness'},
    {min: 4, label: 'Bright, comfortable'},
    {min: 2, label: 'Good for detail'},
    {min: 1, label: 'High magnification'},
    {min: 0, label: 'Very high magnification'},
  ],
  /** Common telescope diameters (mm) for the quick-reference visibility table. */
  REFERENCE_DIAMETERS: [80, 114, 130, 150, 200, 250],
  /** Objects smaller than this (arcmin) get a detail-resolution penalty. */
  COMPACT_SIZE_THRESHOLD: 5,
  /** Maximum description margin penalty for very compact objects. */
  COMPACT_PENALTY_MAX: 5,
  /** Reference aperture (mm) at which compact penalty reaches zero. */
  COMPACT_PENALTY_REF_DIAMETER: 300,
  /** Multiplier for concentration boost on bright, large objects. */
  CONCENTRATION_BOOST_FACTOR: 1.0,
};

/**
 * Input handling constants.
 * @const {!Object}
 */
export const INPUT = {
  /** Minimum drag distance (pixels) to trigger drag vs click. */
  DRAG_THRESHOLD_PX: 5,
  /** Zoom factor per wheel event (multiplicative). */
  ZOOM_FACTOR: 1.15,
  /** Minimum FOV for extreme zoom (degrees). */
  MIN_FOV_EXTREME: 0.0001,
  /** Minimum FOV change to trigger cursor-aware zoom. */
  FOV_CHANGE_THRESHOLD: 0.001,
  /** Minimum phi angle (radians). */
  PHI_MIN_RAD: 0.1,
  /** Maximum phi angle (radians). */
  PHI_MAX_RAD: Math.PI - 0.1,
  /** Time window (ms) for inertia velocity calculation. */
  INERTIA_HISTORY_MS: 100,
  /** Max gap (ms) between taps to count as a double-tap. */
  DOUBLE_TAP_MS: 300,
  /** Max distance (px) between taps to count as a double-tap. */
  DOUBLE_TAP_DIST_PX: 40,
  /** FOV divisor for a double-tap / double-click zoom-in. */
  DOUBLE_TAP_ZOOM_FACTOR: 2,
  /** Mouse events this soon (ms) after a touch are browser-synthesized. */
  SYNTHETIC_MOUSE_MS: 800,
  /** Vertical drag (px) that halves or doubles the FOV in one-handed zoom. */
  ZOOM_SLIDE_PX_PER_DOUBLING: 180,
  /** Frame time factor for velocity (assumes ~60fps). */
  VELOCITY_FRAME_MS: 16,
  /** Friction coefficient for inertia (0-1). */
  INERTIA_FRICTION: 0.92,
  /** Minimum velocity to continue inertia. */
  MIN_VELOCITY: 0.05,
};
