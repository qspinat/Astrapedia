/**
 * @fileoverview Tests for AstronomyCalculator moon position calculations.
 */

import {AstronomyCalculator} from '../modules/core/AstronomyCalculator.js';

describe('AstronomyCalculator', () => {
  let calculator;

  beforeEach(() => {
    calculator = new AstronomyCalculator();
  });

  describe('calculateMoonPosition', () => {
    describe('moon phase calculation', () => {
      test('returns phase ~0 for known new moon date', () => {
        // January 6, 2000 was a known new moon
        const newMoonDate = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
        const result = calculator.calculateMoonPosition(newMoonDate);

        // Phase should be close to 0 (new moon)
        expect(result.phase).toBeGreaterThanOrEqual(0);
        expect(result.phase).toBeLessThan(0.1);
      });

      test('returns phase ~0.5 for full moon (half lunar cycle later)', () => {
        const newMoonDate = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
        // Add half a lunar cycle (~14.77 days)
        const fullMoonDate = new Date(newMoonDate.getTime() + 14.765 * 24 * 60 * 60 * 1000);
        const result = calculator.calculateMoonPosition(fullMoonDate);

        // Phase should be close to 0.5 (full moon)
        expect(result.phase).toBeGreaterThan(0.4);
        expect(result.phase).toBeLessThan(0.6);
      });

      test('returns phase ~0.25 for first quarter', () => {
        const newMoonDate = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
        // Add quarter lunar cycle (~7.38 days)
        const firstQuarterDate = new Date(newMoonDate.getTime() + 7.38 * 24 * 60 * 60 * 1000);
        const result = calculator.calculateMoonPosition(firstQuarterDate);

        // Phase should be close to 0.25 (first quarter)
        expect(result.phase).toBeGreaterThan(0.15);
        expect(result.phase).toBeLessThan(0.35);
      });

      test('returns phase ~0.75 for last quarter', () => {
        const newMoonDate = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
        // Add three-quarter lunar cycle (~22.14 days)
        const lastQuarterDate = new Date(newMoonDate.getTime() + 22.14 * 24 * 60 * 60 * 1000);
        const result = calculator.calculateMoonPosition(lastQuarterDate);

        // Phase should be close to 0.75 (last quarter)
        expect(result.phase).toBeGreaterThan(0.65);
        expect(result.phase).toBeLessThan(0.85);
      });

      test('phase cycles back to ~0 after full lunar cycle', () => {
        const newMoonDate = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
        // Add full lunar cycle (~29.53 days)
        const nextNewMoon = new Date(newMoonDate.getTime() + 29.530588853 * 24 * 60 * 60 * 1000);
        const result = calculator.calculateMoonPosition(nextNewMoon);

        // Phase should be close to 0 or 1 (wraps around)
        const isNewMoon = result.phase < 0.1 || result.phase > 0.9;
        expect(isNewMoon).toBe(true);
      });

      test('phase progresses correctly over multiple days', () => {
        const startDate = new Date(Date.UTC(2024, 0, 1, 12, 0, 0));
        const phases = [];

        // Calculate phase for 30 consecutive days
        for (let day = 0; day < 30; day++) {
          const date = new Date(startDate.getTime() + day * 24 * 60 * 60 * 1000);
          const result = calculator.calculateMoonPosition(date);
          phases.push(result.phase);
        }

        // Phase should generally increase (with wrap-around)
        let increases = 0;
        for (let i = 1; i < phases.length; i++) {
          const diff = phases[i] - phases[i - 1];
          // Account for wrap-around (0.9 -> 0.1 is actually an increase)
          if (diff > 0 || diff < -0.5) {
            increases++;
          }
        }

        // Most transitions should be increases
        expect(increases).toBeGreaterThan(25);
      });

      test('phase is always between 0 and 1', () => {
        // Test various dates
        const testDates = [
          new Date(2000, 0, 1),
          new Date(2010, 5, 15),
          new Date(2020, 11, 31),
          new Date(2024, 6, 4),
          new Date(1990, 2, 20),
        ];

        testDates.forEach((date) => {
          const result = calculator.calculateMoonPosition(date);
          expect(result.phase).toBeGreaterThanOrEqual(0);
          expect(result.phase).toBeLessThanOrEqual(1);
        });
      });
    });

    describe('moon RA/Dec calculation', () => {
      test('returns valid RA between 0 and 360', () => {
        const date = new Date(2024, 6, 15);
        const result = calculator.calculateMoonPosition(date);

        expect(result.ra).toBeGreaterThanOrEqual(0);
        expect(result.ra).toBeLessThan(360);
      });

      test('returns valid Dec between -90 and 90', () => {
        const date = new Date(2024, 6, 15);
        const result = calculator.calculateMoonPosition(date);

        expect(result.dec).toBeGreaterThanOrEqual(-90);
        expect(result.dec).toBeLessThanOrEqual(90);
      });

      test('moon position changes over time', () => {
        const date1 = new Date(2024, 6, 1);
        const date2 = new Date(2024, 6, 15);

        const result1 = calculator.calculateMoonPosition(date1);
        const result2 = calculator.calculateMoonPosition(date2);

        // Position should change significantly over 2 weeks
        const raDiff = Math.abs(result2.ra - result1.ra);
        expect(raDiff).toBeGreaterThan(10);
      });

      test('moon declination varies within lunar month', () => {
        const startDate = new Date(2024, 6, 1);
        const declinations = [];

        // Sample declination over a month
        for (let day = 0; day < 28; day += 7) {
          const date = new Date(startDate.getTime() + day * 24 * 60 * 60 * 1000);
          const result = calculator.calculateMoonPosition(date);
          declinations.push(result.dec);
        }

        const minDec = Math.min(...declinations);
        const maxDec = Math.max(...declinations);

        // Declination should vary (moon wobbles north/south)
        expect(maxDec - minDec).toBeGreaterThan(5);
      });
    });

    describe('regression tests for phase calculation bug', () => {
      test('phase does not double-cycle (old bug: 2*D)', () => {
        // The old buggy code used (2 * D) which made phase cycle twice per month
        // Test that phase changes smoothly without jumping back
        const startDate = new Date(Date.UTC(2024, 0, 1, 0, 0, 0));
        const phases = [];

        // Collect phases over one lunar month
        for (let day = 0; day < 30; day++) {
          const date = new Date(startDate.getTime() + day * 24 * 60 * 60 * 1000);
          const result = calculator.calculateMoonPosition(date);
          phases.push(result.phase);
        }

        // Count how many times phase wraps around (goes from high to low)
        let wrapArounds = 0;
        for (let i = 1; i < phases.length; i++) {
          const diff = phases[i] - phases[i - 1];
          // A wrap-around is when phase drops significantly (e.g., 0.95 -> 0.05)
          if (diff < -0.5) {
            wrapArounds++;
          }
        }

        // Should have at most 1 wrap-around per lunar month
        // (old bug would have 2 wrap-arounds because phase cycled twice as fast)
        expect(wrapArounds).toBeLessThanOrEqual(1);
      });

      test('full moon occurs once per lunar month, not twice', () => {
        const startDate = new Date(Date.UTC(2024, 0, 1, 0, 0, 0));
        let fullMoonCount = 0;
        let wasFullMoon = false;

        // Count full moons over 35 days (slightly more than one lunar month)
        for (let day = 0; day < 35; day++) {
          const date = new Date(startDate.getTime() + day * 24 * 60 * 60 * 1000);
          const result = calculator.calculateMoonPosition(date);

          const isFullMoon = result.phase > 0.45 && result.phase < 0.55;

          if (isFullMoon && !wasFullMoon) {
            fullMoonCount++;
          }
          wasFullMoon = isFullMoon;
        }

        // Should have exactly 1 full moon in ~35 days
        expect(fullMoonCount).toBe(1);
      });

      test('phase increases monotonically between new and full moon', () => {
        // Start from a known new moon date
        const newMoonDate = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));

        let prevPhase = 0;
        for (let day = 1; day <= 14; day++) {
          const date = new Date(newMoonDate.getTime() + day * 24 * 60 * 60 * 1000);
          const result = calculator.calculateMoonPosition(date);

          // Phase should increase as we go from new moon to full moon
          expect(result.phase).toBeGreaterThan(prevPhase);
          prevPhase = result.phase;
        }

        // Final phase should be around 0.5 (full moon)
        expect(prevPhase).toBeGreaterThan(0.4);
        expect(prevPhase).toBeLessThan(0.55);
      });
    });
  });
});
