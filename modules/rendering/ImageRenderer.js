/**
 * @fileoverview Image sprite rendering for deep sky objects.
 * Handles creation, visibility updates, and dynamic loading of astronomical images.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {raDecToCartesian} from '../core/CoordinateUtils.js';
import {CURATED_IMAGES, getCuratedImage, getCuratedImageKeys} from '../data/CuratedImages.js';
import {clamp} from '../core/Utils.js';

/**
 * Image source tiers for quality prioritization.
 * @const {!Object<string, number>}
 */
const IMAGE_TIERS = {
  'iconic': 4,   // Webb/Hubble
  'high': 3,     // NASA, ESO
  'medium': 2,   // Wikimedia
  'vintage': 1,  // DSS
};

/**
 * Types eligible for dynamic image loading from external APIs.
 * @const {!Array<string>}
 */
const DYNAMIC_TARGET_TYPES = ['Neb', 'PN', 'EmN', 'HII', 'Cl+N', 'RfN', 'SNR', 'GCl', 'OCl', 'G'];

/**
 * Special object images (planets and solar system).
 * @const {!Object<string, {url: string, source: string, tier: string}>}
 */
const SPECIAL_OBJECTS = {
  'Sun': {
    url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0193.jpg',
    source: 'NASA/SDO',
    tier: 'iconic',
  },
  'Moon': {
    url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004874/phases/097.jpg',
    source: 'NASA/GSFC',
    tier: 'high',
  },
  'Mercury': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/' +
         'Mercury_in_true_color.jpg/400px-Mercury_in_true_color.jpg',
    source: 'NASA/MESSENGER',
    tier: 'iconic',
  },
  'Venus': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/' +
         'PIA23791-Venus-NewlyProcessedView-20200608.jpg/400px-PIA23791-Venus-' +
         'NewlyProcessedView-20200608.jpg',
    source: 'NASA/Mariner',
    tier: 'iconic',
  },
  'Mars': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/' +
         'Mars_-_August_30_2021_-_Flickr_-_Kevin_M._Gill.png/400px-Mars_-_August_30_2021' +
         '_-_Flickr_-_Kevin_M._Gill.png',
    source: 'NASA/Hubble',
    tier: 'iconic',
  },
  'Jupiter': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/' +
         'Jupiter_New_Horizons.jpg/400px-Jupiter_New_Horizons.jpg',
    source: 'NASA/New Horizons',
    tier: 'iconic',
  },
  'Saturn': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/' +
         'Saturn_during_Equinox.jpg/400px-Saturn_during_Equinox.jpg',
    source: 'NASA/Cassini',
    tier: 'iconic',
  },
  'Uranus': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/' +
         'Uranus_as_seen_by_NASA%27s_Voyager_2_%28reprocessed%29_-_JPEG_converted.jpg/' +
         '400px-Uranus_as_seen_by_NASA%27s_Voyager_2_%28reprocessed%29_-_JPEG_converted.jpg',
    source: 'NASA/Voyager',
    tier: 'iconic',
  },
  'Neptune': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/' +
         'Neptune_Voyager2_color_calibrated.png/400px-Neptune_Voyager2_color_calibrated.png',
    source: 'NASA/Voyager',
    tier: 'iconic',
  },
  'Pluto': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/' +
         'Pluto_in_True_Color_-_High-Res.jpg/400px-Pluto_in_True_Color_-_High-Res.jpg',
    source: 'NASA/New Horizons',
    tier: 'iconic',
  },
};

/**
 * Famous stars that should have dynamic image lookup.
 * @const {!Array<string>}
 */
const FAMOUS_STARS = [
  'Sirius', 'Betelgeuse', 'Rigel', 'Vega', 'Arcturus', 'Capella', 'Aldebaran',
  'Antares', 'Polaris', 'Deneb', 'Altair', 'Procyon', 'Canopus', 'Achernar',
  'Fomalhaut', 'Regulus', 'Pollux', 'Castor',
];

/**
 * ImageRenderer manages deep sky object image sprites.
 */
