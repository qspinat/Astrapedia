/**
 * @fileoverview Input handling for mouse and touch interactions.
 * Manages dragging, zooming, and click detection.
 */

import {clamp} from '../core/Utils.js';
import {CAMERA, INPUT} from '../core/Constants.js';

/**
 * InputController handles mouse and touch input for camera control.
 */
export class InputController {
  /**
   * Creates a new InputController instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {!HTMLCanvasElement} dependencies.canvas - Canvas element for events
   * @param {function(): number} dependencies.getFov - Get current FOV in degrees
   * @param {function(): {theta: number, phi: number}} dependencies.getRotation - Get camera rotation
   * @param {function(number, number): void} dependencies.setRotation - Set camera rotation
   * @param {function(number): void} dependencies.setTargetFov - Set target FOV for smooth zoom
   * @param {function(number, number): void} dependencies.setTargetRotation - Set target rotation
   * @param {function(): void} dependencies.updateCamera - Update camera position
   * @param {function(): void} dependencies.requestRender - Request a render
   * @param {function(): number} dependencies.getCanvasHeight - Get canvas height
   * @param {function(): number} dependencies.getAspect - Get camera aspect ratio
   * @param {function(): boolean=} dependencies.isZoomLocked - Check if zoom is locked
   * @param {function(): void=} dependencies.onDragStart - Called when drag starts
   * @param {function(): void=} dependencies.onDragEnd - Called when drag ends
   * @param {function({x: number, y: number}): void=} dependencies.onClick - Called on click
   */
  constructor(dependencies) {
    /** @private @const */
    this.canvas_ = dependencies.canvas;

    /** @private @const */
    this.getFov_ = dependencies.getFov;

    /** @private @const */
    this.getRotation_ = dependencies.getRotation;

    /** @private @const */
    this.setRotation_ = dependencies.setRotation;

    /** @private @const */
    this.setTargetFov_ = dependencies.setTargetFov;

    /** @private @const */
    this.setTargetRotation_ = dependencies.setTargetRotation;

    /** @private @const */
    this.updateCamera_ = dependencies.updateCamera;

    /** @private @const */
    this.requestRender_ = dependencies.requestRender;

    /** @private @const */
    this.getCanvasHeight_ = dependencies.getCanvasHeight;

    /** @private @const */
    this.getAspect_ = dependencies.getAspect;

    /** @private @const */
    this.isZoomLocked_ = dependencies.isZoomLocked || (() => false);

    /** @private @const */
    this.onDragStart_ = dependencies.onDragStart;

    /** @private @const */
    this.onDragEnd_ = dependencies.onDragEnd;

    /** @private @const */
    this.onClick_ = dependencies.onClick;

    /** @private {boolean} */
    this.isDragging_ = false;

    /** @private {boolean} */
    this.dragMoved_ = false;

    /** @private {boolean} - Prevents synthetic click after touch tap */
    this.touchClickHandled_ = false;

    /** @private {{x: number, y: number}} */
    this.mouseDownPosition_ = {x: 0, y: 0};

    /** @private {{x: number, y: number}} */
    this.previousMousePosition_ = {x: 0, y: 0};

    /** @private {number} */
    this.lastTouchDistance_ = 0;

    /** @private {boolean} */
    this.isPinching_ = false;

    /** @private {boolean} */
    this.wasPinching_ = false;

    /** @private {number} - Timestamp of the last completed single-finger tap */
    this.lastTapTime_ = 0;

    /** @private {?{x: number, y: number}} - Position of the last tap */
    this.lastTapPos_ = null;

    /** @private {boolean} - In a double-tap-and-slide one-handed zoom */
    this.isDoubleTapZoom_ = false;

    /** @private {number} - Finger Y when the zoom slide began */
    this.zoomStartY_ = 0;

    /** @private {number} - FOV when the zoom slide began */
    this.zoomStartFov_ = 0;

    /** @private {number} */
    this.lastMoveTime_ = 0;

    /** @private {{x: number, y: number}} */
    this.velocity_ = {x: 0, y: 0};

    /** @private {!Array<{x: number, y: number, t: number}>} */
    this.recentMoves_ = [];

    /** @private {?number} */
    this.inertiaAnimationId_ = null;

    // Bind handlers
    this.onMouseDown_ = this.onMouseDown_.bind(this);
    this.onMouseMove_ = this.onMouseMove_.bind(this);
    this.onMouseUp_ = this.onMouseUp_.bind(this);
    this.onMouseWheel_ = this.onMouseWheel_.bind(this);
    this.onMouseClick_ = this.onMouseClick_.bind(this);
    this.onTouchStart_ = this.onTouchStart_.bind(this);
    this.onTouchMove_ = this.onTouchMove_.bind(this);
    this.onTouchEnd_ = this.onTouchEnd_.bind(this);
  }

