/**
 * @fileoverview Guards the per-frame and per-object cost of DSO halos.
 *
 * WebGLRenderer.render() calls scene.updateMatrixWorld() every frame, which
 * recomposes the local matrix of every object with matrixAutoUpdate set —
 * moved or not, visible or not. Static sprites and lines opt out; anything
 * that mutates its transform afterwards must call updateMatrix() itself.
 */

import {jest} from '@jest/globals';
import {
  installThreeMock,
  resetThreeStats,
  threeStats,
} from '../helpers/threeMock.js';

const mockGradient = {addColorStop: jest.fn()};
const mockContext = {
  createRadialGradient: jest.fn(() => mockGradient),
  clearRect: jest.fn(),
  beginPath: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  fillStyle: '',
};
HTMLCanvasElement.prototype.getContext = jest.fn(() => mockContext);

installThreeMock();

const {ExtendedObjectRenderer} =
    await import('../../modules/rendering/ExtendedObjectRenderer.js');
const {ConstellationRenderer} =
    await import('../../modules/rendering/ConstellationRenderer.js');

const STARS = [
  {hip: 1, ra: 75, dec: -5, mag: 1.0},
  {hip: 2, ra: 85, dec: 5, mag: 1.5},
  {hip: 3, ra: 80, dec: 0, mag: 2.0},
];
const CONSTELLATIONS = {Ori: {lines: [[1, 2], [2, 3]]}};
const DSOS = [
  {ra: 10, dec: 20, size_major: 5, mag: 8, type: 'G'},
  {ra: 30, dec: 40, size_major: 8, mag: 9, type: 'PN'},
  {ra: 50, dec: 60, size_major: 3, mag: 7, type: 'Neb'},
];

describe('per-frame matrix cost', () => {
  let celestialSphere;

  beforeEach(() => {
    jest.clearAllMocks();
    installThreeMock();
    celestialSphere = new global.THREE.Group();
  });

  /**
   * Matrix compositions caused by the scene's *contents* in one frame.
   *
   * Excludes the celestial sphere itself, which is deliberately left
   * auto-updating: it rotates for sidereal time every frame.
   * @returns {number}
   */
  function perFrameMatrixCost() {
    resetThreeStats();
    celestialSphere.updateMatrixWorld(true);
    const sphereItself = celestialSphere.matrixAutoUpdate ? 1 : 0;
    return threeStats.updateMatrixCalls - sphereItself;
  }

  describe('extended object sprites', () => {
    let renderer;

    beforeEach(() => {
      renderer = new ExtendedObjectRenderer({
        celestialSphere,
        getDSOs: () => DSOS,
        requestRender: jest.fn(),
      });
      renderer.create();
    });

    test('creates one sprite per sized DSO', () => {
      expect(renderer.getSprites()).toHaveLength(DSOS.length);
    });

    test('costs nothing per frame once created', () => {
      expect(perFrameMatrixCost()).toBe(0);
    });

    test('each sprite still has its matrix composed once, at creation', () => {
      for (const sprite of renderer.getSprites()) {
        expect(sprite.updateMatrixCount).toBeGreaterThanOrEqual(1);
      }
    });

    test('a resize recomposes the matrices it actually changes', () => {
      const before = renderer.getSprites()[0].updateMatrixCount;

      renderer.updateSizes(30, 800);

      expect(renderer.getSprites()[0].updateMatrixCount).toBe(before + 1);
    });

    test('the sprites still carry a usable scale after a resize', () => {
      renderer.updateSizes(30, 800);

      for (const sprite of renderer.getSprites()) {
        expect(Number.isFinite(sprite.scale.x)).toBe(true);
        expect(sprite.scale.x).toBeGreaterThan(0);
      }
    });
  });

  describe('shared halo texture', () => {
    let renderer;

    beforeEach(() => {
      renderer = new ExtendedObjectRenderer({
        celestialSphere,
        getDSOs: () => DSOS,
        requestRender: jest.fn(),
      });
      renderer.create();
    });

    test('every halo shares one texture instead of baking its own', () => {
      const textures = new Set(renderer.getSprites().map((s) => s.material.map));

      expect(textures.size).toBe(1);
    });

    test('each halo keeps its own material, so tint and opacity still vary',
        () => {
          const materials = new Set(
              renderer.getSprites().map((s) => s.material));

          expect(materials.size).toBe(DSOS.length);
        });

    test('the type tint moves to the material colour', () => {
      const [galaxy, planetary] = renderer.getSprites();

      expect(galaxy.material.color.equals(planetary.material.color))
          .toBe(false);
    });

    // The trap: the texture's centre alpha used to carry the magnitude term.
    // Normalising it to 1.0 without folding that term into the opacity would
    // flatten the brightness ramp, and nothing would visibly fail.
    test('brightness still tracks magnitude', () => {
      const bright = new ExtendedObjectRenderer({
        celestialSphere: new global.THREE.Group(),
        getDSOs: () => [{ra: 0, dec: 0, size_major: 5, mag: 2, type: 'G'}],
        requestRender: jest.fn(),
      });
      bright.create();
      const faint = new ExtendedObjectRenderer({
        celestialSphere: new global.THREE.Group(),
        getDSOs: () => [{ra: 0, dec: 0, size_major: 5, mag: 12, type: 'G'}],
        requestRender: jest.fn(),
      });
      faint.create();

      const brightOpacity = bright.getSprites()[0].material.opacity;
      const faintOpacity = faint.getSprites()[0].material.opacity;

      expect(brightOpacity).toBeCloseTo(0.15, 6);
      expect(faintOpacity).toBeCloseTo(0.002, 6);
      expect(brightOpacity / faintOpacity).toBeCloseTo(75, 1);
    });

    test('disposing a sprite does not destroy the shared texture', () => {
      const texture = renderer.getSprites()[0].material.map;

      renderer.dispose();

      expect(texture.disposed).toBe(false);
    });
  });

  describe('constellation lines', () => {
    beforeEach(() => {
      new ConstellationRenderer({
        celestialSphere,
        getStars: () => STARS,
        getConstellations: () => CONSTELLATIONS,
        requestRender: jest.fn(),
      }).createLines();
    });

    test('cost nothing per frame', () => {
      expect(perFrameMatrixCost()).toBe(0);
    });
  });

  describe('the parent still animates', () => {
    test('rotating the sphere does not resurrect per-child matrix work', () => {
      new ConstellationRenderer({
        celestialSphere,
        getStars: () => STARS,
        getConstellations: () => CONSTELLATIONS,
        requestRender: jest.fn(),
      }).createLines();

      celestialSphere.rotation.y = 1.234;

      // The sphere recomposes its own matrix, as it must; none of its
      // children do, even though every one of their world matrices changed.
      expect(perFrameMatrixCost()).toBe(0);
      expect(celestialSphere.updateMatrixCount).toBeGreaterThan(0);
    });
  });
});
