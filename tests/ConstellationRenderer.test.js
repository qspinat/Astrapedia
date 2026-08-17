/**
 * @fileoverview Tests for ConstellationRenderer focus mode.
 */

import {jest} from '@jest/globals';
import {ConstellationRenderer} from '../modules/rendering/ConstellationRenderer.js';
import {CONSTELLATIONS} from '../modules/core/Constants.js';
import {
  installThreeMock,
  resetThreeStats,
  spyOnThreeConstructors,
} from './helpers/threeMock.js';

// Helper to create a mock line with material
function createMockLine(constName) {
  return {
    userData: {constellation: constName},
    material: {
      opacity: CONSTELLATIONS.LINE_OPACITY,
      color: {setHex: jest.fn(), getHex: jest.fn(() => 0x3366AA)},
      linewidth: 1,
      clone: jest.fn(function() {
        return {
          opacity: this.opacity,
          color: {setHex: jest.fn(), getHex: jest.fn(() => 0x3366AA)},
          linewidth: 1,
          dispose: jest.fn(),
        };
      }),
      dispose: jest.fn(),
    },
    geometry: {
      computeBoundingSphere: jest.fn(),
      clone: jest.fn(function() { return {dispose: jest.fn()}; }),
      dispose: jest.fn(),
    },
    visible: true,
    parent: null,
  };
}

installThreeMock();
const three = spyOnThreeConstructors([
  'Group',
  'LineBasicMaterial',
  'BufferGeometry',
  'Line',
]);

// Sample star data: two constellations at known positions
const STARS = [
  // Ori (Orion) stars - around RA=80, Dec=0
  {hip: 1, ra: 75, dec: -5, mag: 1.0},
  {hip: 2, ra: 85, dec: 5, mag: 1.5},
  {hip: 3, ra: 80, dec: 0, mag: 2.0},
  // UMa (Ursa Major) stars - around RA=180, Dec=60
  {hip: 10, ra: 175, dec: 55, mag: 2.0},
  {hip: 11, ra: 185, dec: 65, mag: 2.5},
  {hip: 12, ra: 180, dec: 60, mag: 1.8},
];

const CONSTELLATIONS_DATA = {
  Ori: {lines: [[1, 2], [2, 3]]},
  UMa: {lines: [[10, 11], [11, 12]]},
};

