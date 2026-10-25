/**
 * @fileoverview Solar-system body photographs, cut out of their black
 * backgrounds and, for the Moon, shaded to the current phase.
 *
 * Shared by the sky sprite (PlanetRenderer) and the info panel
 * (SelectionManager), so both show the same disc.
 */

import {getPlanetImageSources} from '../data/PlanetImages.js';
import {moonIllumination} from '../core/MoonPhase.js';

/** Side of the composed square canvas, in pixels. */
const COMPOSED_SIZE = 512;

/** Night side of the Moon: near-opaque, slightly blue-black. */
const MOON_SHADOW_COLOR = 'rgba(10, 15, 28, 0.95)';

/**
 * Terminator geometry for a lunar phase.
 *
 * `phase` runs 0 at new moon, 0.5 at full, back to 1 at the next new — the
 * convention SolarSystem.calculateMoonPosition produces.
 *
 * `semiAxis` is the terminator ellipse's x semi-axis as a fraction of the
 * disc radius, signed by which way it bulges:
 *   -1  new moon      ellipse bulges across the lit side, whole disc shaded
 *    0  quarter       straight line, exactly half shaded
 *   +1  full moon     ellipse hugs the shaded limb, nothing shaded
 *
 * @param {number} phase - Lunar phase, 0 to 1
 * @returns {{illuminated: number, waxing: boolean, semiAxis: number}}
 */
export function moonShadowGeometry(phase) {
  // The lit fraction of a sphere seen head-on; the terminator ellipse's
  // semi-axis is then exactly 2k - 1 = -cos(2*pi*phase).
  const illuminated = moonIllumination(phase);
  return {
    illuminated,
    waxing: phase < 0.5,
    semiAxis: 2 * illuminated - 1,
  };
}

/**
 * Shade the night side of a Moon disc. Near full there is nothing to shade.
 * @param {!CanvasRenderingContext2D} ctx
 * @param {number} cx - Disc centre x
 * @param {number} cy - Disc centre y
 * @param {number} r - Disc radius
 * @param {number} phase - Lunar phase, 0 to 1
 */
export function drawMoonShadow(ctx, cx, cy, r, phase) {
  const {illuminated, waxing, semiAxis} = moonShadowGeometry(phase);
  if (illuminated >= 0.98) return;

  ctx.fillStyle = MOON_SHADOW_COLOR;
  ctx.beginPath();
  const rx = Math.abs(semiAxis) * r;
  if (waxing) {
    // Lit on the right: shade the left limb, top to bottom...
    ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, true);
    // ...then close along the terminator. A negative semi-axis bulges the
    // ellipse into the lit side (crescent), a positive one back toward the
    // shaded limb (gibbous).
    ctx.ellipse(cx, cy, rx, r, 0, Math.PI / 2, -Math.PI / 2, semiAxis < 0);
  } else {
    // Waning: mirrored, lit on the left.
    ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.ellipse(cx, cy, rx, r, 0, Math.PI / 2, -Math.PI / 2, semiAxis >= 0);
  }
  ctx.fill();
}

/**
 * Draw a body's disc, cut out of its photograph, filling a square canvas
 * edge to edge — so a sprite sized to the body's angular diameter shows the
 * disc at its true size — and shade it to `phase` when one is given.
 * @param {!HTMLCanvasElement} canvas - Target; resized to COMPOSED_SIZE
 * @param {!CanvasImageSource} image - Loaded photograph
 * @param {{x: number, y: number, diameter: number}} disc - From PlanetImages
 * @param {?number=} phase - Lunar phase to shade, or null for none
 * @returns {boolean} False if the canvas has no 2D context
 */
export function composeBodyDisc(canvas, image, disc, phase = null) {
  // Resizing reallocates the canvas; skip it on a repaint.
  if (canvas.width !== COMPOSED_SIZE) canvas.width = COMPOSED_SIZE;
  if (canvas.height !== COMPOSED_SIZE) canvas.height = COMPOSED_SIZE;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return false;

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const discPx = disc.diameter * width;
  const scale = COMPOSED_SIZE / discPx;
  const r = COMPOSED_SIZE / 2;

  ctx.clearRect(0, 0, COMPOSED_SIZE, COMPOSED_SIZE);
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(image,
      r - disc.x * width * scale, r - disc.y * height * scale,
      width * scale, height * scale);
  ctx.restore();

  if (phase !== null && phase !== undefined) drawMoonShadow(ctx, r, r, r, phase);
  return true;
}

/**
 * Load an image with CORS enabled, so it can be drawn to a canvas that is
 * then read back (texture upload, toDataURL).
 * @param {string} url
 * @returns {!Promise<!HTMLImageElement>}
 */
export function loadCorsImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

/** @type {!Map<string, !Promise<?{image: !HTMLImageElement, disc: ?Object}>>} */
const photoCache = new Map();

/**
 * Load a body's first photograph that works, once per session.
 * @param {string} name - Body name
 * @returns {!Promise<?{image: !HTMLImageElement, disc: ?Object}>} Null when
 *     no source loads (a failure is retried on the next call)
 */
function loadBodyPhoto(name) {
  if (!photoCache.has(name)) {
    const load = (async () => {
      for (const {url, disc} of getPlanetImageSources(name)) {
        try {
          return {image: await loadCorsImage(url), disc};
        } catch (e) {
          // Try the next source.
        }
      }
      photoCache.delete(name);
      return null;
    })();
    photoCache.set(name, load);
  }
  return photoCache.get(name);
}

/**
 * The body's photograph for the info panel: disc cut out and, for the Moon,
 * shaded to the phase.
 * @param {string} name - Body name
 * @param {?number=} phase - Lunar phase, or null for none
 * @returns {!Promise<?string>} Image URL (a PNG data URL when composed), or
 *     null when no source loads
 */
export async function renderBodyImage(name, phase = null) {
  const photo = await loadBodyPhoto(name);
  if (!photo) return null;
  if (!photo.disc) return photo.image.src;
  const canvas = document.createElement('canvas');
  return composeBodyDisc(canvas, photo.image, photo.disc, phase) ?
      canvas.toDataURL('image/png') : photo.image.src;
}
