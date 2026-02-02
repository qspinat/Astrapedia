/**
 * @fileoverview Click handler for celestial object selection.
 * Handles click detection for planets, stars, DSOs, and constellations.
 */

// THREE is loaded globally from CDN in app.html
import {cartesianToRaDec} from '../core/CoordinateUtils.js';
import {CAMERA} from '../core/Constants.js';
import {getDsoTypeName} from '../core/TypeMappings.js';
import {clamp} from '../core/Utils.js';

/**
 * @typedef {{
 *   camera: THREE.PerspectiveCamera,
 *   renderer: THREE.WebGLRenderer,
 *   getCelestialSphere: function(): ?THREE.Object3D,
 *   getStarField: function(): ?THREE.Points,
 *   getPlanetSprites: function(): !Array<!THREE.Sprite>,
 *   getExtendedObjectSprites: function(): !Array<!THREE.Sprite>,
 *   getConstellationLinesGroup: function(): ?THREE.Group,
 *   getDynamicObjectManager: function(): ?Object,
 *   isConstellationLinesVisible: function(): boolean,
 *   isGameActive: function(): boolean,
 *   checkGameAnswer: function({ra: number, dec: number}): void,
 *   checkGameAnswerByName: function(string): void,
 *   selectObject: function(!Object): void,
 *   showConstellationInfo: function(string): void,
 *   unhighlightConstellation: function(): void,
 *   getConstellationName: function(string): string
 * }}
 */
let ClickHandlerDependencies;

/**
 * ClickHandler handles click detection for celestial objects.
 */
export class ClickHandler {
  /**
   * Creates a new ClickHandler instance.
   * @param {!ClickHandlerDependencies} deps - Required dependencies
   */
  constructor(deps) {
    /** @private @const */
    this.deps_ = deps;

    /** @private @const */
    this.raycaster_ = new THREE.Raycaster();

    /** @private @const */
    this.mouse_ = new THREE.Vector2();
  }

  /**
   * Handle click at normalized device coordinates.
   * @param {number} x - X coordinate in NDC (-1 to 1)
   * @param {number} y - Y coordinate in NDC (-1 to 1)
   */
  handleClick(x, y) {
    const camera = this.deps_.camera;
    const renderer = this.deps_.renderer;

    this.mouse_.set(x, y);

    // Configure raycaster with FOV-scaled threshold
    this.raycaster_.params.Points.threshold = 5 * (camera.fov / CAMERA.DEFAULT_FOV);
    this.raycaster_.setFromCamera(this.mouse_, camera);

    // Try click detection in priority order
    if (this.detectPlanetClick_(camera, renderer)) return;
    if (this.detectStarClick_()) return;
    if (this.detectDynamicStarClick_()) return;
    if (this.detectDSOClick_(camera, renderer)) return;
    if (this.detectConstellationClick_(camera)) return;

    // Empty space click - unhighlight any selected constellation
    if (!this.deps_.isGameActive()) {
      this.deps_.unhighlightConstellation();
    }
  }

  /**
   * Transform click direction to celestial coordinates.
   * @param {!THREE.Vector3} clickDir - Click direction vector
   * @returns {{ra: number, dec: number}} RA/Dec coordinates
   * @private
   */
  getClickRaDec_(clickDir) {
    const celestialSphere = this.deps_.getCelestialSphere();
    const clickDirCelestial = clickDir.clone();

    if (celestialSphere) {
      const inverseMatrix = new THREE.Matrix4()
        .copy(celestialSphere.matrixWorld)
        .invert();
      const rotationMatrix = new THREE.Matrix3().setFromMatrix4(inverseMatrix);
      clickDirCelestial.applyMatrix3(rotationMatrix);
    }

    return cartesianToRaDec(
      clickDirCelestial.x,
      clickDirCelestial.y,
      clickDirCelestial.z
    );
  }

