/**
 * @fileoverview Tests for the visible-object count behind the magnitude
 * slider.
 *
 * The slider fires this on every input event, so it is a binary search over a
 * presorted magnitude array rather than a scan of every object.
 */

import {jest} from '@jest/globals';
import {installThreeMock} from '../helpers/threeMock.js';

installThreeMock();

const {StarFieldRenderer} =
    await import('../../modules/rendering/StarFieldRenderer.js');

/** Reference implementation: what the count means, stated plainly. */
function countByScan(stars, dsos, limit) {
  return stars.filter((s) => s.mag <= limit).length +
      dsos.filter((d) => d.mag <= limit).length;
}

describe('StarFieldRenderer.getVisibleCount', () => {
  let renderer;
  let stars;
  let dsos;

  beforeEach(() => {
    jest.clearAllMocks();
    installThreeMock();

    // Deliberately unsorted, with duplicates and values either side of the
    // thresholds the tests probe.
    stars = [
      {ra: 0, dec: 0, mag: 6.5}, {ra: 1, dec: 1, mag: -1.46},
      {ra: 2, dec: 2, mag: 2.0}, {ra: 3, dec: 3, mag: 2.0},
      {ra: 4, dec: 4, mag: 11.2}, {ra: 5, dec: 5, mag: 0.4},
      {ra: 6, dec: 6, mag: 8.0},
    ];
    dsos = [
      {ra: 7, dec: 7, mag: 3.4, type: 'G'},
      {ra: 8, dec: 8, mag: 9.9, type: 'PN'},
      {ra: 9, dec: 9, mag: 2.0, type: 'Neb'},
    ];

    renderer = new StarFieldRenderer({
      celestialSphere: new global.THREE.Group(),
      getStars: () => stars,
      getDSOs: () => dsos,
      requestRender: jest.fn(),
    });
    renderer.create();
  });

  test('returns zero before the field is built', () => {
    const fresh = new StarFieldRenderer({
      celestialSphere: new global.THREE.Group(),
      getStars: () => [],
      getDSOs: () => [],
      requestRender: jest.fn(),
    });

    expect(fresh.getVisibleCount()).toBe(0);
  });

  test('counts everything at or below the limit', () => {
    renderer.setMagnitudeLimit(6.5);

    expect(renderer.getVisibleCount()).toBe(countByScan(stars, dsos, 6.5));
  });

  test('includes objects exactly at the limit', () => {
    renderer.setMagnitudeLimit(2.0);

    // Three objects sit exactly on 2.0; an exclusive bound would miss them.
    // Brighter than 2.0: -1.46 and 0.4. Exactly 2.0: two stars and one DSO.
    expect(renderer.getVisibleCount()).toBe(countByScan(stars, dsos, 2.0));
    expect(renderer.getVisibleCount()).toBe(5);
  });

  test('counts nothing below the brightest object', () => {
    renderer.setMagnitudeLimit(-5);

    expect(renderer.getVisibleCount()).toBe(0);
  });

  test('counts everything above the faintest object', () => {
    renderer.setMagnitudeLimit(20);

    expect(renderer.getVisibleCount()).toBe(stars.length + dsos.length);
  });

  // Guards the float32 trap: storing magnitudes at single precision moves
  // values like 0.4 across the threshold and shifts the count by one.
  test('agrees with a plain scan at every slider position', () => {
    for (let limit = -2; limit <= 13; limit += 0.05) {
      const rounded = Math.round(limit * 100) / 100;
      renderer.setMagnitudeLimit(rounded);

      expect(renderer.getVisibleCount())
          .toBe(countByScan(stars, dsos, rounded));
    }
  });

  test('tracks the data when the field is rebuilt', () => {
    stars = [{ra: 0, dec: 0, mag: 1.0}];
    dsos = [];
    renderer.create();
    renderer.setMagnitudeLimit(6.5);

    expect(renderer.getVisibleCount()).toBe(1);
  });
});
