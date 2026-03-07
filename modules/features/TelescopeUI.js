/**
 * @fileoverview Telescope simulation UI controls.
 * Handles telescope settings, presets, computed properties display,
 * diffuse object visibility table, and telescope HUD overlay.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {TELESCOPE} from '../core/Constants.js';
import {addMobileButtonListener} from '../core/Utils.js';
import {escapeHtml} from '../core/SecurityUtils.js';
import {domCache} from '../ui/DOMCache.js';
import {TelescopeController, isDiffuseObject} from './TelescopeController.js';

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
 * Get CSS class suffix for a visibility label.
 * @param {string} label - Visibility label
 * @returns {string} CSS modifier
 * @private
 */
function visibilityStatusClass_(label) {
  if (label === 'Easily visible' || label === 'Visible') return 'visible';
  if (label === 'Barely visible') return 'barely';
  return 'not-visible';
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
   * @param {function(!Object, !Array<number>): !Array=} dependencies.computeVisibilityForDiameters
   * @param {function(!Object): ?Object=} dependencies.computeDiffuseVisibility
   */
  constructor(dependencies) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private {boolean} */
    this.isActive_ = false;

    /** @private {?Object} */
    this.selectedObject_ = null;

    /** @private {!Array<!Object>} EventBus subscriptions for cleanup */
    this.subscriptions_ = [];
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
      addMobileButtonListener(quickToggle, () => {
        this.deps_.toggleMode?.();
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
      addMobileButtonListener(saveBtn, () => {
        this.handleSavePreset_();
      });
    }

    // Delete preset button
    const deleteBtn = document.getElementById('telescope-delete-preset-btn');
    if (deleteBtn) {
      addMobileButtonListener(deleteBtn, () => {
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
    const sbPctEl = document.getElementById('computed-surface-brightness');
    const exitPupilCatEl = document.getElementById('computed-exit-pupil-category');

    if (magEl) magEl.textContent = `${props.magnification.toFixed(0)}x`;
    if (maxMagEl) maxMagEl.textContent = `${props.maxUsefulMagnification.toFixed(0)}x`;
    if (exitPupilEl) exitPupilEl.textContent = `${props.exitPupil.toFixed(1)}mm`;
    if (realFovEl) realFovEl.textContent = `${props.realFieldOfView.toFixed(2)}°`;
    if (limitingMagEl) limitingMagEl.textContent = props.limitingMagnitude.toFixed(1);
    if (sbPctEl) sbPctEl.textContent = `${props.surfaceBrightnessPct.toFixed(0)}%`;
    if (exitPupilCatEl) exitPupilCatEl.textContent = props.exitPupilCategory;

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
   * Update the DSO HUD overlay.
   * @param {?Object} visibility - Visibility info or null to hide
   * @private
   */
  updateDsoHud_(visibility) {
    const hudEl = domCache.get('reticle-dso-info');
    if (!hudEl) return;

    if (!visibility) {
      hudEl.classList.remove('visible');
      return;
    }

    const nameEl = domCache.get('reticle-dso-name');
    const statusEl = domCache.get('reticle-dso-status');
    const sbEl = domCache.get('reticle-dso-sb');

    if (nameEl) nameEl.textContent = visibility.name;

    if (statusEl) {
      statusEl.textContent = visibility.description;
      statusEl.className = 'reticle-dso-status';
      statusEl.classList.add(`reticle-dso-status--${visibilityStatusClass_(visibility.visibilityLabel)}`);
    }

    if (sbEl) {
      sbEl.textContent = `SB: ${visibility.objectSB.toFixed(1)} mag/arcsec²`;
    }

    const eyepieceEl = domCache.get('reticle-dso-eyepiece');
    if (eyepieceEl) {
      eyepieceEl.textContent = `Eyepiece: ${visibility.suggestedEyepieceFl}mm`;
    }

    hudEl.classList.add('visible');
  }

  /**
   * Append telescope visibility table to info panel for a diffuse object.
   * This is always shown regardless of telescope mode.
   * @param {!Object} obj - Selected DSO
   * @private
   */
  appendVisibilityTable_(obj) {
    if (!isDiffuseObject(obj)) return;

    const content = domCache.get('info-content');
    if (!content) return;

    const results = this.deps_.computeVisibilityForDiameters?.(
      obj, TELESCOPE.REFERENCE_DIAMETERS
    );
    if (!results || results.length === 0) return;

    const objectSB = TelescopeController.computeObjectSurfaceBrightness(
      obj.mag, obj.size_major, obj.size_minor
    );

    const section = document.createElement('div');
    section.className = 'telescope-visibility';
    section.id = 'telescope-visibility-table';

    let html = '<div class="telescope-visibility__title">Visibility by Telescope</div>';
    html += `<div class="telescope-visibility__sb">Surface brightness: ${objectSB.toFixed(1)} mag/arcsec²</div>`;

    html += '<table class="telescope-visibility__table">';
    html += '<tr><th>Telescope</th><th>What you\'ll see</th></tr>';

    for (const r of results) {
      const cls = visibilityStatusClass_(r.visibilityLabel);
      html += `<tr>`;
      html += `<td>${r.diameter}mm</td>`;
      html += `<td class="telescope-visibility__status--${cls}">${escapeHtml(r.description)}</td>`;
      html += `</tr>`;
    }

    html += '</table>';

    // Show advised exit pupil (from current telescope config)
    const visibility = this.deps_.computeDiffuseVisibility?.(obj);
    if (visibility) {
      html += `<div class="telescope-visibility__advice">` +
        `Advised exit pupil: ${visibility.recommendedExitPupil}mm</div>`;
    }

    section.innerHTML = html;
    content.appendChild(section);
  }

  /**
   * Append detailed telescope visibility info (telescope mode only).
   * @param {!Object} obj - Selected DSO
   * @private
   */
  appendTelescopeDetail_(obj) {
    if (!this.isActive_) return;
    if (!isDiffuseObject(obj)) return;

    const content = domCache.get('info-content');
    if (!content) return;

    const visibility = this.deps_.computeDiffuseVisibility?.(obj);
    if (!visibility) return;

    const detail = document.createElement('div');
    detail.className = 'telescope-visibility__detail';
    detail.id = 'telescope-visibility-detail';

    const rows = [
      ['Current SB%', `${visibility.surfaceBrightnessPct.toFixed(0)}%`],
      ['Recommended exit pupil', `${visibility.recommendedExitPupil}mm`],
      ['Suggested eyepiece', `${visibility.suggestedEyepieceFl}mm`],
    ];
    const html = rows.map(([label, value]) =>
      `<div class="telescope-visibility__row">` +
      `<span class="telescope-visibility__row-label">${label}</span>` +
      `<span class="telescope-visibility__row-value">${value}</span>` +
      `</div>`
    ).join('');

    detail.innerHTML = html;

    const table = document.getElementById('telescope-visibility-table');
    if (table) {
      table.appendChild(detail);
    } else {
      content.appendChild(detail);
    }
  }

  /**
   * Remove telescope-specific detail section.
   * @private
   */
  removeTelescopeDetail_() {
    document.getElementById('telescope-visibility-detail')?.remove();
  }

  /**
   * Handle object selection — add visibility table if it's a diffuse object.
   * @param {!Object} data - Selection event data
   * @private
   */
  handleObjectSelected_(data) {
    const obj = data?.object;
    if (!obj) {
      this.selectedObject_ = null;
      return;
    }

    this.selectedObject_ = obj;

    // Wait for SelectionManager to finish populating the info panel.
    // Using rAF ensures DOM updates from synchronous event handlers are complete.
    requestAnimationFrame(() => {
      // Guard against object changing between scheduling and execution
      if (this.selectedObject_ !== obj) return;
      this.appendVisibilityTable_(obj);
      this.appendTelescopeDetail_(obj);
    });
  }

  /**
   * Refresh visibility sections if object is still selected.
   * @private
   */
  refreshVisibilitySections_() {
    if (!this.selectedObject_) return;

    document.getElementById('telescope-visibility-table')?.remove();
    document.getElementById('telescope-visibility-detail')?.remove();

    this.appendVisibilityTable_(this.selectedObject_);
    this.appendTelescopeDetail_(this.selectedObject_);
  }

  /**
   * Set up EventBus listeners.
   * @private
   */
  setupEventBusListeners_() {
    this.subscriptions_.push(
      globalEventBus.on(Events.TELESCOPE_COMPUTED, () => {
        this.updateComputedDisplay_();
        this.refreshVisibilitySections_();
      }),

      globalEventBus.on(Events.TELESCOPE_MODE_ACTIVATED, () => {
        this.isActive_ = true;
        this.updateModeUI_(true);
        this.refreshVisibilitySections_();
      }),

      globalEventBus.on(Events.TELESCOPE_MODE_DEACTIVATED, () => {
        this.isActive_ = false;
        this.updateModeUI_(false);
        this.updateDsoHud_(null);
        this.removeTelescopeDetail_();
      }),

      globalEventBus.on(Events.TELESCOPE_DSO_CENTERED, (data) => {
        this.updateDsoHud_(data);
      }),

      globalEventBus.on(Events.OBJECT_SELECTED, (data) => {
        this.handleObjectSelected_(data);
      }),

      globalEventBus.on(Events.OBJECT_DESELECTED, () => {
        this.selectedObject_ = null;
        document.getElementById('telescope-visibility-table')?.remove();
        document.getElementById('telescope-visibility-detail')?.remove();
      })
    );
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

  /**
   * Dispose of resources and clean up subscriptions.
   */
  dispose() {
    this.subscriptions_.forEach((sub) => sub.unsubscribe());
    this.subscriptions_ = [];
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
