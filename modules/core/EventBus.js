/**
 * @fileoverview Pub/sub event system for decoupled communication.
 * Allows modules to communicate without direct dependencies.
 */

/**
 * Subscription handle returned when subscribing to events.
 * @typedef {{
 *   unsubscribe: function(): void
 * }}
 */
let Subscription;

/**
 * EventBus provides a centralized publish-subscribe event system.
 * Supports automatic cleanup, once-only subscriptions, and namespaced events.
 */
export class EventBus {
  /**
   * Creates a new EventBus instance.
   */
  constructor() {
    /**
     * Map of event names to arrays of listener objects.
     * @private {!Map<string, !Array<{callback: function(*): void, once: boolean}>>}
     */
    this.listeners_ = new Map();

    /**
     * Map of subscriber IDs to their event subscriptions (for bulk cleanup).
     * @private {!Map<string, !Array<{event: string, callback: function(*): void}>>}
     */
    this.subscriptions_ = new Map();

    /**
     * Counter for generating unique subscription IDs.
     * @private {number}
     */
    this.subscriptionIdCounter_ = 0;
  }

  /**
   * Subscribe to an event.
   * @param {string} eventName - Name of the event to listen for
   * @param {function(*): void} callback - Function to call when event fires
   * @param {Object=} options - Optional settings
   * @param {boolean=} options.once - If true, automatically unsubscribe after
   *   first invocation
   * @param {string=} options.subscriberId - Optional ID for bulk unsubscription
   * @returns {!Subscription} Object with unsubscribe method
   */
  on(eventName, callback, options = {}) {
    if (!this.listeners_.has(eventName)) {
      this.listeners_.set(eventName, []);
    }

    const listener = {
      callback,
      once: options.once || false,
    };

    this.listeners_.get(eventName).push(listener);

    // Track subscription for bulk cleanup if subscriberId provided
    if (options.subscriberId) {
      if (!this.subscriptions_.has(options.subscriberId)) {
        this.subscriptions_.set(options.subscriberId, []);
      }
      this.subscriptions_.get(options.subscriberId).push({
        event: eventName,
        callback,
      });
    }

    // Return unsubscribe handle
    return {
      unsubscribe: () => {
        this.off(eventName, callback);
      },
    };
  }

  /**
   * Subscribe to an event that automatically unsubscribes after one call.
   * @param {string} eventName - Name of the event to listen for
   * @param {function(*): void} callback - Function to call when event fires
   * @returns {!Subscription} Object with unsubscribe method
   */
  once(eventName, callback) {
    return this.on(eventName, callback, {once: true});
  }

  /**
   * Unsubscribe from an event.
   * @param {string} eventName - Name of the event
   * @param {function(*): void} callback - The callback to remove
   */
  off(eventName, callback) {
    const listeners = this.listeners_.get(eventName);
    if (!listeners) return;

    const index = listeners.findIndex((l) => l.callback === callback);
    if (index !== -1) {
      listeners.splice(index, 1);
    }

    // Clean up empty listener arrays
    if (listeners.length === 0) {
      this.listeners_.delete(eventName);
    }
  }

  /**
   * Unsubscribe all events for a subscriber ID.
   * Useful for cleaning up when a module is destroyed.
   * @param {string} subscriberId - The subscriber ID to clean up
   */
  offAll(subscriberId) {
    const subscriptions = this.subscriptions_.get(subscriberId);
    if (!subscriptions) return;

    subscriptions.forEach(({event, callback}) => {
      this.off(event, callback);
    });

    this.subscriptions_.delete(subscriberId);
  }

  /**
   * Emit an event to all subscribers.
   * @param {string} eventName - Name of the event to emit
   * @param {*=} data - Optional data to pass to subscribers
   */
  emit(eventName, data) {
    const listeners = this.listeners_.get(eventName);
    if (!listeners || listeners.length === 0) return;

    // Create a copy to allow modifications during iteration
    const listenersToCall = [...listeners];

    listenersToCall.forEach((listener) => {
      try {
        listener.callback(data);
      } catch (error) {
        console.error(`Error in event listener for "${eventName}":`, error);
      }

      // Remove once listeners after calling
      if (listener.once) {
        this.off(eventName, listener.callback);
      }
    });
  }

  /**
   * Check if an event has any subscribers.
   * @param {string} eventName - Name of the event
   * @returns {boolean} True if there are subscribers
   */
  hasListeners(eventName) {
    const listeners = this.listeners_.get(eventName);
    return listeners !== undefined && listeners.length > 0;
  }

