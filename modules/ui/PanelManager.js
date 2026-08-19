/**
 * @fileoverview Panel manager for slide panels and modals.
 * Handles opening, closing, and backdrop management.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {createLogger} from '../core/Logger.js';
import {addMobileButtonListener} from '../core/Utils.js';

const logger = createLogger('PanelManager');

/**
 * All panel IDs managed by PanelManager.
 * @const {!Array<string>}
 */
const PANEL_IDS = [
  'settings-panel',
  'info-panel',
  'visible-tonight-panel',
  'events-panel',
  'tour-panel',
  'game-panel',
  'bug-report-panel',
];

/**
 * PanelManager handles opening and closing of slide panels.
 */
export class PanelManager {
  /**
   * Creates a new PanelManager instance.
   * @param {?Element=} backdrop - Backdrop element (default from DOM)
   */
  constructor(backdrop) {
    /**
     * Backdrop element.
     * @private {?Element}
     */
    this.backdrop_ = backdrop || document.getElementById('panel-backdrop');

    /**
     * Currently open panel ID.
     * @private {?string}
     */
    this.currentPanel_ = null;

    /**
     * Panel open callbacks.
     * @private {!Map<string, !Array<function(): void>>}
     */
    this.openCallbacks_ = new Map();

    /**
     * Panel close callbacks.
     * @private {!Map<string, !Array<function(): void>>}
     */
    this.closeCallbacks_ = new Map();
  }

  /**
   * Initialize the panel manager.
   */
  initialize() {
    this.setupBackdropListener_();
    this.setupPanelTouchHandlers_();
    this.setupBackButtonHandler_();
    this.setupKeyboardHandler_();
  }

