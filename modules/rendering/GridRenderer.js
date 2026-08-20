/**
 * @fileoverview RA/Dec coordinate grid and equator line rendering.
 * Handles celestial coordinate grid visualization.
 * Optimized to use shared materials and LineSegments for performance.
 */

import {raDecToCartesian} from '../core/CoordinateUtils.js';
import {createLogger} from '../core/Logger.js';
import {freezeTransform} from './SceneUtils.js';

const logger = createLogger('GridRenderer');

/**
 * Grid configuration constants.
 * @const {!Object}
 */
const GRID_CONFIG = {
  RADIUS: 99,
  // Dim warm grey. The previous value (0x2a4a6a) was blue, which — like green —
  // disrupts dark adaptation; a warm low-luminance tone keeps the grid
  // readable without hurting night vision. The equator stays warm orange.
  COLOR: 0x5a4a3a,
  OPACITY: 0.25,
  EQUATOR_COLOR: 0xCC5530,
  EQUATOR_OPACITY: 0.5,
};

/**
 * Grid density levels based on camera FOV.
 *
 * The grid adapts to zoom level to maintain visual clarity:
 * - At wide FOV (zoomed out): sparse grid to avoid visual clutter
 * - At narrow FOV (zoomed in): dense grid for precise coordinate reading
 *
 * Rationale for intervals:
 * - Grid lines should be ~3-10% of visible FOV for readability
 * - Smaller intervals at high zoom enable precise positioning
 * - Larger intervals at low zoom prevent overwhelming the star field
 *
 * @const {!Array<!Object>}
 */
const GRID_LEVELS = [
  {maxFov: 0.5, raInterval: 1/60, decInterval: 1/60},      // 1 arcmin - telescope view
  {maxFov: 1, raInterval: 5/60, decInterval: 5/60},        // 5 arcmin - high magnification
  {maxFov: 2, raInterval: 10/60, decInterval: 10/60},      // 10 arcmin - medium-high zoom
  {maxFov: 5, raInterval: 0.5, decInterval: 0.5},          // 30 arcmin - medium zoom
  {maxFov: 15, raInterval: 1, decInterval: 1},             // 1 degree - low zoom
  {maxFov: 30, raInterval: 5, decInterval: 5},             // 5 degrees - wide view
  {maxFov: Infinity, raInterval: 15, decInterval: 15},     // 15 degrees - full sky
];

/**
 * Minimum time between grid rebuilds in milliseconds.
 * Prevents excessive geometry creation during smooth zoom.
 * @const {number}
 */
const FOV_UPDATE_THROTTLE_MS = 100;

/**
 * GridRenderer manages the RA/Dec coordinate grid visualization.
 * Uses shared materials and combined geometry for optimal performance.
 */
export class GridRenderer {
  /**
   * Creates a new GridRenderer instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {!THREE.Group} dependencies.celestialSphere - Celestial sphere group
   * @param {function(): void=} dependencies.requestRender - Request render callback
   */
  constructor(dependencies) {
    /** @private @const */
    this.celestialSphere_ = dependencies.celestialSphere;

    /** @private @const */
    this.requestRender_ = dependencies.requestRender || (() => {});

    /** @private {?THREE.LineSegments} */
    this.gridLines_ = null;

    /** @private {?THREE.BufferGeometry} */
    this.gridGeometry_ = null;

    /** @private {?THREE.Line} */
    this.equatorLine_ = null;

    /** @private {?THREE.BufferGeometry} */
    this.equatorGeometry_ = null;

    /** @private {boolean} */
    this.gridVisible_ = false;

    /** @private {boolean} */
    this.equatorVisible_ = false;

    /** @private {number} */
    this.currentRaInterval_ = 15;

    /** @private {number} */
    this.currentDecInterval_ = 15;

    /** @private {number} Last FOV update timestamp for throttling */
    this.lastFovUpdateTime_ = 0;

    // Shared materials - created once and reused
    /** @private {?THREE.LineBasicMaterial} */
    this.gridMaterial_ = null;

    /** @private {?THREE.LineBasicMaterial} */
    this.equatorMaterial_ = null;

    this.createMaterials_();
  }

