/**
 * @fileoverview Telescope simulation UI controls.
 * Handles telescope settings, presets, and computed properties display.
 */

import {globalEventBus, Events} from '../core/EventBus.js';

/**
 * Maximum length for preset names.
 * @const {number}
 */
const MAX_PRESET_NAME_LENGTH = 50;

/**
 * Validate and sanitize a preset name.
 * @param {string} name - Raw preset name
 * @returns {{valid: boolean, sanitized: string, error: string}} Validation result
 */
export function validatePresetName(name) {
  if (!name) {
    return {valid: false, sanitized: '', error: 'Preset name is required.'};
  }

  let sanitized = name.trim();

  if (!sanitized) {
    return {valid: false, sanitized: '', error: 'Preset name cannot be empty.'};
  }

  if (sanitized.length > MAX_PRESET_NAME_LENGTH) {
    return {
      valid: false,
      sanitized: '',
      error: `Preset name must be ${MAX_PRESET_NAME_LENGTH} characters or less.`,
    };
  }

  const validPattern = /^[\w\s-]+$/;
  if (!validPattern.test(sanitized)) {
    return {
      valid: false,
      sanitized: '',
      error: 'Preset name can only contain letters, numbers, spaces, hyphens, and underscores.',
    };
  }

  return {valid: true, sanitized, error: ''};
}

/**
 * TelescopeUI handles telescope simulation controls.
 */