  /**
   * Initialize event listeners.
   */
  initialize() {
    this.canvas_.addEventListener('mousedown', this.onMouseDown_);
    this.canvas_.addEventListener('mousemove', this.onMouseMove_);
    this.canvas_.addEventListener('mouseup', this.onMouseUp_);
    this.canvas_.addEventListener('wheel', this.onMouseWheel_);
    this.canvas_.addEventListener('click', this.onMouseClick_);

    this.canvas_.addEventListener('touchstart', this.onTouchStart_);
    this.canvas_.addEventListener('touchmove', this.onTouchMove_);
    this.canvas_.addEventListener('touchend', this.onTouchEnd_);
  }

  /**
   * Check if currently dragging.
   * @returns {boolean} True if dragging
   */
  isDragging() {
    return this.isDragging_;
  }

  /**
   * Handle mouse down event.
   * @param {!MouseEvent} event
   * @private
   */
  onMouseDown_(event) {
    this.isDragging_ = true;
    this.dragMoved_ = false;
    this.mouseDownPosition_ = {x: event.clientX, y: event.clientY};
    this.previousMousePosition_ = {x: event.clientX, y: event.clientY};
    this.onDragStart_?.();
    this.requestRender_();
  }

  /**
   * Handle mouse move event.
   * @param {!MouseEvent} event
   * @private
   */
  onMouseMove_(event) {
    if (!this.isDragging_) return;

    const deltaX = event.clientX - this.previousMousePosition_.x;
    const deltaY = event.clientY - this.previousMousePosition_.y;

    // Mark as dragged if moved more than threshold
    const totalDeltaX = event.clientX - this.mouseDownPosition_.x;
    const totalDeltaY = event.clientY - this.mouseDownPosition_.y;
    if (Math.abs(totalDeltaX) > INPUT.DRAG_THRESHOLD_PX ||
        Math.abs(totalDeltaY) > INPUT.DRAG_THRESHOLD_PX) {
      this.dragMoved_ = true;
    }

    this.applyDragRotation_(deltaX, deltaY);

    this.previousMousePosition_ = {x: event.clientX, y: event.clientY};
    this.updateCamera_();
    this.requestRender_();
  }

  /**
   * Handle mouse up event.
   * @param {!MouseEvent} event
   * @private
   */
  onMouseUp_(event) {
    this.isDragging_ = false;
    this.onDragEnd_?.();
  }

  /**
   * Handle mouse wheel event.
   * @param {!WheelEvent} event
   * @private
   */
  onMouseWheel_(event) {
    event.preventDefault();

    if (this.isZoomLocked_()) return;

    const currentFov = this.getFov_();
    const rotation = this.getRotation_();

    // Get mouse position in normalized device coordinates (-1 to +1)
    const rect = this.canvas_.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Multiplicative zoom for consistent feel at all zoom levels
    const delta = event.deltaY > 0 ? 1 : -1;
    let newFov;

    if (delta > 0) {
      newFov = Math.min(CAMERA.MAX_FOV, currentFov * INPUT.ZOOM_FACTOR);
    } else {
      newFov = Math.max(INPUT.MIN_FOV_EXTREME, currentFov / INPUT.ZOOM_FACTOR);
    }

    this.setTargetFov_(newFov);

    // Zoom toward cursor
    const fovRatio = currentFov / newFov;
    if (Math.abs(fovRatio - 1) > INPUT.FOV_CHANGE_THRESHOLD) {
      const oldFovRad = currentFov * Math.PI / 180;
      const newFovRad = newFov * Math.PI / 180;
      const aspect = this.getAspect_();

      const oldAngleX = mouseX * Math.tan(oldFovRad / 2) * aspect;
      const oldAngleY = mouseY * Math.tan(oldFovRad / 2);
      const newAngleX = mouseX * Math.tan(newFovRad / 2) * aspect;
      const newAngleY = mouseY * Math.tan(newFovRad / 2);

      const rotateTheta = oldAngleX - newAngleX;
      const rotatePhi = oldAngleY - newAngleY;

      this.setTargetRotation_(
        rotation.theta + rotateTheta,
        clamp(rotation.phi + rotatePhi, INPUT.PHI_MIN_RAD, INPUT.PHI_MAX_RAD)
      );
    }

    this.requestRender_();
  }

