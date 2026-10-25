/**
 * @fileoverview The Tonight panel: when it is dark, what the Moon does, the
 * cloud forecast, and the best things to look at, ranked for the observer's
 * eyes or telescope. Rebuilt each time the panel opens, so it follows the
 * current location and (simulated) date.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {escapeHtml} from '../core/SecurityUtils.js';
import {formatClockTime, safeGetJson, safeSetJson} from '../core/Utils.js';
import {moonIllumination, moonPhaseLabel} from '../core/MoonPhase.js';
import {HOUR_MS, nightWindow} from '../astronomy/Observability.js';
import {planningWindow, rankTonight} from './TonightPlanner.js';
import {dewRisk} from '../services/WeatherService.js';
import {domCache} from '../ui/DOMCache.js';
import {observingLists} from './ObservingLists.js';

const PANEL_ID = 'visible-tonight-panel';
const PREFS_KEY = 'astrapedia_tonight_prefs';
const MAX_ROWS = 40;

/** Chip groups: container id and the preference each one sets. */
const CHIP_GROUPS = [['tonight-instrument', 'instrument'], ['tonight-sort', 'sort'],
  ['tonight-filter', 'filter']];

/** @const {!Object<string, function(!Object, !Object): number>} */
const SORTS = {
  best: (a, b) => b.score - a.score,
  highest: (a, b) => b.peakAltitude - a.peakAltitude,
  brightest: (a, b) => a.object.mag - b.object.mag,
};

/**
 * @param {?Date} date
 * @returns {string} "21:47", or an en dash when there is none
 */
function clock(date) {
  return date ? formatClockTime(date) : '–';
}

/**
 * What the Moon does during the night, in time order: "sets 02:10",
 * "rises 22:40", "up all night"...
 * @param {{moonUpAtDusk: boolean, moonrise: ?Date, moonset: ?Date}} night
 * @returns {string}
 */
export function moonTonight(night) {
  const events = [
    night.moonrise && {time: night.moonrise, text: `rises ${clock(night.moonrise)}`},
    night.moonset && {time: night.moonset, text: `sets ${clock(night.moonset)}`},
  ].filter(Boolean).sort((a, b) => a.time - b.time);
  if (events.length === 0) return night.moonUpAtDusk ? 'up all night' : 'down all night';
  return events.map((e) => e.text).join(', ');
}

/**
 * Renders the Tonight panel.
 */
export class TonightPanel {
  /**
   * @param {!Object} dependencies
   * @param {function(): ?{lat: number, lon: number}} dependencies.getLocation
   * @param {function(): !Date} dependencies.getTime - Current (simulated) time
   * @param {function(): !Array<!Object>} dependencies.getPlanets - Incl. Moon
   * @param {function(): !Array<!Object>} dependencies.getDSOs
   * @param {function(): !Array<!Object>} dependencies.getStars - Star catalog
   * @param {function(): number} dependencies.getNakedEyeLimit
   * @param {function(): ?number} dependencies.getTelescopeLimit
   * @param {function(!Object): void} dependencies.selectObject
   * @param {function(): void} dependencies.openLocationDialog
   * @param {{getForecast: function(?Object): !Promise<?Array<!Object>>,
   *     isEnabled: function(): boolean, setEnabled: function(boolean): void}}
   *     dependencies.weather - WeatherService
   * @param {{onOpen: function(string, function()): void,
   *     isPanelOpen: function(string): boolean, closeAll: function()}}
   *     dependencies.panelManager
   */
  constructor(dependencies) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private {{instrument: string, sort: string, filter: string}} */
    this.prefs_ = {instrument: 'eye', sort: 'best', filter: 'all',
      ...(safeGetJson(PREFS_KEY) || {})};

    /** @private {!Array<!Object>} Last ranking, unsorted and unfiltered */
    this.ranked_ = [];

    /** @private {number} Guards against an old forecast landing late */
    this.renderToken_ = 0;