  /**
   * Detect planet click using angular distance.
   * @param {!THREE.PerspectiveCamera} camera - Camera
   * @param {!THREE.WebGLRenderer} renderer - Renderer
   * @returns {boolean} True if planet was clicked
   * @private
   */
  detectPlanetClick_(camera, renderer) {
    const planetSprites = this.deps_.getPlanetSprites();
    if (!planetSprites || planetSprites.length === 0) return false;

    // Get click direction
    const clickDir = new THREE.Vector3();
    this.raycaster_.ray.direction.normalize();
    clickDir.copy(this.raycaster_.ray.direction);

    const clickRaDec = this.getClickRaDec_(clickDir);
    const fov = camera.fov;
    const canvasHeight = renderer.domElement.height;
    const pixelsPerDeg = canvasHeight / fov;

    let closestPlanet = null;
    let closestDistance = Infinity;

    for (const sprite of planetSprites) {
      const planetData = sprite.userData;
      if (!planetData || !planetData.ra) continue;

      // Calculate angular distance
      const dRa = (planetData.ra - clickRaDec.ra) *
        Math.cos(THREE.MathUtils.degToRad(planetData.dec));
      const dDec = planetData.dec - clickRaDec.dec;
      const angularDist = Math.sqrt(dRa * dRa + dDec * dDec);

      // Calculate click threshold based on displayed size
      const angularSizeDeg = (planetData.angularSize || 0.1) / 60;
      const realSizePixels = angularSizeDeg * pixelsPerDeg;

      // Magnitude-based size
      const mag = planetData.mag || 0;
      const baseMag = 8;
      const baseSize = 0.8;
      const maxSize = 6;
      const magnitudeDiff = baseMag - mag;
      const magBasedSize = clamp(
        baseSize * Math.pow(1.15, magnitudeDiff),
        baseSize,
        maxSize
      );
      const magBasedPixels = magBasedSize * 1.5;
      const displaySizePixels = Math.max(realSizePixels, magBasedPixels);

      // Click threshold with generous margin
      const visibleSizeDeg = displaySizePixels / pixelsPerDeg;
      const clickThreshold = visibleSizeDeg * 2.0;

      if (angularDist < clickThreshold && angularDist < closestDistance) {
        closestDistance = angularDist;
        closestPlanet = planetData;
      }
    }

    if (closestPlanet) {
      const clickedObject = {
        name: closestPlanet.name,
        type: closestPlanet.type || 'Planet',
        subtype: closestPlanet.name === 'Sun'
          ? 'Star (G2V)'
          : (closestPlanet.name === 'Moon' ? 'Natural Satellite' : 'Planet'),
        ra: closestPlanet.ra,
        dec: closestPlanet.dec,
        mag: closestPlanet.mag,
        angularSize: closestPlanet.angularSize,
        phase: closestPlanet.phase,
      };
      this.handleObjectClick_(clickedObject);
      return true;
    }

    return false;
  }

  /**
   * Detect star/DSO click in main star field.
   * @returns {boolean} True if star/DSO was clicked
   * @private
   */
  detectStarClick_() {
    const starField = this.deps_.getStarField();
    if (!starField) return false;

    const intersects = this.raycaster_.intersectObject(starField);
    if (intersects.length === 0) return false;

    const index = intersects[0].index;
    const stars = starField.userData.stars;
    const dsos = starField.userData.dsos;

    let clickedObject = null;

    if (index < stars.length) {
      const star = stars[index];
      clickedObject = {
        name: star.proper || star.bf || `HIP ${star.hip}` || 'Unknown Star',
        type: 'Star',
        subtype: star.spect ? `Spectral type ${star.spect}` : null,
        ra: star.ra,
        dec: star.dec,
        mag: star.mag,
        distance: star.dist ? `${star.dist.toFixed(1)} ly` : null,
        angularSize: null,
      };
    } else {
      const dsoIndex = index - stars.length;
      if (dsoIndex < dsos.length) {
        const dso = dsos[dsoIndex];
        clickedObject = {
          name: dso.messier
            ? `M${Math.floor(dso.messier)}`
            : (dso.ngc ? `NGC ${dso.ngc}` : dso.name || 'Unknown Object'),
          type: getDsoTypeName(dso.type),
          subtype: dso.type,
          ra: dso.ra,
          dec: dso.dec,
          mag: dso.mag,
          size_major: dso.size_major,
          size_minor: dso.size_minor,
        };
      }
    }

    if (clickedObject) {
      this.handleObjectClick_(clickedObject);
      return true;
    }

    return false;
  }

  /**
   * Detect star click in dynamic star field.
   * @returns {boolean} True if dynamic star was clicked
   * @private
   */
  detectDynamicStarClick_() {
    const dynamicObjectManager = this.deps_.getDynamicObjectManager();
    if (!dynamicObjectManager) return false;

    const dynamicStarField = dynamicObjectManager.getDynamicStarField?.();
    if (!dynamicStarField) return false;

    const intersects = this.raycaster_.intersectObject(dynamicStarField);
    if (intersects.length === 0) return false;

    const visibleIndex = intersects[0].index;
    const visibleIndices = dynamicObjectManager.getVisibleIndices?.();
    const dynamicStars = dynamicObjectManager.getDynamicStars?.();

    if (!dynamicStars) return false;

    const originalIndex = visibleIndices
      ? visibleIndices[visibleIndex]
      : visibleIndex;

    if (originalIndex === undefined || originalIndex >= dynamicStars.length) {
      return false;
    }

    const star = dynamicStars[originalIndex];
    const clickedObject = {
      name: `Star at RA ${star.ra.toFixed(4)}`,
      type: 'Star',
      subtype: 'Catalog star (VizieR)',
      ra: star.ra,
      dec: star.dec,
      mag: star.mag,
      angularSize: null,
    };

    this.handleObjectClick_(clickedObject);
    return true;
  }