  /**
   * Handle mouse click event.
   * @param {!MouseEvent} event
   * @private
   */
  onMouseClick_(event) {
    // Skip synthetic click if touch already handled it
    if (this.touchClickHandled_) {
      this.touchClickHandled_ = false;
      return;
    }

    if (this.dragMoved_) {
      this.dragMoved_ = false;
      return;
    }
    this.dragMoved_ = false;

    // Calculate normalized device coordinates
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.onClick_?.({x, y});
  }

  /**
   * Handle touch start event.
   * @param {!TouchEvent} event
   * @private
   */
  /**
   * Whether a touch starting now continues a recent nearby tap — the trigger
   * for the one-handed zoom slide.
   * @param {!Touch} touch - The starting touch
   * @returns {boolean}
   * @private
   */
  isDoubleTap_(touch) {
    if (!this.lastTapPos_) return false;
    const elapsed = performance.now() - this.lastTapTime_;
    if (elapsed > INPUT.DOUBLE_TAP_MS) return false;
    const dx = touch.clientX - this.lastTapPos_.x;
    const dy = touch.clientY - this.lastTapPos_.y;
    return Math.sqrt(dx * dx + dy * dy) <= INPUT.DOUBLE_TAP_DIST_PX;
  }

  onTouchStart_(event) {
    // Stop any ongoing inertia animation
    if (this.inertiaAnimationId_) {
      cancelAnimationFrame(this.inertiaAnimationId_);
      this.inertiaAnimationId_ = null;
    }
    this.velocity_ = {x: 0, y: 0};
    this.recentMoves_ = [];

    if (event.touches.length === 1) {
      const touch = event.touches[0];

      // A second tap landing near the first, soon after it, starts a
      // one-handed zoom: hold and slide vertically to change the FOV. This
      // takes precedence over panning/selecting so the gesture doesn't also
      // drag the sky. Suppressed while zoom is locked (telescope mode).
      if (this.isDoubleTap_(touch) && !this.isZoomLocked_()) {
        this.isDoubleTapZoom_ = true;
        this.isDragging_ = false;
        this.isPinching_ = false;
        this.zoomStartY_ = touch.clientY;
        this.zoomStartFov_ = this.getFov_();
        this.lastTapTime_ = 0;
        this.requestRender_();
        return;
      }

      this.isDragging_ = true;
      this.dragMoved_ = false;
      this.isPinching_ = false;
      this.wasPinching_ = false;
      this.isDoubleTapZoom_ = false;
      this.mouseDownPosition_ = {x: touch.clientX, y: touch.clientY};
      this.previousMousePosition_ = {x: touch.clientX, y: touch.clientY};
      this.lastMoveTime_ = performance.now();
      // Add initial position to recent moves
      this.recentMoves_.push({x: touch.clientX, y: touch.clientY, t: this.lastMoveTime_});
      this.onDragStart_?.();
    } else if (event.touches.length === 2) {
      this.isPinching_ = true;
      this.isDragging_ = false;
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      this.lastTouchDistance_ = Math.sqrt(dx * dx + dy * dy);
    }
    this.requestRender_();
  }

