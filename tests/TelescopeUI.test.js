/**
 * @fileoverview Tests for TelescopeUI module.
 */

import {jest} from '@jest/globals';
import {
  TelescopeUI,
  initializeTelescopeUI,
  validatePresetName,
} from '../modules/features/TelescopeUI.js';
import {globalEventBus, Events} from '../modules/core/EventBus.js';

describe('validatePresetName', () => {
  test('rejects empty name', () => {
    const result = validatePresetName('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('required');
  });

  test('rejects null name', () => {
    const result = validatePresetName(null);
    expect(result.valid).toBe(false);
  });

  test('rejects whitespace-only name', () => {
    const result = validatePresetName('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  test('rejects name over 50 characters', () => {
    const longName = 'a'.repeat(51);
    const result = validatePresetName(longName);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('50');
  });

  test('accepts name at exactly 50 characters', () => {
    const name = 'a'.repeat(50);
    const result = validatePresetName(name);
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe(name);
  });

  test('rejects name with special characters', () => {
    const result = validatePresetName('My <Preset>');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('letters');
  });

  test('accepts alphanumeric name', () => {
    const result = validatePresetName('My Telescope 2024');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('My Telescope 2024');
  });

  test('accepts name with hyphens and underscores', () => {
    const result = validatePresetName('my-telescope_v2');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('my-telescope_v2');
  });

  test('trims whitespace', () => {
    const result = validatePresetName('  My Preset  ');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('My Preset');
  });
});

describe('TelescopeUI', () => {
  let telescopeUI;
  let mockDeps;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock DOM elements
    document.body.innerHTML = `
      <input type="checkbox" id="telescope-mode-toggle" />
      <button id="telescope-quick-toggle"></button>
      <input type="number" id="telescope-diameter" value="200" />
      <input type="number" id="telescope-focal-length" value="1000" />
      <input type="number" id="eyepiece-focal-length" value="25" />
      <input type="number" id="eyepiece-afov" value="52" />
      <select id="telescope-preset-select">
        <option value="">Select Preset</option>
      </select>
      <button id="telescope-save-preset-btn"></button>
      <button id="telescope-delete-preset-btn"></button>
      <div id="computed-magnification"></div>
      <div id="computed-max-mag"></div>
      <div id="computed-exit-pupil"></div>
      <div id="computed-real-fov"></div>
      <div id="computed-limiting-mag"></div>
      <div id="telescope-warning"></div>
      <div id="reticle-fov"></div>
      <div id="reticle-mag"></div>
      <div id="telescope-reticle"></div>
    `;

    mockDeps = {
      getTelescope: jest.fn(() => ({diameter: 200, focalLength: 1000})),
      setTelescope: jest.fn(),
      getEyepiece: jest.fn(() => ({focalLength: 25, apparentFov: 52})),
      setEyepiece: jest.fn(),
      toggleMode: jest.fn(),
      isActive: jest.fn(() => false),
      savePreset: jest.fn(),
      loadPreset: jest.fn(() => true),
      deletePreset: jest.fn(() => true),
      getPresetNames: jest.fn(() => ['Default', 'My Setup']),
      getComputedProperties: jest.fn(() => ({
        magnification: 40,
        maxUsefulMagnification: 400,
        exitPupil: 5,
        realFieldOfView: 1.3,
        limitingMagnitude: 14.2,
        isOverMagnified: false,
      })),
    };

    telescopeUI = new TelescopeUI(mockDeps);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    test('creates instance with dependencies', () => {
      expect(telescopeUI).toBeInstanceOf(TelescopeUI);
    });

    test('initializes state correctly', () => {
      expect(telescopeUI.isActive()).toBe(false);
    });
  });

  describe('initialize', () => {
    test('sets up mode toggle', () => {
      telescopeUI.initialize();

      const toggle = document.getElementById('telescope-mode-toggle');
      toggle.dispatchEvent(new Event('change'));

      expect(mockDeps.toggleMode).toHaveBeenCalled();
    });

    test('sets up quick toggle', () => {
      telescopeUI.initialize();

      const quickToggle = document.getElementById('telescope-quick-toggle');
      quickToggle.click();

      expect(mockDeps.toggleMode).toHaveBeenCalled();
    });

    test('sets up diameter input', () => {
      telescopeUI.initialize();

      const input = document.getElementById('telescope-diameter');
      input.value = '250';
      input.dispatchEvent(new Event('input'));

      expect(mockDeps.setTelescope).toHaveBeenCalledWith({diameter: 250});
    });

    test('sets up focal length input', () => {
      telescopeUI.initialize();

      const input = document.getElementById('telescope-focal-length');
      input.value = '1200';
      input.dispatchEvent(new Event('input'));

      expect(mockDeps.setTelescope).toHaveBeenCalledWith({focalLength: 1200});
    });

    test('sets up eyepiece focal length input', () => {
      telescopeUI.initialize();

      const input = document.getElementById('eyepiece-focal-length');
      input.value = '10';
      input.dispatchEvent(new Event('input'));

      expect(mockDeps.setEyepiece).toHaveBeenCalledWith({focalLength: 10});
    });

    test('sets up eyepiece AFOV input', () => {
      telescopeUI.initialize();

      const input = document.getElementById('eyepiece-afov');
      input.value = '68';
      input.dispatchEvent(new Event('input'));

      expect(mockDeps.setEyepiece).toHaveBeenCalledWith({apparentFov: 68});
    });

    test('ignores invalid input values', () => {
      telescopeUI.initialize();

      const input = document.getElementById('telescope-diameter');
      input.value = 'not-a-number';
      input.dispatchEvent(new Event('input'));

      expect(mockDeps.setTelescope).not.toHaveBeenCalled();
    });

    test('ignores zero or negative values', () => {
      telescopeUI.initialize();

      const input = document.getElementById('telescope-diameter');
      input.value = '0';
      input.dispatchEvent(new Event('input'));

      expect(mockDeps.setTelescope).not.toHaveBeenCalled();
    });

    test('populates presets dropdown', () => {
      telescopeUI.initialize();

      const select = document.getElementById('telescope-preset-select');
      expect(select.options.length).toBe(3); // Default + 2 presets
      expect(select.options[1].value).toBe('Default');
      expect(select.options[2].value).toBe('My Setup');
    });

    test('loads preset on select change', () => {
      telescopeUI.initialize();

      const select = document.getElementById('telescope-preset-select');
      select.value = 'Default';
      select.dispatchEvent(new Event('change'));

      expect(mockDeps.loadPreset).toHaveBeenCalledWith('Default');
    });
  });

  describe('computed display', () => {
    test('updates magnification display', () => {
      telescopeUI.initialize();

      const magEl = document.getElementById('computed-magnification');
      expect(magEl.textContent).toBe('40x');
    });

    test('updates max magnification display', () => {
      telescopeUI.initialize();

      const maxMagEl = document.getElementById('computed-max-mag');
      expect(maxMagEl.textContent).toBe('400x');
    });

    test('updates exit pupil display', () => {
      telescopeUI.initialize();

      const exitPupilEl = document.getElementById('computed-exit-pupil');
      expect(exitPupilEl.textContent).toBe('5.0mm');
    });

    test('updates real FOV display', () => {
      telescopeUI.initialize();

      const realFovEl = document.getElementById('computed-real-fov');
      expect(realFovEl.textContent).toBe('1.30°');
    });

    test('updates limiting magnitude display', () => {
      telescopeUI.initialize();

      const limitingMagEl = document.getElementById('computed-limiting-mag');
      expect(limitingMagEl.textContent).toBe('14.2');
    });

    test('shows warning when over-magnified', () => {
      mockDeps.getComputedProperties.mockReturnValue({
        magnification: 500,
        maxUsefulMagnification: 400,
        exitPupil: 0.4,
        realFieldOfView: 0.1,
        limitingMagnitude: 14.2,
        isOverMagnified: true,
      });

      telescopeUI.initialize();

      const warningEl = document.getElementById('telescope-warning');
      expect(warningEl.classList.contains('visible')).toBe(true);
    });
  });

  describe('EventBus listeners', () => {
    test('handles TELESCOPE_COMPUTED event', () => {
      telescopeUI.initialize();

      mockDeps.getComputedProperties.mockReturnValue({
        magnification: 100,
        maxUsefulMagnification: 400,
        exitPupil: 2,
        realFieldOfView: 0.52,
        limitingMagnitude: 14.5,
        isOverMagnified: false,
      });

      globalEventBus.emit(Events.TELESCOPE_COMPUTED, {});

      const magEl = document.getElementById('computed-magnification');
      expect(magEl.textContent).toBe('100x');
    });

    test('handles TELESCOPE_MODE_ACTIVATED event', () => {
      telescopeUI.initialize();

      globalEventBus.emit(Events.TELESCOPE_MODE_ACTIVATED, {});

      expect(telescopeUI.isActive()).toBe(true);
    });

    test('handles TELESCOPE_MODE_DEACTIVATED event', () => {
      telescopeUI.initialize();

      globalEventBus.emit(Events.TELESCOPE_MODE_ACTIVATED, {});
      globalEventBus.emit(Events.TELESCOPE_MODE_DEACTIVATED, {});

      expect(telescopeUI.isActive()).toBe(false);
    });
  });

  describe('mode UI updates', () => {
    test('checks toggle on activation', () => {
      telescopeUI.initialize();

      globalEventBus.emit(Events.TELESCOPE_MODE_ACTIVATED, {});

      const toggle = document.getElementById('telescope-mode-toggle');
      expect(toggle.checked).toBe(true);
    });

    test('unchecks toggle on deactivation', () => {
      telescopeUI.initialize();

      const toggle = document.getElementById('telescope-mode-toggle');
      toggle.checked = true;

      globalEventBus.emit(Events.TELESCOPE_MODE_DEACTIVATED, {});

      expect(toggle.checked).toBe(false);
    });

    test('adds active class to quick toggle on activation', () => {
      telescopeUI.initialize();

      globalEventBus.emit(Events.TELESCOPE_MODE_ACTIVATED, {});

      const quickToggle = document.getElementById('telescope-quick-toggle');
      expect(quickToggle.classList.contains('active')).toBe(true);
    });

    test('shows reticle on activation', () => {
      telescopeUI.initialize();

      globalEventBus.emit(Events.TELESCOPE_MODE_ACTIVATED, {});

      const reticle = document.getElementById('telescope-reticle');
      expect(reticle.classList.contains('visible')).toBe(true);
    });

    test('adds telescope-mode class to body on activation', () => {
      telescopeUI.initialize();

      globalEventBus.emit(Events.TELESCOPE_MODE_ACTIVATED, {});

      expect(document.body.classList.contains('telescope-mode')).toBe(true);
    });
  });

  describe('handles missing DOM elements gracefully', () => {
    test('works without DOM elements', () => {
      document.body.innerHTML = '';
      const ui = new TelescopeUI(mockDeps);

      expect(() => ui.initialize()).not.toThrow();
    });

    test('handles null computed properties', () => {
      mockDeps.getComputedProperties.mockReturnValue(null);

      const ui = new TelescopeUI(mockDeps);
      expect(() => ui.initialize()).not.toThrow();
    });
  });
});

describe('initializeTelescopeUI', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('returns a TelescopeUI instance', () => {
    const deps = {getTelescope: jest.fn()};
    const ui = initializeTelescopeUI(deps);
    expect(ui).toBeInstanceOf(TelescopeUI);
  });
});
