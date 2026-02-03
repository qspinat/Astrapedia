/**
 * @fileoverview Render loop management for Three.js scenes.
 * Handles animation frame scheduling and frame counting.
 */

/**
 * RenderLoop manages the animation frame loop for rendering.
 */
export class RenderLoop {
  /**
   * Creates a new RenderLoop instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(): boolean} dependencies.shouldRender - Check if should continue rendering
   * @param {function(number): void} dependencies.onFrame - Called each frame with frame count
   * @param {function(): void} dependencies.render - Render function to call
   */
  constructor(dependencies) {
    /** @private @const */
    this.shouldRender_ = dependencies.shouldRender || (() => true);

    /** @private @const */
    this.onFrame_ = dependencies.onFrame;

    /** @private @const */
    this.render_ = dependencies.render;

    /** @private {number} */
    this.frameCount_ = 0;

    /** @private {boolean} */
    this.isRunning_ = false;

    /** @private {?number} */
    this.animationFrameId_ = null;

    /** @private {function(): void} */
    this.boundAnimate_ = this.animate_.bind(this);
  }

  /**
   * Get the current frame count.
   * @returns {number} Frame count
   */
  getFrameCount() {
    return this.frameCount_;
  }

  /**
   * Check if the render loop is running.
   * @returns {boolean} True if running
   */
  isRunning() {
    return this.isRunning_;
  }

  /**
   * Start the render loop.
   */
  start() {
    if (this.isRunning_) return;

    this.isRunning_ = true;
    this.animationFrameId_ = requestAnimationFrame(this.boundAnimate_);
  }

  /**
   * Stop the render loop.
   */
  stop() {
    this.isRunning_ = false;
    if (this.animationFrameId_) {
      cancelAnimationFrame(this.animationFrameId_);
      this.animationFrameId_ = null;
    }
  }

  /**
   * Reset the frame counter.
   */
  resetFrameCount() {
    this.frameCount_ = 0;
  }

  /**
   * Main animation loop.
   * @private
   */
  animate_() {
    if (!this.isRunning_) return;

    // Schedule next frame
    this.animationFrameId_ = requestAnimationFrame(this.boundAnimate_);

    // Check if we should continue
    if (!this.shouldRender_()) {
      return;
    }

    this.frameCount_++;

    // Call frame callback
    this.onFrame_?.(this.frameCount_);

    // Render
    this.render_?.();
  }

  /**
   * Dispose of resources.
   */
  dispose() {
    this.stop();
  }
}

/**
 * Singleton render loop instance.
 * @type {?RenderLoop}
 */
export let renderLoop = null;

/**
 * Initialize the render loop singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!RenderLoop} Initialized loop
 */
export function initializeRenderLoop(dependencies) {
  renderLoop = new RenderLoop(dependencies);
  return renderLoop;
}
