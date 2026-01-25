/**
 * @fileoverview Camera controller for celestial sphere navigation.
 * Handles smooth camera animation, zoom, and navigation to celestial coordinates.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {CAMERA} from '../core/Constants.js';
import {raDecToCartesian} from '../core/CoordinateUtils.js';

/**
 * Camera state for smooth interpolation.
 * @typedef {{
 *   theta: number,
 *   phi: number,
 *   fov: number,
 *   distance: number
 * }}
 */
let CameraState;

/**
 * CameraController manages camera position and animation.
 */
export class CameraController {
  /**
   * Creates a new CameraController instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {!THREE.PerspectiveCamera} dependencies.camera - Three.js camera
   * @param {!THREE.Group} dependencies.celestialSphere - Celestial sphere group
   * @param {function(): void=} dependencies.requestRender - Request render callback
   */
  constructor(dependencies) {
    /** @private @const */
    this.camera_ = dependencies.camera;

    /** @private @const */
    this.celestialSphere_ = dependencies.celestialSphere;

    /** @private @const */
    this.requestRender_ = dependencies.requestRender || (() => {});

    // Current camera state (spherical coordinates)
    /** @private {number} */
    this.theta_ = CAMERA.DEFAULT_THETA;

    /** @private {number} */
    this.phi_ = CAMERA.DEFAULT_PHI;

    /** @private {number} */
    this.distance_ = CAMERA.INITIAL_DISTANCE;

    // Target state for smooth animation
    /** @private {number} */
    this.targetTheta_ = this.theta_;

    /** @private {number} */
    this.targetPhi_ = this.phi_;

    /** @private {number} */
    this.targetFov_ = CAMERA.DEFAULT_FOV;

    /** @private {boolean} */
    this.isTelescopeModeActive_ = false;
  }

  /**
   * Get current theta angle.
   * @returns {number} Theta in radians
   */
  getTheta() {
    return this.theta_;
  }

  /**
   * Set current theta angle.
   * @param {number} theta - Theta in radians
   */
  setTheta(theta) {
    this.theta_ = theta;
  }

  /**
   * Get current phi angle.
   * @returns {number} Phi in radians
   */
  getPhi() {
    return this.phi_;
  }

  /**
   * Set current phi angle.
   * @param {number} phi - Phi in radians
   */
  setPhi(phi) {
    this.phi_ = phi;
  }

  /**
   * Get target theta for animation.
   * @returns {number} Target theta in radians
   */
  getTargetTheta() {
    return this.targetTheta_;
  }

  /**
   * Set target theta for animation.
   * @param {number} theta - Target theta in radians
   */
  setTargetTheta(theta) {
    this.targetTheta_ = theta;
  }

  /**
   * Get target phi for animation.
   * @returns {number} Target phi in radians
   */
  getTargetPhi() {
    return this.targetPhi_;
  }

  /**
   * Set target phi for animation.
   * @param {number} phi - Target phi in radians
   */
  setTargetPhi(phi) {
    this.targetPhi_ = phi;
  }

  /**
   * Get target FOV.
   * @returns {number} Target FOV in degrees
   */
  getTargetFov() {
    return this.targetFov_;
  }

  /**
   * Set target FOV.
   * @param {number} fov - Target FOV in degrees
   */
  setTargetFov(fov) {
    if (!this.isTelescopeModeActive_) {
      this.targetFov_ = Math.max(CAMERA.MIN_FOV, Math.min(CAMERA.MAX_FOV, fov));
    }
  }

  /**
   * Set telescope mode active state.
   * @param {boolean} active - Whether telescope mode is active
   */
  setTelescopeModeActive(active) {
    this.isTelescopeModeActive_ = active;
  }

  /**
   * Animate camera to look at specific RA/Dec coordinates.
   * @param {number} ra - Right Ascension in degrees
   * @param {number} dec - Declination in degrees
   */
  animateTo(ra, dec) {
    // Get the object position in celestial (local) coordinates
    const localPos = raDecToCartesian(ra, dec, 100);

    // Transform to world coordinates using celestialSphere's world matrix
    const worldPos = localPos.clone();
    if (this.celestialSphere_) {
      this.celestialSphere_.updateMatrixWorld();
      worldPos.applyMatrix4(this.celestialSphere_.matrixWorld);
    }

    // Direction from origin to object in world coordinates
    const dir = worldPos.clone().normalize();

    // Calculate target spherical coordinates
    // Camera position formula: P = (sin(phi)*cos(theta), cos(phi), sin(phi)*sin(theta)) * distance
    // We need view direction = dir, so P = -dir * distance
    const targetPhi = Math.acos(Math.max(-1, Math.min(1, -dir.y)));
    const targetTheta = Math.atan2(-dir.z, -dir.x);

    // Use smooth animation via the target system
    this.targetTheta_ = targetTheta;
    this.targetPhi_ = targetPhi;

    // Zoom in a bit if we're zoomed out too far
    if (this.camera_.fov > 30 && !this.isTelescopeModeActive_) {
      this.targetFov_ = 30;
    }

    // Wake up animation loop
    this.requestRender_();

    globalEventBus.emit(Events.CAMERA_MOVE, {ra, dec});
  }

