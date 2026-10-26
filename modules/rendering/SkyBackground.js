/**
 * @fileoverview What lies behind the stars: the sky's colour, which follows
 * the Sun through twilight, and the Milky Way, which fades under twilight,
 * moonlight and close zoom.
 *
 * Milky Way image: ESO/S. Brunier, CC BY 4.0
 * (https://www.eso.org/public/images/eso0932a/), reprojected to RA/Dec with
 * its stars removed by scripts/make_milkyway.py.
 */

import {SKY, SPHERE} from '../core/Constants.js';
import {clamp, lerp, safeGetJson, safeSetJson, smoothstep} from '../core/Utils.js';
import {freezeTransform} from './SceneUtils.js';
import {domCache} from '../ui/DOMCache.js';
import {createLogger} from '../core/Logger.js';

const logger = createLogger('SkyBackground');

/**
 * Sky colour by Sun altitude (degrees), brightest first. Muted: this is a map
 * for the night, and a true daylight blue would hide everything on it.
 * @const {!Array<{alt: number, rgb: !Array<number>}>}
 */
const SKY_COLORS = [
  {alt: 0, rgb: [0.10, 0.19, 0.34]},
  {alt: -6, rgb: [0.05, 0.08, 0.18]},
  {alt: -12, rgb: [0.012, 0.022, 0.055]},
  {alt: -18, rgb: [0, 0, 0]},
];

/**
 * Sky colour for a Sun altitude: day, civil, nautical and astronomical
 * twilight, then black.
 * @param {number} sunAltitude - Degrees
 * @returns {!Array<number>} [r, g, b], each 0-1
 */
export function skyColor(sunAltitude) {
  if (sunAltitude >= SKY_COLORS[0].alt) return [...SKY_COLORS[0].rgb];
  for (let i = 1; i < SKY_COLORS.length; i++) {
    const hi = SKY_COLORS[i - 1];
    const lo = SKY_COLORS[i];
    if (sunAltitude >= lo.alt) {
      const t = (sunAltitude - lo.alt) / (hi.alt - lo.alt);
      return lo.rgb.map((c, k) => lerp(c, hi.rgb[k], t));
    }
  }
  return [0, 0, 0];
}

/**
 * How strongly the Milky Way shows (0-1).
 * @param {{sunAltitude: number, moonAltitude: number, moonLit: number}} sky
 * @param {number} viewDeg - Sky field of view, degrees
 * @returns {number}
 */
export function milkyWayStrength({sunAltitude, moonAltitude, moonLit}, viewDeg) {
  // Gone by the end of nautical twilight's darker half, full once it's dark.
  const darkness = 1 - smoothstep((sunAltitude - SKY.MILKY_WAY_DARK_DEG) /
      (SKY.MILKY_WAY_GONE_DEG - SKY.MILKY_WAY_DARK_DEG));
  // A bright Moon well up washes most of it out.
  const moonUp = smoothstep((moonAltitude + 2) / 12);
  const moon = 1 - SKY.MOON_WASHOUT * moonLit * moonUp;
  // Zoomed in close, it is only a blur behind the stars.
  const zoom = smoothstep((viewDeg - SKY.MILKY_WAY_MIN_VIEW_DEG) /
      (SKY.MILKY_WAY_FULL_VIEW_DEG - SKY.MILKY_WAY_MIN_VIEW_DEG));
  return SKY.MILKY_WAY_BRIGHTNESS * darkness * moon * zoom;
}

const VERTEX_SHADER = `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Each pixel looks up its own RA/Dec, so the image lines up exactly however
// coarse the sphere's triangles are.
const FRAGMENT_SHADER = `
  uniform sampler2D map;
  uniform float strength;
  varying vec3 vDir;
  const float PI = 3.141592653589793;
  void main() {
    vec3 d = normalize(vDir);
    float ra = atan(-d.z, d.x);
    if (ra < 0.0) ra += 2.0 * PI;
    float dec = asin(clamp(d.y, -1.0, 1.0));
    vec3 light = texture2D(map, vec2(ra / (2.0 * PI), 0.5 + dec / PI)).rgb;
    // The long-exposure photo is more colourful than the eye sees it.
    float grey = dot(light, vec3(0.299, 0.587, 0.114));
    light = mix(vec3(grey), light, ${SKY.MILKY_WAY_SATURATION.toFixed(3)});
    gl_FragColor = vec4(light * strength, 1.0);
  }
