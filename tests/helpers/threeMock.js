/**
 * @fileoverview Shared THREE.js test double.
 *
 * The app loads THREE.js from a CDN, so there is no npm package to import in
 * tests. `tests/setup.js` provides the math primitives (Vector2, Vector3,
 * Matrix3, Matrix4, Raycaster, MathUtils) that pure-math modules need. This
 * file adds the scene-graph half — Object3D and its subclasses, geometries,
 * materials, textures — which renderer modules need in order to be constructed
 * at all.
 *
 * These are real classes with real state, not `jest.fn()` factories, so
 * `instanceof` works and mutations persist. That matters for assertions like
 * "this sprite's matrix was computed once, not every frame".
 *
 * Usage — call at the top of a test file, before importing the module under
 * test:
 *
 *   import {installThreeMock, threeStats} from './helpers/threeMock.js';
 *   installThreeMock();
 *   const {StarFieldRenderer} = await import('../modules/rendering/...');
 *
 * `installThreeMock()` augments the existing `global.THREE` in place rather
 * than replacing it. Replacing it would strand `__mocks__/three.js`, which
 * captures `global.THREE` by reference when the first `import 'three'` is
 * evaluated.
 */

import {jest} from '@jest/globals';

/**
 * Counters for things worth asserting on but awkward to observe directly.
 * Reset by `installThreeMock()`; also resettable on demand via
 * `resetThreeStats()`. These are plain numbers, not jest mocks, so the global
 * `jest.clearAllMocks()` in `tests/setup.js` does not touch them.
 */
export const threeStats = {
  updateMatrixCalls: 0,
  updateMatrixWorldCalls: 0,
  geometryDisposals: 0,
  materialDisposals: 0,
  textureDisposals: 0,
};

/** Zeroes every counter in {@link threeStats}. */
export function resetThreeStats() {
  for (const key of Object.keys(threeStats)) {
    threeStats[key] = 0;
  }
}

/** Fallback used only if `tests/setup.js` has not run. */
class FallbackVector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  clone() {
    return new FallbackVector3(this.x, this.y, this.z);
  }
}

/**
 * Resolves Vector3 at construction time so we always use whichever definition
 * `tests/setup.js` installed, keeping vector identity consistent across the
 * two files.
 * @return {!Function}
 */
function vector3Class() {
  return (global.THREE && global.THREE.Vector3) || FallbackVector3;
}

/** Minimal Euler stand-in — the renderers only ever set/read x, y, z. */
class Euler {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
}

class Color {
  constructor(value) {
    this.r = 1;
    this.g = 1;
    this.b = 1;
    if (value !== undefined) this.set(value);
  }
  set(value) {
    if (typeof value === 'number') return this.setHex(value);
    if (value && typeof value === 'object') return this.copy(value);
    return this;
  }
  setHex(hex) {
    this.r = ((hex >> 16) & 255) / 255;
    this.g = ((hex >> 8) & 255) / 255;
    this.b = (hex & 255) / 255;
    return this;
  }
  setRGB(r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
    return this;
  }
  getHex() {
    return (Math.round(this.r * 255) << 16) ^
      (Math.round(this.g * 255) << 8) ^
      Math.round(this.b * 255);
  }
  copy(c) {
    this.r = c.r;
    this.g = c.g;
    this.b = c.b;
    return this;
  }
  clone() {
    return new Color().copy(this);
  }
  equals(c) {
    return this.r === c.r && this.g === c.g && this.b === c.b;
  }
}

class Object3D {
  constructor() {
    const V3 = vector3Class();
    this.position = new V3(0, 0, 0);
    this.scale = new V3(1, 1, 1);
    this.up = new V3(0, 1, 0);
    this.rotation = new Euler();
    this.matrix = new (global.THREE?.Matrix4 || Object)();
    this.matrixWorld = new (global.THREE?.Matrix4 || Object)();
    this.matrixAutoUpdate = true;
    this.visible = true;
    this.children = [];
    this.parent = null;
    this.userData = {};
    this.renderOrder = 0;
    this.name = '';
    /** Per-object count, for asserting a static object is computed once. */
    this.updateMatrixCount = 0;
  }

  updateMatrix() {
    this.updateMatrixCount++;
    threeStats.updateMatrixCalls++;
  }

  /**
   * Mirrors THREE's real traversal: recurses into children regardless of
   * visibility, and only recomputes the local matrix when matrixAutoUpdate is
   * set. This is what makes the matrixAutoUpdate optimization assertable.
   */
  updateMatrixWorld(force) {
    threeStats.updateMatrixWorldCalls++;
    if (this.matrixAutoUpdate) this.updateMatrix();
    for (const child of this.children) {
      child.updateMatrixWorld(force);
    }
  }

  add(...objects) {
    for (const object of objects) {
      if (object === this) continue;
      if (object.parent) object.parent.remove(object);
      object.parent = this;
      this.children.push(object);
    }
    return this;
  }