export class ImageRenderer {
  /**
   * Creates a new ImageRenderer instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {!THREE.Group} dependencies.celestialSphere - Celestial sphere group
   * @param {function(): !Array<!Object>} dependencies.getDSOs - Get deep sky objects array
   * @param {!THREE.Camera} dependencies.camera - Camera reference
   * @param {!THREE.WebGLRenderer} dependencies.renderer - WebGL renderer
   * @param {boolean} dependencies.isMobile - Mobile device flag
   * @param {function(): void=} dependencies.requestRender - Request render callback
   */
  constructor(dependencies) {
    /** @private @const */
    this.celestialSphere_ = dependencies.celestialSphere;

    /** @private @const */
    this.getDSOs_ = dependencies.getDSOs;

    /** @private @const */
    this.camera_ = dependencies.camera;

    /** @private @const */
    this.renderer_ = dependencies.renderer;

    /** @private @const */
    this.isMobile_ = dependencies.isMobile || false;

    /** @private @const */
    this.requestRender_ = dependencies.requestRender || (() => {});

    /** @private {!Array<!THREE.Sprite>} */
    this.imageSprites_ = [];

    /** @private {!THREE.TextureLoader} */
    this.textureLoader_ = new THREE.TextureLoader();

    /** @private {!Map<string, Object>} */
    this.dynamicImageCache_ = new Map();

    /** @private {boolean} */
    this.dynamicLoadInProgress_ = false;

    /** @private {number} */
    this.lastDynamicImageLoad_ = 0;

    /** @private {?THREE.Sprite} */
    this.bestCandidateSprite_ = null;

    /** @private {number} */
    this.bestCandidateSize_ = 0;

    /** @private {boolean} */
    this.fetchingForPanel_ = false;

    /** @private {!THREE.Vector3} */
    this.tempVec3_ = new THREE.Vector3();

    /** @private {!THREE.Vector3} */
    this.tempVec3B_ = new THREE.Vector3();

    /** @private {number} */
    this.radius_ = 99; // Slightly closer than stars (100) to render in front
  }

  /**
   * Get all image sprites.
   * @returns {!Array<!THREE.Sprite>} Image sprites array
   */
  getImageSprites() {
    return this.imageSprites_;
  }

  /**
   * Get curated image database.
   * @returns {!Object} Curated images object
   */
  getCuratedImageDatabase() {
    return CURATED_IMAGES;
  }

  /**
   * Create image sprites for deep sky objects.
   */
  create() {
    // Clear existing sprites
    this.imageSprites_.forEach((sprite) => {
      if (sprite.material) {
        if (sprite.material.map) sprite.material.map.dispose();
        sprite.material.dispose();
      }
      this.celestialSphere_.remove(sprite);
    });
    this.imageSprites_ = [];

    const curatedDb = this.getCuratedImageDatabase();
    const messierKeys = Object.keys(curatedDb)
      .filter((k) => k.startsWith('M') && /^M\d+$/.test(k))
      .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
    console.log('📚 Curated Messier objects:', messierKeys.join(', '));

    const getImageUrl = (key) => {
      const entry = curatedDb[key];
      if (!entry) return null;
      return typeof entry === 'string' ? entry : entry.url;
    };

    const dsos = this.getDSOs_();
    dsos.forEach((dso) => {
      // Check for Messier, NGC or IC name
      const messierName = dso.messier ? `M${Math.floor(dso.messier)}` : null;
      const ngcMatch = dso.name && dso.name.match(/^NGC(\d+)/);
      const ngcName = ngcMatch ? `NGC${parseInt(ngcMatch[1])}` : null;
      const icMatch = dso.name && dso.name.match(/^IC(\d+)/);
      const icName = icMatch ? `IC${parseInt(icMatch[1])}` : null;

      // Determine which name to use (priority: Messier > NGC > IC)
      const staticObjectName = (messierName && getImageUrl(messierName)) ? messierName :
        (ngcName && getImageUrl(ngcName)) ? ngcName :
        (icName && getImageUrl(icName)) ? icName : null;
      const staticImageUrl = staticObjectName ? getImageUrl(staticObjectName) : null;
      const dynamicObjectName = messierName || ngcName || icName;
      const isTargetType = DYNAMIC_TARGET_TYPES.includes(dso.type);

      if (staticObjectName && staticImageUrl) {
        this.createStaticImageSprite_(dso, staticObjectName, staticImageUrl);
      } else if (dynamicObjectName && isTargetType) {
        this.createDynamicPlaceholder_(dso, dynamicObjectName);
      }
    });
  }

