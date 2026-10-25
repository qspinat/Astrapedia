/**
 * @fileoverview Tests for rise/set times, the dark window and altitude
 * curves, against published almanac values for Paris.
 */

import {installAstronomy} from '../helpers/astronomy.js';
import {
  altitudeCurve,
  nightStart,
  nightWindow,
  riseTransitSet,
} from '../../modules/astronomy/Observability.js';

installAstronomy();

const PARIS = {lat: 48.8566, lon: 2.3522, height: 0};
const VEGA = {name: 'Vega', ra: 279.2347, dec: 38.7837};
const MINUTE = 60 * 1000;

/** Expect two dates within `minutes` of each other. */
const expectNear = (actual, expected, minutes = 3) => {
  expect(Math.abs(actual.getTime() - new Date(expected).getTime())).toBeLessThan(minutes * MINUTE);
};

describe('riseTransitSet', () => {
  test('gives the Sun\'s rise and set on the solstice', () => {
    // Almanac: Paris, 21 June 2026 — sunrise 05:47, sunset 21:58 CEST.
    const sun = riseTransitSet({name: 'Sun'}, PARIS, new Date('2026-06-21T12:00:00Z'));
    expectNear(sun.rise, '2026-06-21T03:47:00Z');
    expectNear(sun.set, '2026-06-21T19:58:00Z');
  });

  test('gives a star its culmination altitude', () => {
    const vega = riseTransitSet(VEGA, PARIS, new Date('2026-06-21T00:00:00Z'));
    // 90 - latitude + declination, plus a little refraction.
    expect(vega.transitAltitude).toBeCloseTo(90 - 48.8566 + 38.7837, 0);
    expect(vega.neverUp).toBe(false);
  });

  test('a circumpolar star never sets', () => {
    const polaris = riseTransitSet({name: 'Polaris', ra: 37.95, dec: 89.26}, PARIS,
        new Date('2026-06-21T00:00:00Z'));
    expect(polaris.alwaysUp).toBe(true);
    expect(polaris.rise).toBeNull();
  });

  test('a far southern object never rises', () => {
    const acrux = riseTransitSet({name: 'Acrux', ra: 186.65, dec: -63.1}, PARIS,
        new Date('2026-06-21T00:00:00Z'));
    expect(acrux.neverUp).toBe(true);
  });

  test('returns null without a location', () => {
    expect(riseTransitSet(VEGA, null, new Date())).toBeNull();
  });
});

describe('nightStart', () => {
  test('in the evening the night began at today\'s noon', () => {
    const start = nightStart(new Date('2026-12-21T20:00:00Z'), 0);
    expect(start.toISOString()).toBe('2026-12-21T12:00:00.000Z');
  });

  test('in the small hours it began at yesterday\'s noon', () => {
    const start = nightStart(new Date('2026-12-22T03:00:00Z'), 0);
    expect(start.toISOString()).toBe('2026-12-21T12:00:00.000Z');
  });
});

describe('nightWindow', () => {
  test('winter in Paris has a long dark window', () => {
    // Almanac: 21 Dec 2026, sunset 16:56 and sunrise 08:42 CET; astronomical
    // twilight ends ~18:52 and starts again ~06:45 CET.
    const night = nightWindow(PARIS, new Date('2026-12-21T22:00:00Z'));
    expectNear(night.sunset, '2026-12-21T15:56:00Z');
    expectNear(night.dusk, '2026-12-21T17:52:00Z');
    expectNear(night.dawn, '2026-12-22T05:45:00Z');
    expectNear(night.sunrise, '2026-12-22T07:42:00Z');
  });

  test('midsummer in Paris never gets astronomically dark', () => {
    const night = nightWindow(PARIS, new Date('2026-06-21T22:00:00Z'));
    expect(night.sunset).not.toBeNull();
    expect(night.dusk).toBeNull();
    expect(night.dawn).toBeNull();
  });
});

describe('altitudeCurve', () => {
  test('samples every step and peaks at the culmination', () => {
    const from = new Date('2026-06-20T20:00:00Z');
    const to = new Date('2026-06-21T04:00:00Z');
    const curve = altitudeCurve(VEGA, PARIS, from, to, 30);
    expect(curve).toHaveLength(17);
    const peak = curve.reduce((a, b) => (b.altitude > a.altitude ? b : a));
    expectNear(peak.time, '2026-06-21T00:31:00Z', 30);
  });
});
