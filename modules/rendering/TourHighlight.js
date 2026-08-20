/**
 * @fileoverview Tour highlight rendering for celestial object selection.
 * Manages pulsing highlight rings for tours and object selection.
 */

/* global THREE */
import {clamp} from '../core/Utils.js';
import {raDecToCartesian} from '../core/CoordinateUtils.js';
import {createLogger} from '../core/Logger.js';

const logger = createLogger('TourHighlight');

/**
 * TourHighlight handles the animated pulsing rings that highlight
 * celestial objects during tours and after search selection.
 */
export class TourHighlight {
  /**
   * Create a TourHighlight instance.
   * @param {THREE.Object3D} celestialSphere - Parent object to add highlights to
   */
  constructor(celestialSphere) {
    /** @private @type {THREE.Object3D} */
    this.celestialSphere_ = celestialSphere;

    /** @private @type {?THREE.Sprite} */
    this.highlight_ = null;
  }

  /**
   * Show a pulsing highlight ring around a celestial object.
   * @param {number} ra - Right ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {number=} angularSizeArcmin - Object's angular size in arcminutes
   */
  show(ra, dec, angularSizeArcmin = 10) {
    logger.debug('show() called at ra:', ra, 'dec:', dec, 'size:', angularSizeArcmin);

    // Remove existing highlight if any
    this.hide();

    // Create a ring texture for the highlight
    const canvas = document.createElement('canvas');
    const size = 128;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // A graduated-dial reticle: two concentric thin rings with tick marks
    // between them, and a clear centre so the object stays visible. Amber
    // (matching --accent-warm) on additive blending, so it reads like an
    // instrument sight. It's part of the 3D scene, so the night-vision canvas
    // overlay tints it red in the dark.
    ctx.clearRect(0, 0, size, size);
    const centerX = size / 2;
    const centerY = size / 2;
    const outerRadius = 58;
    const innerRadius = 42;

    ctx.shadowColor = 'rgba(212, 168, 75, 0.5)';
    ctx.shadowBlur = 4;

    // Outer ring (dim)
    ctx.strokeStyle = 'rgba(154, 122, 58, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner ring (bright amber)
    ctx.strokeStyle = 'rgba(212, 168, 75, 0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Graduation ticks every 30 degrees, spanning the gap between the rings.
    ctx.shadowBlur = 2;
    ctx.strokeStyle = 'rgba(154, 122, 58, 0.9)';
    ctx.lineWidth = 2.5;
    for (let a = 0; a < 360; a += 30) {
      const r = (a * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(r) * outerRadius,
          centerY + Math.sin(r) * outerRadius);
      ctx.lineTo(centerX + Math.cos(r) * innerRadius,
          centerY + Math.sin(r) * innerRadius);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Create sprite
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });

    this.highlight_ = new THREE.Sprite(material);
    const radius = 98; // Slightly in front of stars
    const pos = raDecToCartesian(ra, dec, radius);
    this.highlight_.position.copy(pos);

    // Calculate the real world size based on angular size
    const angularSizeRad = THREE.MathUtils.degToRad(angularSizeArcmin / 60);
    const realWorldSize = radius * angularSizeRad * 2;

    this.highlight_.renderOrder = 100; // Render on top
    this.highlight_.userData = {
      ra,
      dec,
      startTime: Date.now(),
      angularSizeArcmin,
      realWorldSize,
      maxWorldSize: 15 // Maximum size when zoomed out
    };

    this.celestialSphere_.add(this.highlight_);
  }

  /**
   * Hide and dispose of the highlight.
   */
  hide() {
    if (this.highlight_) {
      this.celestialSphere_.remove(this.highlight_);
      if (this.highlight_.material.map) {
        this.highlight_.material.map.dispose();
      }
      this.highlight_.material.dispose();
      this.highlight_ = null;
    }
  }

  /**
   * Check if a highlight is currently active.
   * @returns {boolean} True if highlight is showing
   */
  isActive() {
    return this.highlight_ !== null;
  }

  /**
   * Get the current highlight sprite (for external animation).
   * @returns {?THREE.Sprite} The highlight sprite or null
   */
  getSprite() {
    return this.highlight_;
  }

  /**
   * Update the highlight animation.
   * Should be called from the animation loop.
   * @param {number} fov - Current camera field of view in degrees
   * @param {number} canvasHeight - Canvas height in pixels
   */
  update(fov, canvasHeight) {
    if (!this.highlight_) return;

    const userData = this.highlight_.userData;
    const elapsed = (Date.now() - userData.startTime) / 1000;

    // Acquisition "lock": for the first ~350ms the reticle snaps in larger
    // and settles onto the target (ease-out), fading in over the first 150ms.
    // After that it holds with a gentle pulse. Reads like a sight acquiring a
    // target rather than a ring simply appearing.
    const acqT = Math.min(elapsed / 0.35, 1);
    const acqEase = 1 - Math.pow(1 - acqT, 3);
    const acquireScale = 1 + (1 - acqEase) * 0.7;
    const fadeIn = Math.min(elapsed / 0.15, 1);

    // Pulsing opacity animation, gated by the fade-in.
    const pulse = 0.7 + 0.3 * Math.sin(elapsed * 3);
    this.highlight_.material.opacity = pulse * fadeIn;

    // Slow surveying rotation of the dial (SpriteMaterial rotates the texture).
    this.highlight_.material.rotation = elapsed * 0.25;

    // Calculate size based on FOV
    // When zoomed out (large FOV), show large highlight
    // When zoomed in (small FOV), shrink to real object size
    const pixelsPerDeg = canvasHeight / fov;

    // Calculate how many pixels the real object would be
    const angularSizeDeg = userData.angularSizeArcmin / 60;
    const realSizePixels = angularSizeDeg * pixelsPerDeg;

    // Target: when object is small on screen, use large highlight
    // When object is large on screen, use real size
    // Transition: highlight shrinks as you zoom in
    const minHighlightPixels = 80; // Minimum highlight size in pixels
    const targetPixels = Math.max(realSizePixels * 1.5, minHighlightPixels);

    // Convert target pixels back to world size
    const radius = 98;
    const worldSize = (targetPixels / canvasHeight) * 2 * radius *
        Math.tan(THREE.MathUtils.degToRad(fov / 2));

    // Clamp to reasonable range, add the settle-in acquisition scale and a
    // slight steady pulse.
    const clampedSize = clamp(worldSize, userData.realWorldSize * 1.2, userData.maxWorldSize);
    const pulsedSize = clampedSize * (1 + 0.1 * Math.sin(elapsed * 2)) * acquireScale;

    this.highlight_.scale.set(pulsedSize, pulsedSize, 1);
  }

  /**
   * Dispose of all resources.
   */
  dispose() {
    this.hide();
    this.celestialSphere_ = null;
  }
}
