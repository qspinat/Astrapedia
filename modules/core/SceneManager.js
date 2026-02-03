/**
 * @fileoverview Three.js scene management for the sky map.
 * Handles scene setup, camera control, and rendering.
 */

import {globalEventBus, Events} from './EventBus.js';
import {CAMERA} from './Constants.js';

/**
 * SceneManager handles Three.js setup and rendering.
 */
export class SceneManager {
  /**
   * Creates a new SceneManager instance.
   * @param {!Element} container - DOM element to render into
   */
  constructor(container) {
    /** @private @const {!Element} */
    this.container_ = container;

    /** @private {?THREE.Scene} */
    this.scene_ = null;

    /** @private {?THREE.PerspectiveCamera} */
    this.camera_ = null;

    /** @private {?THREE.WebGLRenderer} */
    this.renderer_ = null;

    /** @private {?THREE.Group} */
    this.celestialSphere_ = null;

    /** @private {?THREE.Group} */
    this.latitudeTiltGroup_ = null;

    // Camera control state
    /** @private {number} */
    this.cameraTheta_ = CAMERA.DEFAULT_THETA;

    /** @private {number} */
    this.cameraPhi_ = CAMERA.DEFAULT_PHI;

    /** @private {number} */
    this.cameraDistance_ = CAMERA.INITIAL_DISTANCE;

    // Smooth animation targets
    /** @private {?number} */
    this.targetFov_ = null;

    /** @private {?number} */
    this.targetTheta_ = null;

    /** @private {?number} */
    this.targetPhi_ = null;

    /** @private @const {number} */
    this.zoomLerpSpeed_ = CAMERA.ZOOM_LERP_SPEED;

    // Reusable objects for performance
    /** @private {?THREE.Vector3} */
    this.tempVec3_ = null;

    /** @private {?THREE.Vector3} */
    this.tempVec3B_ = null;

    /** @private {?THREE.Matrix4} */
    this.tempMatrix4_ = null;

    /** @private {?THREE.Matrix3} */
    this.tempMatrix3_ = null;

    // Render state
    /** @private {boolean} */
    this.needsRender_ = true;

    /** @private {boolean} */
    this.isAnimating_ = false;

    /** @private {number} */
    this.frameCount_ = 0;
  }

  /**
   * Initialize the scene and renderer.
   */
  initialize() {
    this.setupScene_();
    this.setupCamera_();
    this.setupRenderer_();
    this.setupLights_();
    this.createCelestialSphere_();
    this.initTempObjects_();

    // Handle window resize
    window.addEventListener('resize', () => this.handleResize_());
  }

  /**
   * Setup the Three.js scene.
   * @private
   */
  setupScene_() {
    this.scene_ = new THREE.Scene();
    this.scene_.background = new THREE.Color(0x000000);
  }

  /**
   * Setup the camera.
   * @private
   */
  setupCamera_() {
    // Calculate initial FOV based on camera distance
    const normalizedDistance = Math.log(this.cameraDistance_ / CAMERA.MIN_DISTANCE) /
                               Math.log(CAMERA.MAX_DISTANCE / CAMERA.MIN_DISTANCE);
    const initialFov = CAMERA.MIN_FOV + normalizedDistance *
                       (CAMERA.MAX_FOV - CAMERA.MIN_FOV);

    this.camera_ = new THREE.PerspectiveCamera(
      initialFov,
      window.innerWidth / window.innerHeight,
      CAMERA.NEAR_PLANE,
      CAMERA.FAR_PLANE
    );

    // Initialize smooth zoom targets
    this.targetFov_ = initialFov;
    this.targetTheta_ = this.cameraTheta_;
    this.targetPhi_ = this.cameraPhi_;

    this.updateCameraPosition_();
  }

  /**
   * Setup the WebGL renderer.
   * @private
   */
  setupRenderer_() {
    this.renderer_ = new THREE.WebGLRenderer({antialias: true});
    this.renderer_.setSize(window.innerWidth, window.innerHeight);
    this.renderer_.setPixelRatio(window.devicePixelRatio);
    this.container_.appendChild(this.renderer_.domElement);
  }