  /**
   * Close the open panel on Escape, matching the browser/phone back button.
   * @private
   */
  setupKeyboardHandler_() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.currentPanel_) {
        e.preventDefault();
        // Mirror the back-button path so history stays consistent.
        if (history.state?.panelOpen) {
          history.back();
        } else {
          this.closeAll();
        }
      }
    });
  }

  /**
   * Setup handler for browser/phone back button.
   * Closes panels instead of navigating away.
   * @private
   */
  setupBackButtonHandler_() {
    window.addEventListener('popstate', (e) => {
      // If a panel is open and we're going back, close it
      if (this.currentPanel_) {
        // Prevent default navigation, close the panel
        this.closeAll();
        // Push state again to prevent actual navigation
        // (only if we didn't just pop from a panel close)
        if (!e.state?.panelClosed) {
          history.pushState({panelOpen: false}, '');
        }
      }
    });

    // Initialize history state
    if (!history.state) {
      history.replaceState({panelOpen: false}, '');
    }
  }

  /**
   * Setup backdrop click listener.
   * @private
   */
  setupBackdropListener_() {
    if (this.backdrop_) {
      addMobileButtonListener(this.backdrop_, () => this.closeAll());
    }
  }

  /**
   * Setup touch handlers on panels to prevent events from reaching backdrop.
   * Excludes game-panel which has its own drag handling.
   * @private
   */
  setupPanelTouchHandlers_() {
    PANEL_IDS.forEach((id) => {
      // Skip game-panel - it has its own drag handling that needs document events
      if (id === 'game-panel') return;

      const panel = document.getElementById(id);
      if (panel) {
        // Stop touch events from propagating to backdrop
        panel.addEventListener('touchstart', (e) => {
          e.stopPropagation();
        }, {passive: true});
        panel.addEventListener('touchmove', (e) => {
          e.stopPropagation();
        }, {passive: true});
        panel.addEventListener('touchend', (e) => {
          e.stopPropagation();
        }, {passive: true});
      }
    });
  }

  /**
   * Get currently open panel ID.
   * @returns {?string} Panel ID or null
   */
  getCurrentPanel() {
    return this.currentPanel_;
  }

  /**
   * Check if any panel is open.
   * @returns {boolean} True if a panel is open
   */
  isAnyPanelOpen() {
    return this.currentPanel_ !== null;
  }

  /**
   * Check if a specific panel is open.
   * @param {string} panelId - Panel ID to check
   * @returns {boolean} True if panel is open
   */
  isPanelOpen(panelId) {
    return this.currentPanel_ === panelId;
  }

  /**
   * Close all panels and remove backdrop.
   */
  closeAll() {
    const previousPanel = this.currentPanel_;

    PANEL_IDS.forEach((id) => {
      const panel = document.getElementById(id);
      if (panel) {
        panel.classList.remove('visible');
      }
    });

    // Also close search results
    const searchResults = document.getElementById('search-results');
    if (searchResults) {
      searchResults.classList.remove('active');
    }

    if (this.backdrop_) {
      this.backdrop_.classList.remove('visible');
    }

    document.body.classList.remove('panel-open');
    this.currentPanel_ = null;

    // Return focus to whatever opened the panel.
    if (this.previousFocus_?.focus) {
      this.previousFocus_.focus();
    }
    this.previousFocus_ = null;

    if (previousPanel) {
      this.triggerCloseCallbacks_(previousPanel);

      globalEventBus.emit(Events.PANEL_CLOSED, {
        panelId: previousPanel,
      });
    }
  }

  /**
   * Move focus to the first focusable element in a panel (its close button,
   * usually), so keyboard users land inside the dialog rather than behind it.
   * @param {!Element} panel
   * @private
   */
  focusFirstElement_(panel) {
    if (!panel.querySelector) return;
    const focusable = panel.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    focusable?.focus?.();
  }

  /**
   * Open a specific panel.
   * @param {string} panelId - The ID of the panel to open
   */
  open(panelId) {
    // Close any currently open panel
    if (this.currentPanel_) {
      this.closeAll();
    }

    const panel = document.getElementById(panelId);
    if (!panel) {
      logger.warn(`Panel not found: ${panelId}`);
      return;
    }

    panel.classList.add('visible');

    // Dialog semantics + focus management for keyboard and screen-reader users.
    if (panel.setAttribute) {
      if (!panel.getAttribute('role')) panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      this.previousFocus_ = document.activeElement;
      this.focusFirstElement_(panel);
    }

    if (this.backdrop_) {
      this.backdrop_.classList.add('visible');
    }

    document.body.classList.add('panel-open');
    this.currentPanel_ = panelId;

    // Push history state so back button closes panel
    history.pushState({panelOpen: true, panelId}, '');

    this.triggerOpenCallbacks_(panelId);

    globalEventBus.emit(Events.PANEL_OPENED, {
      panelId,
    });
  }

  /**
   * Toggle a panel open/closed.
   * @param {string} panelId - The ID of the panel to toggle
   */
  toggle(panelId) {
    if (this.isPanelOpen(panelId)) {
      this.closeAll();
    } else {
      this.open(panelId);
    }
  }

  /**
   * Register callback for panel open.
   * @param {string} panelId - Panel ID
   * @param {function(): void} callback - Callback function
   */
  onOpen(panelId, callback) {
    if (!this.openCallbacks_.has(panelId)) {
      this.openCallbacks_.set(panelId, []);
    }
    this.openCallbacks_.get(panelId).push(callback);
  }

  /**
   * Register callback for panel close.
   * @param {string} panelId - Panel ID
   * @param {function(): void} callback - Callback function
   */
  onClose(panelId, callback) {
    if (!this.closeCallbacks_.has(panelId)) {
      this.closeCallbacks_.set(panelId, []);
    }
    this.closeCallbacks_.get(panelId).push(callback);
  }

  /**
   * Trigger open callbacks for a panel.
   * @param {string} panelId - Panel ID
   * @private
   */
  triggerOpenCallbacks_(panelId) {
    const callbacks = this.openCallbacks_.get(panelId);
    if (callbacks) {
      callbacks.forEach((cb) => cb());
    }
  }

  /**
   * Trigger close callbacks for a panel.
   * @param {string} panelId - Panel ID
   * @private
   */
  triggerCloseCallbacks_(panelId) {
    const callbacks = this.closeCallbacks_.get(panelId);
    if (callbacks) {
      callbacks.forEach((cb) => cb());
    }
  }

  /**
   * Setup close button for a panel.
   * @param {string} buttonId - Close button ID
   * @param {function()=} extraCallback - Optional extra callback
   */
  setupCloseButton(buttonId, extraCallback) {
    const btn = document.getElementById(buttonId);
    if (btn) {
      addMobileButtonListener(btn, () => {
        this.closeAll();
        if (extraCallback) {
          extraCallback();
        }
      });
    }
  }

  /**
   * Show a temporary notification panel.
   * @param {string} message - Message to display
   * @param {number=} duration - Duration in ms (default 3000)
   */
  showNotification(message, duration = 3000) {
    let notification = document.getElementById('notification-panel');

    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'notification-panel';
      notification.className = 'notification-panel';
      notification.setAttribute('role', 'status');
      notification.setAttribute('aria-live', 'polite');
      document.body.appendChild(notification);
    }

    notification.textContent = message;
    notification.classList.add('visible');

    setTimeout(() => {
      notification.classList.remove('visible');
    }, duration);
  }

  /**
   * Show a confirmation dialog.
   * @param {string} message - Confirmation message
   * @param {function(): void} onConfirm - Callback for confirm
   * @param {function()=} onCancel - Callback for cancel
   */
  showConfirmation(message, onConfirm, onCancel) {
    let dialog = document.getElementById('confirmation-dialog');

    if (!dialog) {
      dialog = document.createElement('div');
      dialog.id = 'confirmation-dialog';
      dialog.className = 'confirmation-dialog';
      dialog.innerHTML = `
        <div class="confirmation-content">
          <p class="confirmation-message"></p>
          <div class="confirmation-buttons">
            <button class="confirm-btn">Confirm</button>
            <button class="cancel-btn">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(dialog);
    }

    const messageEl = dialog.querySelector('.confirmation-message');
    const confirmBtn = dialog.querySelector('.confirm-btn');
    const cancelBtn = dialog.querySelector('.cancel-btn');

    messageEl.textContent = message;
    dialog.classList.add('visible');

    const cleanup = () => {
      dialog.classList.remove('visible');
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    addMobileButtonListener(confirmBtn, () => {
      cleanup();
      onConfirm();
    });

    addMobileButtonListener(cancelBtn, () => {
      cleanup();
      if (onCancel) onCancel();
    });
  }

  /**
   * Dispose of resources.
   */
  dispose() {
    this.openCallbacks_.clear();
    this.closeCallbacks_.clear();
    this.currentPanel_ = null;
  }
}

/**
 * Singleton instance for application-wide panel management.
 * @const {!PanelManager}
 */
export const panelManager = new PanelManager();
