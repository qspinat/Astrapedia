/**
 * @fileoverview Tests for the altitude-through-the-night chart.
 */

import {altitudeChartSvg} from '../../modules/ui/AltitudeChart.js';

const HOUR = 3600 * 1000;
const t0 = new Date('2026-12-21T16:00:00Z');
const at = (h) => new Date(t0.getTime() + h * HOUR);
const curve = [0, 2, 4, 6, 8].map((h) => ({time: at(h), altitude: [5, 40, 70, 40, -10][h / 2]}));

/** Parse the chart so its shapes can be inspected. */
const parse = (svg) => new DOMParser().parseFromString(svg, 'image/svg+xml');

describe('altitudeChartSvg', () => {
  test('draws nothing without enough samples', () => {
    expect(altitudeChartSvg(curve.slice(0, 1), null, at(1))).toBe('');
  });

  test('plots one point per sample, below-horizon clamped to the horizon', () => {
    const doc = parse(altitudeChartSvg(curve, null, at(1)));
    const points = doc.querySelector('.alt-chart__line').getAttribute('points').split(' ');
    expect(points).toHaveLength(5);
    const horizonY = doc.querySelector('.alt-chart__horizon').getAttribute('y1');
    expect(points[4].split(',')[1]).toBe(horizonY);
  });

  test('shades the dark window within the chart', () => {
    const doc = parse(altitudeChartSvg(curve, {dusk: at(2), dawn: at(6)}, at(1)));
    const dark = doc.querySelector('.alt-chart__dark');
    expect(Number(dark.getAttribute('x'))).toBeCloseTo(75);
    expect(Number(dark.getAttribute('width'))).toBeCloseTo(150);
  });

  test('marks now only when it is inside the chart', () => {
    expect(parse(altitudeChartSvg(curve, null, at(3))).querySelector('.alt-chart__now')).not.toBeNull();
    expect(parse(altitudeChartSvg(curve, null, at(20))).querySelector('.alt-chart__now')).toBeNull();
  });
});