  /**
   * Setup scene lighting.
   * @private
   */
  setupLights_() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene_.add(ambientLight);
  }

  /**
   * Create the celestial sphere container with rotation groups.
   * @private
   */
  createCelestialSphere_() {
    // Outer group: tilts based on latitude
    this.latitudeTiltGroup_ = new THREE.Group();
    this.scene_.add(this.latitudeTiltGroup_);

    // Inner group: rotates for Earth's rotation
    this.celestialSphere_ = new THREE.Group();
    this.latitudeTiltGroup_.add(this.celestialSphere_);
  }

  /**
   * Initialize reusable Three.js objects for performance.
   * @private
   */
  initTempObjects_() {
    this.tempVec3_ = new THREE.Vector3();
    this.tempVec3B_ = new THREE.Vector3();
    this.tempMatrix4_ = new THREE.Matrix4();
    this.tempMatrix3_ = new THREE.Matrix3();
  }

  /**
   * Handle window resize.
   * @private
   */
  handleResize_() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera_.aspect = width / height;
    this.camera_.updateProjectionMatrix();
    this.renderer_.setSize(width, height);
    this.requestRender();
  }

  /**
   * Update camera position from spherical coordinates.
   * @private
   */
  updateCameraPosition_() {
    const x = this.cameraDistance_ * Math.sin(this.cameraPhi_) *
              Math.cos(this.cameraTheta_);
    const y = this.cameraDistance_ * Math.cos(this.cameraPhi_);
    const z = this.cameraDistance_ * Math.sin(this.cameraPhi_) *
              Math.sin(this.cameraTheta_);

    this.camera_.position.set(x, y, z);
    this.camera_.lookAt(0, 0, 0);
  }

  /**
   * Set camera rotation angles.
   * @param {number} theta - Horizontal rotation (azimuth)
   * @param {number} phi - Vertical rotation (altitude)
   * @param {boolean=} smooth - Whether to animate smoothly
   */
  setCameraRotation(theta, phi, smooth = true) {
    // Clamp phi to prevent flipping
    const clampedPhi = Math.max(0.01, Math.min(Math.PI - 0.01, phi));

    if (smooth) {
      this.targetTheta_ = theta;
      this.targetPhi_ = clampedPhi;
    } else {
      this.cameraTheta_ = theta;
      this.cameraPhi_ = clampedPhi;
      this.targetTheta_ = theta;
      this.targetPhi_ = clampedPhi;
      this.updateCameraPosition_();
    }

    this.requestRender();
  }

  /**
   * Rotate camera by delta amounts.
   * @param {number} deltaTheta - Horizontal rotation delta
   * @param {number} deltaPhi - Vertical rotation delta
   */
  rotateCamera(deltaTheta, deltaPhi) {
    this.cameraTheta_ += deltaTheta;
    this.cameraPhi_ = Math.max(0.01, Math.min(Math.PI - 0.01,
      this.cameraPhi_ + deltaPhi));

    this.targetTheta_ = this.cameraTheta_;
    this.targetPhi_ = this.cameraPhi_;

    this.updateCameraPosition_();
    this.requestRender();

    globalEventBus.emit(Events.CAMERA_MOVE, {
      theta: this.cameraTheta_,
      phi: this.cameraPhi_,
    });
  }

  /**
   * Set camera field of view.
   * @param {number} fov - Field of view in degrees
   * @param {boolean=} smooth - Whether to animate smoothly
   */
  setFOV(fov, smooth = true) {
    const clampedFov = Math.max(CAMERA.MIN_FOV, Math.min(CAMERA.MAX_FOV, fov));

    if (smooth) {
      this.targetFov_ = clampedFov;
    } else {
      this.camera_.fov = clampedFov;
      this.targetFov_ = clampedFov;
      this.camera_.updateProjectionMatrix();
    }

    this.requestRender();

    globalEventBus.emit(Events.FOV_CHANGED, {fov: clampedFov});
  }

  /**
   * Zoom camera by a factor.
   * @param {number} factor - Zoom factor (>1 = zoom in, <1 = zoom out)
   */
  zoom(factor) {
    const newFov = this.camera_.fov / factor;
    this.setFOV(newFov);
  }

  /**
   * Reset camera to default position.
   */
  resetCamera() {
    this.cameraTheta_ = CAMERA.DEFAULT_THETA;
    this.cameraPhi_ = CAMERA.DEFAULT_PHI;
    this.targetTheta_ = CAMERA.DEFAULT_THETA;
    this.targetPhi_ = CAMERA.DEFAULT_PHI;
    this.setFOV(CAMERA.DEFAULT_FOV, false);
    this.updateCameraPosition_();
    this.requestRender();
  }

  /**
   * Set latitude tilt angle for celestial sphere.
   * @param {number} latitude - Observer latitude in degrees
   */
  setLatitudeTilt(latitude) {
    const tiltAngle = (90 - latitude) * Math.PI / 180;
    this.latitudeTiltGroup_.rotation.x = tiltAngle;
    this.requestRender();
  }

  /**
   * Set celestial sphere rotation (LST-based).
   * @param {number} rotation - Rotation angle in radians
   */
  setCelestialRotation(rotation) {
    this.celestialSphere_.rotation.y = rotation;
    this.requestRender();
  }

  /**
   * Update smooth animations (call in animation loop).
   * @returns {boolean} True if animations are still in progress
   */
  updateAnimations() {
    let animating = false;

    // Smooth FOV interpolation
    if (this.targetFov_ !== null) {
      const fovDiff = this.targetFov_ - this.camera_.fov;
      if (Math.abs(fovDiff) > 0.01) {
        this.camera_.fov += fovDiff * this.zoomLerpSpeed_;
        this.camera_.updateProjectionMatrix();
        animating = true;
      }
    }

    // Smooth rotation interpolation
    if (this.targetTheta_ !== null && this.targetPhi_ !== null) {
      const thetaDiff = this.targetTheta_ - this.cameraTheta_;
      const phiDiff = this.targetPhi_ - this.cameraPhi_;

      if (Math.abs(thetaDiff) > 0.0001 || Math.abs(phiDiff) > 0.0001) {
        this.cameraTheta_ += thetaDiff * this.zoomLerpSpeed_;
        this.cameraPhi_ += phiDiff * this.zoomLerpSpeed_;
        this.updateCameraPosition_();
        animating = true;
      }
    }

    return animating;
  }

  /**
   * Render the scene.
   */
  render() {
    this.renderer_.render(this.scene_, this.camera_);
    this.needsRender_ = false;
    this.frameCount_++;
  }

  /**
   * Request a render on next frame.
   */
  requestRender() {
    this.needsRender_ = true;
  }

  /**
   * Check if render is needed.
   * @returns {boolean} True if render is needed
   */
  needsRender() {
    return this.needsRender_;
  }

  /**
   * Add an object to the celestial sphere.
   * @param {!THREE.Object3D} object - Object to add
   */
  addToCelestialSphere(object) {
    this.celestialSphere_.add(object);
    this.requestRender();
  }

  /**
   * Remove an object from the celestial sphere.
   * @param {!THREE.Object3D} object - Object to remove
   */
  removeFromCelestialSphere(object) {
    this.celestialSphere_.remove(object);
    this.requestRender();
  }

  /**
   * Add an object to the scene.
   * @param {!THREE.Object3D} object - Object to add
   */
  addToScene(object) {
    this.scene_.add(object);
    this.requestRender();
  }

  /**
   * Remove an object from the scene.
   * @param {!THREE.Object3D} object - Object to remove
   */
  removeFromScene(object) {
    this.scene_.remove(object);
    this.requestRender();
  }

  /**
   * Get the Three.js scene.
   * @returns {!THREE.Scene} The scene
   */
  getScene() {
    return this.scene_;
  }

  /**
   * Get the camera.
   * @returns {!THREE.PerspectiveCamera} The camera
   */
  getCamera() {
    return this.camera_;
  }

  /**
   * Get the renderer.
   * @returns {!THREE.WebGLRenderer} The renderer
   */
  getRenderer() {
    return this.renderer_;
  }

  /**
   * Get the celestial sphere group.
   * @returns {!THREE.Group} The celestial sphere group
   */
  getCelestialSphere() {
    return this.celestialSphere_;
  }

  /**
   * Get the latitude tilt group.
   * @returns {!THREE.Group} The latitude tilt group
   */
  getLatitudeTiltGroup() {
    return this.latitudeTiltGroup_;
  }

  /**
   * Get current FOV.
   * @returns {number} Current FOV in degrees
   */
  getFOV() {
    return this.camera_.fov;
  }

  /**
   * Get current camera rotation.
   * @returns {{theta: number, phi: number}} Camera rotation angles
   */
  getCameraRotation() {
    return {
      theta: this.cameraTheta_,
      phi: this.cameraPhi_,
    };
  }

  /**
   * Get camera distance.
   * @returns {number} Camera distance from origin
   */
  getCameraDistance() {
    return this.cameraDistance_;
  }

  /**
   * Get view direction in world coordinates.
   * @returns {!THREE.Vector3} View direction vector
   */
  getViewDirection() {
    const dir = this.tempVec3_ || new THREE.Vector3();
    return this.camera_.getWorldDirection(dir);
  }

  /**
   * Get view direction in celestial coordinates.
   * @returns {{ra: number, dec: number}} View center RA/Dec
   */
  getViewDirectionCelestial() {
    const viewDirWorld = new THREE.Vector3(0, 0, 0)
      .sub(this.camera_.position)
      .normalize();

    const viewDirCelestial = viewDirWorld.clone();

    if (this.celestialSphere_) {
      this.celestialSphere_.updateMatrixWorld();
      const worldMatrix = this.tempMatrix4_.copy(this.celestialSphere_.matrixWorld);
      const inverseMatrix = worldMatrix.invert();
      const rotationMatrix = this.tempMatrix3_.setFromMatrix4(inverseMatrix);
      viewDirCelestial.applyMatrix3(rotationMatrix);
    }

    // Convert to RA/Dec
    const radius = Math.sqrt(
      viewDirCelestial.x ** 2 +
      viewDirCelestial.y ** 2 +
      viewDirCelestial.z ** 2
    );
    const dec = Math.asin(viewDirCelestial.y / radius) * 180 / Math.PI;
    const ra = Math.atan2(-viewDirCelestial.z, viewDirCelestial.x) * 180 / Math.PI;

    return {
      ra: ra < 0 ? ra + 360 : ra,
      dec,
    };
  }

  /**
   * Get canvas dimensions.
   * @returns {{width: number, height: number}} Canvas size
   */
  getCanvasSize() {
    return {
      width: this.renderer_.domElement.width,
      height: this.renderer_.domElement.height,
    };
  }

  /**
   * Get pixels per degree at current FOV.
   * @returns {number} Pixels per degree
   */
  getPixelsPerDegree() {
    return this.renderer_.domElement.height / this.camera_.fov;
  }

  /**
   * Get reusable Vector3.
   * @returns {!THREE.Vector3} Reusable vector
   */
  getTempVec3() {
    return this.tempVec3_;
  }

  /**
   * Get second reusable Vector3.
   * @returns {!THREE.Vector3} Reusable vector
   */
  getTempVec3B() {
    return this.tempVec3B_;
  }

  /**
   * Get frame count.
   * @returns {number} Total frames rendered
   */
  getFrameCount() {
    return this.frameCount_;
  }

  /**
   * Dispose of all Three.js resources.
   */
  dispose() {
    this.renderer_.dispose();
    this.scene_.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((m) => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }
}
