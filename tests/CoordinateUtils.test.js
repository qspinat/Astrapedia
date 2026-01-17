/**
 * @fileoverview Tests for CoordinateUtils module.
 */

// Mock THREE.js before importing the module
global.THREE = {
  MathUtils: {
    degToRad: (deg) => deg * Math.PI / 180,
    radToDeg: (rad) => rad * 180 / Math.PI,
  },
  Vector3: class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    clone() {
      return new Vector3(this.x, this.y, this.z);
    }
    normalize() {
      const len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
      this.x /= len;
      this.y /= len;
      this.z /= len;
      return this;
    }
    applyMatrix3(m) {
      return this;
    }
  },
  Matrix4: class Matrix4 {
    copy() { return this; }
    invert() { return this; }
  },
  Matrix3: class Matrix3 {
    setFromMatrix4() { return this; }
  },
};

import {
  raDecToCartesian,
  cartesianToRaDec,
  angularDistance,
  formatAngle,
  normalizeRA,
  clampDec,
  julianDateToDate,
  dateToJulianDate,
  calculateLST,
} from '../modules/core/CoordinateUtils.js';

describe('CoordinateUtils', () => {
  describe('raDecToCartesian', () => {
    test('converts origin point (RA=0, Dec=0) correctly', () => {
      const result = raDecToCartesian(0, 0, 100);
      expect(result.x).toBeCloseTo(100, 5);
      expect(result.y).toBeCloseTo(0, 5);
      expect(result.z).toBeCloseTo(0, 5);
    });

    test('converts RA=90, Dec=0 correctly', () => {
      const result = raDecToCartesian(90, 0, 100);
      expect(result.x).toBeCloseTo(0, 5);
      expect(result.y).toBeCloseTo(0, 5);
      expect(result.z).toBeCloseTo(-100, 5);
    });

    test('converts Dec=90 (north pole) correctly', () => {
      const result = raDecToCartesian(0, 90, 100);
      expect(result.x).toBeCloseTo(0, 5);
      expect(result.y).toBeCloseTo(100, 5);
      expect(result.z).toBeCloseTo(0, 5);
    });

    test('converts Dec=-90 (south pole) correctly', () => {
      const result = raDecToCartesian(0, -90, 100);
      expect(result.x).toBeCloseTo(0, 5);
      expect(result.y).toBeCloseTo(-100, 5);
      expect(result.z).toBeCloseTo(0, 5);
    });

    test('handles different radii', () => {
      const result = raDecToCartesian(0, 0, 50);
      expect(result.x).toBeCloseTo(50, 5);
    });
  });

  describe('cartesianToRaDec', () => {
    test('converts origin direction correctly', () => {
      const result = cartesianToRaDec(100, 0, 0);
      expect(result.ra).toBeCloseTo(0, 5);
      expect(result.dec).toBeCloseTo(0, 5);
    });

    test('converts north pole correctly', () => {
      const result = cartesianToRaDec(0, 100, 0);
      expect(result.dec).toBeCloseTo(90, 5);
    });

    test('converts south pole correctly', () => {
      const result = cartesianToRaDec(0, -100, 0);
      expect(result.dec).toBeCloseTo(-90, 5);
    });

    test('handles RA=180 correctly', () => {
      const result = cartesianToRaDec(-100, 0, 0);
      expect(result.ra).toBeCloseTo(180, 5);
      expect(result.dec).toBeCloseTo(0, 5);
    });

    test('round-trips through raDecToCartesian', () => {
      const ra = 123.456;
      const dec = 45.678;
      const cart = raDecToCartesian(ra, dec, 100);
      const result = cartesianToRaDec(cart.x, cart.y, cart.z);
      expect(result.ra).toBeCloseTo(ra, 3);
      expect(result.dec).toBeCloseTo(dec, 3);
    });
  });

  describe('angularDistance', () => {
    test('returns 0 for same position', () => {
      const dist = angularDistance(45, 30, 45, 30);
      expect(dist).toBeCloseTo(0, 5);
    });

    test('returns 90 for pole to equator', () => {
      const dist = angularDistance(0, 0, 0, 90);
      expect(dist).toBeCloseTo(90, 5);
    });

    test('returns 180 for opposite points on equator', () => {
      const dist = angularDistance(0, 0, 180, 0);
      expect(dist).toBeCloseTo(180, 5);
    });

    test('calculates distance between arbitrary points', () => {
      // Polaris (RA ~37.95°, Dec ~89.26°) to Vega (RA ~279.23°, Dec ~38.78°)
      const dist = angularDistance(37.95, 89.26, 279.23, 38.78);
      expect(dist).toBeGreaterThan(50);
      expect(dist).toBeLessThan(60);
    });

    test('handles wrap-around in RA', () => {
      const dist1 = angularDistance(350, 0, 10, 0);
      const dist2 = angularDistance(10, 0, 350, 0);
      expect(dist1).toBeCloseTo(20, 3);
      expect(dist2).toBeCloseTo(20, 3);
    });
  });

  describe('formatAngle', () => {
    test('formats degrees for angles >= 1°', () => {
      expect(formatAngle(45.5)).toBe('45.5°');
      expect(formatAngle(1.0)).toBe('1.0°');
    });

    test('formats arcminutes for angles >= 1\'', () => {
      expect(formatAngle(0.5)).toBe('30\''); // 30 arcmin rounds to no decimal
      expect(formatAngle(0.1)).toBe('6.0\''); // 6.0 arcmin has one decimal
    });

    test('formats large arcminutes without decimal', () => {
      expect(formatAngle(0.2)).toBe('12\'');
    });

    test('formats arcseconds for small angles', () => {
      expect(formatAngle(0.01)).toBe('36"');
      expect(formatAngle(1 / 3600)).toBe('1"');
    });
  });

  describe('normalizeRA', () => {
    test('returns unchanged value for 0-360', () => {
      expect(normalizeRA(180)).toBe(180);
      expect(normalizeRA(0)).toBe(0);
    });

    test('normalizes values > 360', () => {
      expect(normalizeRA(400)).toBe(40);
      expect(normalizeRA(720)).toBe(0);
    });

    test('normalizes negative values', () => {
      expect(normalizeRA(-10)).toBe(350);
      expect(normalizeRA(-180)).toBe(180);
    });
  });

  describe('clampDec', () => {
    test('returns unchanged value for valid range', () => {
      expect(clampDec(45)).toBe(45);
      expect(clampDec(-45)).toBe(-45);
      expect(clampDec(0)).toBe(0);
    });

    test('clamps values > 90', () => {
      expect(clampDec(100)).toBe(90);
      expect(clampDec(180)).toBe(90);
    });

    test('clamps values < -90', () => {
      expect(clampDec(-100)).toBe(-90);
      expect(clampDec(-180)).toBe(-90);
    });

    test('handles boundary values', () => {
      expect(clampDec(90)).toBe(90);
      expect(clampDec(-90)).toBe(-90);
    });
  });

  describe('dateToJulianDate', () => {
    test('converts J2000.0 epoch correctly', () => {
      const j2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0)); // Jan 1, 2000 12:00 UTC
      expect(dateToJulianDate(j2000)).toBeCloseTo(2451545.0, 3);
    });

    test('converts Unix epoch correctly', () => {
      const unixEpoch = new Date(Date.UTC(1970, 0, 1, 0, 0, 0));
      expect(dateToJulianDate(unixEpoch)).toBeCloseTo(2440587.5, 3);
    });

    test('handles arbitrary dates', () => {
      // July 4, 2023 00:00 UTC -> JD 2460129.5
      const date = new Date(Date.UTC(2023, 6, 4, 0, 0, 0));
      const jd = dateToJulianDate(date);
      expect(jd).toBeCloseTo(2460129.5, 1);
    });
  });

  describe('julianDateToDate', () => {
    test('converts J2000.0 epoch correctly', () => {
      const date = julianDateToDate(2451545.0);
      expect(date.getUTCFullYear()).toBe(2000);
      expect(date.getUTCMonth()).toBe(0); // January
      expect(date.getUTCDate()).toBe(1);
      expect(date.getUTCHours()).toBe(12);
    });

    test('round-trips through dateToJulianDate', () => {
      const original = new Date(Date.UTC(2023, 5, 15, 18, 30, 0));
      const jd = dateToJulianDate(original);
      const result = julianDateToDate(jd);
      expect(result.getTime()).toBeCloseTo(original.getTime(), -3); // Within 1 second
    });
  });

  describe('calculateLST', () => {
    test('returns value between 0 and 360', () => {
      const date = new Date();
      const lst = calculateLST(date, 0);
      expect(lst).toBeGreaterThanOrEqual(0);
      expect(lst).toBeLessThan(360);
    });

    test('increases with eastern longitude', () => {
      const date = new Date(Date.UTC(2023, 5, 15, 0, 0, 0));
      const lstGreenwich = calculateLST(date, 0);
      const lstParis = calculateLST(date, 2.35);
      // LST at Paris should be slightly ahead of Greenwich
      const diff = (lstParis - lstGreenwich + 360) % 360;
      expect(diff).toBeCloseTo(2.35, 1);
    });

    test('changes with time', () => {
      const date1 = new Date(Date.UTC(2023, 5, 15, 0, 0, 0));
      const date2 = new Date(Date.UTC(2023, 5, 15, 6, 0, 0));
      const lst1 = calculateLST(date1, 0);
      const lst2 = calculateLST(date2, 0);
      // 6 hours = ~90 degrees of rotation
      const diff = (lst2 - lst1 + 360) % 360;
      expect(diff).toBeCloseTo(90.41, 0); // Sidereal time is slightly faster
    });
  });
});
