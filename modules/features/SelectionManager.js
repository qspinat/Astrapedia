/**
 * @fileoverview Selection manager for celestial objects.
 * Handles object selection, highlighting, and info panel display.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {escapeHtml, fetchWikipedia} from '../core/SecurityUtils.js';
import {getDsoTypeName} from '../core/TypeMappings.js';
import {descriptionGenerator} from '../data/DescriptionGenerator.js';
import {getConstellationStory} from '../data/ConstellationStories.js';
import {createLogger} from '../core/Logger.js';
import {domCache} from '../ui/DOMCache.js';

const logger = createLogger('SelectionManager');

/**
 * Resolve a search result into a canonical object by flattening raw data.
 * Search results are thin wrappers with only name/internalName/type/ra/dec/mag/data.
 * This merges the raw data (messier, common_names, size_major, etc.) into the
 * top-level object and normalizes `name` to the canonical internal key.
 * Safe to call on already-canonical objects (no-op if no `internalName`).
 *
 * Spread order: raw data first, then search entry fields win for overlaps.
 * This is intentional — `type` in search entries is the category string for
 * Stars/Planets/Constellations, and the raw DSO abbreviation (e.g., 'G', 'PN')
 * for deep sky objects. Both match what downstream consumers expect.
 *
 * @param {?Object} obj - Search result or raw object
 * @returns {?Object} Canonical object with all fields accessible at top level
 */
export function resolveCanonicalObject(obj) {
  if (obj?.data && obj.internalName !== undefined) {
    return {...obj.data, ...obj, name: obj.internalName};
  }
  return obj;
}

/**
 * SelectionManager handles object selection and info display.
 */
export class SelectionManager {
  /**
   * Creates a new SelectionManager instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(number, number): void=} dependencies.navigateToRaDec - Navigate to coords
   * @param {function(string): void=} dependencies.highlightConstellation - Highlight constellation
   * @param {function(): void=} dependencies.unhighlightConstellation - Unhighlight constellation
   * @param {function(number, number, number): void=} dependencies.showHighlight - Show highlight ring
   * @param {function(): void=} dependencies.hideHighlight - Hide highlight ring
   * @param {function(!Object): ?string=} dependencies.getImageUrl - Get object image URL
   * @param {function(string): void=} dependencies.openPanel - Open UI panel
   * @param {function(): void=} dependencies.closeAllPanels - Close all UI panels
   * @param {function(string): string=} dependencies.getConstellationAbbrev - Get abbreviation
   * @param {function(string): string=} dependencies.getConstellationName - Get localized name
   * @param {function(string): string=} dependencies.getEnglishConstellationName - Get English name
   * @param {function(): string=} dependencies.getConstellationLanguage - Get current language
   * @param {function(string): string=} dependencies.getConstellationFullName - Get full constellation name
   * @param {function(string, number, number, string, number): Promise=} dependencies.fetchBestImage - Fetch best image
   * @param {function(number, number, string, number): string=} dependencies.getSkyViewImageUrl - Get DSS image URL
   * @param {function(number, number): string=} dependencies.getConstellation - Get constellation at coords
   */
  constructor(dependencies = {}) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private {?Object} */
    this.selectedObject_ = null;

    /** @private {?number} */
    this.highlightTimeout_ = null;

    /** @private {?AbortController} - Controller for description fetch requests */
    this.descriptionAbortController_ = null;