describe('ConstellationRenderer focus mode', () => {
  let renderer;
  let mockCelestialSphere;
  let mockRequestRender;

  beforeEach(() => {
    jest.clearAllMocks();
    resetThreeStats();

    mockCelestialSphere = {
      add: jest.fn(),
      remove: jest.fn(),
    };
    mockRequestRender = jest.fn();

    renderer = new ConstellationRenderer({
      celestialSphere: mockCelestialSphere,
      getStars: () => STARS,
      getConstellations: () => CONSTELLATIONS_DATA,
      requestRender: mockRequestRender,
    });
  });

  describe('computeConstellationCenters_', () => {
    test('computes centers for each constellation', () => {
      renderer.createLines();

      expect(renderer.constellationCenters_.size).toBe(2);
      expect(renderer.constellationCenters_.has('Ori')).toBe(true);
      expect(renderer.constellationCenters_.has('UMa')).toBe(true);
    });

    test('center is near the mean of star positions', () => {
      renderer.createLines();

      const oriCenter = renderer.constellationCenters_.get('Ori');
      // Ori stars are at RA ~75-85, Dec ~-5 to 5, center should be near RA=80, Dec=0
      expect(oriCenter.ra).toBeCloseTo(80, 0);
      expect(oriCenter.dec).toBeCloseTo(0, 0);

      const umaCenter = renderer.constellationCenters_.get('UMa');
      // UMa stars at RA ~175-185, Dec ~55-65, center should be near RA=180, Dec=60
      // Not exactly 180° because cos(dec) varies across stars, weighting
      // the Cartesian mean by solid angle (correct spherical centroid)
      expect(Math.abs(umaCenter.ra - 180)).toBeLessThan(1);
      expect(Math.abs(umaCenter.dec - 60)).toBeLessThan(1);
    });

    test('initializes all opacities to 0', () => {
      renderer.createLines();

      renderer.constellationOpacities_.forEach((opacity) => {
        expect(opacity).toBe(0);
      });
    });

    test('skips constellations with no matching stars', () => {
      const rendererNoStars = new ConstellationRenderer({
        celestialSphere: mockCelestialSphere,
        getStars: () => [],
        getConstellations: () => CONSTELLATIONS_DATA,
        requestRender: mockRequestRender,
      });

      rendererNoStars.createLines();

      expect(rendererNoStars.constellationCenters_.size).toBe(0);
    });
  });

  describe('setMode', () => {
    test('updates internal mode', () => {
      renderer.setMode(CONSTELLATIONS.MODE_FOCUS);
      expect(renderer.mode_).toBe(CONSTELLATIONS.MODE_FOCUS);

      renderer.setMode(CONSTELLATIONS.MODE_ALL);
      expect(renderer.mode_).toBe(CONSTELLATIONS.MODE_ALL);
    });
  });

  describe('updateFocusMode', () => {
    beforeEach(() => {
      renderer.createLines();
      renderer.setMode(CONSTELLATIONS.MODE_FOCUS);
    });

    test('returns true when opacities are changing', () => {
      const result = renderer.updateFocusMode(80, 0);
      expect(result).toBe(true);
    });

    test('fades in nearest constellation', () => {
      // View pointing at Orion (RA=80, Dec=0)
      renderer.updateFocusMode(80, 0);

      const oriOpacity = renderer.constellationOpacities_.get('Ori');
      expect(oriOpacity).toBeGreaterThan(0);
    });

    test('fades out distant constellations', () => {
      // View pointing at Orion - UMa should stay at 0
      renderer.updateFocusMode(80, 0);

      const umaOpacity = renderer.constellationOpacities_.get('UMa');
      expect(umaOpacity).toBe(0);
    });

    test('returns false when all opacities have converged', () => {
      // Run many iterations to converge
      for (let i = 0; i < 200; i++) {
        renderer.updateFocusMode(80, 0);
      }

      const result = renderer.updateFocusMode(80, 0);
      expect(result).toBe(false);
    });

    test('converges to LINE_OPACITY for nearest constellation', () => {
      for (let i = 0; i < 200; i++) {
        renderer.updateFocusMode(80, 0);
      }

      const oriOpacity = renderer.constellationOpacities_.get('Ori');
      expect(oriOpacity).toBeCloseTo(CONSTELLATIONS.LINE_OPACITY, 2);
    });

    test('no constellation selected when view is beyond FOCUS_RADIUS', () => {
      // Point very far from both constellations (RA=300, Dec=-80)
      renderer.updateFocusMode(300, -80);

      // Both should remain at 0
      renderer.constellationOpacities_.forEach((opacity) => {
        expect(opacity).toBe(0);
      });
    });

    test('does not modify highlighted constellation lines', () => {
      // Simulate a highlight on Ori
      renderer.highlightedConstellation_ = 'Ori';

      // Set up lines group with mock lines that have constellation data
      const oriLine = createMockLine('Ori');
      const umaLine = createMockLine('UMa');
      oriLine.material.opacity = 1.0; // highlighted state
      renderer.linesGroup_ = {
        children: [oriLine, umaLine],
        visible: true,
      };

      // Run focus mode pointing at UMa
      renderer.updateFocusMode(180, 60);

      // Ori line should be untouched (still at highlighted opacity)
      expect(oriLine.material.opacity).toBe(1.0);
    });

    test('skips material loop when nothing changed', () => {
      // Converge fully
      for (let i = 0; i < 200; i++) {
        renderer.updateFocusMode(80, 0);
      }

      // Track material changes on next call
      const linesGroup = renderer.linesGroup_;
      const lineCount = linesGroup.children.length;
      const opacitiesBefore = linesGroup.children.map((l) => l.material?.opacity);

      const needsRender = renderer.updateFocusMode(80, 0);

      expect(needsRender).toBe(false);
      // Opacities should be unchanged (material loop was skipped)
      linesGroup.children.forEach((l, i) => {
        if (l.material) {
          expect(l.material.opacity).toBe(opacitiesBefore[i]);
        }
      });
    });
  });

  describe('resetOpacities', () => {
    beforeEach(() => {
      renderer.createLines();
      renderer.setMode(CONSTELLATIONS.MODE_FOCUS);
      // Run focus mode to set some opacities
      for (let i = 0; i < 50; i++) {
        renderer.updateFocusMode(80, 0);
      }
    });

    test('resets all opacity map values to 0', () => {
      renderer.resetOpacities();

      renderer.constellationOpacities_.forEach((opacity) => {
        expect(opacity).toBe(0);
      });
    });

    test('restores all lines to default opacity', () => {
      renderer.resetOpacities();

      renderer.linesGroup_.children.forEach((line) => {
        expect(line.material.opacity).toBe(CONSTELLATIONS.LINE_OPACITY);
        expect(line.visible).toBe(true);
      });
    });

    test('calls requestRender', () => {
      mockRequestRender.mockClear();
      renderer.resetOpacities();
      expect(mockRequestRender).toHaveBeenCalled();
    });
  });

  describe('highlight/unhighlight in focus mode', () => {
    beforeEach(() => {
      renderer.createLines();
      renderer.setMode(CONSTELLATIONS.MODE_FOCUS);
      // Converge focus on Orion
      for (let i = 0; i < 200; i++) {
        renderer.updateFocusMode(80, 0);
      }
    });

    test('unhighlight restores focus opacity (not default)', () => {
      // UMa should be at opacity 0 in focus mode (far from view center)
      const umaOpacity = renderer.constellationOpacities_.get('UMa');
      expect(umaOpacity).toBe(0);

      // Highlight UMa
      renderer.highlight('UMa');
      expect(renderer.highlightedConstellation_).toBe('UMa');

      // Unhighlight - should restore to focus opacity (0), not LINE_OPACITY
      renderer.unhighlight();

      // Find UMa lines and check their opacity
      renderer.linesGroup_.children.forEach((line) => {
        if (line.userData?.isGlow) return;
        if (line.userData.constellation === 'UMa') {
          expect(line.material.opacity).toBe(0);
        }
      });
    });

    test('unhighlight in all mode restores to LINE_OPACITY', () => {
      renderer.setMode(CONSTELLATIONS.MODE_ALL);
      renderer.resetOpacities();

      renderer.highlight('UMa');
      renderer.unhighlight();

      renderer.linesGroup_.children.forEach((line) => {
        if (line.userData?.isGlow) return;
        if (line.userData.constellation === 'UMa') {
          expect(line.material.opacity).toBe(CONSTELLATIONS.LINE_OPACITY);
        }
      });
    });
  });
});