`;

/**
 * Owns the sky colour and the Milky Way.
 */
export class SkyBackground {
  /**
   * @param {!Object} dependencies
   * @param {!THREE.Scene} dependencies.scene - Its background is the sky colour
   * @param {!THREE.Object3D} dependencies.celestialSphere - Turns with the sky
   * @param {function(): void=} dependencies.requestRender
   */
  constructor(dependencies) {
    /** @private @const */
    this.scene_ = dependencies.scene;
    /** @private @const */
    this.celestialSphere_ = dependencies.celestialSphere;
    /** @private @const */
    this.requestRender_ = dependencies.requestRender || (() => {});

    /** @private {?THREE.Mesh} */
    this.milkyWay_ = null;
    /** @private {?{sunAltitude: number, moonAltitude: number, moonLit: number}} */
    this.sky_ = null;
    /** @private {number} Sky field of view, degrees */
    this.viewDeg_ = 60;
    /** @private {boolean} */
    this.showMilkyWay_ = safeGetJson(SKY.MILKY_WAY_STORAGE_KEY) !== false;
  }

  /**
   * Build the Milky Way sphere, load its image and bind the settings toggle.
   */
  initialize() {
    const texture = new THREE.TextureLoader().load(SKY.MILKY_WAY_URL,
        () => this.requestRender_(),
        undefined,
        (error) => logger.warn('Milky Way image failed to load:', error));
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    // No mipmaps: their selection jumps at the RA 0/360 seam.
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const material = new THREE.ShaderMaterial({
      uniforms: {map: {value: texture}, strength: {value: 0}},
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });
    this.milkyWay_ = new THREE.Mesh(
        new THREE.SphereGeometry(SPHERE.RADIUS, 96, 48), material);
    // Drawn first, behind everything.
    this.milkyWay_.renderOrder = -10;
    this.milkyWay_.visible = false;
    freezeTransform(this.milkyWay_);
    this.celestialSphere_.add(this.milkyWay_);

    const toggle = domCache.get('milky-way-toggle');
    if (toggle) {
      toggle.checked = this.showMilkyWay_;
      toggle.addEventListener('change', () => this.setShowMilkyWay(toggle.checked));
    }
  }

  /**
   * @param {boolean} show - Whether to draw the Milky Way
   */
  setShowMilkyWay(show) {
    this.showMilkyWay_ = show;
    safeSetJson(SKY.MILKY_WAY_STORAGE_KEY, show);
    this.apply_();
  }

  /**
   * Follow the Sun and Moon.
   * @param {?{sunAltitude: number, moonAltitude: number, moonLit: number}} sky
   *     From sunAndMoon; null keeps the night look
   */
  setSky(sky) {
    this.sky_ = sky;
    this.apply_();
  }

  /**
   * Follow the zoom.
   * @param {number} viewDeg - Sky field of view, degrees
   */
  setViewFov(viewDeg) {
    this.viewDeg_ = viewDeg;
    this.apply_();
  }

  /**
   * Push the current state into the scene.
   * @private
   */
  apply_() {
    const sky = this.sky_ ?? {sunAltitude: -90, moonAltitude: -90, moonLit: 0};
    let changed = false;

    const [r, g, b] = skyColor(sky.sunAltitude);
    const background = this.scene_.background;
    if (background?.setRGB &&
        (background.r !== r || background.g !== g || background.b !== b)) {
      background.setRGB(r, g, b);
      changed = true;
    }

    if (this.milkyWay_) {
      const strength = this.showMilkyWay_ ?
          clamp(milkyWayStrength(sky, this.viewDeg_), 0, 1) : 0;
      const uniform = this.milkyWay_.material.uniforms.strength;
      if (Math.abs(uniform.value - strength) > 1e-4 ||
          this.milkyWay_.visible !== strength > 0) {
        uniform.value = strength;
        this.milkyWay_.visible = strength > 0;
        changed = true;
      }
    }
    if (changed) this.requestRender_();
  }

  /**
   * Remove the Milky Way from the scene.
   */
  dispose() {
    if (!this.milkyWay_) return;
    this.celestialSphere_.remove(this.milkyWay_);
    this.milkyWay_.geometry.dispose();
    this.milkyWay_.material.uniforms.map.value?.dispose();
    this.milkyWay_.material.dispose();
    this.milkyWay_ = null;
  }
}