    /** @private {?AbortController} - Controller for image fetch requests */
    this.imageAbortController_ = null;
  }

  /**
   * Get the currently selected object.
   * @returns {?Object} Selected object or null
   */
  getSelectedObject() {
    return this.selectedObject_;
  }

  /**
   * Select an object and display its info.
   * @param {?Object} obj - Object to select, or null to deselect
   */
  selectObject(obj) {
    obj = resolveCanonicalObject(obj);
    this.selectedObject_ = obj;

    // Abort any pending fetch requests from previous selection
    if (this.descriptionAbortController_) {
      this.descriptionAbortController_.abort();
      this.descriptionAbortController_ = null;
    }
    if (this.imageAbortController_) {
      this.imageAbortController_.abort();
      this.imageAbortController_ = null;
    }

    // Clear any existing highlight timeout
    if (this.highlightTimeout_) {
      clearTimeout(this.highlightTimeout_);
      this.highlightTimeout_ = null;
    }

    if (!obj) {
      // Deselect - hide info panel and any highlight
      this.deps_.unhighlightConstellation?.();
      this.deps_.hideHighlight?.();
      this.deps_.closeAllPanels?.();

      globalEventBus.emit(Events.OBJECT_DESELECTED, {});
      return;
    }

    // Navigate camera to object
    this.deps_.navigateToRaDec?.(obj.ra, obj.dec);

    // Handle constellations specially
    if (obj.type === 'Constellation') {
      const constellationKey = obj.internalName || obj.name;
      this.deps_.hideHighlight?.();
      this.deps_.highlightConstellation?.(constellationKey);
      this.showConstellationInfo_(constellationKey);
      this.deps_.openPanel?.('info-panel');

      globalEventBus.emit(Events.OBJECT_SELECTED, {
        object: obj,
        type: 'constellation',
      });
      return;
    }

    // Unhighlight any previously highlighted constellation
    this.deps_.unhighlightConstellation?.();

    // Show temporary highlight ring around the object
    const angularSize = obj.size_major || obj.angularSize || 20;
    this.deps_.showHighlight?.(obj.ra, obj.dec, angularSize);

    // Auto-hide the highlight after 4 seconds
    this.highlightTimeout_ = setTimeout(() => {
      this.deps_.hideHighlight?.();
      this.highlightTimeout_ = null;
    }, 4000);

    // Show info panel
    this.showObjectInfo_(obj);
    this.deps_.openPanel?.('info-panel');

    globalEventBus.emit(Events.OBJECT_SELECTED, {
      object: obj,
      type: obj.type,
    });
  }

  /**
   * Clear the current selection.
   */
  clearSelection() {
    this.selectObject(null);
  }

  /**
   * Get full name for a DSO type abbreviation.
   * @param {string} type - Type abbreviation
   * @returns {string} Full type name
   */
  getTypeFullName(type) {
    return getDsoTypeName(type);
  }

  /**
   * Format angular size for display.
   * @param {number} arcminMajor - Major axis in arcminutes
   * @param {number=} arcminMinor - Minor axis in arcminutes
   * @returns {string} Formatted size string
   * @private
   */
  formatAngularSize_(arcminMajor, arcminMinor) {
    let sizeStr;
    if (arcminMajor >= 60) {
      sizeStr = `${(arcminMajor / 60).toFixed(1)}°`;
    } else if (arcminMajor >= 1) {
      sizeStr = `${arcminMajor.toFixed(1)}'`;
    } else {
      sizeStr = `${(arcminMajor * 60).toFixed(1)}"`;
    }

    // Add minor axis if different
    if (arcminMinor && arcminMinor !== arcminMajor) {
      let minorStr;
      if (arcminMinor >= 60) {
        minorStr = `${(arcminMinor / 60).toFixed(1)}°`;
      } else if (arcminMinor >= 1) {
        minorStr = `${arcminMinor.toFixed(1)}'`;
      } else {
        minorStr = `${(arcminMinor * 60).toFixed(1)}"`;
      }
      sizeStr += ` × ${minorStr}`;
    }

    return sizeStr;
  }

  /**
   * Show object info in the info panel.
   * @param {!Object} obj - Object to display
   * @private
   */
  showObjectInfo_(obj) {
    const content = domCache.infoContent;
    if (!content) return;

    // Get display name with fallbacks
    const displayName = obj.name || obj.proper || 'Unknown Object';

    // Update panel header title
    const titleEl = domCache.objectTitle;
    if (titleEl) titleEl.textContent = displayName;

    let html = '';

    // Image container - will be populated with best available image
    html += `<div class="object-images">`;
    html += `<div class="object-image-container" id="main-image">`;
    html += `<div class="image-loading">Loading image...</div>`;
    html += `</div>`;
    html += `</div>`;

    // Object details
    const typeFullName = this.getTypeFullName(obj.type);
    html += `<p><strong>Type:</strong> ${escapeHtml(typeFullName)}</p>`;

    if (obj.subtype) {
      html += `<p><strong>Subtype:</strong> ${escapeHtml(this.getTypeFullName(obj.subtype))}</p>`;
    }

    html += `<p><strong>RA:</strong> ${obj.ra.toFixed(4)}°</p>`;
    html += `<p><strong>Dec:</strong> ${obj.dec.toFixed(4)}°</p>`;

    if (obj.mag !== undefined && obj.mag !== null) {
      html += `<p><strong>Magnitude:</strong> ${obj.mag.toFixed(1)}</p>`;
    }

    // Angular size
    if (obj.size_major) {
      const sizeStr = this.formatAngularSize_(obj.size_major, obj.size_minor);
      html += `<p><strong>Angular Size:</strong> ${sizeStr}</p>`;
    }

    // Distance
    if (obj.dist) {
      html += `<p><strong>Distance:</strong> ${obj.dist.toFixed(1)} parsecs</p>`;
    }

    // Spectral type
    if (obj.spect) {
      html += `<p><strong>Spectral Type:</strong> ${escapeHtml(obj.spect)}</p>`;
    }

    // Alternative names
    if (obj.common_names) {
      const names = Array.isArray(obj.common_names)
        ? obj.common_names.join(', ')
        : obj.common_names;
      html += `<p><strong>Also known as:</strong> ${escapeHtml(names)}</p>`;
    }

    // Messier number
    if (obj.messier) {
      html += `<p><strong>Messier:</strong> M${obj.messier}</p>`;
    }

    // Wikipedia link - use internal/English name for en.wikipedia lookup
    const wikiName = obj.internalName || displayName;
    html += `<div class="wiki-link-container">`;
    html += `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(wikiName)}" `;
    html += `target="_blank" rel="noopener noreferrer" class="wiki-link">`;
    html += `Learn more on Wikipedia</a>`;
    html += `</div>`;

    content.innerHTML = html;

    // Add extra object info (Moon phase, constellation, description)
    this.addExtraObjectInfo_(obj);
  }

  /**
   * Add extra object info features (Moon phase, constellation, Wikipedia).
   * @param {!Object} obj - Object being displayed
   * @private
   */
  addExtraObjectInfo_(obj) {
    const content = domCache.infoContent;
    if (!content) return;

    // Add Moon phase info
    if (obj.name === 'Moon' && obj.phase !== undefined) {
      const phasePercent = (obj.phase * 100).toFixed(0);
      const phases = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
        'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
      const thresholds = [0.03, 0.22, 0.28, 0.47, 0.53, 0.72, 0.78, 0.97];
      let phaseName = 'New Moon';
      for (let i = 0; i < thresholds.length; i++) {
        if (obj.phase < thresholds[i]) {
          phaseName = phases[i];
          break;
        }
      }
      const phaseEl = document.createElement('p');
      phaseEl.innerHTML = `<strong>Phase:</strong> ${phaseName} (${phasePercent}% illuminated)`;
      content.appendChild(phaseEl);
    }

    // Add constellation info
    const constName = this.deps_.getConstellation?.(obj.ra, obj.dec);
    if (constName) {
      const constEl = document.createElement('p');
      constEl.innerHTML = `<strong>Constellation:</strong> ${escapeHtml(constName)}`;
      content.appendChild(constEl);
    }

    // Add description placeholder and fetch
    let descEl = document.getElementById('object-description');
    if (!descEl) {
      descEl = document.createElement('div');
      descEl.id = 'object-description';
      descEl.className = 'object-description';
      descEl.innerHTML = '<em>Loading description...</em>';
      content.appendChild(descEl);
    }
    this.fetchObjectDescription_(obj);

    // Load best image
    const curatedImageUrl = this.deps_.getImageUrl?.(obj);
    this.loadBestImage_(obj, curatedImageUrl);
  }

  /**
   * Fetch object description from Wikipedia.
   * @param {!Object} obj - Object to fetch description for
   * @private
   */
  async fetchObjectDescription_(obj) {
    // Abort any pending description request
    if (this.descriptionAbortController_) {
      this.descriptionAbortController_.abort();
    }
    this.descriptionAbortController_ = new AbortController();
    const signal = this.descriptionAbortController_.signal;

    const descDiv = document.getElementById('object-description');
    if (!descDiv) return;

    // Build search terms for Wikipedia
    const searchTerms = descriptionGenerator.getWikipediaSearchTerms(obj);

    // For catalog stars without Wikipedia articles, generate a description from data
    if (searchTerms.length === 0) {
      const generated = descriptionGenerator.generateStarDescription(obj);
      if (generated) {
        descDiv.textContent = '';
        const p = document.createElement('p');
        p.className = 'wiki-description generated';
        p.textContent = generated;
        descDiv.appendChild(p);
        return;
      }
      const em = document.createElement('em');
      em.textContent = 'No description available for this catalog object.';
      descDiv.textContent = '';
      descDiv.appendChild(em);
      return;
    }

    for (const term of searchTerms) {
      try {
        const response = await fetchWikipedia(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`,
          signal
        );

        if (response.ok) {
          const data = await response.json();
          if (data.extract) {
            // Truncate to reasonable length
            let description = data.extract;
            if (description.length > 500) {
              description = description.substring(0, 500) + '...';
            }
            // Use DOM methods to prevent XSS from API response
            descDiv.textContent = '';
            const p = document.createElement('p');
            p.className = 'wiki-description';
            p.textContent = description;
            descDiv.appendChild(p);

            const wikiUrl = data.content_urls?.desktop?.page;
            if (wikiUrl) {
              const a = document.createElement('a');
              a.href = wikiUrl;
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              a.className = 'wiki-link';
              a.textContent = 'Read more on Wikipedia';
              descDiv.appendChild(a);
            }
            return;
          }
        }
      } catch (e) {
        // Handle abort gracefully - just return without logging
        if (e.name === 'AbortError') {
          return;
        }
        logger.warn(`Wikipedia fetch failed for ${term}:`, e);
      }
    }

    // No description found - try generating one for stars
    const generated = descriptionGenerator.generateStarDescription(obj);
    if (generated) {
      descDiv.textContent = '';
      const p = document.createElement('p');
      p.className = 'wiki-description generated';
      p.textContent = generated;
      descDiv.appendChild(p);
      return;
    }

    const em = document.createElement('em');
    em.textContent = 'No description available.';
    descDiv.textContent = '';
    descDiv.appendChild(em);
  }

  /**
   * Load best available image for object panel.
   * @param {!Object} obj - Object to load image for
   * @param {?string} curatedImageUrl - Pre-fetched curated image URL
   * @private
   */
  async loadBestImage_(obj, curatedImageUrl) {
    // Abort any pending image request
    if (this.imageAbortController_) {
      this.imageAbortController_.abort();
    }
    this.imageAbortController_ = new AbortController();
    const signal = this.imageAbortController_.signal;

    const container = document.getElementById('main-image');
    if (!container) return;

    // Show loading state
    container.innerHTML = '<div class="image-loading">Loading best available image...</div>';

    // Get object identifier - prefer catalog names from raw data or internalName
    // to avoid using localized display names (e.g., 'Galaxie du Sombrero')
    const raw = obj.data || obj;
    const objectName = raw.messier ? `M${Math.floor(raw.messier)}` :
      (raw.ngc ? `NGC${raw.ngc}` :
        (raw.ic ? `IC${raw.ic}` :
          (obj.internalName || obj.name)));

    // Use unified image fetcher to get the best available image
    // Pass forPanel=true to enable DSS fallback for stars
    let result;
    try {
      result = await this.deps_.fetchBestImage?.(
        objectName,
        obj.ra,
        obj.dec,
        obj.type,
        obj.size_major || obj.angularSize,
        true // forPanel - enables DSS for stars
      );
    } catch (e) {
      // Handle abort gracefully
      if (e.name === 'AbortError') {
        return;
      }
      throw e;
    }

    // Check if aborted while waiting
    if (signal.aborted) return;

    if (result?.url) {
      // Skip size check for trusted sources (already optimized)
      const trustedSources = ['ESA/Hubble', 'NASA', 'NASA/Webb', 'NASA/Hubble', 'Curated', 'DSS'];
      const isTrusted = trustedSources.includes(result.source) ||
        result.url?.includes('esahubble.org') ||
        result.url?.includes('nasa.gov') ||
        result.url?.includes('alasky.cds.unistra.fr');

      let skipDueToSize = false;
      if (!isTrusted) {
        // Check file size before loading (max 1MB) - only for untrusted sources
        const maxSize = 1024 * 1024;
        try {
          const headResponse = await fetch(result.url, {method: 'HEAD', signal});
          const contentLength = parseInt(headResponse.headers.get('content-length') || '0', 10);
          if (contentLength > maxSize) {
            logger.debug(`Skipping panel image: ${(contentLength / 1024 / 1024).toFixed(2)}MB exceeds 1MB limit`);
            skipDueToSize = true;
          }
        } catch (e) {
          // Handle abort gracefully
          if (e.name === 'AbortError') {
            return;
          }
          // If HEAD fails for other reasons, proceed anyway
        }
      }

      // Check if aborted while waiting
      if (signal.aborted) return;

      if (skipDueToSize) {
        // Try DSS fallback instead of showing nothing
        logger.debug(`Trying DSS fallback for ${objectName}`);
        const dssUrl = this.deps_.getSkyViewImageUrl?.(obj.ra, obj.dec, obj.type);
        if (dssUrl) {
          this.displayImage_(container, obj, dssUrl, 'DSS', 'tier-vintage',
            '📜 Digitized Sky Survey (fallback)');
          return;
        }
        this.displayUnavailable_(container);
        return;
      }

      // Map tier to display name
      const sourceDisplay = {
        'ESA/Hubble': '🔭 ESA/Hubble Space Telescope',
        'NASA/Webb': '🌟 James Webb Space Telescope',
        'NASA/Hubble': '🔭 Hubble Space Telescope',
        'NASA/SDO': '☀️ NASA Solar Dynamics Observatory',
        'NASA': '🚀 NASA Image Archive',
        'Wikimedia/ESO': '🌌 ESO/ESA via Wikimedia',
        'Wikimedia/Subaru': '🔭 Subaru Telescope (NAOJ)',
        'Wikimedia/Astrophoto': '📷 Astrophotography',
        'Wikimedia': '📷 Wikimedia Commons',
        'DSS': '📜 Digitized Sky Survey',
      };

      const tierClass = result.tier === 'iconic' ? 'tier-iconic' :
        result.tier === 'high' ? 'tier-high' :
          result.tier === 'survey' ? 'tier-survey' : 'tier-vintage';

      this.displayImage_(container, obj, result.url, result.source, tierClass,
        sourceDisplay[result.source] || result.source || 'Unknown source');
    } else {
      this.displayUnavailable_(container);
    }
  }

  /**
   * Display an image in the container.
   * @param {!Element} container - Container element
   * @param {!Object} obj - Object being displayed
   * @param {string} url - Image URL
   * @param {string} source - Source name
   * @param {string} tierClass - CSS class for tier
   * @param {string} sourceText - Display text for source
   * @private
   */
  displayImage_(container, obj, url, source, tierClass, sourceText) {
    container.textContent = '';

    const img = document.createElement('img');
    img.src = url;
    img.alt = obj.name || 'Celestial object';
    img.className = `object-image ${tierClass}`;
    img.onerror = () => {
      // Try DSS fallback if not already DSS and we have coordinates
      if (source !== 'DSS' && obj.ra !== undefined && obj.dec !== undefined) {
        logger.debug(`Image failed for ${obj.name}, trying DSS fallback`);
        const dssUrl = this.deps_.getSkyViewImageUrl?.(obj.ra, obj.dec, obj.type);
        if (dssUrl) {
          this.displayImage_(container, obj, dssUrl, 'DSS', 'tier-vintage',
            '📜 Digitized Sky Survey (fallback)');
          return;
        }
      }
      this.displayUnavailable_(container);
    };
    container.appendChild(img);

    const sourceDiv = document.createElement('div');
    sourceDiv.className = `image-source ${tierClass}`;
    sourceDiv.textContent = sourceText;
    container.appendChild(sourceDiv);
  }

  /**
   * Display unavailable message in container.
   * @param {!Element} container - Container element
   * @private
   */
  displayUnavailable_(container) {
    container.textContent = '';
    const fallbackDiv = document.createElement('div');
    fallbackDiv.className = 'image-unavailable';
    fallbackDiv.textContent = 'No image available';
    container.appendChild(fallbackDiv);
  }

  /**
   * Get constellation story data.
   * @param {string} constellationName - Constellation abbreviation or name
   * @returns {?Object} Story data or null
   */
  getConstellationStory(constellationName) {
    return getConstellationStory(constellationName);
  }

  /**
   * Fetch constellation description from Wikipedia.
   * @param {string} constellationName - Constellation name
   */
  async fetchConstellationDescription(constellationName) {
    // Abort any pending description request
    if (this.descriptionAbortController_) {
      this.descriptionAbortController_.abort();
    }
    this.descriptionAbortController_ = new AbortController();
    const signal = this.descriptionAbortController_.signal;

    const descContainer = document.getElementById('object-description');
    if (!descContainer) return;

    try {
      const searchName = `${constellationName} (constellation)`;
      const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchName)}`;
      const response = await fetchWikipedia(searchUrl, signal);

      if (response.ok) {
        const data = await response.json();
        if (data.extract) {
          // Use textContent to prevent XSS from API response
          descContainer.textContent = '';
          const p = document.createElement('p');
          p.textContent = data.extract;
          descContainer.appendChild(p);
          return;
        }
      }

      // Fallback: search without "(constellation)"
      const fallbackUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(constellationName)}`;
      const fallbackResponse = await fetchWikipedia(fallbackUrl, signal);

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        if (fallbackData.extract) {
          // Use textContent to prevent XSS from API response
          descContainer.textContent = '';
          const p = document.createElement('p');
          p.textContent = fallbackData.extract;
          descContainer.appendChild(p);
          return;
        }
      }

      descContainer.textContent = '';
    } catch (error) {
      // Handle abort gracefully - just return without logging
      if (error.name === 'AbortError') {
        return;
      }
      logger.warn('Failed to fetch constellation description:', error);
      descContainer.textContent = '';
    }
  }

  /**
   * Show constellation info in the info panel.
   * @param {string} constName - Constellation name (full name or abbreviation)
   */
  showConstellationInfo_(constName) {
    const content = domCache.infoContent;
    if (!content) return;

    // Convert full name to abbreviation if needed
    const abbrev = this.deps_.getConstellationAbbrev?.(constName) || constName;

    // Get the full constellation name in current language
    const fullName = this.deps_.getConstellationName?.(abbrev) || constName;

    // Get English name for Wikipedia lookup
    const englishName = this.deps_.getEnglishConstellationName?.(abbrev) || constName;

    // Update panel header title
    const titleEl = domCache.objectTitle;
    if (titleEl) titleEl.textContent = fullName;

    let html = `<h2>${escapeHtml(fullName)}</h2>`;
    html += `<p><strong>Abbreviation:</strong> ${escapeHtml(abbrev)}</p>`;

    // Show Latin name if current language is not English/Latin
    const lang = this.deps_.getConstellationLanguage?.() || 'en';
    if (lang !== 'en' && lang !== 'la') {
      html += `<p><strong>Latin:</strong> ${escapeHtml(englishName)}</p>`;
    }

    // Get constellation story if available (use local method)
    const story = this.getConstellationStory(abbrev) || this.getConstellationStory(constName);
    if (story) {
      html += `<div class="constellation-story">`;
      html += `<p>${escapeHtml(story.mythology)}</p>`;
      html += `<p><strong>Best Seen:</strong> ${escapeHtml(story.bestSeen)}</p>`;
      html += `</div>`;
    }

    // Add placeholder for Wikipedia description
    html += `<div id="object-description" class="object-description"><em>Loading description...</em></div>`;

    content.innerHTML = html;

    // Highlight the clicked constellation
    const fullConstName = this.deps_.getConstellationFullName?.(constName) || constName;
    this.deps_.highlightConstellation?.(fullConstName);

    // Fetch Wikipedia description for constellation (use local method)
    this.fetchConstellationDescription(englishName);

    // Open info panel
    this.deps_.openPanel?.('info-panel');
  }

  /**
   * Dispose of resources.
   */
  dispose() {
    if (this.highlightTimeout_) {
      clearTimeout(this.highlightTimeout_);
      this.highlightTimeout_ = null;
    }

    // Abort any pending fetch requests
    if (this.descriptionAbortController_) {
      this.descriptionAbortController_.abort();
      this.descriptionAbortController_ = null;
    }
    if (this.imageAbortController_) {
      this.imageAbortController_.abort();
      this.imageAbortController_ = null;
    }

    this.selectedObject_ = null;
  }
}
