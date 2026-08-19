/**
 * @fileoverview Local horizon and cardinal direction rendering.
 * Handles horizon line and N/S/E/W directional markers.
 */

import {CAMERA} from '../core/Constants.js';
import {createLogger} from '../core/Logger.js';
import {freezeTransform} from './SceneUtils.js';

const logger = createLogger('HorizonRenderer');

/**
 * Horizon configuration constants.
 * @const {!Object}
 */
const HORIZON_CONFIG = {
  RADIUS: 99,
  CARDINAL_RADIUS: 95,
  // Dim amber, matching --accent-warm-dim. Green (the previous value) is
  // among the worst colors for dark adaptation despite the old "night vision"
  // comment — long-wavelength red/amber is what preserves night vision.
  COLOR: 0x9a7a3a,
  COLOR_CSS: '#9a7a3a',  // Same color as CSS hex for canvas drawing
  OPACITY: 0.5,          // Reduced brightness
  SEGMENTS: 128,
  LABEL_SIZE: 10,
  REFERENCE_FOV: CAMERA.DEFAULT_FOV,
};

/**
 * Cardinal direction definitions.
 * @const {!Array<!Object>}
 */
const CARDINAL_DIRECTIONS = [
  {name: 'N', az: 0},
  {name: 'W', az: 90},
  {name: 'S', az: 180},
  {name: 'E', az: 270},
];

/**
 * HorizonRenderer manages the local horizon and cardinal markers.
 */
export class HorizonRenderer {
  /**
   * Creates a new HorizonRenderer instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {!THREE.Scene} dependencies.scene - Three.js scene
   * @param {!THREE.Camera} dependencies.camera - Camera for FOV-based scaling
   * @param {function(): void=} dependencies.requestRender - Request render callback
   */
  constructor(dependencies) {
    /** @private @const */
    this.scene_ = dependencies.scene;

    /** @private @const */
    this.camera_ = dependencies.camera;

    /** @private @const */
    this.requestRender_ = dependencies.requestRender || (() => {});

    /** @private {?THREE.Group} */
    this.horizonGroup_ = null;

    /** @private {!Array<!THREE.Sprite>} */
    this.cardinalLabels_ = [];

    /** @private {boolean} */
    this.horizonVisible_ = true;

    /** @private {boolean} */
    this.cardinalsVisible_ = true;
  }

  /**
   * Get the horizon group.
   * @returns {?THREE.Group} Horizon group
   */
  getHorizonGroup() {
    return this.horizonGroup_;
  }

  /**
   * Get cardinal labels.
   * @returns {!Array<!THREE.Sprite>} Cardinal label sprites
   */
  getCardinalLabels() {
    return this.cardinalLabels_;
  }

  /**
   * Create the local horizon line.
   */
  createHorizon() {
    this.cleanupHorizon_();

    const horizonGroup = new THREE.Group();
    const radius = HORIZON_CONFIG.RADIUS;
    const segments = HORIZON_CONFIG.SEGMENTS;

    // Create the main horizon circle (at Y=0 plane)
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      points.push(new THREE.Vector3(x, 0, z));
    }

    const horizonGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const horizonMaterial = new THREE.LineBasicMaterial({
      color: HORIZON_CONFIG.COLOR,
      transparent: true,
      opacity: HORIZON_CONFIG.OPACITY,
      linewidth: 2,
      depthTest: false,
      depthWrite: false,
    });
    const horizonCircle = new THREE.Line(horizonGeometry, horizonMaterial);
    horizonGroup.add(horizonCircle);

    this.horizonGroup_ = horizonGroup;
    freezeTransform(this.horizonGroup_);
    this.scene_.add(this.horizonGroup_);

    logger.info('Created local horizon line');
  }

  /**
   * Create cardinal direction labels (N/S/E/W).
   */
  createCardinalLabels() {
    this.cleanupCardinals_();

    const radius = HORIZON_CONFIG.CARDINAL_RADIUS;

    CARDINAL_DIRECTIONS.forEach((dir) => {
      const sprite = this.createCardinalSprite_(dir.name);

      // Position on local horizon (Y=0 plane)
      const azRad = THREE.MathUtils.degToRad(dir.az);
      const x = radius * Math.sin(azRad);
      const z = radius * Math.cos(azRad);
      sprite.position.set(x, 2, z);
      sprite.scale.set(HORIZON_CONFIG.LABEL_SIZE, HORIZON_CONFIG.LABEL_SIZE, 1);

      this.cardinalLabels_.push(sprite);
      this.scene_.add(sprite);
    });

    logger.info('Created cardinal direction labels');
  }

  /**
   * Create a cardinal direction sprite.
   * @param {string} label - Direction label (N/S/E/W)
   * @returns {!THREE.Sprite} Cardinal sprite
   * @private
   */
  createCardinalSprite_(label) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Draw cardinal text in the same dim amber as the horizon line.
    ctx.fillStyle = HORIZON_CONFIG.COLOR_CSS;
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    return new THREE.Sprite(material);
  }

  /**
   * Update cardinal label sizes based on camera FOV.
   */
  updateCardinalLabelSizes() {
    if (!this.camera_) return;

    const scaleFactor = this.camera_.fov / HORIZON_CONFIG.REFERENCE_FOV;
    const baseSize = HORIZON_CONFIG.LABEL_SIZE;

    this.cardinalLabels_.forEach((label) => {
      label.scale.set(baseSize * scaleFactor, baseSize * scaleFactor, 1);
    });

    this.requestRender_();
  }

  /**
   * Set horizon visibility.
   * @param {boolean} visible - Whether the horizon should be visible
   */
  setHorizonVisible(visible) {
    this.horizonVisible_ = visible;
    if (this.horizonGroup_) {
      this.horizonGroup_.visible = visible;
      this.requestRender_();
    }
  }

  /**
   * Set cardinal labels visibility.
   * @param {boolean} visible - Whether the cardinals should be visible
   */
  setCardinalsVisible(visible) {
    this.cardinalsVisible_ = visible;
    this.cardinalLabels_.forEach((label) => {
      label.visible = visible;
    });
    this.requestRender_();
  }

  /**
   * Check if horizon is visible.
   * @returns {boolean} Horizon visibility
   */
  isHorizonVisible() {
    return this.horizonVisible_;
  }

  /**
   * Check if cardinals are visible.
   * @returns {boolean} Cardinals visibility
   */
  isCardinalsVisible() {
    return this.cardinalsVisible_;
  }

  /**
   * Cleanup horizon elements.
   * @private
   */
  cleanupHorizon_() {
    if (this.horizonGroup_) {
      this.horizonGroup_.children.forEach((child) => {
        child.geometry?.dispose();
        child.material?.dispose();
      });
      this.scene_.remove(this.horizonGroup_);
      this.horizonGroup_ = null;
    }
  }

  /**
   * Cleanup cardinal labels.
   * @private
   */
  cleanupCardinals_() {
    this.cardinalLabels_.forEach((label) => {
      label.material?.map?.dispose();
      label.material?.dispose();
      this.scene_.remove(label);
    });
    this.cardinalLabels_ = [];
  }

  /**
   * Dispose of all resources.
   */
  dispose() {
    this.cleanupHorizon_();
    this.cleanupCardinals_();
  }
}
