/**
 * @fileoverview Constellation line rendering and highlighting.
 * Handles creation and visual highlighting of constellation patterns.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {raDecToCartesian, cartesianToRaDec, angularDistance} from '../core/CoordinateUtils.js';
import {SPHERE, CONSTELLATIONS} from '../core/Constants.js';

/**
 * Default colors for constellation lines.
 * @const {!Object<string, number>}
 */
const COLORS = {
  LINE: 0x3366AA,
  HIGHLIGHT: 0x4A9EFF,
};

/**
 * ConstellationRenderer handles constellation line visualization.
 */
export class ConstellationRenderer {
  /**
   * Creates a new ConstellationRenderer instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {!THREE.Group} dependencies.celestialSphere - Celestial sphere group
   * @param {function(): !Array<!Object>} dependencies.getStars - Get stars array
   * @param {function(): !Object} dependencies.getConstellations - Get constellations data
   * @param {function(): void=} dependencies.requestRender - Request render callback
   */
  constructor(dependencies) {
    /** @private @const */
    this.celestialSphere_ = dependencies.celestialSphere;

    /** @private @const */
    this.getStars_ = dependencies.getStars;

    /** @private @const */
    this.getConstellations_ = dependencies.getConstellations;

    /** @private @const */
    this.requestRender_ = dependencies.requestRender || (() => {});

    /** @private {?THREE.Group} */
    this.linesGroup_ = null;

    /** @private {boolean} */
    this.visible_ = true;

    /** @private {!Array<!THREE.Line>} */
    this.glowLines_ = [];

    /** @private {!Array<!THREE.Material>} */
    this.lineMaterials_ = [];

    /** @private {boolean} - Whether we forced visibility for highlighting */
    this.forcedVisible_ = false;

    /** @private {?string} - Currently highlighted constellation name */
    this.highlightedConstellation_ = null;

    /** @private {number} */
    this.radius_ = SPHERE.CONSTELLATION_RADIUS;

    /** @private {string} - Current display mode */
    this.mode_ = CONSTELLATIONS.MODE_ALL;

    /** @private {!Map<string, {ra: number, dec: number}>} */
    this.constellationCenters_ = new Map();

    /** @private {!Map<string, number>} */
    this.constellationOpacities_ = new Map();
  }

  /**
   * Get the constellation lines group.
   * @returns {?THREE.Group} Lines group
   */
  getLinesGroup() {
    return this.linesGroup_;
  }

  /**
   * Get visibility state.
   * @returns {boolean} Whether lines are visible
   */
  isVisible() {
    return this.visible_;
  }

  /**
   * Set visibility of constellation lines.
   * @param {boolean} visible - Whether lines should be visible
   */
  setVisible(visible) {
    this.visible_ = visible;
    if (this.linesGroup_) {
      this.linesGroup_.visible = visible;
    }
    this.requestRender_();
  }

  /**
   * Set the current display mode.
   * @param {string} mode - One of CONSTELLATIONS.MODE_OFF/MODE_FOCUS/MODE_ALL
   */
  setMode(mode) {
    this.mode_ = mode;
  }

  /**
   * Create constellation lines from star data.
   */
  createLines() {
    // Remove old lines if they exist, disposing each line's geometry and its
    // cloned material (each line uses lineMaterial.clone()), not just the
    // tracked base materials below.
    if (this.linesGroup_) {
      this.linesGroup_.children.forEach((line) => {
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
      });
      this.celestialSphere_.remove(this.linesGroup_);
    }

    // Dispose old (base) line materials
    this.lineMaterials_.forEach((mat) => mat.dispose());
    this.lineMaterials_ = [];

    this.linesGroup_ = new THREE.Group();
    const stars = this.getStars_();
    const constellations = this.getConstellations_();

    let linesCreated = 0;

    Object.entries(constellations).forEach(([constName, constellation]) => {
      // Create a unique material for each line so we can highlight individually
      const lineMaterial = new THREE.LineBasicMaterial({
        color: COLORS.LINE,
        transparent: true,
        opacity: CONSTELLATIONS.LINE_OPACITY,
        linewidth: 1,
        depthWrite: false,
      });
      // Track material for disposal
      this.lineMaterials_.push(lineMaterial);

      constellation.lines.forEach(([hip1, hip2]) => {
        // Find stars by HIP number
        const star1 = stars.find((s) => s.hip === hip1);
        const star2 = stars.find((s) => s.hip === hip2);

        if (star1 && star2) {
          const points = [
            raDecToCartesian(star1.ra, star1.dec, this.radius_),
            raDecToCartesian(star2.ra, star2.dec, this.radius_),
          ];
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          // Required for raycaster to detect clicks on lines
          geometry.computeBoundingSphere();
          const line = new THREE.Line(geometry, lineMaterial.clone());
          // Store constellation name for highlighting
          line.userData = {constellation: constName};
          this.linesGroup_.add(line);
          linesCreated++;
        }
      });
    });

    this.linesGroup_.visible = this.visible_;
    this.celestialSphere_.add(this.linesGroup_);

    // Precompute constellation centers for focus mode
    this.computeConstellationCenters_(stars, constellations);

    globalEventBus.emit(Events.CONSTELLATION_LINES_CREATED, {
      count: linesCreated,
    });

    return linesCreated;
  }