  remove(...objects) {
    for (const object of objects) {
      const index = this.children.indexOf(object);
      if (index !== -1) {
        this.children.splice(index, 1);
        object.parent = null;
      }
    }
    return this;
  }

  clear() {
    for (const child of [...this.children]) this.remove(child);
    return this;
  }

  traverse(callback) {
    callback(this);
    for (const child of [...this.children]) child.traverse(callback);
  }

  getObjectByName(name) {
    let found = null;
    this.traverse((o) => {
      if (!found && o.name === name) found = o;
    });
    return found;
  }
}

class Scene extends Object3D {
  constructor() {
    super();
    this.background = null;
    this.isScene = true;
  }
}

class Group extends Object3D {
  constructor() {
    super();
    this.isGroup = true;
  }
}

class BufferAttribute {
  constructor(array, itemSize) {
    this.array = array;
    this.itemSize = itemSize;
    this.count = array ? Math.floor(array.length / itemSize) : 0;
    this.needsUpdate = false;
  }
  getX(i) {
    return this.array[i * this.itemSize];
  }
  getY(i) {
    return this.array[i * this.itemSize + 1];
  }
  getZ(i) {
    return this.array[i * this.itemSize + 2];
  }
  setXYZ(i, x, y, z) {
    this.array[i * this.itemSize] = x;
    this.array[i * this.itemSize + 1] = y;
    this.array[i * this.itemSize + 2] = z;
    return this;
  }
}

class Float32BufferAttribute extends BufferAttribute {
  constructor(array, itemSize) {
    super(array instanceof Float32Array ? array : new Float32Array(array),
        itemSize);
  }
}

class BufferGeometry {
  constructor() {
    this.attributes = {};
    this.boundingSphere = null;
    this.disposed = false;
    this.drawRange = {start: 0, count: Infinity};
  }
  setAttribute(name, attribute) {
    this.attributes[name] = attribute;
    return this;
  }
  getAttribute(name) {
    return this.attributes[name];
  }
  deleteAttribute(name) {
    delete this.attributes[name];
    return this;
  }
  setFromPoints(points) {
    const array = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
      array[i * 3] = p.x;
      array[i * 3 + 1] = p.y;
      array[i * 3 + 2] = p.z;
    });
    this.setAttribute('position', new Float32BufferAttribute(array, 3));
    /** Retained so tests can assert on the source points directly. */
    this.pointsFrom = points;
    return this;
  }
  setDrawRange(start, count) {
    this.drawRange = {start, count};
    return this;
  }
  computeBoundingSphere() {
    const V3 = vector3Class();
    this.boundingSphere = {radius: 1, center: new V3(0, 0, 0)};
  }
  dispose() {
    this.disposed = true;
    threeStats.geometryDisposals++;
  }
  clone() {
    const geometry = new BufferGeometry();
    geometry.attributes = {...this.attributes};
    return geometry;
  }
}

class Texture {
  constructor(image = null) {
    this.image = image;
    this.needsUpdate = false;
    this.disposed = false;
  }
  dispose() {
    this.disposed = true;
    threeStats.textureDisposals++;
  }
  clone() {
    return new Texture(this.image);
  }
}

class CanvasTexture extends Texture {
  constructor(canvas) {
    super(canvas);
    this.isCanvasTexture = true;
  }
}

/**
 * Texture loader whose requests are inspectable and resolved manually, so a
 * test can assert what happens when a load lands after the sprite it targeted
 * was disposed.
 */
class TextureLoader {
  constructor() {
    this.requests = [];
    this.crossOrigin = 'anonymous';
    this.path = '';
  }
  setCrossOrigin(value) {
    this.crossOrigin = value;
    return this;
  }
  setPath(value) {
    this.path = value;
    return this;
  }
  load(url, onLoad, onProgress, onError) {
    const texture = new Texture({src: url});
    const request = {url, onLoad, onProgress, onError, texture};
    this.requests.push(request);
    TextureLoader.pending.push(request);
    if (TextureLoader.autoResolve) {
      Promise.resolve().then(() => onLoad && onLoad(texture));
    }
    return texture;
  }
}
/** @type {!Array<!Object>} Every outstanding request, across all loaders. */
TextureLoader.pending = [];
/** When true, loads resolve on the microtask queue instead of manually. */
TextureLoader.autoResolve = false;
/** Resolves every pending request successfully. */
TextureLoader.resolveAll = function() {
  const pending = [...TextureLoader.pending];
  TextureLoader.pending.length = 0;
  for (const request of pending) {
    if (request.onLoad) request.onLoad(request.texture);
  }
};
/** Fails every pending request. */
TextureLoader.failAll = function(error = new Error('load failed')) {
  const pending = [...TextureLoader.pending];
  TextureLoader.pending.length = 0;
  for (const request of pending) {
    if (request.onError) request.onError(error);
  }
};
TextureLoader.reset = function() {
  TextureLoader.pending.length = 0;
  TextureLoader.autoResolve = false;
};

