/**
 * @fileoverview Centralized constants for the Sky Map application.
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
  /** Smoothing factor for zoom interpolation (0-1). */
  ZOOM_LERP_SPEED: 0.12,
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
  DEFAULT_MAGNITUDE: 8.0,
  /** Maximum magnitude stored in data. */
  MAX_MAGNITUDE: 20,
  /** Magnitude fade range for smooth transitions. */
  FADE_RANGE: 1.5,
  /** Minimum star visibility in shader. */
  MIN_VISIBILITY: 0.35,
  /** Base star opacity. */
  OPACITY: 0.9,
  /** Base size multiplier for stars. */
  BASE_SIZE: 300.0,
  /** Minimum size for faint stars. */
  MIN_SIZE: 0.8,
  /** Maximum size for bright stars. */
  MAX_SIZE: 8.0,
};

/**
 * DSO (Deep Sky Object) type colors for rendering.
 * Each color is an RGB array with values 0-1.
 * @const {!Object<string, !Array<number>>}
 */
export const DSO_COLORS = {
  /** Default color for unknown types. */
  DEFAULT: [0.5, 0.8, 1.0],
  /** Galaxy color (yellowish). */
  G: [1.0, 0.9, 0.6],
  /** Planetary nebula color (greenish). */
  PN: [0.6, 1.0, 0.6],
  /** Nebula types (pinkish). */
  Neb: [1.0, 0.6, 0.8],
  'Cl+N': [1.0, 0.6, 0.8],
  EmN: [1.0, 0.6, 0.8],
  HII: [1.0, 0.6, 0.8],
  /** Globular cluster color (pale yellow). */
  GCl: [1.0, 1.0, 0.8],
  /** Open cluster color (pale blue). */
  OCl: [0.8, 0.9, 1.0],
};

/**
 * Grid line configuration.
 * @const {!Object}
 */
export const GRID = {
  /** Spacing between RA lines in degrees. */
  RA_SPACING: 15,
  /** Spacing between Dec lines in degrees. */
  DEC_SPACING: 15,
  /** Color for grid lines (hex). */
  LINE_COLOR: 0x1a2535,
  /** Opacity for grid lines. */
  LINE_OPACITY: 0.2,
  /** Color for equatorial line (hex). */
  EQUATOR_COLOR: 0xcc5530,
  /** Opacity for equatorial line. */
  EQUATOR_OPACITY: 0.5,
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
  HIGHLIGHT_COLOR: 0x66aaff,
  /** Opacity when highlighted. */
  HIGHLIGHT_OPACITY: 0.8,
};

/**
 * Horizon and cardinal direction configuration.
 * @const {!Object}
 */
export const HORIZON = {
  /** Color for local horizon line (hex). */
  LINE_COLOR: 0x22c55e,
  /** Opacity for horizon line. */
  LINE_OPACITY: 0.9,
  /** Number of segments for horizon circle. */
  SEGMENTS: 128,
  /** Font for cardinal labels. */
  LABEL_FONT: 'bold 80px Arial',
  /** Color for cardinal labels (CSS). */
  LABEL_COLOR: '#22C55E',
  /** Base scale for cardinal label sprites. */
  LABEL_SCALE: 10,
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
  MAX_SPEED: 86400 * 7,
  /** Available speed presets. */
  SPEED_PRESETS: [0, 1, 10, 60, 600, 3600, 86400],
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
 * Image loading and caching configuration.
 * @const {!Object}
 */
export const IMAGES = {
  /** Maximum number of cached images. */
  MAX_CACHE_SIZE: 200,
  /** Screen fill percentage to show image. */
  SHOW_THRESHOLD: 0.5,
  /** Screen fill percentage to hide image (too zoomed). */
  HIDE_THRESHOLD: 1.0,
  /** Timeout for image fetch requests (ms). */
  FETCH_TIMEOUT: 10000,
  /** Maximum retries for failed image loads. */
  MAX_RETRIES: 2,
};

/**
 * Game mode configuration.
 * @const {!Object}
 */
export const GAME = {
  /** Points awarded for correct answer. */
  CORRECT_POINTS: 10,
  /** Bonus points for quick answer. */
  SPEED_BONUS: 5,
  /** Time threshold for speed bonus (seconds). */
  SPEED_THRESHOLD: 10,
  /** Tolerance for object selection (degrees). */
  SELECTION_TOLERANCE: 5,
};

/**
 * UI update intervals and throttling.
 * @const {!Object}
 */
export const THROTTLE = {
  /** Interval for image visibility updates (ms). */
  IMAGE_VISIBILITY: 100,
  /** Interval for extended object updates (ms). */
  EXTENDED_OBJECTS: 200,
  /** Interval for dynamic loading checks (ms). */
  DYNAMIC_CHECK: 500,
  /** Interval for info badge updates (ms). */
  INFO_BADGE: 2000,
  /** Idle timeout before stopping animation (ms). */
  IDLE_TIMEOUT: 30000,
};

/**
 * Power saving configuration.
 * @const {!Object}
 */
export const POWER_SAVING = {
  /** Time after interaction to consider idle (ms). */
  IDLE_THRESHOLD: 30000,
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
 * Shader code for star rendering.
 * @const {!Object}
 */
export const SHADERS = {
  VERTEX: `
    attribute float size;
    attribute float magnitude;
    uniform float magLimit;
    uniform float magFadeRange;
    varying vec3 vColor;
    varying float vVisibility;
    void main() {
      vColor = color;
      float magDiff = magnitude - magLimit;
      float intensityRange = max(12.0, magLimit + 2.0);
      if (magDiff <= 0.0) {
        float magIntensity = 1.0 - (magnitude + 2.0) / intensityRange;
        vVisibility = clamp(0.35 + 0.65 * magIntensity, 0.35, 1.0);
      } else if (magDiff < magFadeRange) {
        float fadeProgress = magDiff / magFadeRange;
        float baseMagIntensity = 1.0 - (magnitude + 2.0) / intensityRange;
        float baseVis = clamp(0.35 + 0.65 * baseMagIntensity, 0.35, 1.0);
        vVisibility = baseVis * (1.0 - smoothstep(0.0, 1.0, fadeProgress));
      } else {
        vVisibility = 0.0;
      }
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (300.0 / -mvPosition.z) * (vVisibility > 0.01 ? 1.0 : 0.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  FRAGMENT: `
    uniform float opacity;
    varying vec3 vColor;
    varying float vVisibility;
    void main() {
      if (vVisibility < 0.01) discard;
      float dist = length(gl_PointCoord - vec2(0.5));
      if (dist > 0.5) discard;
      float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
      vec3 brightColor = vColor * (0.5 + 0.5 * vVisibility);
      gl_FragColor = vec4(brightColor, alpha * opacity * vVisibility);
    }
  `,
};

/**
 * Cardinal directions with azimuth angles.
 * @const {!Array<!Object>}
 */
export const CARDINAL_DIRECTIONS = [
  {name: 'N', az: 0},
  {name: 'W', az: 90},
  {name: 'S', az: 180},
  {name: 'E', az: 270},
];

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
};

/**
 * Image source base URLs.
 * @const {!Object}
 */
export const IMAGE_SOURCES = {
  WEBB: 'https://cdn.esawebb.org/archives/images/screen/',
  HUBBLE: 'https://cdn.esahubble.org/archives/images/screen/',
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
  /** Maximum useful magnification multiplier (times aperture in mm). */
  MAX_MAG_MULTIPLIER: 2,
  /** localStorage key for telescope settings. */
  STORAGE_KEY: 'skymap_telescope_settings',
};
