/**
 * @fileoverview Bug report handler for Astrapedia.
 * Handles bug report form submission to Formspree with validation.
 */

import {createLogger} from '../core/Logger.js';
import {panelManager} from './PanelManager.js';

const logger = createLogger('BugReportHandler');

/**
 * Formspree endpoint for bug reports.
 * @const {string}
 */
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xaqeoelv';

/**
 * Validate email format.
 * @param {string} email - Email address to validate
 * @returns {boolean} True if email is valid or empty
 */
const isValidEmail = (email) => {
  if (!email) return true; // Empty is valid (optional field)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Bug Report Handler - handles bug report form submission to Formspree.
 */
export class BugReportHandler {
  /**
   * Creates a new BugReportHandler instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(): void=} dependencies.closePanel - Close panel function
   */
  constructor(dependencies = {}) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private {boolean} */
    this.submitting_ = false;
  }

  /**
   * Initialize the bug report handler.
   */
  initialize() {
    this.setupEventListeners_();
  }

  /**
   * Sets up event listeners for bug report form.
   * @private
   */
  setupEventListeners_() {
    const submitBtn = document.getElementById('bug-report-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.handleSubmit_());
    }
  }

  /**
   * Validates the bug report form.
   * @returns {boolean} True if form is valid
   * @private
   */
  validateForm_() {
    const description = document.getElementById('bug-description');
    if (!description || !description.value.trim()) {
      panelManager.showNotification('Please provide a description of the bug.');
      description?.focus();
      return false;
    }
    if (description.value.trim().length < 10) {
      panelManager.showNotification('Please provide a more detailed description.');
      description?.focus();
      return false;
    }

    // Validate email if provided
    const emailInput = document.getElementById('bug-email');
    const email = emailInput?.value.trim() || '';
    if (email && !isValidEmail(email)) {
      panelManager.showNotification('Please enter a valid email address.');
      emailInput?.focus();
      return false;
    }

    return true;
  }

  /**
   * Collects diagnostic information.
   * @returns {!Object} Diagnostic info
   * @private
   */
  collectDiagnosticInfo_() {
    return {
      userAgent: navigator.userAgent,
      screenSize: `${window.innerWidth}x${window.innerHeight}`,
      devicePixelRatio: window.devicePixelRatio || 1,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      language: navigator.language || 'unknown',
    };
  }

  /**
   * Handles form submission.
   * @private
   */
  async handleSubmit_() {
    if (this.submitting_) return;
    if (!this.validateForm_()) return;

    const description =
        document.getElementById('bug-description')?.value.trim() || '';
    const category = document.getElementById('bug-category')?.value || 'other';
    const email = document.getElementById('bug-email')?.value.trim() || '';

    const submitBtn = document.getElementById('bug-report-submit');
    this.submitting_ = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }

    try {
      const formData = {
        '_subject': `Bug Report: ${category}`,
        'message': description,
        'category': category,
        ...this.collectDiagnosticInfo_(),
      };
      // Only include email if provided (Formspree rejects invalid emails)
      if (email) {
        formData.email = email;
        formData._replyto = email;
      }

      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        panelManager.showNotification('Bug report submitted. Thank you!');
        this.clearForm_();
        this.deps_.closePanel?.();
      } else {
        panelManager.showNotification('Failed to submit. Please try again.');
      }
    } catch (error) {
      logger.error('Submission failed:', error);
      panelManager.showNotification('Network error. Please try again.');
    } finally {
      this.submitting_ = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Report';
      }
    }
  }

  /**
   * Clears the form fields.
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

}

/**
 * Singleton bug report handler instance.
 * @type {?BugReportHandler}
 */
export let bugReportHandler = null;

/**
 * Initialize the bug report handler singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!BugReportHandler} Initialized handler
 */
export function initializeBugReportHandler(dependencies) {
  bugReportHandler = new BugReportHandler(dependencies);
  bugReportHandler.initialize();
  return bugReportHandler;
}
