/**
 * @fileoverview Tests for the live image-resolution path.
 *
 * ImageRenderer.fetchBestImage is what the app actually runs — the info panel
 * reaches it through SelectionManager and the in-sky sprites through
 * triggerDynamicLoad_ — and it had no coverage at all until these tests. The
 * only image tests that existed covered ImageFetcher, a fork nothing called,
 * which has since been deleted.
 */

import {jest} from '@jest/globals';
import {installThreeMock} from '../helpers/threeMock.js';

installThreeMock();

const {ImageRenderer} =
    await import('../../modules/rendering/ImageRenderer.js');

/** A VizieR/NASA/Wikimedia response that finds nothing. */
function emptyApiResponse() {
  return {
    ok: true,
    json: async () => ({
      collection: {items: []},
      query: {pages: {}},
    }),
    headers: {get: () => '0'},
  };
}

describe('ImageRenderer.fetchBestImage', () => {
  let renderer;

  beforeEach(() => {
    jest.clearAllMocks();
    installThreeMock();
    global.fetch = jest.fn(async () => emptyApiResponse());

    renderer = new ImageRenderer({
      celestialSphere: new global.THREE.Group(),
      getDSOs: () => [],
      camera: new global.THREE.PerspectiveCamera(),
      renderer: {domElement: {width: 800, height: 600}},
      requestRender: jest.fn(),
    });
  });

  describe('curated images', () => {
    test('returns a curated image without touching the network', async () => {
      const result = await renderer.fetchBestImage('M31', 10.68, 41.27, 'G');

      expect(result.url).toBeTruthy();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    // Three curated entries are {url: null} sentinels meaning "no curated
    // image exists, go straight to the sky survey" — NGC869, NGC884 and
    // IC4665. Treating the sentinel as "no image" would lose them entirely.
    test('falls through to the sky survey for a null curated sentinel',
        async () => {
          const result =
              await renderer.fetchBestImage('NGC869', 34.75, 57.13, 'OCl', 30);

          expect(result.url).toBeTruthy();
          expect(result.source).toBe('DSS');
        });
  });

  describe('caching', () => {
    test('serves a settled result from cache', async () => {
      const first = await renderer.fetchBestImage('M31', 10.68, 41.27, 'G');
      const second = await renderer.fetchBestImage('M31', 10.68, 41.27, 'G');

      expect(second).toEqual(first);
    });

    test('caches a negative result so it is not refetched', async () => {
      await renderer.fetchBestImage('NGC9999', 12, 34, 'Star');
      const callsAfterFirst = global.fetch.mock.calls.length;

      await renderer.fetchBestImage('NGC9999', 12, 34, 'Star');

      expect(global.fetch.mock.calls).toHaveLength(callsAfterFirst);
    });
  });

  describe('concurrent callers', () => {
    // The regression. The cache previously held a {loading: true} sentinel
    // during the fetch and returned null to anyone who arrived while it was
    // set. Opening a DSO's info panel starts a 1-2s fetch; within that window
    // the animate loop picks the same object's sprite, receives null, sets
    // needsDynamicLoad = false and gives up — so that object's in-sky image
    // never loaded again for the rest of the session.
    test('a second caller joins the in-flight fetch instead of getting null',
        async () => {
          const [panel, sprite] = await Promise.all([
            renderer.fetchBestImage('NGC6820', 295.8, 23.1, 'Neb', 40),
            renderer.fetchBestImage('NGC6820', 295.8, 23.1, 'Neb', 40),
          ]);

          expect(panel).not.toBeNull();
          expect(sprite).not.toBeNull();
          expect(sprite).toEqual(panel);
        });

    test('resolves the fetch only once for concurrent callers', async () => {
      const spy = jest.spyOn(renderer, 'resolveBestImage_');

      await Promise.all([
        renderer.fetchBestImage('NGC6820', 295.8, 23.1, 'Neb', 40),
        renderer.fetchBestImage('NGC6820', 295.8, 23.1, 'Neb', 40),
        renderer.fetchBestImage('NGC6820', 295.8, 23.1, 'Neb', 40),
      ]);

      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('a caller arriving after the fetch settles gets the same result',
        async () => {
          const inFlight =
              renderer.fetchBestImage('NGC6820', 295.8, 23.1, 'Neb', 40);
          const first = await inFlight;

          const later =
              await renderer.fetchBestImage('NGC6820', 295.8, 23.1, 'Neb', 40);

          expect(later).toEqual(first);
        });
  });

  describe('failure handling', () => {
    test('does not cache a rejected fetch', async () => {
      jest.spyOn(renderer, 'resolveBestImage_')
          .mockRejectedValueOnce(new Error('network down'));

      await expect(renderer.fetchBestImage('NGC6820', 295.8, 23.1, 'Neb'))
          .rejects.toThrow('network down');

      // A cached rejection would poison every later caller for this object.
      expect(renderer.dynamicImageCache_.has('NGC6820')).toBe(false);
    });

    test('recovers on the next attempt after a failure', async () => {
      jest.spyOn(renderer, 'resolveBestImage_')
          .mockRejectedValueOnce(new Error('network down'));
      await renderer.fetchBestImage('NGC6820', 295.8, 23.1, 'Neb').catch(
          () => {});

      const result =
          await renderer.fetchBestImage('NGC6820', 295.8, 23.1, 'Neb', 40);

      expect(result).not.toBeNull();
    });
  });
});