  /**
   * Reset camera to default position.
   */
  reset() {
    this.targetTheta_ = CAMERA.DEFAULT_THETA;
    this.targetPhi_ = CAMERA.DEFAULT_PHI;
    this.targetFov_ = CAMERA.DEFAULT_FOV;
    this.requestRender_();
  }

  /**
   * Update camera position with smooth interpolation.
   * Should be called in the animation loop.
   * @returns {boolean} Whether camera is still animating
   */
  update() {
    let isAnimating = false;

    // Smooth interpolation for theta
    const thetaDiff = this.targetTheta_ - this.theta_;
    if (Math.abs(thetaDiff) > 0.0001) {
      this.theta_ += thetaDiff * CAMERA.ZOOM_LERP_SPEED;
      isAnimating = true;
    }

    // Smooth interpolation for phi
    const phiDiff = this.targetPhi_ - this.phi_;
    if (Math.abs(phiDiff) > 0.0001) {
      this.phi_ += phiDiff * CAMERA.ZOOM_LERP_SPEED;
      isAnimating = true;
    }

    // Smooth interpolation for FOV
    const fovDiff = this.targetFov_ - this.camera_.fov;
    if (Math.abs(fovDiff) > 0.01) {
      this.camera_.fov += fovDiff * CAMERA.ZOOM_LERP_SPEED;
      this.camera_.updateProjectionMatrix();
      isAnimating = true;

      globalEventBus.emit(Events.FOV_CHANGED, {fov: this.camera_.fov});
    }

    // Update camera position from spherical coordinates
    this.updateCameraPosition_();

    return isAnimating;
  }

  /**
   * Update camera position from current spherical coordinates.
   * @private
   */
  updateCameraPosition_() {
    const x = this.distance_ * Math.sin(this.phi_) * Math.cos(this.theta_);
    const y = this.distance_ * Math.cos(this.phi_);
    const z = this.distance_ * Math.sin(this.phi_) * Math.sin(this.theta_);

    this.camera_.position.set(x, y, z);
    this.camera_.lookAt(0, 0, 0);
  }

  /**
   * Handle mouse drag for camera rotation.
   * @param {number} deltaX - Horizontal drag delta in pixels
   * @param {number} deltaY - Vertical drag delta in pixels
   * @param {number} sensitivity - Rotation sensitivity multiplier
   */
  handleDrag(deltaX, deltaY, sensitivity = 0.005) {
    // Adjust sensitivity based on FOV (slower when zoomed in)
    const fovFactor = this.camera_.fov / CAMERA.DEFAULT_FOV;
    const adjustedSensitivity = sensitivity * fovFactor;

    this.targetTheta_ -= deltaX * adjustedSensitivity;
    this.targetPhi_ -= deltaY * adjustedSensitivity;

    // Clamp phi to avoid gimbal lock
    this.targetPhi_ = Math.max(0.1, Math.min(Math.PI - 0.1, this.targetPhi_));

    this.requestRender_();
  }

  /**
   * Handle zoom input.
   * @param {number} delta - Zoom delta (positive = zoom in)
   */
  handleZoom(delta) {
    if (this.isTelescopeModeActive_) return;

    const zoomSpeed = 0.1;
    const newFov = this.targetFov_ - delta * zoomSpeed;
    this.targetFov_ = Math.max(CAMERA.MIN_FOV, Math.min(CAMERA.MAX_FOV, newFov));
    this.requestRender_();
  }

  /**
   * Get current view direction as RA/Dec.
   * @returns {{ra: number, dec: number}} View direction in degrees
   */
  getViewDirection() {
    // Camera looks at origin, so view direction is -camera.position normalized
    const dir = this.camera_.position.clone().negate().normalize();

    // Convert to RA/Dec
    const dec = Math.asin(dir.y) * 180 / Math.PI;
    let ra = Math.atan2(-dir.z, dir.x) * 180 / Math.PI;
    if (ra < 0) ra += 360;

    return {ra, dec};
  }
}

/**
 * Singleton camera controller instance.
 * @type {?CameraController}
 */
export let cameraController = null;

/**
 * Initialize the camera controller singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!CameraController} Initialized controller
 */
export function initializeCameraController(dependencies) {
  cameraController = new CameraController(dependencies);
  return cameraController;
}
