/**
 * @jest-environment jsdom
 * @fileoverview Tests for keeping the screen on.
 */

import {jest} from '@jest/globals';
import {ScreenWakeLock} from '../../modules/core/WakeLock.js';

/**
 * A wake lock API stand-in whose sentinels can be released like the
 * browser's are when the page is hidden.
 * @returns {!Object}
 */
function fakeWakeLock() {
  const api = {
    sentinels: [],
    request: jest.fn(async () => {
      const listeners = [];
      const sentinel = {
        released: false,
        addEventListener: (type, fn) => listeners.push(fn),
        release: jest.fn(() => {
          sentinel.released = true;
          listeners.forEach((fn) => fn());
        }),
      };
      api.sentinels.push(sentinel);
      return sentinel;
    }),
  };
  return api;
}

/** @returns {!Object} localStorage stand-in */
function fakeStorage(initial = {}) {
  const data = {...initial};
  return {getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => {
    data[k] = String(v);
  }};
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ScreenWakeLock', () => {
  let api;
  let lock;

  beforeEach(() => {
    api = fakeWakeLock();
  });

  afterEach(() => lock?.dispose());

  test('keeps the screen on by default', async () => {
    lock = new ScreenWakeLock({wakeLock: api, storage: fakeStorage()});
    lock.initialize();
    await flush();
    expect(api.request).toHaveBeenCalledWith('screen');
  });

  test('takes the lock again when the app comes back', async () => {
    lock = new ScreenWakeLock({wakeLock: api, storage: fakeStorage()});
    lock.initialize();
    await flush();
    api.sentinels[0].release(); // the browser drops it while hidden

    document.dispatchEvent(new Event('visibilitychange'));
    await flush();

    expect(api.request).toHaveBeenCalledTimes(2);
  });

  test('turning it off releases the lock and is remembered', async () => {
    const storage = fakeStorage();
    lock = new ScreenWakeLock({wakeLock: api, storage});
    lock.initialize();
    await flush();

    lock.setEnabled(false);

    expect(api.sentinels[0].released).toBe(true);
    expect(new ScreenWakeLock({wakeLock: api, storage}).isEnabled()).toBe(false);
  });

  test('does nothing where unsupported', () => {
    lock = new ScreenWakeLock({wakeLock: null, storage: fakeStorage()});
    expect(lock.isSupported()).toBe(false);
    expect(() => lock.initialize()).not.toThrow();
  });

  test('survives a refused request', async () => {
    api.request.mockRejectedValueOnce(new Error('battery saver'));
    lock = new ScreenWakeLock({wakeLock: api, storage: fakeStorage()});
    lock.initialize();
    await flush();
    expect(lock.isEnabled()).toBe(true);
  });
});