  /**
   * Handle touch move event.
   * @param {!TouchEvent} event
   * @private
   */
  onTouchMove_(event) {
    event.preventDefault();

    if (event.touches.length === 1 && this.isDoubleTapZoom_) {
      // Slide down to zoom in, up to zoom out. Exponential so each fixed
      // slide distance multiplies the FOV, matching how pinch feels, and
      // anchored to where the slide began so it never accumulates drift.
      const dy = event.touches[0].clientY - this.zoomStartY_;
      const factor = Math.pow(2, -dy / INPUT.ZOOM_SLIDE_PX_PER_DOUBLING);
      const newFov = clamp(this.zoomStartFov_ * factor,
          INPUT.MIN_FOV_EXTREME, CAMERA.MAX_FOV);
      this.setTargetFov_(newFov);
      this.requestRender_();
      return;
    } else if (event.touches.length === 1 && this.isDragging_) {
      const touch = event.touches[0];
      const deltaX = touch.clientX - this.previousMousePosition_.x;
      const deltaY = touch.clientY - this.previousMousePosition_.y;

      const totalDeltaX = touch.clientX - this.mouseDownPosition_.x;
      const totalDeltaY = touch.clientY - this.mouseDownPosition_.y;
      if (Math.abs(totalDeltaX) > INPUT.DRAG_THRESHOLD_PX ||
          Math.abs(totalDeltaY) > INPUT.DRAG_THRESHOLD_PX) {
        this.dragMoved_ = true;
      }

      // Track recent moves for inertia velocity calculation
      const now = performance.now();
      this.recentMoves_.push({x: touch.clientX, y: touch.clientY, t: now});
      // Keep only moves from inertia history window
      while (this.recentMoves_.length > 0 &&
             now - this.recentMoves_[0].t > INPUT.INERTIA_HISTORY_MS) {
        this.recentMoves_.shift();
      }
      this.lastMoveTime_ = now;

      this.applyDragRotation_(deltaX, deltaY);

      this.previousMousePosition_ = {x: touch.clientX, y: touch.clientY};
      this.updateCamera_();
    } else if (event.touches.length === 2 && this.isPinching_) {
      if (this.isZoomLocked_()) return;

      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (this.lastTouchDistance_ > 0) {
        const scale = this.lastTouchDistance_ / distance;
        const currentFov = this.getFov_();
        const newFov = clamp(currentFov * scale, INPUT.MIN_FOV_EXTREME, CAMERA.MAX_FOV);
        this.setTargetFov_(newFov);
      }

      this.lastTouchDistance_ = distance;
    }

    this.requestRender_();
  }

  /**
   * Handle touch end event.
   * @param {!TouchEvent} event
   * @private
   */
  onTouchEnd_(event) {
    if (event.touches.length === 0) {
      if (this.isDoubleTapZoom_) {
        // End the one-handed zoom without selecting or flinging.
        this.isDoubleTapZoom_ = false;
      } else if (this.isDragging_ && !this.dragMoved_ && !this.wasPinching_) {
        // A completed tap: remember it so a quick second tap nearby can start
        // the zoom slide, then dispatch the selection click.
        this.lastTapTime_ = performance.now();
        this.lastTapPos_ = {x: this.mouseDownPosition_.x, y: this.mouseDownPosition_.y};
        // Mark that touch handled the click to prevent synthetic click
        this.touchClickHandled_ = true;
        // Simulate click at last position
        const x = (this.mouseDownPosition_.x / window.innerWidth) * 2 - 1;
        const y = -(this.mouseDownPosition_.y / window.innerHeight) * 2 + 1;
        this.onClick_?.({x, y});
      } else if (this.isDragging_ && this.dragMoved_) {
        // Start inertia if we were dragging with movement
        this.startInertia_();
      }

      this.isDragging_ = false;
      this.isPinching_ = false;
      this.wasPinching_ = false;
      this.lastTouchDistance_ = 0;
      this.onDragEnd_?.();
    } else if (event.touches.length === 1) {
      // Switch from pinch back to drag
      this.isPinching_ = false;
      this.wasPinching_ = true; // Remember we were pinching to prevent click
      this.isDragging_ = true;
      this.dragMoved_ = true; // Prevent click after pinch
      const touch = event.touches[0];
      this.previousMousePosition_ = {x: touch.clientX, y: touch.clientY};
      this.mouseDownPosition_ = {x: touch.clientX, y: touch.clientY};
      this.velocity_ = {x: 0, y: 0}; // Reset velocity after pinch
    }
  }

