/**
 * @fileoverview How a star looks: its colour from the B-V index and its size
 * and brightness from its magnitude, drawn as a point with a sharp core and a
 * faint glow. Shared by the catalogue star field and the stars loaded while
 * zooming, so both look the same.
 *
 * Brightness model (written from the published methods, not from any app's
 * code; the approach follows Stellarium's):
 * - Pogson's law: each magnitude is a flux ratio of 10^0.4.
 * - Flux is compressed with Schlick's logarithmic tone mapping (C. Schlick,
 *   "Quantization techniques for visualization of high dynamic range
 *   pictures", 1994), so a star 100 times brighter than the faintest shown
 *   draws a few pixels wider, not 100 times wider.
 * - A star too small to cover a pixel keeps a minimum size and fades
 *   instead, so faint stars dim out smoothly rather than flickering.
 *
 * Colour: B-V to temperature with Ballesteros' formula (EPL 97, 34008, 2012),
 * temperature to CIE xy along the Planckian locus with the cubic fits of Kim
 * et al. (US patent 7,024,034, 2006), then to sRGB.
 */

import {STAR_LOOK, STARS} from '../core/Constants.js';
import {getRenderPixelRatio} from './SceneUtils.js';
import {FADE_MS} from '../core/Utils.js';

/**
 * Uniforms every star material shares, so one resize updates them all.
 * @const {!Object<string, {value: number}>}
 */
const SHARED_UNIFORMS = {
  screenScale: {value: 1},
  pixelRatio: {value: 1},
  /** Drawing buffer size in pixels, to turn clip space into gl_FragCoord. */
  viewport: {value: {x: 1, y: 1}},
};

/** Typical B-V of each spectral class, for stars without a measured index. */
const CLASS_BV = {O: -0.32, B: -0.16, A: 0.0, F: 0.42, G: 0.66, K: 1.1, M: 1.55};

/**
 * Star surface temperature from its B-V colour index (Ballesteros 2012).
 * @param {number} bv - B-V index
 * @returns {number} Kelvin
 */