class Material {
  constructor(params = {}) {
    const {color, ...rest} = params;
    this.color = new Color(color === undefined ? 0xffffff : color);
    this.opacity = 1;
    this.transparent = false;
    this.visible = true;
    this.depthWrite = true;
    this.depthTest = true;
    this.blending = NormalBlending;
    this.map = null;
    this.disposed = false;
    this.needsUpdate = false;
    Object.assign(this, rest);
  }
  dispose() {
    this.disposed = true;
    threeStats.materialDisposals++;
  }
  clone() {
    const clone = new this.constructor();
    Object.assign(clone, this, {color: this.color.clone(), disposed: false});
    return clone;
  }
}

class SpriteMaterial extends Material {}
class PointsMaterial extends Material {}
class MeshBasicMaterial extends Material {}

class LineBasicMaterial extends Material {
  constructor(params = {}) {
    super(params);
    if (this.linewidth === undefined) this.linewidth = 1;
  }
}

class ShaderMaterial extends Material {
  constructor(params = {}) {
    super(params);
    if (this.uniforms === undefined) this.uniforms = {};
    if (this.vertexShader === undefined) this.vertexShader = '';
    if (this.fragmentShader === undefined) this.fragmentShader = '';
  }
}

class Sprite extends Object3D {
  constructor(material) {
    super();
    this.material = material || new SpriteMaterial();
    this.center = new (global.THREE?.Vector2 || Object)(0.5, 0.5);
    this.isSprite = true;
  }
}

class Points extends Object3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry || new BufferGeometry();
    this.material = material || new PointsMaterial();
    this.isPoints = true;
  }
}

class Line extends Object3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry || new BufferGeometry();
    this.material = material || new LineBasicMaterial();
    this.isLine = true;
  }
}

class LineSegments extends Line {
  constructor(geometry, material) {
    super(geometry, material);
    this.isLineSegments = true;
  }
}

class Mesh extends Object3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry || new BufferGeometry();
    this.material = material || new MeshBasicMaterial();
    this.isMesh = true;
  }
}

class PerspectiveCamera extends Object3D {
  constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
    super();
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.isPerspectiveCamera = true;
  }
  updateProjectionMatrix() {
    this.projectionMatrixUpdated = true;
  }
  lookAt() {}
}

const NormalBlending = 1;
const AdditiveBlending = 2;
const SubtractiveBlending = 3;
const MultiplyBlending = 4;
const FrontSide = 0;
const BackSide = 1;
const DoubleSide = 2;

/** Everything this helper contributes on top of `tests/setup.js`. */
const SCENE_GRAPH_MOCK = {
  Object3D,
  Scene,
  Group,
  Sprite,
  Points,
  Line,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  BufferGeometry,
  BufferAttribute,
  Float32BufferAttribute,
  Texture,
  CanvasTexture,
  TextureLoader,
  Material,
  SpriteMaterial,
  PointsMaterial,
  MeshBasicMaterial,
  LineBasicMaterial,
  ShaderMaterial,
  Color,
  Euler,
  NormalBlending,
  AdditiveBlending,
  SubtractiveBlending,
  MultiplyBlending,
  FrontSide,
  BackSide,
  DoubleSide,
};

/**
 * Augments `global.THREE` with the scene-graph classes and resets all
 * counters. Safe to call more than once.
 *
 * Mutates rather than replaces, because `__mocks__/three.js` captures
 * `global.THREE` by reference.
 *
 * @return {!Object} The augmented `global.THREE`.
 */
export function installThreeMock() {
  if (!global.THREE) global.THREE = {};
  Object.assign(global.THREE, SCENE_GRAPH_MOCK);
  resetThreeStats();
  TextureLoader.reset();
  return global.THREE;
}

/**
 * Wraps the named THREE constructors in jest spies that still build real
 * instances, so a test can assert both "was it constructed twice" and "what
 * state does the result hold".
 *
 * A plain `jest.fn(SomeClass)` will not work here: jest invokes the
 * implementation via `apply`, and an ES class throws when called without
 * `new`. Constructing inside an arrow sidesteps that — `new spy()` yields the
 * arrow's returned object.
 *
 * Call {@link installThreeMock} again to restore the originals.
 *
 * @param {!Array<string>} names Constructor names on `global.THREE`.
 * @return {!Object<string, !Function>} The spies, keyed by name.
 */
export function spyOnThreeConstructors(names) {
  const spies = {};
  for (const name of names) {
    const Real = global.THREE[name];
    const spy = jest.fn((...args) => new Real(...args));
    spy.realConstructor = Real;
    global.THREE[name] = spy;
    spies[name] = spy;
  }
  return spies;
}

export {
  Object3D,
  Scene,
  Group,
  Sprite,
  Points,
  Line,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  BufferGeometry,
  BufferAttribute,
  Float32BufferAttribute,
  Texture,
  CanvasTexture,
  TextureLoader,
  Material,
  SpriteMaterial,
  PointsMaterial,
  MeshBasicMaterial,
  LineBasicMaterial,
  ShaderMaterial,
  Color,
  Euler,
};
