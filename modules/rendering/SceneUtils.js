/**
 * @fileoverview Scene-graph helpers shared by the renderers.
 */

// THREE is loaded globally via script tag in app.html
/* global THREE */

/**
 * Take an object out of THREE's per-frame matrix recomputation.
 *
 * WebGLRenderer.render() calls scene.updateMatrixWorld() every frame, which
 * walks the whole graph and recomposes the local matrix of every object whose
 * matrixAutoUpdate is set — regardless of whether it moved, and regardless of
 * whether it is visible. With ~4,200 sprites and lines on the celestial
 * sphere that is ~4,200 Matrix4 compositions per frame, a quarter of a million
 * a second at 60fps, for objects that never move relative to their parent.
 *
 * The parent is unaffected: the celestial sphere still rotates for sidereal
 * time and the tilt group still rotates for latitude. Their children's *world*
 * matrices are still recomputed when a parent moves — only the redundant
 * recomposition of an unchanged *local* transform is skipped.
 *
 * Anything that mutates position, scale or rotation after this call must
 * follow the change with object.updateMatrix().
 *
 * @param {!THREE.Object3D} object - Object whose transform is now fixed
 * @returns {!THREE.Object3D} The same object, for chaining
 */
export function freezeTransform(object) {
  object.matrixAutoUpdate = false;
  object.updateMatrix();
  return object;
}

/** @private {?THREE.CanvasTexture} Lazily built, shared by every halo. */
let sharedHaloTexture = null;

/**
 * The radial-gradient texture used by every DSO halo sprite.
 *
 * Each halo used to bake its own 128x128 canvas, varying only by a type tint
 * and a magnitude-derived alpha. That is ~1,729 distinct textures for the
 * bundled catalog — about 113 MB of GPU memory, plus a texture bind per
 * sprite per frame — to express what is really four colours and a scalar.
 *
 * This texture is white with the alpha ramp normalised to 1.0 at the centre,
 * so callers reproduce the original appearance with:
 *   material.color -> the type tint
 *   material.opacity -> the magnitude intensity
 * Both are per-material, and materials are cheap; the texture was the cost.
 *
 * Shared, so it must outlive any individual sprite: it is marked
 * `isShared` and {@link disposeSpriteTexture} skips it.
 *
 * @returns {!THREE.CanvasTexture}
 */
export function getSharedHaloTexture() {
  if (sharedHaloTexture) return sharedHaloTexture;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);
  const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // Same stops as the per-sprite gradients this replaces, with alpha scaled
  // to 1.0 at the centre so material.opacity carries the magnitude term.
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  sharedHaloTexture = new THREE.CanvasTexture(canvas);
  sharedHaloTexture.isShared = true;
  return sharedHaloTexture;
}

/**
 * Dispose a sprite's texture unless it is shared with other sprites.
 * @param {!THREE.Sprite} sprite - Sprite being torn down
 */
export function disposeSpriteTexture(sprite) {
  const map = sprite.material?.map;
  if (map && !map.isShared) map.dispose();
}

/** Test seam: forget the cached texture so the next call rebuilds it. */
export function resetSharedHaloTexture() {
  sharedHaloTexture = null;
}
