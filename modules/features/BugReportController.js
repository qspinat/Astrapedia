/**
 * @fileoverview Bug report controller for submitting user feedback.
 * Collects user input and diagnostic information, then submits to Formspree.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {APP_VERSION, FORMSPREE_ENDPOINT} from '../core/Constants.js';

/**
 * Check if Formspree endpoint is configured.
 * @returns {boolean} True if endpoint is configured
 */
function isEndpointConfigured() {
  return FORMSPREE_ENDPOINT && !FORMSPREE_ENDPOINT.includes('YOUR_FORM_ID');
}

/**
 * Validate email format.
 * @param {string} email - Email address to validate
 * @returns {boolean} True if email is valid or empty
 */
function isValidEmail(email) {
  if (!email) return true; // Empty is valid (optional field)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * BugReportController handles bug report form submission.
 */
export class BugReportController {
  /**
   * Creates a new BugReportController instance.
   * @param {!Object} deps - Dependencies
   * @param {!Object} deps.panelManager - Panel manager instance
   */
  constructor({panelManager}) {
    /**
     * Panel manager for opening/closing panels.
     * @private {!Object}
     */
    this.panelManager_ = panelManager;

    /**
     * Whether a submission is in progress.
     * @private {boolean}
     */
    this.submitting_ = false;

    /**
     * Bound event handlers for cleanup.
     * @private {!Object}
     */
    this.boundHandlers_ = {
      handleOpen: null,
      handleClose: null,
      handleSubmit: null,
    };
  }

  /**
   * Initialize the bug report controller.
   */
  initialize() {
    this.setupEventListeners_();
  }

  /**
   * Setup DOM event listeners.
   * @private
   */
  setupEventListeners_() {
    // Create bound handlers for cleanup
    this.boundHandlers_.handleOpen = () => {
      this.panelManager_.open('bug-report-panel');
    };
    this.boundHandlers_.handleClose = () => {
      this.panelManager_.closeAll();
    };
    this.boundHandlers_.handleSubmit = () => {
      this.handleSubmit_();
    };

    // Bug report button
    const bugReportBtn = document.getElementById('bug-report-btn');
    if (bugReportBtn) {
      bugReportBtn.addEventListener('click', this.boundHandlers_.handleOpen);
    }

    // Close button
    const closeBtn = document.getElementById('bug-report-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', this.boundHandlers_.handleClose);
    }

    // Submit button
    const submitBtn = document.getElementById('bug-report-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', this.boundHandlers_.handleSubmit);
    }

    // Clear form when panel closes
    this.panelManager_.onClose('bug-report-panel', () => {
      this.clearForm_();
    });
  }

  /**
   * Collect diagnostic information about the user's environment.
   * @returns {!Object} Diagnostic info object
   * @private
   */
  collectDiagnosticInfo_() {
    return {
      userAgent: navigator.userAgent,
      screenSize: `${window.innerWidth}x${window.innerHeight}`,
      devicePixelRatio: window.devicePixelRatio || 1,
      appVersion: APP_VERSION,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      language: navigator.language || 'unknown',
    };
  }

  /**
   * Validate form input.
   * @returns {boolean} True if form is valid
   * @private
   */
  validateForm_() {
    const description = document.getElementById('bug-description');
    if (!description || !description.value.trim()) {
      this.showNotification_('Please provide a description of the bug.', 'error');
      description?.focus();
      return false;
    }

    if (description.value.trim().length < 10) {
      this.showNotification_('Please provide a more detailed description.', 'error');
      description?.focus();
      return false;
    }

    // Validate email if provided
    const emailInput = document.getElementById('bug-email');
    const email = emailInput?.value.trim() || '';
    if (email && !isValidEmail(email)) {
      this.showNotification_('Please enter a valid email address.', 'error');
      emailInput?.focus();
      return false;
    }

    return true;
  }

  /**
   * Handle form submission.
   * @private
   */
  async handleSubmit_() {
    if (this.submitting_) return;

    // Check if endpoint is configured
    if (!isEndpointConfigured()) {
      this.showNotification_(
        'Bug reporting is not configured. Please contact the developer.',
        'error'
      );
      console.warn('Bug report: Formspree endpoint not configured');
      return;
    }

    if (!this.validateForm_()) return;

    const description = document.getElementById('bug-description')?.value.trim() || '';
    const category = document.getElementById('bug-category')?.value || 'other';
    const email = document.getElementById('bug-email')?.value.trim() || '';

    const diagnosticInfo = this.collectDiagnosticInfo_();

    const reportData = {
      description,
      category,
      email: email || 'Not provided',
      ...diagnosticInfo,
    };

    await this.submitReport_(reportData);
  }

  /**
   * Submit the bug report to Formspree.
   * @param {!Object} data - Report data
   * @private
   */
  async submitReport_(data) {
    this.submitting_ = true;
    const submitBtn = document.getElementById('bug-report-submit');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }

    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        this.showNotification_('Bug report submitted successfully. Thank you!', 'success');
        this.panelManager_.closeAll();
        globalEventBus.emit(Events.BUG_REPORT_SUBMITTED, {success: true, data});
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || 'Failed to submit report. Please try again.';
        this.showNotification_(errorMessage, 'error');
        globalEventBus.emit(Events.BUG_REPORT_SUBMITTED, {success: false, error: errorMessage});
      }
    } catch (error) {
      console.error('Bug report submission failed:', error);
      this.showNotification_('Network error. Please check your connection and try again.', 'error');
      globalEventBus.emit(Events.BUG_REPORT_SUBMITTED, {success: false, error: error.message});
    } finally {
      this.submitting_ = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Report';
      }
    }
  }

  /**
   * Show a notification message.
   * @param {string} message - Message to display
   * @param {string} type - 'success' or 'error'
   * @private
   */
  showNotification_(message, type = 'success') {
    this.panelManager_.showNotification(message, type === 'error' ? 5000 : 3000);
  }

  /**
   * Clear the form fields.
   * @private
   */
  clearForm_() {
    const description = document.getElementById('bug-description');
    const category = document.getElementById('bug-category');
    const email = document.getElementById('bug-email');

    if (description) description.value = '';
    if (category) category.selectedIndex = 0;
    if (email) email.value = '';
  }

  /**
   * Dispose of resources.
   */
  dispose() {
    // Remove event listeners
    const bugReportBtn = document.getElementById('bug-report-btn');
    if (bugReportBtn && this.boundHandlers_.handleOpen) {
      bugReportBtn.removeEventListener('click', this.boundHandlers_.handleOpen);
    }

    const closeBtn = document.getElementById('bug-report-close-btn');
    if (closeBtn && this.boundHandlers_.handleClose) {
      closeBtn.removeEventListener('click', this.boundHandlers_.handleClose);
    }

    const submitBtn = document.getElementById('bug-report-submit');
    if (submitBtn && this.boundHandlers_.handleSubmit) {
      submitBtn.removeEventListener('click', this.boundHandlers_.handleSubmit);
    }

    this.boundHandlers_ = {
      handleOpen: null,
      handleClose: null,
      handleSubmit: null,
    };
    this.submitting_ = false;
  }
}

/**
 * Initialize bug report controller with dependencies.
 * @param {!Object} deps - Dependencies
 * @returns {!BugReportController} Initialized controller
 */
export function initializeBugReportController(deps) {
  const controller = new BugReportController(deps);
  controller.initialize();
  return controller;
}
