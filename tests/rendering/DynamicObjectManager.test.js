/**
 * @fileoverview Tests for dynamic DSO ingestion and sprite creation.
 *
 * These pin the contract between DynamicDataLoader (which produces DSO rows)
 * and DynamicObjectManager (which consumes them), and the contract between
 * the sprites this module creates and ExtendedObjectRenderer.updateSizes,
 * which scales them every frame.
 */

import {jest} from '@jest/globals';
import {
  installThreeMock,
  resetThreeStats,
} from '../helpers/threeMock.js';

// The halo textures are drawn on a 2D canvas, which jsdom does not implement.
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

const {DynamicObjectManager} =
    await import('../../modules/rendering/DynamicObjectManager.js');
const {ExtendedObjectRenderer} =
    await import('../../modules/rendering/ExtendedObjectRenderer.js');

/**
 * Builds a DSO row in exactly the shape DynamicDataLoader.parseVOTableDSOs_
 * emits. Keeping this in one place is the point of the test: the production
 * bug is that the consumer reads a different shape than the producer writes.
 * @param {!Object=} overrides
 * @return {!Object}
 */
function loaderDso(overrides = {}) {
  return {
    ra: 210.8,
    dec: 54.35,
    mag: 9.4,
    size_major: 8.7,
    size_minor: 3.5,
    name: 'NGC5457',
    type: 'Gx',
    ...overrides,
  };
}

describe('DynamicObjectManager dynamic DSOs', () => {
  let manager;
  let celestialSphere;
  let extendedSprites;

  beforeEach(() => {
    jest.clearAllMocks();
    resetThreeStats();

    celestialSphere = new global.THREE.Group();
    extendedSprites = [];

    manager = new DynamicObjectManager({
      getCelestialSphere: () => celestialSphere,
      getCamera: () => new global.THREE.PerspectiveCamera(),
      getStarFieldRenderer: () => null,
      getExtendedObjectSprites: () => extendedSprites,
      addExtendedSprite: (sprite) => extendedSprites.push(sprite),
      removeExtendedSprite: (sprite) => {
        const i = extendedSprites.indexOf(sprite);
        if (i !== -1) extendedSprites.splice(i, 1);
      },
      getMagnitude: () => 12,
      requestRender: jest.fn(),
    });
  });

  describe('addDynamicDSOs', () => {
    // Regression: addDynamicDSOs used to index these objects positionally
    // (row[0], row[1], ...), so every value was undefined, parseFloat gave
    // NaN, and the isNaN guard dropped every row silently. Dynamic DSO
    // loading had never worked.
    test('ingests rows in the shape the loader emits', () => {
      manager.addDynamicDSOs([
        loaderDso(),
        loaderDso({ra: 148.97, dec: 69.68, name: 'NGC3031'}),
      ]);

      expect(manager.dynamicDSOs).toHaveLength(2);
    });

    test('creates one sprite per accepted DSO', () => {
      manager.addDynamicDSOs([loaderDso()]);

      expect(extendedSprites).toHaveLength(1);
      expect(celestialSphere.children).toHaveLength(1);
    });

    test('carries the loader-provided name and type through', () => {
      manager.addDynamicDSOs([loaderDso({name: 'NGC5457', type: 'Gx'})]);

      expect(manager.dynamicDSOs[0]).toMatchObject({
        name: 'NGC5457',
        type: 'Gx',
      });
    });

    test('deduplicates DSOs at the same position', () => {
      manager.addDynamicDSOs([loaderDso(), loaderDso()]);

      expect(manager.dynamicDSOs).toHaveLength(1);
    });

    test('keeps distinct positions apart', () => {
      manager.addDynamicDSOs([
        loaderDso({ra: 10, dec: 10}),
        loaderDso({ra: 20, dec: 20}),
      ]);

      expect(manager.dynamicDSOs).toHaveLength(2);
    });

    test('drops rows with unusable coordinates', () => {
      manager.addDynamicDSOs([loaderDso({ra: NaN, dec: 5})]);

      expect(manager.dynamicDSOs).toHaveLength(0);
      expect(extendedSprites).toHaveLength(0);
    });

    test('accepts an empty batch without creating anything', () => {
      manager.addDynamicDSOs([]);

      expect(manager.dynamicDSOs).toHaveLength(0);
      expect(extendedSprites).toHaveLength(0);
    });
  });

  describe('sprite contract with ExtendedObjectRenderer', () => {
    /**
     * Builds a dynamic sprite directly, bypassing addDynamicDSOs so this
     * contract can be checked independently of the ingestion bug above.
     * @return {!Object}
     */
    function createDynamicSprite() {
      manager.createDynamicDSOSprite_(loaderDso(), 99, celestialSphere);
      return extendedSprites[extendedSprites.length - 1];
    }

    test('marks the sprite as dynamic', () => {
      expect(createDynamicSprite().userData.isDynamic).toBe(true);
    });

    test('carries the angular size updateSizes reads', () => {
      expect(createDynamicSprite().userData.angularSizeArcmin).toBe(8.7);
    });

    // updateSizes computes Math.max(userData.baseSize, worldSize). These
    // sprites used to omit baseSize, making that NaN and scaling the sprite to
    // NaN — latent only because the ingestion bug meant none were ever built.
    test('sets the baseSize that updateSizes requires', () => {
      expect(Number.isFinite(createDynamicSprite().userData.baseSize))
          .toBe(true);
    });

    test('survives a frame of updateSizes with a finite scale', () => {
      const sprite = createDynamicSprite();
      const renderer = new ExtendedObjectRenderer({
        celestialSphere,
        getDSOs: () => [],
        requestRender: jest.fn(),
      });
      // skymap.js aliases the renderer's array and the app-level array, so
      // dynamic sprites are scaled by the renderer that never created them.
      renderer.sprites_ = extendedSprites;

      renderer.updateSizes(60, 800);

      expect(Number.isFinite(sprite.scale.x)).toBe(true);
      expect(sprite.scale.x).toBeGreaterThan(0);
    });

    // ExtendedObjectRenderer.create() rebuilds the static sprites, but the
    // array it clears is shared with DynamicObjectManager. It must not dispose
    // sprites it does not own, and must not swap the array out from under the
    // alias skymap.js holds.
    describe('when the static sprites are rebuilt', () => {
      let renderer;

      beforeEach(() => {
        renderer = new ExtendedObjectRenderer({
          celestialSphere,
          getDSOs: () => [
            {ra: 10, dec: 20, size_major: 5, mag: 8, type: 'G'},
          ],
          requestRender: jest.fn(),
        });
        renderer.sprites_ = extendedSprites;
      });

      test('keeps dynamic sprites alive', () => {
        const dynamicSprite = createDynamicSprite();

        renderer.create();

        expect(extendedSprites).toContain(dynamicSprite);
        expect(dynamicSprite.material.disposed).toBe(false);
      });

      test('still rebuilds the static sprites', () => {
        createDynamicSprite();

        renderer.create();

        const statics =
            extendedSprites.filter((s) => !s.userData?.isDynamic);
        expect(statics).toHaveLength(1);
      });

      test('keeps the array identity the app aliases', () => {
        createDynamicSprite();

        renderer.create();

        expect(renderer.sprites_).toBe(extendedSprites);
      });

      test('disposes the static sprites it replaces', () => {
        renderer.create();
        const firstStatic = extendedSprites[0];

        renderer.create();

        expect(firstStatic.material.disposed).toBe(true);
      });
    });
  });
});
