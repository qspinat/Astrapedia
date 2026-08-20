/**
 * @fileoverview Tests for the first-run onboarding overlay.
 *
 * The contract: show once on first run, remember dismissal, and be reopenable
 * afterward.
 */

import {jest} from '@jest/globals';
import {Onboarding} from '../../modules/ui/Onboarding.js';

/**
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

describe('Onboarding', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="onboarding-overlay">
        <div class="onboarding-card">
          <button id="onboarding-dismiss"></button>
        </div>
      </div>`;
  });

  /**
   * @param {!Object} storage
   * @returns {!Onboarding}
   */
  function make(storage) {
    const ob = new Onboarding({storage});
    ob.initialize();
    return ob;
  }

  test('shows on first run', () => {
    make(fakeStorage());

    expect(document.getElementById('onboarding-overlay')
        .classList.contains('visible')).toBe(true);
  });

  test('stays hidden once it has been seen', () => {
    make(fakeStorage({'astrapedia-onboarded': 'true'}));

    expect(document.getElementById('onboarding-overlay')
        .classList.contains('visible')).toBe(false);
  });

  test('dismiss hides it and records that it was seen', () => {
    const storage = fakeStorage();
    make(storage);

    document.getElementById('onboarding-dismiss').click();

    expect(document.getElementById('onboarding-overlay')
        .classList.contains('visible')).toBe(false);
    expect(storage.getItem('astrapedia-onboarded')).toBe('true');
  });

  test('can be reopened after being dismissed', () => {
    const ob = make(fakeStorage({'astrapedia-onboarded': 'true'}));

    ob.show();

    expect(document.getElementById('onboarding-overlay')
        .classList.contains('visible')).toBe(true);
  });

  test('Escape dismisses it', () => {
    const storage = fakeStorage();
    make(storage);

    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));

    expect(document.getElementById('onboarding-overlay')
        .classList.contains('visible')).toBe(false);
    expect(storage.getItem('astrapedia-onboarded')).toBe('true');
  });

  test('clicking the card does not dismiss', () => {
    make(fakeStorage());

    document.querySelector('.onboarding-card')
        .dispatchEvent(new MouseEvent('click', {bubbles: true}));

    expect(document.getElementById('onboarding-overlay')
        .classList.contains('visible')).toBe(true);
  });

  test('clicking the backdrop dismisses', () => {
    const overlay = document.getElementById('onboarding-overlay');
    make(fakeStorage());

    // target === overlay only when the backdrop itself is clicked.
    overlay.dispatchEvent(new MouseEvent('click', {bubbles: true}));

    expect(overlay.classList.contains('visible')).toBe(false);
  });

  test('a throwing storage still shows and hides without crashing', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };

    const ob = new Onboarding({storage: throwing});
    expect(() => ob.initialize()).not.toThrow();
    expect(document.getElementById('onboarding-overlay')
        .classList.contains('visible')).toBe(true);
    expect(() => ob.dismiss()).not.toThrow();
  });
});
