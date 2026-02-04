/**
 * @fileoverview RA/Dec coordinate grid and equator line rendering.
 * Handles celestial coordinate grid visualization.
 * Optimized to use shared materials and LineSegments for performance.
 */

import {raDecToCartesian} from '../core/CoordinateUtils.js';

/**
 * Grid configuration constants.
 * @const {!Object}
 */
const GRID_CONFIG = {
  RADIUS: 99,
  COLOR: 0x2a4a6a,
  OPACITY: 0.25,
  EQUATOR_COLOR: 0xCC5530,
  EQUATOR_OPACITY: 0.5,
};

/**
 * Grid density levels based on FOV.
 * Each level defines FOV threshold and grid spacing.
 * @const {!Array<!Object>}
 */
const GRID_LEVELS = [
  {maxFov: 0.5, raInterval: 1/60, decInterval: 1/60},      // 1 arcmin
  {maxFov: 1, raInterval: 5/60, decInterval: 5/60},        // 5 arcmin
  {maxFov: 2, raInterval: 10/60, decInterval: 10/60},      // 10 arcmin
  {maxFov: 5, raInterval: 0.5, decInterval: 0.5},          // 30 arcmin
  {maxFov: 15, raInterval: 1, decInterval: 1},             // 1 degree
  {maxFov: 30, raInterval: 5, decInterval: 5},             // 5 degrees
  {maxFov: Infinity, raInterval: 15, decInterval: 15},     // 15 degrees
];

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
    console.log('GridRenderer: Created RA/Dec grid');
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

    // Limit maximum number of lines to prevent performance issues.
    // Even at fine zoom levels, 360 lines (1° spacing) provides excellent precision.
    const maxLines = 360;
    const requestedRaLines = Math.ceil(360 / raInterval);
    const requestedDecLines = Math.ceil(180 / decInterval);

    if (requestedRaLines > maxLines) {
      raInterval = 360 / maxLines;
    }
    if (requestedDecLines > maxLines / 2) {
      decInterval = 180 / (maxLines / 2);
    }

    const numRaLines = Math.ceil(360 / raInterval);
    const numDecLines = Math.ceil(180 / decInterval);

    // Point step for line smoothness. Use smaller steps for smoother curves,
    // but scale with grid interval to avoid excessive vertices.
    // Target ~50 segments per line for smooth appearance.
    const pointStep = Math.min(Math.max(raInterval, decInterval, 0.5), 5);

    // Collect all line segments as pairs of vertices
    const vertices = [];

    // RA lines (meridians) - each line segment connects adjacent points
    for (let ra = 0; ra < 360; ra += raInterval) {
      let prevPos = null;
      for (let dec = -90; dec <= 90; dec += pointStep) {
        const pos = raDecToCartesian(ra, dec, radius);
        if (prevPos) {
          // Add segment from previous point to current point
          vertices.push(prevPos.x, prevPos.y, prevPos.z);
          vertices.push(pos.x, pos.y, pos.z);
        }
        prevPos = pos;
      }
    }

    // Dec lines (parallels) - each line segment connects adjacent points
    const minDec = -90 + decInterval;
    const maxDec = 90 - decInterval;
    for (let dec = minDec; dec <= maxDec; dec += decInterval) {
      let prevPos = null;
      for (let ra = 0; ra <= 360; ra += pointStep) {
        const pos = raDecToCartesian(ra, dec, radius);
        if (prevPos) {
          // Add segment from previous point to current point
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
   * @param {number} fov - Current camera field of view in degrees
   */
  updateForFov(fov) {
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
