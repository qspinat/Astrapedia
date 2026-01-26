/**
 * @fileoverview Jest test setup file.
 */

import {jest} from '@jest/globals';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock THREE.js global (used by CoordinateUtils and other modules)
global.THREE = {
  MathUtils: {
    degToRad: (deg) => deg * Math.PI / 180,
    radToDeg: (rad) => rad * 180 / Math.PI,
    clamp: (val, min, max) => Math.min(Math.max(val, min), max),
  },
  Vector2: class Vector2 {
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
    set(x, y) {
      this.x = x;
      this.y = y;
      return this;
    }
    clone() {
      return new global.THREE.Vector2(this.x, this.y);
    }
  },
  Vector3: class Vector3 {
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
      return new global.THREE.Vector3(this.x, this.y, this.z);
    }
    normalize() {
      const len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
      if (len > 0) {
        this.x /= len;
        this.y /= len;
        this.z /= len;
      }
      return this;
    }
    applyMatrix3(m) {
      return this;
    }
    applyMatrix4(m) {
      return this;
    }
  },
  Matrix3: class Matrix3 {
    constructor() {
      this.elements = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    }
    setFromMatrix4(m) {
      return this;
    }
  },
  Matrix4: class Matrix4 {
    constructor() {
      this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    }
    copy(m) {
      return this;
    }
    invert() {
      return this;
    }
  },
  Raycaster: class Raycaster {
    constructor() {
      this.ray = {
        origin: new global.THREE.Vector3(),
        // Default direction points to RA=0, Dec=0 (cartesian: x=1, y=0, z=0)
        direction: new global.THREE.Vector3(1, 0, 0),
      };
      this.params = {
        Points: {threshold: 1},
        Line: {threshold: 1},
      };
    }
    setFromCamera(coords, camera) {
      // For testing: when coords are (0, 0), point to RA=0, Dec=0
      // This makes planets at (ra=0, dec=0) clickable
      this.ray.direction = new global.THREE.Vector3(1, 0, 0);
    }
    intersectObject(object, recursive = false) {
      return [];
    }
    intersectObjects(objects, recursive = false) {
      return [];
    }
  },
};

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock window.navigator.geolocation
const geolocationMock = {
  getCurrentPosition: jest.fn(),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
};
global.navigator.geolocation = geolocationMock;

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
  localStorageMock.getItem.mockReturnValue(null);
});