  /**
   * Highlight a specific constellation by name.
   * @param {string} constellationName - Constellation name or abbreviation
   */
  highlight(constellationName) {
    if (!this.linesGroup_) {
      return;
    }

    // Remove any existing glow lines and restore previous highlight
    this.clearGlowLines_();
    this.restoreHighlightedLines_();

    // Check if lines were hidden (game mode) - only dim others in this case
    const linesWereHidden = !this.linesGroup_.visible;

    // Force lines visible if currently hidden (for game mode)
    if (linesWereHidden) {
      this.linesGroup_.visible = true;
      this.forcedVisible_ = true;

      // Dim all lines when forcing visibility (game mode)
      this.linesGroup_.children.forEach((line) => {
        if (!line.userData?.isGlow) {
          line.material.opacity = 0.08;
          line.material.color.setHex(0x666688);
        }
      });
    }

    // Highlight matching constellation lines
    this.highlightedConstellation_ = constellationName;
    this.linesGroup_.children.forEach((line) => {
      if (line.userData?.isGlow) return;

      if (line.userData.constellation === constellationName) {
        // Store original color (opacity restored from mode, not snapshot)
        if (!line.userData.originalColor) {
          line.userData.originalColor = line.material.color.getHex();
        }
        line.material.opacity = 1.0;
        line.material.color.setHex(COLORS.HIGHLIGHT);
        line.material.linewidth = 2;

        // Create glow effect
        this.createGlowLine_(line);
      }
    });

    this.requestRender_();

    globalEventBus.emit(Events.CONSTELLATION_HIGHLIGHTED, {
      name: constellationName,
    });
  }

  /**
   * Restore highlighted lines to their original state.
   * @private
   */
  restoreHighlightedLines_() {
    if (!this.linesGroup_ || !this.highlightedConstellation_) return;

    this.linesGroup_.children.forEach((line) => {
      if (line.userData?.isGlow) return;

      if (line.userData.constellation === this.highlightedConstellation_) {
        if (line.userData.originalColor !== undefined) {
          // In focus mode, restore to lerped opacity from focus state
          // In all mode, restore to default constant
          if (this.mode_ === CONSTELLATIONS.MODE_FOCUS) {
            const focusOpacity = this.constellationOpacities_.get(
              this.highlightedConstellation_) ?? 0;
            line.material.opacity = focusOpacity;
            line.visible = focusOpacity > 0.005;
          } else {
            line.material.opacity = CONSTELLATIONS.LINE_OPACITY;
          }
          line.material.color.setHex(line.userData.originalColor);
          line.material.linewidth = 1;
          delete line.userData.originalColor;
        }
      }
    });

    this.highlightedConstellation_ = null;
  }

  /**
   * Remove all constellation highlighting.
   */
  unhighlight() {
    // Remove glow lines first
    this.clearGlowLines_();

    // Restore highlighted constellation lines
    this.restoreHighlightedLines_();

    // Restore original visibility if we forced it (game mode)
    if (this.forcedVisible_ && this.linesGroup_) {
      this.linesGroup_.visible = false;
      this.forcedVisible_ = false;

      // Restore all lines to original state when hiding
      this.linesGroup_.children.forEach((line) => {
        if (line.userData?.isGlow) return;
        line.material.opacity = CONSTELLATIONS.LINE_OPACITY;
        line.material.color.setHex(COLORS.LINE);
        line.material.linewidth = 1;
      });
    }

    this.requestRender_();

    globalEventBus.emit(Events.CONSTELLATION_UNHIGHLIGHTED, {});
  }

  /**
   * Create a glow line effect for a highlighted constellation line.
   * @param {!THREE.Line} line - Line to create glow for
   * @private
   */
  createGlowLine_(line) {
    const glowMaterial = new THREE.LineBasicMaterial({
      color: COLORS.HIGHLIGHT,
      transparent: true,
      opacity: 0.4,
      linewidth: 3,
      depthWrite: false,
    });

    const glowLine = new THREE.Line(line.geometry.clone(), glowMaterial);
    glowLine.userData = {isGlow: true};
    this.linesGroup_.add(glowLine);
    this.glowLines_.push(glowLine);
  }

  /**
   * Clear all glow lines.
   * @private
   */
  clearGlowLines_() {
    this.glowLines_.forEach((line) => {
      if (line.parent) line.parent.remove(line);
      if (line.geometry) line.geometry.dispose();
      if (line.material) line.material.dispose();
    });
    this.glowLines_ = [];
  }

