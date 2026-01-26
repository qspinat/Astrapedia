/**
 * @fileoverview Tests for MagnitudeUtils module.
 */

import {
  magnitudeToSize,
  telescopeLimitingMagnitude,
  telescopeGain,
} from '../modules/core/MagnitudeUtils.js';

describe('MagnitudeUtils', () => {
  describe('magnitudeToSize', () => {
    test('returns larger size for brighter stars (lower magnitude)', () => {
      const brightSize = magnitudeToSize(-1);
      const dimSize = magnitudeToSize(6);
      expect(brightSize).toBeGreaterThan(dimSize);
    });

    test('returns maximum size at default maxSize for very bright stars', () => {
      const size = magnitudeToSize(-5);
      expect(size).toBeLessThanOrEqual(3.5);
    });

    test('returns at least baseSize for dim stars', () => {
      const size = magnitudeToSize(15);
      expect(size).toBeGreaterThanOrEqual(0.8);
    });

    test('uses custom maxSize when provided', () => {
      const size = magnitudeToSize(-5, 5.0);
      expect(size).toBeLessThanOrEqual(5.0);
    });

    test('uses custom baseSize when provided', () => {
      const size = magnitudeToSize(15, 3.5, 1.0);
      expect(size).toBeGreaterThanOrEqual(1.0);
    });

    test('uses custom baseMag for scaling reference', () => {
      const sizeDefault = magnitudeToSize(6, 3.5, 0.8, 8);
      const sizeCustom = magnitudeToSize(6, 3.5, 0.8, 6);

      // At baseMag, size should equal baseSize
      expect(sizeCustom).toBeCloseTo(0.8, 1);
      // With default baseMag=8, mag 6 should be larger than baseSize
      expect(sizeDefault).toBeGreaterThan(0.8);
    });

    test('star at baseMag returns approximately baseSize', () => {
      const size = magnitudeToSize(8, 3.5, 0.8, 8);
      expect(size).toBeCloseTo(0.8, 5);
    });

    test('magnitude difference of 1 scales by 1.15x', () => {
      const size8 = magnitudeToSize(8, 10, 1.0, 8);
      const size7 = magnitudeToSize(7, 10, 1.0, 8);
      expect(size7 / size8).toBeCloseTo(1.15, 2);
    });
  });

  describe('telescopeLimitingMagnitude', () => {
    test('calculates correct limiting magnitude for 200mm aperture', () => {
      // 2.7 + 5 * log10(200) = 2.7 + 5 * 2.301 = 2.7 + 11.505 = 14.205
      const lm = telescopeLimitingMagnitude(200);
      expect(lm).toBeCloseTo(14.2, 1);
    });

    test('larger aperture gives higher limiting magnitude', () => {
      const lm200 = telescopeLimitingMagnitude(200);
      const lm400 = telescopeLimitingMagnitude(400);
      expect(lm400).toBeGreaterThan(lm200);
    });

    test('doubling aperture adds ~1.5 magnitudes', () => {
      // 5 * log10(2) ≈ 1.5
      const lm100 = telescopeLimitingMagnitude(100);
      const lm200 = telescopeLimitingMagnitude(200);
      expect(lm200 - lm100).toBeCloseTo(1.5, 1);
    });

    test('calculates correct value for 50mm binoculars', () => {
      // 2.7 + 5 * log10(50) = 2.7 + 5 * 1.699 = 2.7 + 8.495 = 11.195
      const lm = telescopeLimitingMagnitude(50);
      expect(lm).toBeCloseTo(11.2, 1);
    });

    test('calculates correct value for 7mm naked eye pupil', () => {
      // 2.7 + 5 * log10(7) = 2.7 + 5 * 0.845 = 2.7 + 4.225 = 6.925
      const lm = telescopeLimitingMagnitude(7);
      expect(lm).toBeCloseTo(6.9, 1);
    });
  });

  describe('telescopeGain', () => {
    test('calculates gain for 200mm aperture with 7mm pupil', () => {
      // 5 * log10(200/7) = 5 * log10(28.57) = 5 * 1.456 = 7.28
      const gain = telescopeGain(200, 7);
      expect(gain).toBeCloseTo(7.3, 1);
    });

    test('uses default 7mm pupil', () => {
      const gainExplicit = telescopeGain(200, 7);
      const gainDefault = telescopeGain(200);
      expect(gainDefault).toBeCloseTo(gainExplicit, 5);
    });

    test('larger aperture gives more gain', () => {
      const gain100 = telescopeGain(100);
      const gain200 = telescopeGain(200);
      expect(gain200).toBeGreaterThan(gain100);
    });

    test('doubling aperture adds ~1.5 magnitudes gain', () => {
      const gain100 = telescopeGain(100);
      const gain200 = telescopeGain(200);
      expect(gain200 - gain100).toBeCloseTo(1.5, 1);
    });

    test('returns zero gain when aperture equals pupil', () => {
      // 5 * log10(7/7) = 5 * log10(1) = 5 * 0 = 0
      const gain = telescopeGain(7, 7);
      expect(gain).toBeCloseTo(0, 5);
    });

    test('smaller pupil gives less gain', () => {
      const gain7mm = telescopeGain(200, 7);
      const gain5mm = telescopeGain(200, 5);
      expect(gain5mm).toBeGreaterThan(gain7mm);
    });
  });
});
