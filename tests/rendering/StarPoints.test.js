/**
 * @jest-environment jsdom
 * @fileoverview Tests for how stars look: colour, size and brightness.
 */

import {installThreeMock} from '../helpers/threeMock.js';

installThreeMock();

const {
  bvToTemperature,
  createStarMaterial,
  segmentEndAttributes,
  starColor,
  starDisc,
  trimLinesAtStars,
  updateStarScreen,
} = await import('../../modules/rendering/StarPoints.js');

describe('starColor', () => {
  test('the Sun comes out near 5800 K', () => {
    expect(bvToTemperature(0.65)).toBeGreaterThan(5600);
    expect(bvToTemperature(0.65)).toBeLessThan(6000);
  });

  test('hot stars are blue and cool stars are orange', () => {
    const [rRigel, , bRigel] = starColor(-0.03);
    const [rBetelgeuse, , bBetelgeuse] = starColor(1.85);
    expect(bRigel).toBeGreaterThan(rRigel);
    expect(rBetelgeuse).toBeGreaterThan(bBetelgeuse);
  });

  test('falls back to the spectral class without a colour index', () => {
    expect(starColor(null, 'M2Iab')).toEqual(starColor(1.55));
  });

  test('is white with nothing to go on', () => {
    expect(starColor(undefined, '')).toEqual([1, 1, 1]);
  });

  test('channels stay within 0-1 at the extremes', () => {
    for (const bv of [-0.4, 3]) {
      for (const c of starColor(bv)) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('starDisc', () => {
  test('brighter stars are bigger and brighter', () => {
    const vega = starDisc(0, 6);
    const faint = starDisc(5, 6);
    expect(vega.radius).toBeGreaterThan(faint.radius);
    expect(vega.intensity).toBeGreaterThan(faint.intensity);
  });

  test('a hundredfold brighter star is only a few times wider', () => {
    const ratio = starDisc(0, 6).radius / starDisc(5, 6).radius;
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(4);
  });

  test('a star too small for a pixel keeps a minimum size and dims', () => {
    const tiny = starDisc(9, 6, 0.8);
    expect(tiny.radius).toBeGreaterThan(0);
    expect(tiny.intensity).toBeLessThan(starDisc(6, 6, 0.8).intensity / 2);
  });
});

describe('createStarMaterial', () => {
  test('adds light and resizes with the screen', () => {
    const material = createStarMaterial(5);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    window.innerWidth = 1000;
    window.innerHeight = 1000;
    updateStarScreen();
    const big = material.uniforms.screenScale.value;
    window.innerWidth = 400;
    window.innerHeight = 800;
    updateStarScreen();
    expect(material.uniforms.screenScale.value).toBeLessThan(big);
  });
});

describe('line trimming', () => {
  test('each vertex carries both ends of its segment', () => {
    const ends = segmentEndAttributes([0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, -1], [1, 2, 3, 4]);
    expect(ends.segA).toEqual([0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0]);
    expect(ends.segB).toEqual([1, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, -1]);
    expect(ends.magA).toEqual([1, 1, 3, 3]);
    expect(ends.magB).toEqual([2, 2, 4, 4]);
  });

  test('the line shader clears a gap at each end', () => {
    const material = new THREE.LineBasicMaterial();
    const magLimit = {value: 5};
    trimLinesAtStars(material, magLimit);
    const shader = {
      uniforms: {},
      vertexShader: 'void main() {\n#include <project_vertex>\n}',
      fragmentShader: 'void main() {\n#include <clipping_planes_fragment>\n}',
    };
    material.onBeforeCompile(shader);
    expect(shader.uniforms.magLimit).toBe(magLimit);
    expect(shader.vertexShader).toContain('vEndA');
    expect(shader.fragmentShader).toContain('discard');
  });
});
