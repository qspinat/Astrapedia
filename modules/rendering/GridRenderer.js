/**
 * @fileoverview RA/Dec coordinate grid and equator line rendering.
 * Handles celestial coordinate grid visualization.
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

    /** @private {?THREE.Group} */
    this.gridLines_ = null;

    /** @private {?THREE.Line} */
    this.equatorLine_ = null;

    /** @private {boolean} */
    this.gridVisible_ = false;

    /** @private {boolean} */
    this.equatorVisible_ = false;

    /** @private {number} */
    this.currentRaInterval_ = 15;

    /** @private {number} */
    this.currentDecInterval_ = 15;
  }

  /**
   * Get the grid lines group.
   * @returns {?THREE.Group} Grid lines group
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
   */
  create() {
    this.cleanup_();

    const gridGroup = new THREE.Group();
    const radius = GRID_CONFIG.RADIUS;
    const raInterval = this.currentRaInterval_;
    const decInterval = this.currentDecInterval_;

    // Point step size for smooth lines (smaller for finer grids)
    const pointStep = Math.min(raInterval, decInterval, 5);

    // RA lines (meridians)
    for (let ra = 0; ra < 360; ra += raInterval) {
      const points = [];
      for (let dec = -90; dec <= 90; dec += pointStep) {
        const pos = raDecToCartesian(ra, dec, radius);
        points.push(pos);
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: GRID_CONFIG.COLOR,
        transparent: true,
        opacity: GRID_CONFIG.OPACITY,
        depthTest: false,
        depthWrite: false,
      });
      const line = new THREE.Line(geometry, material);
      gridGroup.add(line);
    }

    // Dec lines (parallels)
    const minDec = -90 + decInterval;
    const maxDec = 90 - decInterval;
    for (let dec = minDec; dec <= maxDec; dec += decInterval) {
      const points = [];
      for (let ra = 0; ra <= 360; ra += pointStep) {
        const pos = raDecToCartesian(ra, dec, radius);
        points.push(pos);
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: GRID_CONFIG.COLOR,
        transparent: true,
        opacity: GRID_CONFIG.OPACITY,
        depthTest: false,
        depthWrite: false,
      });
      const line = new THREE.Line(geometry, material);
      gridGroup.add(line);
    }

    this.gridLines_ = gridGroup;
    this.gridLines_.visible = this.gridVisible_;
    this.celestialSphere_.add(this.gridLines_);

    // Create equator line (dec = 0)
    this.createEquatorLine_();

    console.log('GridRenderer: Created RA/Dec grid');
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

    const equatorGeometry = new THREE.BufferGeometry().setFromPoints(equatorPoints);
    const equatorMaterial = new THREE.LineBasicMaterial({
      color: GRID_CONFIG.EQUATOR_COLOR,
      transparent: true,
      opacity: GRID_CONFIG.EQUATOR_OPACITY,
      linewidth: 2,
      depthTest: false,
      depthWrite: false,
    });

    this.equatorLine_ = new THREE.Line(equatorGeometry, equatorMaterial);
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

        // Recreate grid with new intervals
        const gridGroup = new THREE.Group();
        const radius = GRID_CONFIG.RADIUS;
        const pointStep = Math.min(newRaInterval, newDecInterval, 5);

        // RA lines (meridians)
        for (let ra = 0; ra < 360; ra += newRaInterval) {
          const points = [];
          for (let dec = -90; dec <= 90; dec += pointStep) {
            const pos = raDecToCartesian(ra, dec, radius);
            points.push(pos);
          }
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const material = new THREE.LineBasicMaterial({
            color: GRID_CONFIG.COLOR,
            transparent: true,
            opacity: GRID_CONFIG.OPACITY,
            depthWrite: false,
          });
          const line = new THREE.Line(geometry, material);
          gridGroup.add(line);
        }

        // Dec lines (parallels)
        const minDec = -90 + newDecInterval;
        const maxDec = 90 - newDecInterval;
        for (let dec = minDec; dec <= maxDec; dec += newDecInterval) {
          const points = [];
          for (let ra = 0; ra <= 360; ra += pointStep) {
            const pos = raDecToCartesian(ra, dec, radius);
            points.push(pos);
          }
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const material = new THREE.LineBasicMaterial({
            color: GRID_CONFIG.COLOR,
            transparent: true,
            opacity: GRID_CONFIG.OPACITY,
            depthWrite: false,
          });
          const line = new THREE.Line(geometry, material);
          gridGroup.add(line);
        }

        this.gridLines_ = gridGroup;
        this.gridLines_.visible = wasVisible;
        this.celestialSphere_.add(this.gridLines_);
        this.requestRender_();
      }
    }
  }

  /**
   * Cleanup grid lines only (preserves equator).
   * @private
   */
  cleanupGrid_() {
    if (this.gridLines_) {
      this.celestialSphere_.remove(this.gridLines_);
      this.gridLines_ = null;
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
  }

  /**
   * Dispose of all resources.
   */
  dispose() {
    this.cleanup_();
  }
}
