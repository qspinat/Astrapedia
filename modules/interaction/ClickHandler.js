/**
 * @fileoverview Click handler for celestial object selection.
 * Handles click detection for planets, stars, DSOs, and constellations.
 */

// THREE is loaded globally from CDN in app.html
import {cartesianToRaDec} from '../core/CoordinateUtils.js';
import {CAMERA} from '../core/Constants.js';
import {getDsoTypeName} from '../core/TypeMappings.js';
import {isWithinMagnitudeLimit, magnitudeToSize}
  from '../core/MagnitudeUtils.js';

/**
 * Raycast tolerance for click targets, in world units at the default field of
 * view. Scaled by fov/DEFAULT_FOV at use, which holds the tolerance constant
 * in screen pixels (about 22px) at every zoom level.
 * @const {number}
 */
const CLICK_THRESHOLD = 5;

/**
 * Whether an object is actually being drawn.
 *
 * THREE's raycaster does not consider visibility — a LineSegments with
 * visible = false still reports intersections (verified against r128) — so
 * anything hidden has to be filtered out here, or the user can click a target
 * that is not on screen. Focus mode hides all but the nearest constellation
 * exactly this way.
 *
 * Walks the parent chain, since hiding a group hides its children.
 *
 * @param {?THREE.Object3D} object - Object to test
 * @returns {boolean} True if the object and all its ancestors are visible
 */
/**
 * Opacity at or below which an object is treated as not drawn, and so not
 * clickable.
 * @const {number}
 */
const MIN_VISIBLE_OPACITY = 0.01;