  /**
   * Get the number of subscribers for an event.
   * @param {string} eventName - Name of the event
   * @returns {number} Number of subscribers
   */
  listenerCount(eventName) {
    const listeners = this.listeners_.get(eventName);
    return listeners ? listeners.length : 0;
  }

  /**
   * Remove all listeners for all events.
   * Use with caution - typically only for testing or shutdown.
   */
  clear() {
    this.listeners_.clear();
    this.subscriptions_.clear();
  }

  /**
   * Generate a unique subscription ID.
   * @returns {string} Unique subscription ID
   */
  generateSubscriptionId() {
    return `sub_${++this.subscriptionIdCounter_}`;
  }
}

/**
 * Standard event names used throughout the application.
 * Using constants prevents typos and enables IDE autocomplete.
 * @const {!Object<string, string>}
 */
export const Events = {
  // Data events
  DATA_LOADED: 'data:loaded',
  DATA_ERROR: 'data:error',
  STARS_LOADED: 'data:stars:loaded',
  DSOS_LOADED: 'data:dsos:loaded',
  CONSTELLATIONS_LOADED: 'data:constellations:loaded',

  // Camera events
  CAMERA_MOVE: 'camera:move',
  CAMERA_ZOOM: 'camera:zoom',
  FOV_CHANGED: 'camera:fov:changed',

  // Selection events
  OBJECT_SELECTED: 'object:selected',
  OBJECT_DESELECTED: 'object:deselected',
  OBJECT_HOVERED: 'object:hovered',

  // Time events
  TIME_CHANGED: 'time:changed',
  TIME_SPEED_CHANGED: 'time:speed:changed',
  TIME_TICK: 'time:tick',

  // Location events
  LOCATION_CHANGED: 'location:changed',
  LOCATION_ERROR: 'location:error',

  // Game events
  GAME_STARTED: 'game:started',
  GAME_STOPPED: 'game:stopped',
  GAME_ENDED: 'game:ended',
  GAME_QUESTION: 'game:question',
  GAME_CORRECT: 'game:correct',
  GAME_INCORRECT: 'game:incorrect',
  GAME_PASSED: 'game:passed',
  GAME_SCORE: 'game:score',
  GAME_SCORE_UPDATED: 'game:score:updated',

  // Tour events
  TOUR_STARTED: 'tour:started',
  TOUR_STOPPED: 'tour:stopped',
  TOUR_ENDED: 'tour:ended',
  TOUR_STEP_CHANGED: 'tour:step:changed',

  // UI events
  PANEL_OPENED: 'ui:panel:opened',
  PANEL_CLOSED: 'ui:panel:closed',
  SETTINGS_CHANGED: 'ui:settings:changed',
  SETTING_CHANGED: 'ui:setting:changed',
  MAGNITUDE_CHANGED: 'ui:magnitude:changed',

  // Search events
  SEARCH_QUERY: 'search:query',
  SEARCH_RESULTS: 'search:results',
  SEARCH_SELECT: 'search:select',
  SEARCH_RESULT_SELECTED: 'search:result:selected',

  // Image events
  IMAGE_LOADED: 'image:loaded',
  IMAGE_ERROR: 'image:error',

  // Dynamic data events
  DYNAMIC_STARS_LOADED: 'dynamic:stars:loaded',
  DYNAMIC_DSOS_LOADED: 'dynamic:dsos:loaded',
  DYNAMIC_QUERY_STARTED: 'dynamic:query:started',
  DYNAMIC_QUERY_COMPLETE: 'dynamic:query:complete',
  DYNAMIC_QUERY_RATE_LIMITED: 'dynamic:query:ratelimited',

  // Compass events
  COMPASS_ENABLED: 'compass:enabled',
  COMPASS_DISABLED: 'compass:disabled',
  COMPASS_HEADING: 'compass:heading',

  // Render events
  RENDER_FRAME: 'render:frame',
  RENDER_IDLE: 'render:idle',
  RENDER_ACTIVE: 'render:active',

  // Visibility events
  PAGE_VISIBLE: 'page:visible',
  PAGE_HIDDEN: 'page:hidden',

  // Application events
  APP_INITIALIZED: 'app:initialized',
  PLANETS_UPDATED: 'planets:updated',
};

/**
 * Global EventBus instance for the application.
 * Import this in modules that need to communicate.
 * @const {!EventBus}
 */
export const globalEventBus = new EventBus();
