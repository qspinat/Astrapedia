/**
 * @fileoverview A small altitude-over-the-night chart for the info panel:
 * the object's height above the horizon from sunset to sunrise, with the
 * dark window shaded and a marker for the current time.
 */

import {formatClockTime} from '../core/Utils.js';

const WIDTH = 300;
const HEIGHT = 96;
const PAD_TOP = 6;
const PAD_BOTTOM = 16;
const PLOT_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM;

/** Altitude above which seeing through the atmosphere is reasonable. */
const GOOD_ALTITUDE_DEG = 30;

/**
 * @param {!Array<{time: !Date, altitude: number}>} curve - Altitude samples,
 *     oldest first
 * @param {?{dusk: ?Date, dawn: ?Date}} night - Dark window to shade
 * @param {!Date} now - Current (simulated) time
 * @returns {string} SVG markup, or '' with fewer than two samples
 */
export function altitudeChartSvg(curve, night, now) {
  if (curve.length < 2) return '';
  const t0 = curve[0].time.getTime();
  const t1 = curve[curve.length - 1].time.getTime();
  const round = (v) => Math.round(v * 10) / 10;
  const x = (time) => round((time.getTime() - t0) / (t1 - t0) * WIDTH);
  const y = (alt) => round(PAD_TOP + (1 - Math.max(0, alt) / 90) * PLOT_HEIGHT);
  const inRange = (time) => time && time.getTime() >= t0 && time.getTime() <= t1;

  const parts = [];
  if (night?.dusk && night?.dawn) {
    const from = Math.max(t0, night.dusk.getTime());
    const to = Math.min(t1, night.dawn.getTime());
    if (to > from) {
      parts.push(`<rect class="alt-chart__dark" x="${x(new Date(from))}" y="${PAD_TOP}" ` +
          `width="${round(x(new Date(to)) - x(new Date(from)))}" height="${PLOT_HEIGHT}"/>`);
    }
  }
  parts.push(`<line class="alt-chart__guide" x1="0" x2="${WIDTH}" ` +
      `y1="${y(GOOD_ALTITUDE_DEG)}" y2="${y(GOOD_ALTITUDE_DEG)}"/>`);
  parts.push(`<line class="alt-chart__horizon" x1="0" x2="${WIDTH}" ` +
      `y1="${y(0)}" y2="${y(0)}"/>`);
  const points = curve.map((s) => `${x(s.time)},${y(s.altitude)}`).join(' ');
  parts.push(`<polyline class="alt-chart__line" points="${points}"/>`);
  if (inRange(now)) {
    parts.push(`<line class="alt-chart__now" x1="${x(now)}" x2="${x(now)}" ` +
        `y1="${PAD_TOP}" y2="${y(0)}"/>`);
  }
  const labelY = HEIGHT - 3;
  parts.push(`<text class="alt-chart__label" x="0" y="${labelY}">` +
      `${formatClockTime(curve[0].time)}</text>`);
  parts.push(`<text class="alt-chart__label" x="${WIDTH}" y="${labelY}" text-anchor="end">` +
      `${formatClockTime(curve[curve.length - 1].time)}</text>`);
  parts.push(`<text class="alt-chart__label" x="2" y="${y(GOOD_ALTITUDE_DEG) - 2}">` +
      `${GOOD_ALTITUDE_DEG}°</text>`);

  return `<svg class="alt-chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" ` +
      `aria-label="Altitude through the night">${parts.join('')}</svg>`;
}