  /**
   * Precompute center positions for each constellation using Cartesian mean.
   * @param {!Array<!Object>} stars - Star array
   * @param {!Object} constellations - Constellations data
   * @private
   */
  computeConstellationCenters_(stars, constellations) {
    this.constellationCenters_.clear();
    this.constellationOpacities_.clear();

    const starByHip = new Map();
    stars.forEach((s) => {
      if (s.hip) starByHip.set(s.hip, s);
    });

    Object.entries(constellations).forEach(([constName, constellation]) => {
      const hipSet = new Set();
      constellation.lines.forEach(([hip1, hip2]) => {
        hipSet.add(hip1);
        hipSet.add(hip2);
      });

      let sx = 0, sy = 0, sz = 0;
      let count = 0;
      hipSet.forEach((hip) => {
        const star = starByHip.get(hip);
        if (star) {
          const raRad = star.ra * Math.PI / 180;
          const decRad = star.dec * Math.PI / 180;
          sx += Math.cos(decRad) * Math.cos(raRad);
          sy += Math.sin(decRad);
          sz += Math.cos(decRad) * Math.sin(raRad);
          count++;
        }
      });

      if (count > 0) {
        const raDec = cartesianToRaDec(sx / count, sy / count, -(sz / count));
        this.constellationCenters_.set(constName, {ra: raDec.ra, dec: raDec.dec});
        this.constellationOpacities_.set(constName, 0);
      }
    });
  }

  /**
   * Update focus mode - fade in nearest constellation, fade out others.
   * @param {number} viewRa - View center RA in degrees
   * @param {number} viewDec - View center Dec in degrees
   * @returns {boolean} True if any opacity is still changing (needs more frames)
   */
  updateFocusMode(viewRa, viewDec) {
    if (!this.linesGroup_) return false;

    // Find nearest constellation center
    let nearestConst = null;
    let nearestDist = Infinity;
    this.constellationCenters_.forEach(({ra, dec}, name) => {
      const dist = angularDistance(viewRa, viewDec, ra, dec);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestConst = name;
      }
    });

    // Only select if within focus radius
    if (nearestDist > CONSTELLATIONS.FOCUS_RADIUS) {
      nearestConst = null;
    }

    let needsRender = false;
    const lerpSpeed = CONSTELLATIONS.FOCUS_LERP_SPEED;

    // Update opacities for each constellation
    this.constellationOpacities_.forEach((currentOpacity, name) => {
      const target = (name === nearestConst) ? CONSTELLATIONS.LINE_OPACITY : 0;
      const newOpacity = currentOpacity + (target - currentOpacity) * lerpSpeed;

      // Snap to target when close enough
      const finalOpacity = Math.abs(newOpacity - target) < 0.005 ? target : newOpacity;

      if (finalOpacity !== currentOpacity) {
        this.constellationOpacities_.set(name, finalOpacity);
        needsRender = true;
      }
    });

    // Only touch line materials when opacities actually changed
    if (needsRender) {
      this.linesGroup_.children.forEach((line) => {
        if (line.userData?.isGlow) return;
        const constName = line.userData.constellation;

        // Skip highlighted constellation (tour/selection takes priority)
        if (constName === this.highlightedConstellation_) return;

        const opacity = this.constellationOpacities_.get(constName) ?? 0;
        line.material.opacity = opacity;
        line.visible = opacity > 0.005;
      });
    }

    return needsRender;
  }

  /**
   * Reset all line opacities to default (for switching away from focus mode).
   */
  resetOpacities() {
    if (!this.linesGroup_) return;

    this.constellationOpacities_.forEach((_, name) => {
      this.constellationOpacities_.set(name, 0);
    });

    this.linesGroup_.children.forEach((line) => {
      if (line.userData?.isGlow) return;
      line.material.opacity = CONSTELLATIONS.LINE_OPACITY;
      line.material.color.setHex(COLORS.LINE);
      line.visible = true;
    });

    this.requestRender_();
  }

  /**
   * Dispose of resources.
   */
  dispose() {
    this.clearGlowLines_();
    if (this.linesGroup_) {
      this.linesGroup_.children.forEach((line) => {
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
      });
      this.celestialSphere_.remove(this.linesGroup_);
      this.linesGroup_ = null;
    }
    // Dispose tracked source materials
    this.lineMaterials_.forEach((mat) => mat.dispose());
    this.lineMaterials_ = [];
  }
}

/**
 * Singleton constellation renderer instance.
 * @type {?ConstellationRenderer}
 */
export let constellationRenderer = null;

/**
 * Initialize the constellation renderer singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!ConstellationRenderer} Initialized renderer
 */
export function initializeConstellationRenderer(dependencies) {
  constellationRenderer = new ConstellationRenderer(dependencies);
  return constellationRenderer;
}
