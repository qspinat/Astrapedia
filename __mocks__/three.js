/**
 * @fileoverview Jest mock for THREE.js library.
 *
 * This mock handles ES module imports: `import * as THREE from 'three'`
 * It re-exports from global.THREE which is set up in tests/setup.js.
 *
 * The dual-mock approach is needed because:
 * - The app loads THREE.js from CDN (not via npm)
 * - Some modules use global.THREE (CoordinateUtils)
 * - Some modules use ES import (ClickHandler)
 *
 * Jest routes `import from 'three'` here via moduleNameMapper in jest.config.js.
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