  /**
   * Create a sprite with a static (curated) image.
   * @param {!Object} dso - Deep sky object data
   * @param {string} objectName - Object name
   * @param {string} imageUrl - Image URL
   * @private
   */
  createStaticImageSprite_(dso, objectName, imageUrl) {
    const pos = raDecToCartesian(dso.ra, dso.dec, this.radius_);

    this.textureLoader_.load(
      imageUrl,
      (texture) => {
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        const imgWidth = texture.image?.naturalWidth || texture.image?.width || 1;
        const imgHeight = texture.image?.naturalHeight || texture.image?.height || 1;
        const aspectRatio = imgWidth / imgHeight;

        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
          depthTest: false,
          sizeAttenuation: true,
        });
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(pos);
        sprite.renderOrder = 10;

        const angularSizeArcmin = dso.size_major || 10;
        const angularSizeRad = THREE.MathUtils.degToRad(angularSizeArcmin / 60);
        const baseSize = this.radius_ * angularSizeRad * 2 * 3;

        sprite.userData = {
          object: dso,
          objectName,
          angularSizeArcmin,
          baseSize,
          aspectRatio,
          needsDynamicLoad: false,
        };

        if (aspectRatio >= 1) {
          sprite.scale.set(baseSize, baseSize / aspectRatio, 1);
        } else {
          sprite.scale.set(baseSize * aspectRatio, baseSize, 1);
        }

        if (dso.pos_angle !== undefined && dso.pos_angle !== null) {
          sprite.material.rotation = -THREE.MathUtils.degToRad(dso.pos_angle);
        }

        sprite.visible = true;
        sprite.material.opacity = 0.1;

        this.celestialSphere_.add(sprite);
        this.imageSprites_.push(sprite);

        console.log(
          `✓ Loaded image for ${objectName} ` +
          `(size: ${angularSizeArcmin.toFixed(1)}', baseSize: ${baseSize.toFixed(3)})`
        );
      },
      undefined,
      () => {
        console.warn(`Static image failed for ${objectName}, will try dynamic loading`);
        this.createDynamicPlaceholder_(dso, objectName);
      }
    );
  }

  /**
   * Create a placeholder sprite for dynamic loading.
   * @param {!Object} dso - Deep sky object data
   * @param {string} objectName - Object name
   * @private
   */
  createDynamicPlaceholder_(dso, objectName) {
    const pos = raDecToCartesian(dso.ra, dso.dec, this.radius_);
    const angularSizeArcmin = dso.size_major || 10;
    const angularSizeRad = THREE.MathUtils.degToRad(angularSizeArcmin / 60);
    const baseSize = this.radius_ * angularSizeRad * 2 * 3;

    const material = new THREE.SpriteMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: true,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(pos);
    sprite.renderOrder = 10;
    sprite.scale.set(baseSize, baseSize, 1);
    sprite.visible = false;

    sprite.userData = {
      object: dso,
      objectName,
      angularSizeArcmin,
      baseSize,
      needsDynamicLoad: true,
      dynamicLoadAttempted: false,
    };

    if (dso.pos_angle !== undefined && dso.pos_angle !== null) {
      sprite.material.rotation = -THREE.MathUtils.degToRad(dso.pos_angle);
    }

    this.celestialSphere_.add(sprite);
    this.imageSprites_.push(sprite);
  }

  /**
   * Update visibility of image sprites based on zoom level.
   */
  updateVisibility() {
    if (!this.imageSprites_ || this.imageSprites_.length === 0) return;

    const fov = this.camera_.fov;
    const canvasHeight = this.renderer_.domElement.height;
    const pixelsPerDeg = canvasHeight / fov;

    this.bestCandidateSprite_ = null;
    this.bestCandidateSize_ = 0;

    this.camera_.getWorldDirection(this.tempVec3B_);

    this.imageSprites_.forEach((sprite) => {
      if (!sprite.userData) return;

      // Check if sprite is in the camera's field of view
      sprite.getWorldPosition(this.tempVec3_);
      const toSpriteX = this.tempVec3_.x - this.camera_.position.x;
      const toSpriteY = this.tempVec3_.y - this.camera_.position.y;
      const toSpriteZ = this.tempVec3_.z - this.camera_.position.z;
      const len = Math.sqrt(
        toSpriteX * toSpriteX + toSpriteY * toSpriteY + toSpriteZ * toSpriteZ
      );
      const dot = (toSpriteX / len) * this.tempVec3B_.x +
            (toSpriteY / len) * this.tempVec3B_.y +
            (toSpriteZ / len) * this.tempVec3B_.z;

      const margin = Math.min(5, fov);
      const fovHalfRad = THREE.MathUtils.degToRad(fov / 2 + margin);
      const cosFovThreshold = Math.cos(fovHalfRad);

      if (dot < cosFovThreshold) {
        sprite.material.opacity = 0;
        sprite.visible = false;
        return;
      }

      const angularSizeArcmin = sprite.userData.angularSizeArcmin || 10;
      const angularSizeDeg = angularSizeArcmin / 60;
      const realSizePixels = angularSizeDeg * pixelsPerDeg;

      const screenSize = Math.min(window.innerWidth, window.innerHeight);
      const showThreshold = this.isMobile_ ? 0.9 : 0.65;
      const fullOpacityThreshold = this.isMobile_ ? 1.1 : 0.85;
      const fadeOutStartThreshold = this.isMobile_ ? 2.0 : 1.2;
      const fadeOutEndThreshold = this.isMobile_ ? 3.0 : 1.8;

      const minPixelsToShow = screenSize * showThreshold;
      const showImage = realSizePixels >= minPixelsToShow;

      if (showImage) {
        if (sprite.userData.needsDynamicLoad && !sprite.userData.dynamicLoadAttempted) {
          if (!this.dynamicLoadInProgress_) {
            if (realSizePixels > this.bestCandidateSize_) {
              this.bestCandidateSprite_ = sprite;
              this.bestCandidateSize_ = realSizePixels;
            }
          }
        }

        const worldSize = (realSizePixels / canvasHeight) * 2 * this.radius_ *
          Math.tan(THREE.MathUtils.degToRad(fov / 2));
        const aspectRatio = sprite.userData.aspectRatio || 1;
        if (aspectRatio >= 1) {
          sprite.scale.set(worldSize, worldSize / aspectRatio, 1);
        } else {
          sprite.scale.set(worldSize * aspectRatio, worldSize, 1);
        }

        const fadeInStart = minPixelsToShow;
        const fadeInEnd = screenSize * fullOpacityThreshold;
        const fadeOutStart = screenSize * fadeOutStartThreshold;
        const fadeOutEnd = screenSize * fadeOutEndThreshold;

        let opacity = 0;
        if (realSizePixels < fadeInEnd) {
          opacity = (realSizePixels - fadeInStart) / (fadeInEnd - fadeInStart);
        } else if (realSizePixels < fadeOutStart) {
          opacity = 1;
        } else {
          opacity = 1 - (realSizePixels - fadeOutStart) / (fadeOutEnd - fadeOutStart);
        }
        opacity = clamp(opacity * 0.9, 0, 0.9);

        sprite.material.opacity = opacity;
        sprite.visible = opacity > 0.05 && sprite.material.map !== null;
      } else {
        sprite.material.opacity = 0;
        sprite.visible = false;
      }
    });

    // Load the single most-centered object with cooldown
    const now = performance.now();
    const cooldownMs = 2000;
    if (
      this.bestCandidateSprite_ &&
      !this.dynamicLoadInProgress_ &&
      (!this.lastDynamicImageLoad_ || now - this.lastDynamicImageLoad_ > cooldownMs)
    ) {
      this.lastDynamicImageLoad_ = now;
      this.triggerDynamicLoad_(this.bestCandidateSprite_);
    }
  }

  /**
   * Trigger dynamic image loading for a sprite.
   * @param {!THREE.Sprite} sprite - Sprite to load image for
   * @private
   */
  async triggerDynamicLoad_(sprite) {
    const objectName = sprite.userData.objectName;
    const dso = sprite.userData.object;
    sprite.userData.dynamicLoadAttempted = true;
    this.dynamicLoadInProgress_ = true;

    console.log(`🔍 Loading image for: ${objectName}`);

    const result = await this.fetchBestImage(
      objectName,
      dso?.ra,
      dso?.dec,
      dso?.type,
      dso?.size_major
    );

    if (!result?.url) {
      sprite.userData.needsDynamicLoad = false;
      this.dynamicLoadInProgress_ = false;
      return;
    }

    // Skip size check for trusted sources
    const trustedSources = ['ESA/Hubble', 'NASA', 'NASA/Webb', 'NASA/Hubble', 'Curated', 'DSS'];
    const isTrusted = trustedSources.includes(result.source) ||
      result.url?.includes('esahubble.org') ||
      result.url?.includes('nasa.gov');

    if (!isTrusted) {
      const maxSize = 1024 * 1024; // 1MB
      try {
        const headResponse = await fetch(result.url, {method: 'HEAD'});
        const contentLength = parseInt(headResponse.headers.get('content-length') || '0', 10);
        if (contentLength > maxSize) {
          console.log(
            `⚠️ Skipping image for ${objectName}: ` +
            `${(contentLength / 1024 / 1024).toFixed(2)}MB exceeds 1MB limit`
          );
          sprite.userData.needsDynamicLoad = false;
          this.dynamicLoadInProgress_ = false;
          return;
        }
      } catch (e) {
        // If HEAD fails, proceed anyway
      }
    }

    this.textureLoader_.load(
      result.url,
      (texture) => {
        const imgWidth = texture.image?.naturalWidth || texture.image?.width || 0;
        const imgHeight = texture.image?.naturalHeight || texture.image?.height || 0;

        if (imgWidth > 0 && imgHeight > 0) {
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          sprite.material.map = texture;
          sprite.material.needsUpdate = true;
          sprite.userData.needsDynamicLoad = false;
          sprite.userData.imageSource = result.source;
          sprite.userData.imageTier = result.tier;
          sprite.userData.aspectRatio = imgWidth / imgHeight;

          console.log(
            `✓ Loaded image for ${objectName} (aspect: ${sprite.userData.aspectRatio.toFixed(2)})`
          );
        } else {
          console.warn(`⚠️ Texture has no dimensions for ${objectName}`);
          sprite.userData.needsDynamicLoad = false;
        }
        this.dynamicLoadInProgress_ = false;
      },
      () => {},
      (error) => {
        console.warn(
          `❌ Failed to load texture for ${objectName}:`,
          error?.message || 'Unknown error'
        );

        // Try DSS fallback
        if (dso?.ra !== undefined && dso?.dec !== undefined && result.source !== 'DSS') {
          console.log(`🔄 Trying DSS fallback for ${objectName}`);
          const dssUrl = this.getSkyViewImageUrl(dso.ra, dso.dec, dso.type, dso.size_major);

          this.textureLoader_.load(
            dssUrl,
            (texture) => {
              const w = texture.image?.naturalWidth || texture.image?.width || 0;
              const h = texture.image?.naturalHeight || texture.image?.height || 0;

              if (w > 0 && h > 0) {
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                sprite.material.map = texture;
                sprite.material.needsUpdate = true;
                sprite.userData.imageSource = 'DSS';
                sprite.userData.imageTier = 'vintage';
                sprite.userData.aspectRatio = w / h;
                console.log(`✓ Loaded DSS fallback for ${objectName}`);
              }
              sprite.userData.needsDynamicLoad = false;
              this.dynamicLoadInProgress_ = false;
            },
            undefined,
            () => {
              console.warn(`❌ DSS fallback also failed for ${objectName}`);
              sprite.userData.needsDynamicLoad = false;
              this.dynamicLoadInProgress_ = false;
            }
          );
        } else {
          sprite.userData.needsDynamicLoad = false;
          this.dynamicLoadInProgress_ = false;
        }
      }
    );
  }

  /**
   * Unified image fetching from multiple astronomical sources.
   * @param {?string} objectName - Object identifier
   * @param {number=} ra - Right ascension in degrees
   * @param {number=} dec - Declination in degrees
   * @param {string=} type - Object type
   * @param {number=} angularSizeArcmin - Angular size in arcminutes
   * @returns {!Promise<?{url: string, source: string, tier: string}>}
   */
  async fetchBestImage(objectName, ra, dec, type, angularSizeArcmin = null) {
    console.log(
      `fetchBestImage called: name=${objectName}, ra=${ra}, dec=${dec}, type=${type}`
    );

    const normalizedName = objectName?.trim();
    const cacheKey = normalizedName ||
      (ra !== undefined && dec !== undefined ? `${ra.toFixed(3)}_${dec.toFixed(3)}` : 'unknown');

    let skipToFallback = false;

    // Check curated images first
    const curatedImage = getCuratedImage(normalizedName);
    if (curatedImage) {
      const url = typeof curatedImage === 'string' ? curatedImage : curatedImage.url;
      if (url === null) {
        console.log(`⊘ No curated image for ${normalizedName}, will try DSS fallback`);
        skipToFallback = true;
      } else {
        const source = typeof curatedImage === 'string' ? 'Curated' : (curatedImage.source || 'Curated');
        const tier = typeof curatedImage === 'string' ? 'high' : (curatedImage.tier || 'high');
        const result = {url, loading: false, source, tier};
        this.dynamicImageCache_.set(cacheKey, result);
        console.log(`✓ Using curated image for ${normalizedName}`);
        return result;
      }
    }

    // Check cache
    if (this.dynamicImageCache_.has(cacheKey) && !skipToFallback) {
      const cached = this.dynamicImageCache_.get(cacheKey);
      if (!cached.loading) {
        console.log(`Cache hit for ${cacheKey}: ${cached.source || 'no image'}`);
        return cached;
      }
      return null;
    } else if (skipToFallback && this.dynamicImageCache_.has(cacheKey)) {
      this.dynamicImageCache_.delete(cacheKey);
    }

    // Limit cache size
    if (this.dynamicImageCache_.size > 200) {
      const keysToRemove = Array.from(this.dynamicImageCache_.keys()).slice(0, 50);
      keysToRemove.forEach((key) => this.dynamicImageCache_.delete(key));
    }

    this.dynamicImageCache_.set(cacheKey, {url: null, loading: true, source: null});

    // Check special objects (planets)
    if (normalizedName && SPECIAL_OBJECTS[normalizedName]) {
      const special = SPECIAL_OBJECTS[normalizedName];
      const result = {url: special.url, loading: false, source: special.source, tier: special.tier};
      this.dynamicImageCache_.set(cacheKey, result);
      console.log(`Using dedicated image for ${normalizedName}`);
      return result;
    }

    // Determine object category
    const isCatalogObject = objectName?.match(/^(IC|NGC|M)\d+$/i);
    const isDeepSkyObject = type && DYNAMIC_TARGET_TYPES.includes(type);
    const isStar = type === 'Star' || type === '*' || (!type && !isCatalogObject);
    const isFamousStar = isStar && normalizedName &&
      FAMOUS_STARS.some((s) => normalizedName.toLowerCase().includes(s.toLowerCase()));
    const skipApiSearch = isStar && !isFamousStar;

    // Format search name
    let searchName = objectName || '';
    if (searchName.startsWith('M') && /^M\d+$/.test(searchName)) {
      searchName = searchName.replace(/^M(\d+)$/, 'messier $1');
    } else {
      searchName = searchName.replace(/([A-Za-z]+)(\d+)/, '$1 $2').trim();
    }

    // Log curated misses
    if (/^(M|NGC|IC)\d+$/i.test(normalizedName) && !skipToFallback) {
      console.log(
        `⚠️ No curated image for "${normalizedName}" (${getCuratedImageKeys().length} total curated images)`
      );
    }

    // Tier 1: NASA Images API
    if (objectName && !isStar && !skipToFallback) {
      const nasaResult = await this.searchNasaImages_(objectName, searchName, isDeepSkyObject, isCatalogObject);
      if (nasaResult) {
        this.dynamicImageCache_.set(cacheKey, nasaResult);
        return nasaResult;
      }
    }

    // Tier 2: Wikimedia Commons
    if (objectName && !isStar && !skipToFallback) {
      const wikiResult = await this.searchWikimedia_(objectName, isDeepSkyObject, type);
      if (wikiResult) {
        this.dynamicImageCache_.set(cacheKey, wikiResult);
        return wikiResult;
      }
    }

    // Tier 3: DSS (Digitized Sky Survey)
    const allowDssForStar = isStar && this.fetchingForPanel_;
    if (ra !== undefined && dec !== undefined && (!isStar || allowDssForStar)) {
      const dssUrl = this.getSkyViewImageUrl(ra, dec, type, angularSizeArcmin);
      console.log(`📜 Using DSS fallback for ${objectName || 'coordinates'}`);
      const result = {url: dssUrl, loading: false, source: 'DSS', tier: 'vintage'};
      this.dynamicImageCache_.set(cacheKey, result);
      return result;
    }

    // No image available
    console.log(`No image available for ${objectName} (type=${type})`);
    const result = {url: null, loading: false, source: null, tier: null};
    this.dynamicImageCache_.set(cacheKey, result);
    return result;
  }

  /**
   * Search NASA Images API for astronomical images.
   * @param {string} objectName - Object name
   * @param {string} searchName - Search-formatted name
   * @param {boolean} isDeepSkyObject - Is this a DSO
   * @param {boolean} isCatalogObject - Is this a catalog object
   * @returns {!Promise<?{url: string, source: string, tier: string}>}
   * @private
   */
  async searchNasaImages_(objectName, searchName, isDeepSkyObject, isCatalogObject) {
    try {
      let nasaSearchTerm = searchName;
      if (isDeepSkyObject) {
        nasaSearchTerm = `${searchName} astronomy`;
      }

      const response = await fetch(
        `https://images-api.nasa.gov/search?q=${encodeURIComponent(nasaSearchTerm)}&media_type=image`
      );
      const data = await response.json();

      if (!data.collection?.items?.length) return null;

      const checkRelevance = (title, desc, keywords) => {
        const titleLower = title.toLowerCase();
        const descLower = desc.toLowerCase();
        const keywordsLower = keywords.toLowerCase();

        const catalogMatch = objectName.match(/^(IC|NGC|M)(\d+)$/i);
        if (catalogMatch) {
          const prefix = catalogMatch[1].toLowerCase();
          const number = catalogMatch[2];
          const patterns = [`${prefix}${number}`, `${prefix} ${number}`, `${prefix}-${number}`];
          for (const pattern of patterns) {
            if (titleLower.includes(pattern) || descLower.includes(pattern) ||
                keywordsLower.includes(pattern)) {
              return true;
            }
          }
        }

        const searchLower = objectName.toLowerCase().replace(/\s+/g, '');
        const titleNoSpace = titleLower.replace(/\s+/g, '');
        const descNoSpace = descLower.replace(/\s+/g, '');

        return titleNoSpace.includes(searchLower) || descNoSpace.includes(searchLower) ||
          keywordsLower.includes(objectName.toLowerCase());
      };

      // Look for Webb or Hubble images first
      for (const item of data.collection.items) {
        const desc = item.data?.[0]?.description || '';
        const title = item.data?.[0]?.title || '';
        const keywords = (item.data?.[0]?.keywords || []).join(' ');

        if (!checkRelevance(title, desc, keywords)) continue;

        const descLower = desc.toLowerCase();
        const titleLower = title.toLowerCase();
        const isWebb = descLower.includes('webb') || titleLower.includes('webb') || descLower.includes('jwst');
        const isHubble = descLower.includes('hubble') || titleLower.includes('hubble') || descLower.includes('hst');

        const previewLink = item.links?.find((link) => link.rel === 'preview');
        if (previewLink?.href && (isWebb || isHubble)) {
          const tier = isWebb ? 'Webb' : 'Hubble';
          console.log(`✨ Found ${tier} image for ${objectName}`);
          return {url: previewLink.href, loading: false, source: `NASA/${tier}`, tier: 'iconic'};
        }
      }

      // Fall back to any relevant NASA image
      for (const item of data.collection.items) {
        const desc = item.data?.[0]?.description || '';
        const title = item.data?.[0]?.title || '';
        const keywords = (item.data?.[0]?.keywords || []).join(' ');

        if (!checkRelevance(title, desc, keywords)) continue;

        const previewLink = item.links?.find((link) => link.rel === 'preview');
        if (previewLink?.href) {
          console.log(`Found NASA image for ${objectName}`);
          return {url: previewLink.href, loading: false, source: 'NASA', tier: 'high'};
        }
      }

      // Last resort for catalog objects
      if (isCatalogObject && data.collection.items.length > 0) {
        const firstItem = data.collection.items[0];
        const previewLink = firstItem.links?.find((link) => link.rel === 'preview');
        if (previewLink?.href) {
          console.log(`Found NASA image for ${objectName} (first result)`);
          return {url: previewLink.href, loading: false, source: 'NASA', tier: 'high'};
        }
      }
    } catch (error) {
      console.warn(`NASA API failed for ${objectName}:`, error.message);
    }

    return null;
  }

  /**
   * Search Wikimedia Commons for astronomical images.
   * @param {string} objectName - Object name
   * @param {boolean} isDeepSkyObject - Is this a DSO
   * @param {string=} type - Object type
   * @returns {!Promise<?{url: string, source: string, tier: string}>}
   * @private
   */
  async searchWikimedia_(objectName, isDeepSkyObject, type) {
    try {
      const wikiSearchName = objectName.replace(/([A-Za-z]+)(\d+)/, '$1 $2').trim();

      let wikiSearchQuery = wikiSearchName;
      if (isDeepSkyObject) {
        const typeTerms = {
          'G': 'galaxy',
          'Neb': 'nebula',
          'PN': 'planetary nebula',
          'EmN': 'emission nebula',
          'HII': 'nebula',
          'Cl+N': 'cluster nebula',
          'RfN': 'reflection nebula',
          'SNR': 'supernova remnant',
          'GCl': 'globular cluster',
          'OCl': 'open cluster',
        };
        const typeTerm = typeTerms[type] || '';
        wikiSearchQuery = `${wikiSearchName} ${typeTerm} astronomy`;
      } else {
        wikiSearchQuery = `${wikiSearchName} astronomy space`;
      }

      const wikiResponse = await fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
        `&gsrsearch=${encodeURIComponent(wikiSearchQuery)}&gsrlimit=10` +
        `&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=400&format=json&origin=*`
      );
      const wikiData = await wikiResponse.json();

      if (!wikiData.query?.pages) return null;

      const pages = Object.values(wikiData.query.pages).sort((a, b) => (a.index || 0) - (b.index || 0));

      const checkWikiRelevance = (pageTitle) => {
        const titleLower = pageTitle.toLowerCase();

        const catalogMatch = objectName.match(/^(IC|NGC|M)(\d+)$/i);
        if (catalogMatch) {
          const prefix = catalogMatch[1].toLowerCase();
          const number = catalogMatch[2];
          const patterns = [`${prefix}${number}`, `${prefix} ${number}`, `${prefix}-${number}`, `${prefix}_${number}`];
          for (const pattern of patterns) {
            if (titleLower.includes(pattern)) return true;
          }
        }

        const searchLower = objectName.toLowerCase().replace(/\s+/g, '');
        const titleNoSpace = titleLower.replace(/\s+/g, '');
        return titleNoSpace.includes(searchLower);
      };

      const maxOriginalSize = 20 * 1024 * 1024;

      // First pass: look for official observatory images
      for (const page of pages) {
        const imageInfo = page.imageinfo?.[0];
        const thumbUrl = imageInfo?.thumburl;
        const originalSize = imageInfo?.size || 0;
        const metadata = imageInfo?.extmetadata;
        const artist = metadata?.Artist?.value || '';
        const pageTitle = page.title || '';

        if (!checkWikiRelevance(pageTitle)) continue;
        if (originalSize > maxOriginalSize) continue;

        if (thumbUrl && !thumbUrl.includes('.svg') && !thumbUrl.includes('Map') && !thumbUrl.includes('map')) {
          const isSubaru = artist.includes('Subaru') || artist.includes('NAOJ') ||
            artist.includes('National Astronomical Observatory of Japan');
          const isOfficial = artist.includes('ESO') || artist.includes('ESA') ||
            artist.includes('NASA') || artist.includes('Hubble') || isSubaru;

          if (isOfficial) {
            const source = isSubaru ? 'Wikimedia/Subaru' : 'Wikimedia/ESO';
            console.log(`Found Wikimedia (official) image for ${objectName}`);
            return {url: thumbUrl, loading: false, source, tier: 'high'};
          }
        }
      }

      // Second pass: any relevant image
      for (const page of pages) {
        const imageInfo = page.imageinfo?.[0];
        const thumbUrl = imageInfo?.thumburl;
        const originalSize = imageInfo?.size || 0;
        const pageTitle = page.title || '';

        if (!checkWikiRelevance(pageTitle)) continue;
        if (originalSize > maxOriginalSize) continue;

        if (thumbUrl && !thumbUrl.includes('.svg') && !thumbUrl.includes('Map')) {
          console.log(`Found Wikimedia image for ${objectName}`);
          return {url: thumbUrl, loading: false, source: 'Wikimedia', tier: 'medium'};
        }
      }
    } catch (error) {
      console.warn(`Wikimedia API failed for ${objectName}:`, error.message);
    }

    return null;
  }

  /**
   * Generate DSS/CDS HiPS image URL.
   * @param {number} ra - Right ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {string=} type - Object type
   * @param {number=} angularSizeArcmin - Angular size in arcminutes
   * @returns {string} Image URL
   */
  getSkyViewImageUrl(ra, dec, type, angularSizeArcmin = null) {
    let fov;

    if (angularSizeArcmin && angularSizeArcmin > 0) {
      fov = (angularSizeArcmin * 1.3) / 60;
      fov = clamp(fov, 0.05, 5.0);
    } else if (type === 'Star') {
      fov = 0.1;
    } else if (type === 'Galaxy' || type === 'Nebula' || type === 'G') {
      fov = 0.5;
    } else if (type === 'Globular Cluster' || type === 'Open Cluster' || type === 'GCl' || type === 'OCl') {
      fov = 0.3;
    } else if (type === 'Planetary Nebula' || type === 'PN') {
      fov = 0.15;
    } else if (type === 'Neb' || type === 'EmN' || type === 'HII' || type === 'Cl+N' || type === 'RfN' || type === 'SNR') {
      fov = 0.5;
    } else {
      fov = 0.25;
    }

    const sizePixels = 512;

    return `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?` +
      `hips=CDS%2FP%2FDSS2%2Fcolor&ra=${ra.toFixed(5)}&dec=${dec.toFixed(5)}` +
      `&fov=${fov.toFixed(4)}&width=${sizePixels}&height=${sizePixels}&format=jpg`;
  }

  /**
   * Get curated image URL for an object.
   * @param {!Object} obj - Object with name/proper properties
   * @returns {?string} Image URL or null
   */
  getObjectImageUrl(obj) {
    const name = obj.name || obj.proper || '';
    if (!name) return null;

    const curatedImage = getCuratedImage(name);
    if (curatedImage) {
      return typeof curatedImage === 'string' ? curatedImage : curatedImage.url;
    }

    if (obj.proper && obj.proper !== name) {
      const properImage = getCuratedImage(obj.proper);
      if (properImage) {
        return typeof properImage === 'string' ? properImage : properImage.url;
      }
    }

    return null;
  }

  /**
   * Set whether we're fetching for the info panel.
   * @param {boolean} value - Panel fetch mode
   */
  setFetchingForPanel(value) {
    this.fetchingForPanel_ = value;
  }

  /**
   * Dispose of all resources.
   */
  dispose() {
    this.imageSprites_.forEach((sprite) => {
      if (sprite.material) {
        if (sprite.material.map) sprite.material.map.dispose();
        sprite.material.dispose();
      }
      this.celestialSphere_.remove(sprite);
    });
    this.imageSprites_ = [];
    this.dynamicImageCache_.clear();
  }
}
