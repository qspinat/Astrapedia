/**
 * @fileoverview Tests for Night Vision mode — the deep-red field skin.
 *
 * The mode is a persisted boolean that toggles a body class and keeps its
 * controls' aria-pressed state in sync. These pin that contract, plus the
 * private-mode storage fallback.
 */

import {jest} from '@jest/globals';
import {NightVision} from '../../modules/ui/NightVision.js';

/**
 * A localStorage stand-in backed by a plain object.
 * @returns {!Object}
 */
function fakeStorage(initial = {}) {
  const data = {...initial};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    _data: data,
  };
}

describe('NightVision', () => {
  let body;

  beforeEach(() => {
    body = document.createElement('body');
  });

  describe('default state', () => {
    test('starts off when nothing is stored', () => {
      const nv = new NightVision({storage: fakeStorage(), body});

      expect(nv.isEnabled()).toBe(false);
      expect(body.classList.contains('night-vision')).toBe(false);
    });

    test('restores the on state from storage', () => {
      const nv = new NightVision({
        storage: fakeStorage({'astrapedia-night-vision': 'true'}),
        body,
      });

      expect(nv.isEnabled()).toBe(true);
      expect(body.classList.contains('night-vision')).toBe(true);
    });
  });

  describe('toggling', () => {
    test('setEnabled(true) adds the body class and persists', () => {
      const storage = fakeStorage();
      const nv = new NightVision({storage, body});

      nv.setEnabled(true);

      expect(body.classList.contains('night-vision')).toBe(true);
      expect(storage.getItem('astrapedia-night-vision')).toBe('true');
    });

    test('toggle flips the state and returns it', () => {
      const nv = new NightVision({storage: fakeStorage(), body});

      expect(nv.toggle()).toBe(true);
      expect(body.classList.contains('night-vision')).toBe(true);
      expect(nv.toggle()).toBe(false);
      expect(body.classList.contains('night-vision')).toBe(false);
    });
  });

  describe('registered controls', () => {
    test('a registered toggle reflects the current state', () => {
      const nv = new NightVision({
        storage: fakeStorage({'astrapedia-night-vision': 'true'}),
        body,
      });
      const btn = document.createElement('button');

      nv.registerToggle(btn);

      expect(btn.getAttribute('aria-pressed')).toBe('true');
      expect(btn.classList.contains('active')).toBe(true);
    });

    test('toggling updates every registered control', () => {
      const nv = new NightVision({storage: fakeStorage(), body});
      const btn = document.createElement('button');
      nv.registerToggle(btn);

      nv.toggle();

      expect(btn.getAttribute('aria-pressed')).toBe('true');
      nv.toggle();
      expect(btn.getAttribute('aria-pressed')).toBe('false');
    });

    test('registering the same control twice is a no-op', () => {
      const nv = new NightVision({storage: fakeStorage(), body});
      const btn = document.createElement('button');

      nv.registerToggle(btn);
      nv.registerToggle(btn);
      nv.setEnabled(true);

      // Would throw or double-fire if it were registered twice; a clean
      // single sync leaves aria-pressed exactly "true".
      expect(btn.getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('storage failures', () => {
    test('a throwing storage does not break the mode', () => {
      const throwing = {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      };

      const nv = new NightVision({storage: throwing, body});
      expect(nv.isEnabled()).toBe(false);

      expect(() => nv.setEnabled(true)).not.toThrow();
      expect(body.classList.contains('night-vision')).toBe(true);
    });
  });
});