  /**
   * Create shared materials for grid and equator lines.
   * @private
   */
  createMaterials_() {
    this.gridMaterial_ = new THREE.LineBasicMaterial({
      color: GRID_CONFIG.COLOR,
      transparent: true,
      opacity: GRID_CONFIG.OPACITY,
      depthTest: false,
      depthWrite: false,
    });

    this.equatorMaterial_ = new THREE.LineBasicMaterial({
      color: GRID_CONFIG.EQUATOR_COLOR,
      transparent: true,
      opacity: GRID_CONFIG.EQUATOR_OPACITY,
      depthTest: false,
      depthWrite: false,
    });
  }

  /**
   * Get the grid lines object.
   * @returns {?THREE.LineSegments} Grid lines object
   */
  getGridLines() {
    return this.gridLines_;
  }

  /**
   * Get the equator line.
   * @returns {?THREE.Line} Equator line
   */
  getEquatorLine() {
    return this.equatorLine_;
  }

  /**
   * Create the coordinate grid visualization.
   * Uses a single LineSegments object for optimal performance.
   */
  create() {
    this.cleanup_();
    this.createGridGeometry_();
    this.createEquatorLine_();
    logger.info('Created RA/Dec grid');
  }

  /**
   * Build grid geometry using LineSegments for efficiency.
   * All lines are combined into a single geometry.
   * @private
   */
  createGridGeometry_() {
    const radius = GRID_CONFIG.RADIUS;
    let raInterval = this.currentRaInterval_;
    let decInterval = this.currentDecInterval_;

    // Limit maximum number of lines to prevent performance issues
    const maxLines = 360;
    if (Math.ceil(360 / raInterval) > maxLines) {
      raInterval = 360 / maxLines;
    }
    if (Math.ceil(180 / decInterval) > maxLines / 2) {
      decInterval = 180 / (maxLines / 2);
    }

    // Point step for line smoothness (~50 segments per line)
    const pointStep = Math.min(Math.max(raInterval, decInterval, 0.5), 5);

    // Collect all line segments as pairs of vertices
    const vertices = [];

    // RA lines (meridians)
    for (let ra = 0; ra < 360; ra += raInterval) {
      let prevPos = null;
      for (let dec = -90; dec <= 90; dec += pointStep) {
        const pos = raDecToCartesian(ra, dec, radius);
        if (prevPos) {
          vertices.push(prevPos.x, prevPos.y, prevPos.z);
          vertices.push(pos.x, pos.y, pos.z);
        }
        prevPos = pos;
      }
    }

    // Dec lines (parallels)
    for (let dec = -90 + decInterval; dec <= 90 - decInterval; dec += decInterval) {
      let prevPos = null;
      for (let ra = 0; ra <= 360; ra += pointStep) {
        const pos = raDecToCartesian(ra, dec, radius);
        if (prevPos) {
          vertices.push(prevPos.x, prevPos.y, prevPos.z);
          vertices.push(pos.x, pos.y, pos.z);
        }
        prevPos = pos;
      }
    }

    // Create single geometry with all segments
    this.gridGeometry_ = new THREE.BufferGeometry();
    this.gridGeometry_.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3)
    );

    // Use LineSegments - much more efficient than many Line objects
    this.gridLines_ = new THREE.LineSegments(this.gridGeometry_, this.gridMaterial_);
    this.gridLines_.visible = this.gridVisible_;
    freezeTransform(this.gridLines_);
    this.celestialSphere_.add(this.gridLines_);
  }

  /**
   * Create the celestial equator line.
   * @private
   */
  createEquatorLine_() {
    const radius = GRID_CONFIG.RADIUS;
    const equatorPoints = [];

    for (let ra = 0; ra <= 360; ra += 2) {
      const pos = raDecToCartesian(ra, 0, radius);
      equatorPoints.push(pos);
    }

    this.equatorGeometry_ = new THREE.BufferGeometry().setFromPoints(equatorPoints);
    this.equatorLine_ = new THREE.Line(this.equatorGeometry_, this.equatorMaterial_);
    this.equatorLine_.visible = this.equatorVisible_;
    freezeTransform(this.equatorLine_);
    this.celestialSphere_.add(this.equatorLine_);
  }

  /**
   * Set the visibility of the grid lines.
   * @param {boolean} visible - Whether the grid should be visible
   */
  setGridVisible(visible) {
    this.gridVisible_ = visible;
    if (this.gridLines_) {
      this.gridLines_.visible = visible;
      this.requestRender_();
    }
  }

  /**
   * Set the visibility of the equator line.
   * @param {boolean} visible - Whether the equator line should be visible
   */
  setEquatorVisible(visible) {
    this.equatorVisible_ = visible;
    if (this.equatorLine_) {
      this.equatorLine_.visible = visible;
      this.requestRender_();
    }
  }

  /**
   * Check if grid is visible.
   * @returns {boolean} Grid visibility
   */
  isGridVisible() {
    return this.gridVisible_;
  }

  /**
   * Check if equator is visible.
   * @returns {boolean} Equator visibility
   */
  isEquatorVisible() {
    return this.equatorVisible_;
  }

  /**
   * Update grid density based on camera FOV.
   * Recreates grid if density level changes.
   * Throttled to prevent excessive geometry rebuilds during smooth zoom.
   * @param {number} fov - Current camera field of view in degrees
   */
  updateForFov(fov) {
    // Throttle updates to prevent excessive geometry creation during zoom
    const now = Date.now();
    if (now - this.lastFovUpdateTime_ < FOV_UPDATE_THROTTLE_MS) {
      return;
    }

    // Find appropriate grid level for current FOV
    let newRaInterval = 15;
    let newDecInterval = 15;

    for (const level of GRID_LEVELS) {
      if (fov <= level.maxFov) {
        newRaInterval = level.raInterval;
        newDecInterval = level.decInterval;
        break;
      }
    }

    // Only recreate if intervals changed
    if (newRaInterval !== this.currentRaInterval_ ||
        newDecInterval !== this.currentDecInterval_) {
      this.lastFovUpdateTime_ = now;
      this.currentRaInterval_ = newRaInterval;
      this.currentDecInterval_ = newDecInterval;

      // Only recreate if grid exists
      if (this.gridLines_) {
        const wasVisible = this.gridVisible_;
        this.cleanupGrid_();
        this.createGridGeometry_();
        this.gridLines_.visible = wasVisible;
        this.requestRender_();
      }
    }
  }

  /**
   * Cleanup grid lines only (preserves equator).
   * Properly disposes of geometry to prevent memory leaks.
   * @private
   */
  cleanupGrid_() {
    if (this.gridLines_) {
      this.celestialSphere_.remove(this.gridLines_);
      this.gridLines_ = null;
    }
    if (this.gridGeometry_) {
      this.gridGeometry_.dispose();
      this.gridGeometry_ = null;
    }
  }

  /**
   * Cleanup all grid elements including equator.
   * @private
   */
  cleanup_() {
    this.cleanupGrid_();
    if (this.equatorLine_) {
      this.celestialSphere_.remove(this.equatorLine_);
      this.equatorLine_ = null;
    }
    if (this.equatorGeometry_) {
      this.equatorGeometry_.dispose();
      this.equatorGeometry_ = null;
    }
  }

  /**
   * Dispose of all resources including materials.
   */
  dispose() {
    this.cleanup_();
    if (this.gridMaterial_) {
      this.gridMaterial_.dispose();
      this.gridMaterial_ = null;
    }
    if (this.equatorMaterial_) {
      this.equatorMaterial_.dispose();
      this.equatorMaterial_ = null;
    }
  }
}
