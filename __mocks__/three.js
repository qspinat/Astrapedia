/**
 * @fileoverview Jest mock for THREE.js library.
 * Re-exports the global THREE object set up in tests/setup.js
 */

// Export classes from global THREE (set up in tests/setup.js)
export const Vector2 = global.THREE.Vector2;
export const Vector3 = global.THREE.Vector3;
export const Matrix3 = global.THREE.Matrix3;
export const Matrix4 = global.THREE.Matrix4;
export const Raycaster = global.THREE.Raycaster;
export const MathUtils = global.THREE.MathUtils;

// Default export for `import * as THREE from 'three'`
export default global.THREE;
