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

    test('a resize recomposes the matrix of a halo that is drawn', () => {
      renderer.setMagnitudeLimit(12);
      const sprite = renderer.getSprites()[0];
      const before = sprite.updateMatrixCount;

      renderer.updateSizes(30, 800);

      expect(sprite.updateMatrixCount).toBe(before + 1);
    });

    // The fixture's DSOs are magnitude 7-9, so the default limit hides all of
    // them. Resizing what is not drawn is pure waste, and it is the common
    // case: 1,672 of the 1,729 catalogued halos are hidden at the default.
    test('a resize skips halos the magnitude limit has hidden', () => {
      renderer.setMagnitudeLimit(4);
      const sprites = renderer.getSprites();
      const before = sprites.map((s) => s.updateMatrixCount);

      renderer.updateSizes(30, 800);

      expect(sprites.map((s) => s.updateMatrixCount)).toEqual(before);
    });

    test('the sprites still carry a usable scale after a resize', () => {
      renderer.setMagnitudeLimit(12);
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

  describe('magnitude limit', () => {
    const FADE = 1.5;
    const dsos = [
      {ra: 0, dec: 0, size_major: 5, mag: 3, type: 'G'},
      {ra: 10, dec: 10, size_major: 5, mag: 5.5, type: 'G'},
      {ra: 20, dec: 20, size_major: 5, mag: 5.6, type: 'G'},
      {ra: 30, dec: 30, size_major: 5, mag: 11, type: 'G'},
    ];

    /** @return {!ExtendedObjectRenderer} */
    function rendererAtLimit(limit) {
      const r = new ExtendedObjectRenderer({
        celestialSphere,
        getDSOs: () => dsos,
        requestRender: jest.fn(),
      });
      r.create();
      r.setMagnitudeLimit(limit);
      return r;
    }

    // The inconsistency this closes: halos were drawn for every sized deep
    // sky object whatever the limit, while ClickHandler filtered clicks at
    // limit + fade range. At limit 4 that left 1,672 of 1,729 halos visible
    // on screen but unselectable.
    test('hides halos fainter than the limit plus the fade range', () => {
      const visible = rendererAtLimit(4).getSprites()
          .filter((s) => s.visible)
          .map((s) => s.userData.dso.mag);

      expect(visible).toEqual([3, 5.5]);
    });

    test('includes an object exactly at the fade boundary', () => {
      const r = rendererAtLimit(4);
      const atBoundary = r.getSprites()
          .find((s) => s.userData.dso.mag === 4 + FADE);

      expect(atBoundary.visible).toBe(true);
    });

    test('shows everything again when the limit is raised', () => {
      const r = rendererAtLimit(4);

      r.setMagnitudeLimit(11);

      expect(r.getSprites().every((s) => s.visible)).toBe(true);
    });

    test('applies the limit to newly created halos as well', () => {
      const r = rendererAtLimit(4);

      r.create();

      const visible = r.getSprites().filter((s) => s.visible);
      expect(visible).toHaveLength(2);
    });

    test('keeps an object with no magnitude visible', () => {
      const r = new ExtendedObjectRenderer({
        celestialSphere,
        getDSOs: () => [{ra: 0, dec: 0, size_major: 5, type: 'G'}],
        requestRender: jest.fn(),
      });
      r.create();
      r.setMagnitudeLimit(1);

      expect(r.getSprites()[0].visible).toBe(true);
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
