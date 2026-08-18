/**
 * @fileoverview Tests for lunar phase rendering.
 *
 * The drawn moon is what you see between roughly 23 and 52 degrees FOV, above
 * which it is too small to matter and below which the real photograph
 * replaces it.
 */

import {jest} from '@jest/globals';
import {installThreeMock} from '../helpers/threeMock.js';

installThreeMock();

const {moonShadowGeometry, PlanetRenderer} =
    await import('../../modules/rendering/PlanetRenderer.js');

describe('moonShadowGeometry', () => {
  describe('illuminated fraction', () => {
    test('is zero at new moon', () => {
      expect(moonShadowGeometry(0).illuminated).toBeCloseTo(0, 9);
    });

    test('is one at full moon', () => {
      expect(moonShadowGeometry(0.5).illuminated).toBeCloseTo(1, 9);
    });

    test('is zero again at the end of the cycle', () => {
      expect(moonShadowGeometry(1).illuminated).toBeCloseTo(0, 9);
    });

    test('is a half at both quarters', () => {
      expect(moonShadowGeometry(0.25).illuminated).toBeCloseTo(0.5, 9);
      expect(moonShadowGeometry(0.75).illuminated).toBeCloseTo(0.5, 9);
    });

    test('rises monotonically from new to full', () => {
      let previous = -1;
      for (let phase = 0; phase <= 0.5; phase += 0.02) {
        const {illuminated} = moonShadowGeometry(phase);
        expect(illuminated).toBeGreaterThan(previous);
        previous = illuminated;
      }
    });

    test('falls monotonically from full to new', () => {
      let previous = 2;
      for (let phase = 0.5; phase <= 1; phase += 0.02) {
        const {illuminated} = moonShadowGeometry(phase);
        expect(illuminated).toBeLessThan(previous);
        previous = illuminated;
      }
    });

    test('is symmetric about full moon', () => {
      for (const offset of [0.05, 0.15, 0.25, 0.4]) {
        expect(moonShadowGeometry(0.5 - offset).illuminated)
            .toBeCloseTo(moonShadowGeometry(0.5 + offset).illuminated, 9);
      }
    });
  });

  describe('terminator', () => {
    // The regression this replaces had it backwards: the old
    // `cx + r * (1 - phase * 4)` put the terminator at the lit limb for a new
    // moon, drawing it almost fully lit, and across the whole disc at full
    // moon, drawing it almost fully dark.
    test('covers the whole disc at new moon', () => {
      expect(moonShadowGeometry(0).semiAxis).toBeCloseTo(-1, 9);
    });

    test('leaves the disc uncovered at full moon', () => {
      expect(moonShadowGeometry(0.5).semiAxis).toBeCloseTo(1, 9);
    });

    test('is a straight line at the quarters', () => {
      expect(moonShadowGeometry(0.25).semiAxis).toBeCloseTo(0, 9);
      expect(moonShadowGeometry(0.75).semiAxis).toBeCloseTo(0, 9);
    });

    test('bulges into the lit side while a crescent', () => {
      expect(moonShadowGeometry(0.1).semiAxis).toBeLessThan(0);
      expect(moonShadowGeometry(0.9).semiAxis).toBeLessThan(0);
    });

    test('retreats toward the shaded limb while gibbous', () => {
      expect(moonShadowGeometry(0.4).semiAxis).toBeGreaterThan(0);
      expect(moonShadowGeometry(0.6).semiAxis).toBeGreaterThan(0);
    });

    test('never exceeds the disc', () => {
      for (let phase = 0; phase <= 1; phase += 0.01) {
        expect(Math.abs(moonShadowGeometry(phase).semiAxis))
            .toBeLessThanOrEqual(1 + 1e-9);
      }
    });
  });

  describe('direction of travel', () => {
    test('reports waxing before full', () => {
      expect(moonShadowGeometry(0.2).waxing).toBe(true);
    });

    // The old waning branch closed its path on the point it started from, so
    // it enclosed no area: every waning phase drew the same half moon.
    test('reports waning after full', () => {
      expect(moonShadowGeometry(0.8).waxing).toBe(false);
    });

    test('mirrors the terminator across the cycle', () => {
      const waxing = moonShadowGeometry(0.15);
      const waning = moonShadowGeometry(0.85);

      expect(waxing.semiAxis).toBeCloseTo(waning.semiAxis, 9);
      expect(waxing.waxing).not.toBe(waning.waxing);
    });
  });
});

describe('drawMoon_', () => {
  let ctx;
  let renderer;

  beforeEach(() => {
    jest.clearAllMocks();
    installThreeMock();
    ctx = {
      arc: jest.fn(),
      ellipse: jest.fn(),
      beginPath: jest.fn(),
      fill: jest.fn(),
      clearRect: jest.fn(),
      fillStyle: '',
    };
    renderer = new PlanetRenderer({
      celestialSphere: new global.THREE.Group(),
      getSimulationTime: () => new Date(Date.UTC(2026, 0, 15)),
      getObserverLocation: () => ({lat: 0, lon: 0, height: 0}),
      requestRender: jest.fn(),
    });
  });

  test('draws no shadow at full moon', () => {
    renderer.drawMoon_(ctx, 128, 0.5);

    expect(ctx.ellipse).not.toHaveBeenCalled();
  });

  test('draws a shadow at new moon', () => {
    renderer.drawMoon_(ctx, 128, 0);

    expect(ctx.ellipse).toHaveBeenCalled();
  });

  test('the new-moon terminator spans the full radius', () => {
    renderer.drawMoon_(ctx, 128, 0);

    const [, , rx] = ctx.ellipse.mock.calls[0];
    expect(rx).toBeCloseTo(128 / 2 - 4, 6);
  });

  test('the quarter terminator collapses to a line', () => {
    renderer.drawMoon_(ctx, 128, 0.25);

    const [, , rx] = ctx.ellipse.mock.calls[0];
    expect(rx).toBeCloseTo(0, 6);
  });

  test('waxing and waning shade opposite limbs', () => {
    renderer.drawMoon_(ctx, 128, 0.25);
    const waxingCounterclockwise = ctx.arc.mock.calls.at(-1).at(-1);

    ctx.arc.mockClear();
    renderer.drawMoon_(ctx, 128, 0.75);
    const waningCounterclockwise = ctx.arc.mock.calls.at(-1).at(-1);

    expect(waxingCounterclockwise).not.toBe(waningCounterclockwise);
  });
});
