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
  RA_INTERVAL: 15,
  DEC_INTERVAL: 15,
  COLOR: 0x1A2535,
  OPACITY: 0.2,
  EQUATOR_COLOR: 0xCC5530,
  EQUATOR_OPACITY: 0.5,
};

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
    this.gridVisible_ = true;

    /** @private {boolean} */
    this.equatorVisible_ = false;
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

    // RA lines (meridians) - every 15 degrees (1 hour)
    for (let ra = 0; ra < 360; ra += GRID_CONFIG.RA_INTERVAL) {
      const points = [];
      for (let dec = -90; dec <= 90; dec += 5) {
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
    for (let dec = -75; dec <= 75; dec += GRID_CONFIG.DEC_INTERVAL) {
      const points = [];
      for (let ra = 0; ra <= 360; ra += 3) {
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
    const radius = GRID_CONFIG.RADIUS + 0.5;
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
   * Cleanup existing grid elements.
   * @private
   */
  cleanup_() {
    if (this.gridLines_) {
      this.celestialSphere_.remove(this.gridLines_);
      this.gridLines_ = null;
    }
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