function isDisplayed(object) {
  for (let node = object; node; node = node.parent) {
    if (node.visible === false) return false;

    // `visible` is not the only way this app stops drawing something.
    // ExtendedObjectRenderer fades a halo to opacity 0 once it covers the
    // whole screen, leaving visible === true; since DSOs outrank stars in the
    // ladder below, a completely transparent halo would otherwise swallow
    // every click at deep zoom. The threshold sits under the deliberate
    // game-mode dimming (0.08), which is faint but still meant to be clickable.
    const material = node.material;
    if (material?.transparent && material.opacity <= MIN_VISIBLE_OPACITY) {
      return false;
    }
  }
  return true;
}

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
 *   clearSelection: function(): void,
 *   getMagnitudeLimit: function(): number,
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
    this.raycaster_.params.Points.threshold =
        CLICK_THRESHOLD * (camera.fov / CAMERA.DEFAULT_FOV);
    this.raycaster_.setFromCamera(this.mouse_, camera);

    // Try click detection in priority order.
    // DSOs (extended objects) are checked before stars so that clicking
    // within a nebula selects the nebula, not a field star inside it.
    if (this.detectPlanetClick_(camera, renderer)) return;
    if (this.detectDSOClick_(camera, renderer)) return;

    // Constellation lines compete with the star field on distance rather than
    // losing to it by rank. Both measure perpendicular distance from the ray
    // in the same world units, so whichever the click is actually closer to
    // wins — clicking a line's midpoint selects the constellation, clicking a
    // star on that line still selects the star.
    const constellation = this.findConstellationCandidate_(camera);
    const starLimit = constellation ? constellation.distanceToRay : Infinity;

    if (this.detectStarClick_(starLimit)) return;
    if (this.detectDynamicStarClick_()) return;

    if (constellation) {
      this.selectConstellation_(constellation);
      return;
    }

    // Empty space click - deselect any selected object/constellation
    if (!this.deps_.isGameActive()) {
      this.deps_.unhighlightConstellation();
      this.deps_.clearSelection?.();
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
      if (!isDisplayed(sprite)) continue;

      const planetData = sprite.userData;
      // RA 0 is a real coordinate — the vernal equinox — so test for absence,
      // not falsiness, or anything sitting there becomes unclickable.
      if (!planetData || planetData.ra == null) continue;

      // Calculate angular distance (wrap RA delta across the 0h/360h meridian)
      const dRaDeg = ((planetData.ra - clickRaDec.ra + 540) % 360) - 180;
      const dRa = dRaDeg * Math.cos(THREE.MathUtils.degToRad(planetData.dec));
      const dDec = planetData.dec - clickRaDec.dec;
      const angularDist = Math.sqrt(dRa * dRa + dDec * dDec);

      // Calculate click threshold based on displayed size
      const angularSizeDeg = (planetData.angularSize || 0.1) / 60;
      const realSizePixels = angularSizeDeg * pixelsPerDeg;

      // Must match how PlanetRenderer sizes the sprite (maxSize 6), or the
      // tap target drifts away from what is drawn.
      const mag = planetData.mag || 0;
      const magBasedSize = magnitudeToSize(mag, 6);
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
  detectStarClick_(maxDistanceToRay = Infinity) {
    const starField = this.deps_.getStarField();
    if (!starField) return false;

    const intersects = this.raycaster_.intersectObject(starField);
    if (intersects.length === 0) return false;

    const stars = starField.userData.stars;
    const dsos = starField.userData.dsos;
    const magnitudeLimit = this.deps_.getMagnitudeLimit?.() ?? 12;


    for (const intersection of intersects) {
      // A star only wins the click if it is nearer than the best competing
      // target. Without this the star field took every click at wide fields
      // of view, where its 22px capture radius is about the mean spacing
      // between visible stars.
      if (intersection.distanceToRay > maxDistanceToRay) continue;

      const index = intersection.index;
      let clickedObject = null;

      if (index < stars.length) {
        const star = stars[index];
        if (!isWithinMagnitudeLimit(star.mag, magnitudeLimit)) continue;
        clickedObject = {
          name: star.proper || star.bf ||
            (star.hip ? `HIP ${star.hip}` : 'Unknown Star'),
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
          if (!isWithinMagnitudeLimit(dso.mag, magnitudeLimit)) continue;
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

    const visibleIndices = dynamicObjectManager.getVisibleIndices?.();
    const dynamicStars = dynamicObjectManager.getDynamicStars?.();

    if (!dynamicStars) return false;

    const magnitudeLimit = this.deps_.getMagnitudeLimit?.() ?? 12;

    // Iterate through all intersections to find the first visible star
    for (const intersection of intersects) {
      const visibleIndex = intersection.index;
      const originalIndex = visibleIndices
        ? visibleIndices[visibleIndex]
        : visibleIndex;

      if (originalIndex === undefined || originalIndex >= dynamicStars.length) {
        continue;
      }

      const star = dynamicStars[originalIndex];

      // Skip stars beyond the fade range (completely invisible)
      if (!isWithinMagnitudeLimit(star.mag, magnitudeLimit)) {
        continue;
      }

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

    return false;
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
    const magnitudeLimit = this.deps_.getMagnitudeLimit?.() ?? 12;

    let closestDSO = null;
    let closestDistance = Infinity;

    for (const sprite of extendedObjectSprites) {
      if (!isDisplayed(sprite)) continue;

      const dsoData = sprite.userData?.dso;
      if (!dsoData || dsoData.ra == null) continue;
      // Skip DSOs beyond the fade range (completely invisible)
      if (!isWithinMagnitudeLimit(dsoData.mag, magnitudeLimit)) continue;

      // Wrap RA delta across the 0h/360h meridian
      const dRaDeg = ((dsoData.ra - clickRaDec.ra + 540) % 360) - 180;
      const dRa = dRaDeg * Math.cos(THREE.MathUtils.degToRad(dsoData.dec));
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
  findConstellationCandidate_(camera) {
    if (!this.deps_.isConstellationLinesVisible()) return null;

    const constellationLinesGroup = this.deps_.getConstellationLinesGroup();
    if (!constellationLinesGroup) return null;

    // Same tolerance the star field gets. Lines previously had 2.5x less,
    // which combined with being checked last meant they almost never won.
    this.raycaster_.params.Line = {
      threshold: CLICK_THRESHOLD * (camera.fov / CAMERA.DEFAULT_FOV),
    };

    const lineIntersects = this.raycaster_.intersectObjects(
      constellationLinesGroup.children,
      false
    );

    for (const intersection of lineIntersects) {
      const name = intersection.object.userData?.constellation;
      if (!name) continue;
      // Focus mode hides every constellation but the nearest one.
      if (!isDisplayed(intersection.object)) continue;
      return {
        name,
        // Perpendicular distance from the ray, directly comparable to a
        // star's distanceToRay: both are world units on the same sphere.
        // Fall back to the raw ray distance if the intersection carries no
        // point, so a click still registers rather than throwing.
        distanceToRay: intersection.point ?
          this.raycaster_.ray.distanceToPoint(intersection.point) :
          (intersection.distanceToRay ?? 0),
      };
    }

    return null;
  }

  /**
   * Select a constellation found by findConstellationCandidate_.
   * @param {{name: string}} candidate - The constellation to select
   * @private
   */
  selectConstellation_(candidate) {
    if (this.deps_.isGameActive()) {
      this.deps_.checkGameAnswerByName(candidate.name);
    } else {
      this.deps_.showConstellationInfo(candidate.name);
    }
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
