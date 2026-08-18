/**
 * @fileoverview Tests for AstronomyCalculator, the observer-aware wrapper over
 * the coordinate helpers.
 *
 * setObserverLocation and calculateAltitude are its entire production surface;
 * skymap.js and SkyConditionsHandler call these and nothing else. The moon and
 * planet ephemeris this class once also carried lives in
 * modules/astronomy/SolarSystem.js, and so do its tests.
 */

import {AstronomyCalculator} from '../modules/core/AstronomyCalculator.js';

describe('AstronomyCalculator', () => {
  let calculator;

  beforeEach(() => {
    calculator = new AstronomyCalculator();
  });

  describe('observer location and altitude', () => {
    const PARIS = {lat: 48.8566, lon: 2.3522};
    // Evening of 15 Jan 2026 UTC — Sirius near transit, Vega near its minimum.
    const WINTER_EVENING = new Date(Date.UTC(2026, 0, 15, 22, 0, 0));

    describe('setObserverLocation', () => {
      test('defaults to the origin before a location is set', () => {
        expect(calculator.getObserverLocation()).toEqual(
            {lat: 0, lon: 0, height: 0});
      });

      test('stores latitude, longitude and height', () => {
        calculator.setObserverLocation(48.8566, 2.3522, 35);

        expect(calculator.getObserverLocation())
            .toEqual({lat: 48.8566, lon: 2.3522, height: 35});
      });

      test('defaults height to 0 when omitted', () => {
        calculator.setObserverLocation(10, 20);

        expect(calculator.getObserverLocation().height).toBe(0);
      });

      test('returns a copy, so callers cannot mutate internal state', () => {
        calculator.setObserverLocation(48.8566, 2.3522);

        calculator.getObserverLocation().lat = 0;

        expect(calculator.getObserverLocation().lat).toBe(48.8566);
      });

      test('altitude reflects the most recently set location', () => {
        calculator.setObserverLocation(0, 0);
        const atEquator = calculator.calculateAltitude(0, 90, WINTER_EVENING);

        calculator.setObserverLocation(48.8566, 2.3522);
        const atParis = calculator.calculateAltitude(0, 90, WINTER_EVENING);

        expect(atEquator).toBeCloseTo(0, 6);
        expect(atParis).toBeCloseTo(48.8566, 6);
      });
    });

    describe('calculateAltitude', () => {
      beforeEach(() => {
        calculator.setObserverLocation(PARIS.lat, PARIS.lon);
      });

      // The celestial pole sits at an altitude equal to the observer's
      // latitude, always. Being independent of both time and right ascension,
      // this is the sharpest available check on the hour-angle plumbing: any
      // sign error or units mix-up in the LST chain breaks it.
      test('north celestial pole sits at the observer latitude', () => {
        expect(calculator.calculateAltitude(0, 90, WINTER_EVENING))
            .toBeCloseTo(PARIS.lat, 9);
      });

      test('pole altitude is independent of right ascension and time', () => {
        const other = new Date(Date.UTC(1999, 6, 4, 3, 17, 0));

        expect(calculator.calculateAltitude(300, 90, other))
            .toBeCloseTo(PARIS.lat, 9);
      });

      test('south celestial pole sits at minus the observer latitude', () => {
        expect(calculator.calculateAltitude(0, -90, WINTER_EVENING))
            .toBeCloseTo(-PARIS.lat, 9);
      });

      test('a circumpolar star never sets', () => {
        // Dec +80 from lat 48.86: altitude stays within
        // [dec - (90 - lat), 90 - |lat - dec|] = [38.86, 58.86].
        for (let hour = 0; hour < 24; hour++) {
          const date = new Date(Date.UTC(2026, 0, 15, hour, 0, 0));
          const altitude = calculator.calculateAltitude(120, 80, date);

          expect(altitude).toBeGreaterThan(38.8);
          expect(altitude).toBeLessThan(58.9);
        }
      });

      test('a far-southern object never rises', () => {
        // Max possible altitude is 90 - |lat - dec| = 90 - 108.86 < 0.
        for (let hour = 0; hour < 24; hour++) {
          const date = new Date(Date.UTC(2026, 0, 15, hour, 0, 0));

          expect(calculator.calculateAltitude(200, -60, date))
              .toBeLessThan(0);
        }
      });

      test('altitude never leaves the -90..90 range', () => {
        for (let ra = 0; ra < 360; ra += 37) {
          for (let dec = -90; dec <= 90; dec += 30) {
            const altitude =
                calculator.calculateAltitude(ra, dec, WINTER_EVENING);

            expect(altitude).toBeGreaterThanOrEqual(-90);
            expect(altitude).toBeLessThanOrEqual(90);
            expect(Number.isFinite(altitude)).toBe(true);
          }
        }
      });

      test('peak altitude over a day matches the transit formula', () => {
        // At transit (hour angle 0) altitude is 90 - |lat - dec|.
        const dec = -16.716;
        const expectedTransit = 90 - Math.abs(PARIS.lat - dec);
        let peak = -Infinity;
        for (let minute = 0; minute < 24 * 60; minute += 2) {
          const date = new Date(Date.UTC(2026, 0, 15, 0, minute, 0));
          peak = Math.max(peak,
              calculator.calculateAltitude(101.287, dec, date));
        }

        expect(peak).toBeCloseTo(expectedTransit, 1);
      });

      // Golden values, cross-checked against the physical expectations above:
      // Polaris is ~0.74 deg off the pole so it must sit near the latitude;
      // Sirius culminates at 24.43 deg from Paris; Vega bottoms out at -2.36.
      test('pins known star altitudes from Paris', () => {
        expect(calculator.calculateAltitude(37.95, 89.26, WINTER_EVENING))
            .toBeCloseTo(49.331352, 5);
        expect(calculator.calculateAltitude(101.287, -16.716, WINTER_EVENING))
            .toBeCloseTo(23.324943, 5);
        expect(calculator.calculateAltitude(279.234, 38.784, WINTER_EVENING))
            .toBeCloseTo(-1.767207, 5);
      });

      test('mirrors across the equator for a mirrored observer', () => {
        calculator.setObserverLocation(PARIS.lat, 0);
        const north = calculator.calculateAltitude(0, 30, WINTER_EVENING);

        calculator.setObserverLocation(-PARIS.lat, 0);
        const south = calculator.calculateAltitude(0, -30, WINTER_EVENING);

        expect(south).toBeCloseTo(north, 9);
      });
    });
  });

});
