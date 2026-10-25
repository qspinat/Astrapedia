/**
 * @fileoverview Tests for ranking tonight's targets.
 */

import {planningWindow, rankTonight} from '../../modules/features/TonightPlanner.js';

const PARIS = {lat: 48.8566, lon: 2.3522};
// A December night in Paris, fully dark 18:52 → 06:45 local.
const WINDOW = {from: new Date('2026-12-21T17:52:00Z'), to: new Date('2026-12-22T05:45:00Z')};

const M42 = {name: 'NGC1976', messier: 42, type: 'HII', ra: 83.82, dec: -5.39, mag: 4.0};
const M31 = {name: 'NGC0224', messier: 31, type: 'G', ra: 10.68, dec: 41.27, mag: 3.4};
const FAINT = {name: 'NGC1', type: 'G', ra: 1.8, dec: 27.7, mag: 13.6};
const SOUTHERN = {name: 'NGC104', type: 'GCl', ra: 6.02, dec: -72.08, mag: 4.1};
const JUPITER = {name: 'Jupiter', ra: 110, dec: 22, mag: -2.6};
const SUN = {name: 'Sun', ra: 270, dec: -23.4, mag: -26.7};

const rank = (extra = {}) => rankTonight({
  location: PARIS, window: WINDOW, limitMag: 6, planets: [JUPITER, SUN],
  dsos: [M42, M31, FAINT, SOUTHERN], ...extra,
});

describe('planningWindow', () => {
  test('uses astronomical darkness when there is some', () => {
    const night = {dusk: WINDOW.from, dawn: WINDOW.to, sunset: null, sunrise: null};
    expect(planningWindow(night)).toEqual({...WINDOW, fullyDark: true});
  });

  test('falls back to an hour inside sunset and sunrise in a bright summer night', () => {
    const night = {dusk: null, dawn: null,
      sunset: new Date('2026-06-21T19:58:00Z'), sunrise: new Date('2026-06-22T03:47:00Z')};
    const span = planningWindow(night);
    expect(span.fullyDark).toBe(false);
    expect(span.from.toISOString()).toBe('2026-06-21T20:58:00.000Z');
  });

  test('uses the whole night when it is too short to trim', () => {
    const night = {dusk: null, dawn: null,
      sunset: new Date('2026-06-21T21:50:00Z'), sunrise: new Date('2026-06-21T23:10:00Z')};
    const span = planningWindow(night);
    expect(span.from).toEqual(night.sunset);
    expect(span.to).toEqual(night.sunrise);
  });

  test('is null when the Sun never sets', () => {
    expect(planningWindow({dusk: null, dawn: null, sunset: null, sunrise: null})).toBeNull();
  });
});

describe('rankTonight', () => {
  test('lists what climbs high enough and is bright enough', () => {
    const names = rank().map((e) => e.object.name);
    expect(names).toEqual(expect.arrayContaining(['Jupiter', 'M42', 'M31']));
    expect(names).not.toContain('NGC1'); // fainter than the limit
    expect(names).not.toContain('NGC104'); // never rises from Paris
    expect(names).not.toContain('Sun');
  });

  test('a telescope limit lets fainter objects in', () => {
    expect(rank({limitMag: 14}).map((e) => e.object.name)).toContain('NGC1');
  });

  test('finds when each object is highest', () => {
    const m42 = rank().find((e) => e.object.name === 'M42');
    // M42 culminates around local midnight in December, ~36 degrees up.
    expect(m42.peakAltitude).toBeCloseTo(90 - 48.86 - 5.39, -1);
    expect(m42.bestTime.getUTCHours()).toBeGreaterThanOrEqual(22);
  });

  test("a bright Moon nearby lowers a nebula's score", () => {
    const dark = rank().find((e) => e.object.name === 'M42').score;
    const moonlit = rank({moon: {ra: 85, dec: -3, illumination: 1}})
        .find((e) => e.object.name === 'M42').score;
    expect(moonlit).toBeLessThan(dark);
  });

  test('tags each entry with its category', () => {
    const categories = Object.fromEntries(rank().map((e) => [e.object.name, e.category]));
    expect(categories).toMatchObject({Jupiter: 'planets', M42: 'nebulae', M31: 'galaxies'});
  });
});