export function bvToTemperature(bv) {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

/**
 * Colour of a black body seen on screen, normalised so its brightest channel
 * is 1 (brightness comes from the magnitude, not the colour).
 * @param {number} kelvin - Temperature
 * @returns {!Array<number>} sRGB [r, g, b], each 0-1
 */
export function temperatureToRgb(kelvin) {
  const t = Math.min(25000, Math.max(1667, kelvin));
  const t1 = 1e3 / t;
  const t2 = t1 * t1;
  const t3 = t2 * t1;
  // Planckian locus chromaticity (Kim et al.).
  const x = t <= 4000 ?
      -0.2661239 * t3 - 0.2343589 * t2 + 0.8776956 * t1 + 0.179910 :
      -3.0258469 * t3 + 2.1070379 * t2 + 0.2226347 * t1 + 0.240390;
  const x2 = x * x;
  const x3 = x2 * x;
  let y;
  if (t <= 2222) y = -1.1063814 * x3 - 1.34811020 * x2 + 2.18555832 * x - 0.20219683;
  else if (t <= 4000) y = -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867;
  else y = 3.0817580 * x3 - 5.87338670 * x2 + 3.75112997 * x - 0.37001483;

  // xyY (Y = 1) to XYZ to linear sRGB (D65).
  const X = x / y;
  const Z = (1 - x - y) / y;
  const linear = [
    3.2406 * X - 1.5372 - 0.4986 * Z,
    -0.9689 * X + 1.8758 + 0.0415 * Z,
    0.0557 * X - 0.2040 + 1.0570 * Z,
  ].map((c) => Math.max(0, c));
  const max = Math.max(...linear);
  return linear.map((c) => {
    const v = c / max;
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  });
}

/**
 * Display colour of a star. Real stars look paler than their black-body
 * colour, so the colour is mixed toward white.
 * @param {?number|undefined} bv - B-V index, when measured
 * @param {?string=} spectralType - Spectral type (e.g. 'K5III'), the fallback
 * @returns {!Array<number>} [r, g, b], each 0-1
 */
export function starColor(bv, spectralType = null) {
  let index = Number.isFinite(bv) ? bv : CLASS_BV[spectralType?.charAt(0).toUpperCase()];
  if (index === undefined) return [1, 1, 1];
  index = Math.min(2.5, Math.max(-0.4, index));
  const s = STAR_LOOK.COLOR_SATURATION;
  return temperatureToRgb(bvToTemperature(index)).map((c) => 1 - s + s * c);
}

/**
 * Size and brightness of a star on screen. The vertex shader below computes
 * the same thing on the GPU; this copy documents and tests the model.
 * @param {number} mag - Star magnitude
 * @param {number} magLimit - Faintest magnitude shown
 * @param {number=} screenScale - Screen size factor (see updateStarScreen)
 * @returns {{radius: number, intensity: number}} Core radius in CSS px, and
 *     brightness 0-1 (0: not drawn)
 */
export function starDisc(mag, magLimit, screenScale = 1) {
  const p = STAR_LOOK.TONE_CONTRAST;
  const flux = Math.pow(10, -0.4 * (mag - magLimit));
  const refFlux = Math.pow(10, -0.4 * (STAR_LOOK.REFERENCE_MAG - magLimit));
  const level = Math.log(1 + p * flux) / Math.log(1 + p * refFlux);
  let radius = STAR_LOOK.RADIUS_PX * screenScale * Math.pow(level, STAR_LOOK.RADIUS_EXPONENT);
  let intensity = Math.min(1, Math.pow(level, 1 / 2.2));
  if (radius < STAR_LOOK.CULL_RADIUS_PX) return {radius: 0, intensity: 0};
  if (radius < STAR_LOOK.MIN_RADIUS_PX) {
    const f = (radius - STAR_LOOK.CULL_RADIUS_PX) /
        (STAR_LOOK.MIN_RADIUS_PX - STAR_LOOK.CULL_RADIUS_PX);
    intensity *= f * f;
    radius = STAR_LOOK.MIN_RADIUS_PX;
  }
  return {radius: Math.min(radius, STAR_LOOK.MAX_RADIUS_PX), intensity};
}

/** GLSL for starDisc's tone curve: the level and core radius of a star. */
const STAR_LEVEL_GLSL = `
  float starLevel(float mag, float magLimit) {
    const float P = ${STAR_LOOK.TONE_CONTRAST.toFixed(3)};
    float flux = pow(10.0, -0.4 * (mag - magLimit));
    float refFlux = pow(10.0, -0.4 * (${STAR_LOOK.REFERENCE_MAG.toFixed(3)} - magLimit));
    return log(1.0 + P * flux) / log(1.0 + P * refFlux);
  }
  float starRadius(float level, float screenScale) {
    return ${STAR_LOOK.RADIUS_PX.toFixed(3)} * screenScale *
        pow(level, ${STAR_LOOK.RADIUS_EXPONENT.toFixed(3)});
  }
`;

const VERTEX_SHADER = `
  attribute float magnitude;
  #ifdef FADE_IN
  attribute float bornAt;
  uniform float now;
  #endif
  uniform float magLimit;
  uniform float magFadeRange;
  uniform float screenScale;
  uniform float pixelRatio;
  varying vec3 vColor;
  varying float vIntensity;
  varying float vCore;
  ${STAR_LEVEL_GLSL}
  void main() {
    vColor = color;
    // Fade out across the magnitude limit (matches isWithinMagnitudeLimit).
    float fade = 1.0 - smoothstep(0.0, 1.0, (magnitude - magLimit) / magFadeRange);
    float level = starLevel(magnitude, magLimit);
    float radius = starRadius(level, screenScale);
    float intensity = min(1.0, pow(level, 1.0 / 2.2));
    // Sub-pixel stars keep a minimum size and dim instead.
    float small = clamp((radius - ${STAR_LOOK.CULL_RADIUS_PX.toFixed(3)}) /
        ${(STAR_LOOK.MIN_RADIUS_PX - STAR_LOOK.CULL_RADIUS_PX).toFixed(3)}, 0.0, 1.0);
    if (radius < ${STAR_LOOK.MIN_RADIUS_PX.toFixed(3)}) intensity *= small * small;
    radius = clamp(radius, ${STAR_LOOK.MIN_RADIUS_PX.toFixed(3)}, ${STAR_LOOK.MAX_RADIUS_PX.toFixed(3)});
    vIntensity = intensity * fade;
    #ifdef FADE_IN
    // Stars that just arrived fade in rather than popping up.
    vIntensity *= smoothstep(0.0, ${(FADE_MS / 1000).toFixed(3)}, now - bornAt);
    #endif
    // The sprite spans the glow; the core is a fraction of it.
    vCore = 1.0 / ${STAR_LOOK.GLOW_EXTENT.toFixed(3)};
    gl_PointSize = vIntensity > 0.004 ?
        2.0 * radius * ${STAR_LOOK.GLOW_EXTENT.toFixed(3)} * pixelRatio : 0.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vIntensity;
  varying float vCore;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (d > 1.0) discard;
    float core = 1.0 - smoothstep(vCore * 0.6, vCore * 1.2, d);
    float glow = (1.0 - smoothstep(0.0, 1.0, d)) * ${STAR_LOOK.GLOW_STRENGTH.toFixed(3)};
    float a = (core + glow) * vIntensity;
    // Additive: a star's core whitens a little where it saturates.
    gl_FragColor = vec4(mix(vColor, vec3(1.0), core * vIntensity * 0.35), a);
  }
`;

/**
 * Seconds on the clock fade-ins are measured by (see starClock).
 * @param {number=} nowMs - performance.now()
 * @returns {number}
 */
export function starClock(nowMs = performance.now()) {
  // Seconds, not ms: a float32 attribute keeps sub-ms precision for days.
  return nowMs / 1000;
}

/**
 * Material for a field of star points with `position`, `color` and
 * `magnitude` attributes.
 * @param {number} magLimit - Faintest magnitude shown
 * @param {{fadeIn: boolean}=} options - fadeIn: each star also has a
 *     `bornAt` attribute (starClock() when it arrived) and fades in from
 *     then, following the `now` uniform
 * @returns {!THREE.ShaderMaterial}
 */
export function createStarMaterial(magLimit, {fadeIn = false} = {}) {
  return new THREE.ShaderMaterial({
    defines: fadeIn ? {FADE_IN: ''} : {},
    uniforms: {
      magLimit: {value: magLimit},
      magFadeRange: {value: STARS.FADE_RANGE},
      now: {value: starClock()},
      ...SHARED_UNIFORMS,
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Size stars for the screen: bigger screens get slightly bigger stars.
 * Call at start-up and on resize.
 */
export function updateStarScreen() {
  const minSide = Math.min(window.innerWidth, window.innerHeight) || STAR_LOOK.REFERENCE_SCREEN_PX;
  SHARED_UNIFORMS.screenScale.value = Math.min(STAR_LOOK.MAX_SCREEN_SCALE,
      Math.max(STAR_LOOK.MIN_SCREEN_SCALE, minSide / STAR_LOOK.REFERENCE_SCREEN_PX));
  SHARED_UNIFORMS.pixelRatio.value = getRenderPixelRatio();
  SHARED_UNIFORMS.viewport.value = {
    x: window.innerWidth * SHARED_UNIFORMS.pixelRatio.value,
    y: window.innerHeight * SHARED_UNIFORMS.pixelRatio.value,
  };
}

/**
 * Make lines stop short of the stars at their ends, the gap growing with each
 * star's drawn size, so a line never runs into a star's disc. The cut is made
 * on screen, so it stays the same at every zoom. The geometry needs `segA`,
 * `segB` (both ends of the segment, on each of its two vertices) and `magA`,
 * `magB` (their magnitudes); see segmentEndAttributes.
 * @param {!THREE.Material} material - A LineBasicMaterial
 * @param {{value: number}} magLimit - Shared magnitude limit uniform
 * @param {{value: number}} lineFade - Shared 0-1 multiplier on the lines'
 *     opacity, for fading them all in or out together
 */
export function trimLinesAtStars(material, magLimit, lineFade) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SHARED_UNIFORMS, {magLimit, lineFade});
    shader.vertexShader = `
      attribute vec3 segA;
      attribute vec3 segB;
      attribute float magA;
      attribute float magB;
      uniform float magLimit;
      uniform float screenScale;
      uniform float pixelRatio;
      uniform vec2 viewport;
      varying vec2 vEndA;
      varying vec2 vEndB;
      varying vec2 vGap;
      ${STAR_LEVEL_GLSL}
      float endGap(float mag) {
        float r = max(starRadius(starLevel(mag, magLimit), screenScale),
            ${STAR_LOOK.MIN_RADIUS_PX.toFixed(3)});
        return (r + ${STAR_LOOK.LINE_GAP_PX.toFixed(3)}) * pixelRatio;
      }
      ${shader.vertexShader}`.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 clipA = projectionMatrix * modelViewMatrix * vec4(segA, 1.0);
      vec4 clipB = projectionMatrix * modelViewMatrix * vec4(segB, 1.0);
      vEndA = (clipA.xy / clipA.w * 0.5 + 0.5) * viewport;
      vEndB = (clipB.xy / clipB.w * 0.5 + 0.5) * viewport;
      // An end behind the camera has no place on screen to keep clear of.
      vGap = vec2(clipA.w > 0.0 ? endGap(magA) : 0.0, clipB.w > 0.0 ? endGap(magB) : 0.0);`);
    shader.fragmentShader = `
      uniform float lineFade;
      varying vec2 vEndA;
      varying vec2 vEndB;
      varying vec2 vGap;
      ${shader.fragmentShader}`.replace('#include <clipping_planes_fragment>', `
      if (distance(gl_FragCoord.xy, vEndA) < vGap.x ||
          distance(gl_FragCoord.xy, vEndB) < vGap.y) discard;
      #include <clipping_planes_fragment>`).replace('#include <tonemapping_fragment>', `
      gl_FragColor.a *= lineFade;
      #include <tonemapping_fragment>`);
  };
}

/**
 * Attributes trimLinesAtStars needs, for LineSegments vertices given as
 * consecutive pairs.
 * @param {!Array<number>} positions - x, y, z per vertex, two per segment
 * @param {!Array<number>} mags - Magnitude of the star at each vertex
 * @returns {{segA: !Array<number>, segB: !Array<number>, magA: !Array<number>,
 *     magB: !Array<number>}}
 */
export function segmentEndAttributes(positions, mags) {
  const segA = [];
  const segB = [];
  const magA = [];
  const magB = [];
  for (let v = 0; v < mags.length; v += 2) {
    const a = positions.slice(v * 3, v * 3 + 3);
    const b = positions.slice(v * 3 + 3, v * 3 + 6);
    // Both vertices of a segment carry both ends, so nothing interpolates.
    segA.push(...a, ...a);
    segB.push(...b, ...b);
    magA.push(mags[v], mags[v]);
    magB.push(mags[v + 1], mags[v + 1]);
  }
  return {segA, segB, magA, magB};
}