    /** @private {!Array<!Object>} */
    this.subscriptions_ = [];
  }

  /**
   * Wire the controls and re-render whenever the panel opens.
   */
  initialize() {
    this.deps_.panelManager.onOpen(PANEL_ID, () => this.render());
    this.subscriptions_.push(globalEventBus.on(Events.LOCATION_CHANGED, () => {
      if (this.deps_.panelManager.isPanelOpen(PANEL_ID)) this.render();
    }));

    for (const [group, key] of CHIP_GROUPS) {
      domCache.get(group)?.addEventListener('click', (e) => {
        const chip = e.target.closest?.(`[data-${key}]`);
        if (!chip) return;
        this.prefs_[key] = chip.dataset[key];
        safeSetJson(PREFS_KEY, this.prefs_);
        // A different instrument changes which objects qualify: re-rank.
        if (key === 'instrument') {
          this.render();
        } else {
          this.renderList_();
        }
      });
    }

    domCache.get('tonight-list')?.addEventListener('click', (e) => {
      const row = e.target.closest?.('[data-index]');
      const entry = row && this.visibleEntries_()[Number(row.dataset.index)];
      if (!entry) return;
      this.deps_.panelManager.closeAll();
      this.deps_.selectObject(entry.object);
    });

    domCache.get('tonight-summary')?.addEventListener('click', (e) => {
      if (e.target.closest?.('[data-action="location"]')) this.deps_.openLocationDialog();
    });

    const weatherToggle = domCache.get('weather-toggle');
    if (weatherToggle) {
      weatherToggle.checked = this.deps_.weather.isEnabled();
      weatherToggle.addEventListener('change', () => {
        this.deps_.weather.setEnabled(weatherToggle.checked);
        if (this.deps_.panelManager.isPanelOpen(PANEL_ID)) this.render();
      });
    }
  }

  /**
   * Recompute everything for the current location and time.
   */
  render() {
    const location = this.deps_.getLocation();
    const now = this.deps_.getTime();
    const token = ++this.renderToken_;
    const night = location ? nightWindow(location, now) : null;
    const span = planningWindow(night);
    const planets = this.deps_.getPlanets();
    const moon = planets.find((p) => p.name === 'Moon');

    this.renderSummary_(location, night, span, moon);

    if (!location || !span) {
      this.ranked_ = [];
      this.renderList_();
      this.setWeather_('');
      return;
    }

    this.ranked_ = rankTonight({
      location,
      window: span,
      limitMag: this.limitMag_(),
      planets,
      dsos: this.deps_.getDSOs(),
      // Stars are ranked only when on the observer's list.
      stars: this.deps_.getStars().filter((s) => s.proper && observingLists.isWanted(s.proper)),
      moon: moon ? {...moon, illumination: moonIllumination(moon.phase ?? 0)} : null,
    });
    this.renderList_();

    this.setWeather_('<p class="tonight-muted">Loading forecast…</p>');
    this.deps_.weather.getForecast(location).then((hours) => {
      if (token !== this.renderToken_) return;
      this.setWeather_(this.weatherHtml_(hours, span));
    });
  }

  /**
   * @returns {number} Faintest magnitude for the chosen instrument
   * @private
   */
  limitMag_() {
    if (this.prefs_.instrument === 'telescope') {
      return this.deps_.getTelescopeLimit() ?? this.deps_.getNakedEyeLimit();
    }
    return this.deps_.getNakedEyeLimit();
  }

  /**
   * @param {?Object} location
   * @param {?Object} night
   * @param {?{from: !Date, to: !Date, fullyDark: boolean}} span - Planning window
   * @param {?Object} moon - The Moon's position and phase
   * @private
   */
  renderSummary_(location, night, span, moon) {
    const summary = domCache.get('tonight-summary');
    if (!summary) return;
    const change = '<button class="tonight-link" data-action="location">Change</button>';

    if (!location) {
      summary.innerHTML = '<p>Set your location to plan tonight.</p>' +
          '<button class="telescope-preset-btn" data-action="location">Set location</button>';
      return;
    }

    const lat = `${Math.abs(location.lat).toFixed(1)}°${location.lat >= 0 ? 'N' : 'S'}`;
    const lon = `${Math.abs(location.lon).toFixed(1)}°${location.lon >= 0 ? 'E' : 'W'}`;
    let html = `<p class="tonight-muted">${lat} ${lon} · ${change}</p>`;

    if (!span) {
      html += '<p>The Sun does not set tonight.</p>';
    } else if (span.fullyDark) {
      html += `<p><strong>Dark</strong> ${clock(span.from)} → ${clock(span.to)}</p>`;
    } else {
      html += `<p><strong>Never fully dark</strong> · darkest ${clock(span.from)} → ` +
          `${clock(span.to)}</p>`;
    }

    if (moon && night) {
      html += `<p class="tonight-muted">Moon: ${escapeHtml(moonPhaseLabel(moon.phase ?? 0))} ` +
          `· ${moonTonight(night)}</p>`;
    }
    summary.innerHTML = html;
  }

  /**
   * @returns {!Array<!Object>} Ranked entries after filter and sort
   * @private
   */
  visibleEntries_() {
    const {filter, sort} = this.prefs_;
    const keep = filter === 'all' ? () => true :
        filter === 'wanted' ? (e) => observingLists.isWanted(e.object.name) :
        (e) => e.category === filter;
    return this.ranked_
        .filter(keep)
        .sort(SORTS[sort] || SORTS.best)
        .slice(0, MAX_ROWS);
  }

  /** @private */
  renderList_() {
    for (const [group, key] of CHIP_GROUPS) {
      domCache.get(group)?.querySelectorAll(`[data-${key}]`).forEach((chip) => {
        chip.setAttribute('aria-checked', String(chip.dataset[key] === this.prefs_[key]));
      });
    }

    const list = domCache.get('tonight-list');
    if (!list) return;
    const entries = this.visibleEntries_();
    const missing = this.prefs_.filter === 'wanted' ? this.wantedNotUp_() : '';
    if (this.prefs_.filter === 'wanted' && observingLists.getWanted().length === 0) {
      list.innerHTML = '<li class="tonight-muted">Your list is empty. Open any object ' +
          'and tap "Want to see" to plan it here.</li>';
      return;
    }
    if (entries.length === 0) {
      list.innerHTML = this.ranked_.length ?
          '<li class="tonight-muted">Nothing of this kind rises high enough tonight.</li>' :
          '<li class="tonight-muted">Nothing to plan for this night.</li>';
      list.innerHTML += missing;
      return;
    }
    list.innerHTML = entries.map((e, i) => {
      const o = e.object;
      const alias = o.common_names ? ` · ${escapeHtml(o.common_names.split(',')[0])}` : '';
      const seen = observingLists.seenOn(o.name) ? ' ✓' : '';
      return `<li><button class="tonight-row" data-index="${i}">` +
          `<span class="tonight-row__name">${escapeHtml(o.name)}${alias}${seen}</span>` +
          `<span class="tonight-row__meta">${escapeHtml(o.type)} · mag ${o.mag.toFixed(1)}</span>` +
          `<span class="tonight-row__when">best ${clock(e.bestTime)} · ` +
          `${Math.round(e.peakAltitude)}°</span></button></li>`;
    }).join('') + missing;
  }

  /**
   * Wanted objects missing from tonight's ranking, as a list note.
   * @returns {string} HTML, empty when every wanted object is up
   * @private
   */
  wantedNotUp_() {
    const up = new Set(this.ranked_.map((e) => e.object.name));
    const missing = observingLists.getWanted().filter((name) => !up.has(name));
    if (missing.length === 0) return '';
    return `<li class="tonight-muted">Not well placed tonight, or too faint: ` +
        `${missing.map(escapeHtml).join(', ')}</li>`;
  }

  /**
   * Hourly cloud bars across the observing window.
   * @param {?Array<!Object>} hours - Forecast, or null when unavailable
   * @param {{from: !Date, to: !Date}} span - Planning window
   * @returns {string} HTML
   * @private
   */
  weatherHtml_(hours, span) {
    if (!hours) return '<p class="tonight-muted">No cloud forecast (offline or turned off).</p>';
    const night = hours.filter((h) =>
      h.time.getTime() >= span.from.getTime() - HOUR_MS && h.time.getTime() <= span.to.getTime());
    if (night.length === 0) return '<p class="tonight-muted">No forecast for tonight yet.</p>';

    const bars = night.map((h) => `<span class="tonight-cloud" ` +
        `style="--cloud:${Math.round(h.cloudCover)}%" title="${clock(h.time)}: ` +
        `${Math.round(h.cloudCover)}% cloud"></span>`).join('');
    const clear = night.filter((h) => h.cloudCover < 30).length;
    const verdict = clear === night.length ? 'Clear all night' :
        clear === 0 ? 'Cloudy all night' : `Clear ${clear} of ${night.length} hours`;
    const dew = night.some(dewRisk) ? ' · dew likely, cover your optics' : '';
    return `<p><strong>${verdict}</strong><span class="tonight-muted">${dew}</span></p>` +
        `<div class="tonight-clouds" aria-hidden="true">${bars}</div>` +
        `<p class="tonight-muted tonight-clouds__axis"><span>${clock(night[0].time)}</span>` +
        `<span>${clock(night[night.length - 1].time)}</span></p>`;
  }

  /**
   * @param {string} html
   * @private
   */
  setWeather_(html) {
    const el = domCache.get('tonight-weather');
    if (el) el.innerHTML = html;
  }

  /**
   * Remove subscriptions.
   */
  dispose() {
    this.subscriptions_.forEach((sub) => sub.unsubscribe());
    this.subscriptions_ = [];
  }
}

/** @type {?TonightPanel} */
let tonightPanel = null;

/**
 * Create the panel once; later calls return the same instance.
 * @param {!Object} dependencies - See TonightPanel
 * @returns {!TonightPanel}
 */
export function initializeTonightPanel(dependencies) {
  if (tonightPanel) return tonightPanel;
  tonightPanel = new TonightPanel(dependencies);
  tonightPanel.initialize();
  return tonightPanel;
}

/**
 * Reset the singleton (tests only).
 */
export function resetTonightPanel() {
  tonightPanel?.dispose();
  tonightPanel = null;
}