  /**
   * Start inertia animation after touch release.
   * @private
   */
  startInertia_() {
    // Cancel any existing inertia animation
    if (this.inertiaAnimationId_) {
      cancelAnimationFrame(this.inertiaAnimationId_);
    }

    // Calculate velocity from recent moves
    if (this.recentMoves_.length >= 2) {
      const first = this.recentMoves_[0];
      const last = this.recentMoves_[this.recentMoves_.length - 1];
      const dt = last.t - first.t;
      if (dt > 0) {
        // Velocity in pixels per frame
        this.velocity_ = {
          x: (last.x - first.x) / dt * INPUT.VELOCITY_FRAME_MS,
          y: (last.y - first.y) / dt * INPUT.VELOCITY_FRAME_MS,
        };
      }
    }
    this.recentMoves_ = [];

    const animate = () => {
      // Apply friction
      this.velocity_.x *= INPUT.INERTIA_FRICTION;
      this.velocity_.y *= INPUT.INERTIA_FRICTION;

      // Stop if velocity is too low
      if (Math.abs(this.velocity_.x) < INPUT.MIN_VELOCITY &&
          Math.abs(this.velocity_.y) < INPUT.MIN_VELOCITY) {
        this.velocity_ = {x: 0, y: 0};
        this.inertiaAnimationId_ = null;
        return;
      }

      // Apply rotation
      this.applyDragRotation_(this.velocity_.x, this.velocity_.y);
      this.updateCamera_();
      this.requestRender_();

      // Continue animation
      this.inertiaAnimationId_ = requestAnimationFrame(animate);
    };

    // Only start if we have meaningful velocity
    if (Math.abs(this.velocity_.x) > INPUT.MIN_VELOCITY ||
        Math.abs(this.velocity_.y) > INPUT.MIN_VELOCITY) {
      this.inertiaAnimationId_ = requestAnimationFrame(animate);
    }
  }

  /**
   * Apply drag rotation to camera.
   * @param {number} deltaX - X movement in pixels
   * @param {number} deltaY - Y movement in pixels
   * @private
   */
  applyDragRotation_(deltaX, deltaY) {
    const fov = this.getFov_();
    const canvasHeight = this.getCanvasHeight_();
    const fovRad = fov * Math.PI / 180;

    // Calculate radians per pixel at current FOV
    const radiansPerPixel = fovRad / canvasHeight;

    const rotation = this.getRotation_();
    const newTheta = rotation.theta - deltaX * radiansPerPixel;
    const newPhi = clamp(rotation.phi + deltaY * radiansPerPixel, INPUT.PHI_MIN_RAD, INPUT.PHI_MAX_RAD);

    this.setRotation_(newTheta, newPhi);
    this.setTargetRotation_(newTheta, newPhi);
  }

  /**
   * Stop any running inertia animation.
   */
  stopInertia() {
    if (this.inertiaAnimationId_) {
      cancelAnimationFrame(this.inertiaAnimationId_);
      this.inertiaAnimationId_ = null;
      this.velocity_ = {x: 0, y: 0};
    }
  }

  /**
   * Dispose of event listeners.
   */
  dispose() {
    // Stop inertia animation
    this.stopInertia();

    this.canvas_.removeEventListener('mousedown', this.onMouseDown_);
    this.canvas_.removeEventListener('mousemove', this.onMouseMove_);
    this.canvas_.removeEventListener('mouseup', this.onMouseUp_);
    this.canvas_.removeEventListener('wheel', this.onMouseWheel_);
    this.canvas_.removeEventListener('click', this.onMouseClick_);

    this.canvas_.removeEventListener('touchstart', this.onTouchStart_);
    this.canvas_.removeEventListener('touchmove', this.onTouchMove_);
    this.canvas_.removeEventListener('touchend', this.onTouchEnd_);
  }
}

/**
 * Singleton input controller instance.
 * @type {?InputController}
 */
export let inputController = null;

/**
 * Initialize the input controller singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!InputController} Initialized controller
 */
export function initializeInputController(dependencies) {
  inputController = new InputController(dependencies);
  inputController.initialize();
  return inputController;
}
