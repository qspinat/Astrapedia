/**
 * @fileoverview Tests that planet sprites are repositioned rather than
 * rebuilt during playback, and that a texture load which outlives its sprite
 * is discarded.
 *
 * At 1000x speed a simulated hour elapses every ~3.6 real seconds, and the
 * planet-update callback used to run the full create() teardown each time:
 * every photo was re-fetched from the CDN, the sprite flickered back to its
 * drawn gradient, and each in-flight load resolved onto a disposed sprite.
 */

import {jest} from '@jest/globals';
import {installCanvasMock, installThreeMock, TextureLoader}
  from '../helpers/threeMock.js';

installCanvasMock();

installThreeMock();

const {PlanetRenderer} =
    await import('../../modules/rendering/PlanetRenderer.js');

describe('PlanetRenderer during time playback', () => {
  let renderer;
  let celestialSphere;

  beforeEach(() => {
    jest.clearAllMocks();
    installThreeMock();

    celestialSphere = new global.THREE.Group();
    renderer = new PlanetRenderer({
      celestialSphere,
      getSimulationTime: () => new Date(Date.UTC(2026, 0, 15, 22, 0, 0)),
      getObserverLocation: () => ({lat: 48.8566, lon: 2.3522, height: 0}),
      requestRender: jest.fn(),
    });
    renderer.create();
  });

  describe('updatePositions', () => {
    test('keeps the existing sprites rather than rebuilding them', () => {
      const before = [...renderer.sprites_];

      renderer.updatePositions();

      expect(renderer.sprites_).toEqual(before);
    });

    test('disposes nothing', () => {
      const materials = renderer.sprites_.map((s) => s.material);

      renderer.updatePositions();

      expect(materials.every((m) => !m.disposed)).toBe(true);
    });

    test('moves the sprites as simulated time advances', () => {
      let simTime = new Date(Date.UTC(2026, 0, 15, 22, 0, 0));
      renderer.getSimulationTime_ = () => simTime;
      const moon = renderer.sprites_.find((s) => s.userData.name === 'Moon');
      const before = {x: moon.position.x, y: moon.position.y};

      simTime = new Date(Date.UTC(2026, 0, 18, 22, 0, 0));
      renderer.updatePositions();

      expect(moon.position.x).not.toBeCloseTo(before.x, 6);
    });

    test('rebuilds if the sprites are missing', () => {
      renderer.sprites_ = [];

      renderer.updatePositions();

      expect(renderer.sprites_.length).toBeGreaterThan(0);
    });

    // The Moon's crescent is painted into its canvas texture rather than
    // derived from the transform, so the reposition-instead-of-rebuild change
    // above would otherwise freeze the drawn phase for the whole session.
    test('repaints the moon texture when the phase moves', () => {
      let simTime = new Date(Date.UTC(2026, 0, 15, 22, 0, 0));
      renderer.getSimulationTime_ = () => simTime;
      const moon = renderer.sprites_.find((s) => s.userData.name === 'Moon');
      moon.material.map.needsUpdate = false;
      const phaseBefore = moon.userData.phase;

      // Ten days on, a waxing crescent has become a waning gibbous.
      simTime = new Date(Date.UTC(2026, 0, 25, 22, 0, 0));
      renderer.updatePositions();

      expect(moon.userData.phase).not.toBeCloseTo(phaseBefore, 3);
      expect(moon.material.map.needsUpdate).toBe(true);
    });

    test('leaves the texture alone when the phase has not moved', () => {
      const moon = renderer.sprites_.find((s) => s.userData.name === 'Moon');
      moon.material.map.needsUpdate = false;

      renderer.updatePositions();

      expect(moon.material.map.needsUpdate).toBe(false);
    });

    test('does not repaint over a photograph that already replaced the disc',
        () => {
          let simTime = new Date(Date.UTC(2026, 0, 15, 22, 0, 0));
          renderer.getSimulationTime_ = () => simTime;
          const moon =
              renderer.sprites_.find((s) => s.userData.name === 'Moon');
          moon.userData.imageLoaded = true;
          moon.material.map.needsUpdate = false;

          simTime = new Date(Date.UTC(2026, 0, 25, 22, 0, 0));
          renderer.updatePositions();

          expect(moon.material.map.needsUpdate).toBe(false);
        });

    test('does not refetch planet textures', () => {
      TextureLoader.reset();

      renderer.updatePositions();

      expect(TextureLoader.pending).toHaveLength(0);
    });
  });

  describe('stale texture loads', () => {
    /**
     * Starts a real image load for one sprite.
     * @return {!Object} The sprite the load targets.
     */
    function startImageLoad() {
      const sprite = renderer.sprites_.find((s) => s.userData.imageUrl);
      renderer.loadPlanetImage_(sprite, sprite.userData.imageUrl);
      return sprite;
    }

    test('applies a texture that resolves against the current sprites', () => {
      const sprite = startImageLoad();
      const originalMaterial = sprite.material;

      TextureLoader.resolveAll();

      expect(sprite.material).not.toBe(originalMaterial);
      expect(sprite.userData.imageLoaded).toBe(true);
    });

    // The regression: create() disposes every sprite, so a load started before
    // it resolved onto an orphan — double-disposing the material, stranding
    // the texture, and marking imageLoaded on dead userData, which left the
    // freshly built sprite to request the same image again.
    test('discards a texture that resolves after a rebuild', () => {
      const staleSprite = startImageLoad();

      renderer.create();
      const freshMaterials = renderer.sprites_.map((s) => s.material);
      TextureLoader.resolveAll();

      expect(staleSprite.userData.imageLoaded).toBe(false);
      expect(renderer.sprites_.map((s) => s.material))
          .toEqual(freshMaterials);
    });

    test('does not double-dispose the material of a rebuilt sprite', () => {
      const staleSprite = startImageLoad();
      renderer.create();
      const disposalsAfterRebuild =
          staleSprite.material.disposed;

      TextureLoader.resolveAll();

      // create() already disposed it once; the late load must not touch it.
      expect(staleSprite.material.disposed).toBe(disposalsAfterRebuild);
    });

    test('a rebuilt sprite can still load its own texture', () => {
      startImageLoad();
      renderer.create();
      TextureLoader.resolveAll();

      const sprite = startImageLoad();
      TextureLoader.resolveAll();

      expect(sprite.userData.imageLoaded).toBe(true);
    });
  });
});
