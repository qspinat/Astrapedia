/**
 * @fileoverview Tests for moon phase helpers.
 */

import {moonIllumination, moonPhaseName} from '../../modules/core/MoonPhase.js';

describe('moonIllumination', () => {
  test.each([
    [0, 0],
    [0.25, 0.5],
    [0.5, 1],
    [0.75, 0.5],
    [1, 0],
  ])('phase %p is %p lit', (phase, lit) => {
    expect(moonIllumination(phase)).toBeCloseTo(lit, 6);
  });
});

describe('moonPhaseName', () => {
  test('names the full moon', () => {
    expect(moonPhaseName(0.5).name).toBe('Full Moon');
  });
});