export class TelescopeUI {
  /**
   * Creates a new TelescopeUI instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(): !Object=} dependencies.getTelescope - Get telescope config
   * @param {function(!Object): void=} dependencies.setTelescope - Set telescope config
   * @param {function(): !Object=} dependencies.getEyepiece - Get eyepiece config
   * @param {function(!Object): void=} dependencies.setEyepiece - Set eyepiece config
   * @param {function(): void=} dependencies.toggleMode - Toggle telescope mode
   * @param {function(): boolean=} dependencies.isActive - Check if mode is active
   * @param {function(string): void=} dependencies.savePreset - Save preset
   * @param {function(string): boolean=} dependencies.loadPreset - Load preset
   * @param {function(string): boolean=} dependencies.deletePreset - Delete preset
   * @param {function(): !Array<string>=} dependencies.getPresetNames - Get preset names
   * @param {function(): ?Object=} dependencies.getComputedProperties - Get computed props
   */
  constructor(dependencies) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private {boolean} */
    this.isActive_ = false;
  }

  /**
   * Initialize the telescope UI.
   */
  initialize() {
    this.setupEventListeners_();
    this.setupEventBusListeners_();
    this.populatePresets_();
    this.loadCurrentValues_();
    this.updateComputedDisplay_();
  }

  /**
   * Set up DOM event listeners.
   * @private
   */
  setupEventListeners_() {
    // Mode toggle
    const modeToggle = document.getElementById('telescope-mode-toggle');
    if (modeToggle) {
      modeToggle.addEventListener('change', () => {
        this.deps_.toggleMode?.();
      });
    }

    // Quick toggle button
    const quickToggle = document.getElementById('telescope-quick-toggle');
    if (quickToggle) {
      quickToggle.addEventListener('click', () => {
        this.deps_.toggleMode?.();
        quickToggle.classList.toggle('active');
      });
    }

    // Telescope diameter
    const diameterInput = document.getElementById('telescope-diameter');
    if (diameterInput) {
      diameterInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value > 0) {
          this.deps_.setTelescope?.({diameter: value});
        }
      });
    }

    // Telescope focal length
    const focalLengthInput = document.getElementById('telescope-focal-length');
    if (focalLengthInput) {
      focalLengthInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value > 0) {
          this.deps_.setTelescope?.({focalLength: value});
        }
      });
    }

    // Eyepiece focal length
    const eyepieceFLInput = document.getElementById('eyepiece-focal-length');
    if (eyepieceFLInput) {
      eyepieceFLInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value > 0) {
          this.deps_.setEyepiece?.({focalLength: value});
        }
      });
    }

    // Eyepiece apparent FOV
    const eyepieceAFOVInput = document.getElementById('eyepiece-afov');
    if (eyepieceAFOVInput) {
      eyepieceAFOVInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value > 0) {
          this.deps_.setEyepiece?.({apparentFov: value});
        }
      });
    }

    // Preset selector
    const presetSelect = document.getElementById('telescope-preset-select');
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => {
        const name = e.target.value;
        if (name) {
          this.deps_.loadPreset?.(name);
          this.loadCurrentValues_();
        }
      });
    }

    // Save preset button
    const saveBtn = document.getElementById('telescope-save-preset-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.handleSavePreset_();
      });
    }

    // Delete preset button
    const deleteBtn = document.getElementById('telescope-delete-preset-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.handleDeletePreset_();
      });
    }
  }

  /**
   * Handle save preset action.
   * @private
   */
  handleSavePreset_() {
    const name = prompt('Enter preset name:');
    if (!name) return;

    const validation = validatePresetName(name);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    const existingPresets = this.deps_.getPresetNames?.() || [];
    if (existingPresets.includes(validation.sanitized)) {
      if (!confirm(`Preset "${validation.sanitized}" already exists. Overwrite?`)) {
        return;
      }
    }

    this.deps_.savePreset?.(validation.sanitized);
    this.populatePresets_();

    const select = document.getElementById('telescope-preset-select');
    if (select) select.value = validation.sanitized;
  }

  /**
   * Handle delete preset action.
   * @private
   */
  handleDeletePreset_() {
    const select = document.getElementById('telescope-preset-select');
    const name = select?.value;
    if (name && confirm(`Delete preset "${name}"?`)) {
      this.deps_.deletePreset?.(name);
      this.populatePresets_();
    }
  }

  /**
   * Load current values into inputs.
   * @private
   */
  loadCurrentValues_() {
    const telescope = this.deps_.getTelescope?.();
    const eyepiece = this.deps_.getEyepiece?.();

    if (telescope) {
      const diameterInput = document.getElementById('telescope-diameter');
      const focalLengthInput = document.getElementById('telescope-focal-length');
      if (diameterInput) diameterInput.value = telescope.diameter;
      if (focalLengthInput) focalLengthInput.value = telescope.focalLength;
    }

    if (eyepiece) {
      const eyepieceFLInput = document.getElementById('eyepiece-focal-length');
      const eyepieceAFOVInput = document.getElementById('eyepiece-afov');
      if (eyepieceFLInput) eyepieceFLInput.value = eyepiece.focalLength;
      if (eyepieceAFOVInput) eyepieceAFOVInput.value = eyepiece.apparentFov;
    }
  }

  /**
   * Populate preset dropdown.
   * @private
   */
  populatePresets_() {
    const select = document.getElementById('telescope-preset-select');
    if (!select) return;

    const presetNames = this.deps_.getPresetNames?.() || [];

    // Clear existing options except the first one
    while (select.options.length > 1) {
      select.remove(1);
    }

    // Add presets
    presetNames.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  }

  /**
   * Update computed display values.
   * @private
   */
  updateComputedDisplay_() {
    const props = this.deps_.getComputedProperties?.();
    if (!props) return;

    const magEl = document.getElementById('computed-magnification');
    const maxMagEl = document.getElementById('computed-max-mag');
    const exitPupilEl = document.getElementById('computed-exit-pupil');
    const realFovEl = document.getElementById('computed-real-fov');
    const limitingMagEl = document.getElementById('computed-limiting-mag');
    const warningEl = document.getElementById('telescope-warning');

    if (magEl) magEl.textContent = `${props.magnification.toFixed(0)}x`;
    if (maxMagEl) maxMagEl.textContent = `${props.maxUsefulMagnification.toFixed(0)}x`;
    if (exitPupilEl) exitPupilEl.textContent = `${props.exitPupil.toFixed(1)}mm`;
    if (realFovEl) realFovEl.textContent = `${props.realFieldOfView.toFixed(2)}°`;
    if (limitingMagEl) limitingMagEl.textContent = props.limitingMagnitude.toFixed(1);

    if (warningEl) {
      warningEl.classList.toggle('visible', props.isOverMagnified);
    }

    // Update reticle info
    const reticleFovEl = document.getElementById('reticle-fov');
    const reticleMagEl = document.getElementById('reticle-mag');
    if (reticleFovEl) reticleFovEl.textContent = `${props.realFieldOfView.toFixed(2)}°`;
    if (reticleMagEl) reticleMagEl.textContent = `${props.magnification.toFixed(0)}x`;
  }

  /**
   * Set up EventBus listeners.
   * @private
   */
  setupEventBusListeners_() {
    globalEventBus.on(Events.TELESCOPE_COMPUTED, () => {
      this.updateComputedDisplay_();
    });

    globalEventBus.on(Events.TELESCOPE_MODE_ACTIVATED, () => {
      this.isActive_ = true;
      this.updateModeUI_(true);
    });

    globalEventBus.on(Events.TELESCOPE_MODE_DEACTIVATED, () => {
      this.isActive_ = false;
      this.updateModeUI_(false);
    });
  }

  /**
   * Update mode UI state.
   * @param {boolean} isActive - Whether mode is active
   * @private
   */
  updateModeUI_(isActive) {
    const toggle = document.getElementById('telescope-mode-toggle');
    if (toggle) toggle.checked = isActive;

    const quickToggle = document.getElementById('telescope-quick-toggle');
    if (quickToggle) quickToggle.classList.toggle('active', isActive);

    const reticle = document.getElementById('telescope-reticle');
    if (reticle) reticle.classList.toggle('visible', isActive);

    document.body.classList.toggle('telescope-mode', isActive);
  }

  /**
   * Check if telescope mode is active.
   * @returns {boolean} True if active
   */
  isActive() {
    return this.isActive_;
  }
}

/**
 * Singleton telescope UI instance.
 * @type {?TelescopeUI}
 */
export let telescopeUI = null;

/**
 * Initialize the telescope UI singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!TelescopeUI} Initialized instance
 */
export function initializeTelescopeUI(dependencies) {
  telescopeUI = new TelescopeUI(dependencies);
  telescopeUI.initialize();
  return telescopeUI;
}