  /**
   * Detect DSO click via extended object sprites.
   * @param {!THREE.PerspectiveCamera} camera - Camera
   * @param {!THREE.WebGLRenderer} renderer - Renderer
   * @returns {boolean} True if DSO was clicked
   * @private
   */
  detectDSOClick_(camera, renderer) {
    const extendedObjectSprites = this.deps_.getExtendedObjectSprites();
    if (!extendedObjectSprites || extendedObjectSprites.length === 0) {
      return false;
    }

    const clickDirCelestial = this.raycaster_.ray.direction.clone();
    const celestialSphere = this.deps_.getCelestialSphere();

    if (celestialSphere) {
      const inverseMatrix = new THREE.Matrix4()
        .copy(celestialSphere.matrixWorld)
        .invert();
      const rotationMatrix = new THREE.Matrix3().setFromMatrix4(inverseMatrix);
      clickDirCelestial.applyMatrix3(rotationMatrix);
    }

    const clickRaDec = cartesianToRaDec(
      clickDirCelestial.x,
      clickDirCelestial.y,
      clickDirCelestial.z
    );

    const fov = camera.fov;
    const canvasHeight = renderer.domElement.height;
    const pixelsPerDeg = canvasHeight / fov;
    const minSizePixels = 6;

    let closestDSO = null;
    let closestDistance = Infinity;

    for (const sprite of extendedObjectSprites) {
      const dsoData = sprite.userData?.dso;
      if (!dsoData || !dsoData.ra) continue;

      const dRa = (dsoData.ra - clickRaDec.ra) *
        Math.cos(THREE.MathUtils.degToRad(dsoData.dec));
      const dDec = dsoData.dec - clickRaDec.dec;
      const angularDist = Math.sqrt(dRa * dRa + dDec * dDec);

      const angularSizeDeg = (sprite.userData.angularSizeArcmin || 1) / 60;
      const realSizePixels = angularSizeDeg * pixelsPerDeg;

      let clickThreshold;
      if (realSizePixels >= minSizePixels) {
        clickThreshold = angularSizeDeg * 1.2;
      } else {
        const visibleSizeDeg = minSizePixels / pixelsPerDeg;
        clickThreshold = visibleSizeDeg * 1.5;
      }

      if (angularDist < clickThreshold && angularDist < closestDistance) {
        closestDistance = angularDist;
        closestDSO = dsoData;
      }
    }

    if (closestDSO) {
      const clickedObject = {
        name: closestDSO.name || `DSO at RA ${closestDSO.ra.toFixed(2)}`,
        type: getDsoTypeName(closestDSO.type),
        subtype: closestDSO.type,
        ra: closestDSO.ra,
        dec: closestDSO.dec,
        mag: closestDSO.mag,
        size_major: closestDSO.size_major,
        size_minor: closestDSO.size_minor,
      };
      this.handleObjectClick_(clickedObject);
      return true;
    }

    return false;
  }

  /**
   * Detect constellation line click.
   * @param {!THREE.PerspectiveCamera} camera - Camera
   * @returns {boolean} True if constellation was clicked
   * @private
   */
  detectConstellationClick_(camera) {
    if (!this.deps_.isConstellationLinesVisible()) return false;

    const constellationLinesGroup = this.deps_.getConstellationLinesGroup();
    if (!constellationLinesGroup) return false;

    // Set line threshold based on FOV
    this.raycaster_.params.Line = {threshold: 0.5 * (camera.fov / CAMERA.DEFAULT_FOV)};

    const lineIntersects = this.raycaster_.intersectObjects(
      constellationLinesGroup.children,
      false
    );

    if (lineIntersects.length > 0) {
      const clickedLine = lineIntersects[0].object;
      const constInternalKey = clickedLine.userData.constellation;

      if (constInternalKey) {
        if (this.deps_.isGameActive()) {
          this.deps_.checkGameAnswerByName(constInternalKey);
        } else {
          this.deps_.showConstellationInfo(constInternalKey);
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Handle click on an object (common logic for planets/stars/DSOs).
   * @param {!Object} clickedObject - The clicked object data
   * @private
   */
  handleObjectClick_(clickedObject) {
    this.deps_.unhighlightConstellation();

    if (this.deps_.isGameActive()) {
      this.deps_.checkGameAnswer({ra: clickedObject.ra, dec: clickedObject.dec});
    } else {
      this.deps_.selectObject(clickedObject);
    }
  }
}

/**
 * Initialize click handler with dependencies.
 * @param {!ClickHandlerDependencies} deps - Dependencies
 * @returns {!ClickHandler} Initialized click handler
 */
export function initializeClickHandler(deps) {
  return new ClickHandler(deps);
}
