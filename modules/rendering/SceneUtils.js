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
