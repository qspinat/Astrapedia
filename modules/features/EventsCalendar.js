/**
 * @fileoverview Astronomy events calendar module.
 * Displays astronomical events from built-in data (meteor showers, eclipses,
 * solstices, equinoxes, planetary events).
 */

import {escapeHtml} from '../core/SecurityUtils.js';
import {panelManager} from '../ui/PanelManager.js';

/**
 * Event type icons for display.
 * @const {!Object<string, string>}
 */
const TYPE_ICONS = {
  'meteor': '☄️',
  'eclipse': '🌑',
  'planet': '🪐',
  'solstice': '☀️',
  'equinox': '🌗',
  'moon': '🌙',
  'other': '⭐',
};

/**
 * EventsCalendar manages astronomy event fetching and display.
 */
export class EventsCalendar {
  /**
   * Creates a new EventsCalendar instance.
   */
  constructor() {
    /** @private {?Array<!Object>} */
    this.eventsCache_ = null;
  }

  /**
   * Get astronomy events (from built-in data).
   * @returns {!Array<!Object>} Array of event objects
   */
  getEvents() {
    if (!this.eventsCache_) {
      this.eventsCache_ = this.getFallbackEvents();
    }
    return this.eventsCache_;
  }

  /**
   * Get fallback events when online fetch fails.
   * Includes meteor showers, eclipses, planetary events, and more.
   * @returns {!Array<!Object>} Fallback events
   */
  getFallbackEvents() {
    const now = new Date();
    const year = now.getFullYear();

    // Recurring (showers/solstices/equinoxes) + year-specific events for 4 years
    const events = [];
    for (let y = year; y <= year + 3; y++) {
      events.push(...this.getRecurringEvents_(y));
      events.push(...this.getYearSpecificEvents_(y));
    }

    return events;
  }

  /**
   * Returns the annually recurring meteor showers, solstices, and equinoxes
   * for a given year.
   * @param {number} y - Calendar year.
   * @returns {!Array<!Object>} Recurring events for that year.
   * @private
   */
  getRecurringEvents_(y) {
    return [
      // ===== METEOR SHOWERS =====
      {name: 'Quadrantids Meteor Shower', date: new Date(y, 0, 3), type: 'meteor',
       description: 'Up to 120 meteors/hour. Best viewed from Northern Hemisphere.'},
      {name: 'Lyrids Meteor Shower', date: new Date(y, 3, 22), type: 'meteor',
       description: 'Up to 20 meteors/hour. Active April 16-25.'},
      {name: 'Eta Aquarids Meteor Shower', date: new Date(y, 4, 6), type: 'meteor',
       description: 'Up to 60 meteors/hour. Debris from Halley\'s Comet.'},
      {name: 'Delta Aquarids Meteor Shower', date: new Date(y, 6, 30), type: 'meteor',
       description: 'Up to 20 meteors/hour. Best from Southern Hemisphere.'},
      {name: 'Perseids Meteor Shower', date: new Date(y, 7, 12), type: 'meteor',
       description: 'Up to 100 meteors/hour. One of the best annual showers.'},
      {name: 'Orionids Meteor Shower', date: new Date(y, 9, 21), type: 'meteor',
       description: 'Up to 20 meteors/hour. Debris from Halley\'s Comet.'},
      {name: 'Leonids Meteor Shower', date: new Date(y, 10, 17), type: 'meteor',
       description: 'Up to 15 meteors/hour. Produces meteor storms every 33 years.'},
      {name: 'Geminids Meteor Shower', date: new Date(y, 11, 14), type: 'meteor',
       description: 'Up to 150 meteors/hour. Best meteor shower of the year.'},
      {name: 'Ursids Meteor Shower', date: new Date(y, 11, 22), type: 'meteor',
       description: 'Up to 10 meteors/hour. Often overlooked due to holidays.'},

      // ===== SOLSTICES AND EQUINOXES =====
      {name: 'Vernal Equinox', date: new Date(y, 2, 20), type: 'equinox',
       description: 'Spring begins in Northern Hemisphere.'},
      {name: 'Summer Solstice', date: new Date(y, 5, 21), type: 'solstice',
       description: 'Longest day of the year in Northern Hemisphere.'},
      {name: 'Autumnal Equinox', date: new Date(y, 8, 22), type: 'equinox',
       description: 'Fall begins in Northern Hemisphere.'},
      {name: 'Winter Solstice', date: new Date(y, 11, 21), type: 'solstice',
       description: 'Shortest day of the year in Northern Hemisphere.'},
    ];
  }

  /**
   * Get year-specific astronomical events (eclipses, planetary events).
   * Data verified from NASA, TimeandDate.com, and other authoritative sources.
   *
   * MAINTENANCE NOTE: This data covers 2025-2029 and should be updated when:
   * - The current year approaches 2028 (add 2030+ events)
   * - NASA/TimeandDate publish corrections to eclipse times
   * - Last updated: February 2026
   *
   * @param {number} year - The year to get events for
   * @returns {!Array<!Object>} Year-specific events
   * @private
   */
  getYearSpecificEvents_(year) {
    const events = [];

    // Eclipse and planetary event data by year
    // Sources: NASA Eclipse Page, TimeandDate.com, EclipseWise.com, Almanac.com
    // TODO: Add 2030+ events when approaching 2028
    const yearData = {
      2025: {
        eclipses: [
          {name: 'Total Lunar Eclipse', date: new Date(2025, 2, 14), type: 'eclipse',
           description: 'Visible from Americas, Europe, Africa. Totality lasts 65 minutes.'},
          {name: 'Partial Solar Eclipse', date: new Date(2025, 2, 29), type: 'eclipse',
           description: 'Visible from Europe, N. Africa, N. America. Max coverage 93%.'},
          {name: 'Total Lunar Eclipse', date: new Date(2025, 8, 7), type: 'eclipse',
           description: 'Visible from Europe, Africa, Asia, Australia.'},
          {name: 'Partial Solar Eclipse', date: new Date(2025, 8, 21), type: 'eclipse',
           description: 'Visible from S. Pacific, New Zealand, Antarctica.'},
        ],
        planets: [
          {name: 'Mars at Opposition', date: new Date(2025, 0, 16), type: 'planet',
           description: 'Mars closest to Earth, visible all night. Magnitude -1.4.'},
          {name: 'Saturn at Opposition', date: new Date(2025, 8, 21), type: 'planet',
           description: 'Saturn at its brightest in Pisces. Rings appear edge-on!'},
          {name: 'Neptune at Opposition', date: new Date(2025, 8, 23), type: 'planet',
           description: 'Neptune at its brightest in Pisces. Telescope required.'},
          {name: 'Uranus at Opposition', date: new Date(2025, 10, 21), type: 'planet',
           description: 'Uranus at its brightest in Taurus. Binoculars recommended.'},
        ],
        moons: [
          {name: 'Supermoon (Harvest Moon)', date: new Date(2025, 9, 6), type: 'moon',
           description: 'First of three supermoons. Largest Full Moon of 2025.'},
          {name: 'Supermoon (Beaver Moon)', date: new Date(2025, 10, 5), type: 'moon',
           description: 'Closest supermoon of 2025 at 356,980 km from Earth.'},
          {name: 'Supermoon (Cold Moon)', date: new Date(2025, 11, 4), type: 'moon',
           description: 'Third consecutive supermoon. Won\'t repeat until 2037.'},
        ],
      },
      2026: {
        eclipses: [
          {name: 'Annular Solar Eclipse', date: new Date(2026, 1, 17), type: 'eclipse',
           description: 'Visible from Antarctica, S. America, S. Africa. Ring of fire.'},
          {name: 'Total Lunar Eclipse', date: new Date(2026, 2, 3), type: 'eclipse',
           description: 'Visible from Americas, Europe, Africa. Totality lasts 58 minutes.'},
          {name: 'Total Solar Eclipse', date: new Date(2026, 7, 12), type: 'eclipse',
           description: 'Path crosses Greenland, Iceland, Spain. Totality up to 2m18s.'},
          {name: 'Partial Lunar Eclipse', date: new Date(2026, 7, 28), type: 'eclipse',
           description: 'Visible from E. Asia, Australia, Pacific, Americas.'},
        ],
        planets: [
          {name: 'Jupiter at Opposition', date: new Date(2026, 0, 10), type: 'planet',
           description: 'Jupiter at its brightest in Gemini, visible all night.'},
          {name: 'Neptune at Opposition', date: new Date(2026, 8, 24), type: 'planet',
           description: 'Neptune at its brightest. Telescope required.'},
          {name: 'Saturn at Opposition', date: new Date(2026, 9, 4), type: 'planet',
           description: 'Saturn at its brightest, visible all night.'},
          {name: 'Uranus at Opposition', date: new Date(2026, 10, 23), type: 'planet',
           description: 'Uranus at its brightest. Binoculars recommended.'},
        ],
        moons: [
          {name: 'Supermoon (Wolf Moon)', date: new Date(2026, 0, 3), type: 'moon',
           description: 'First supermoon of 2026. Coincides with Earth at perihelion.'},
          {name: 'Supermoon (Beaver Moon)', date: new Date(2026, 10, 24), type: 'moon',
           description: 'Second supermoon of 2026.'},
          {name: 'Supermoon (Cold Moon)', date: new Date(2026, 11, 23), type: 'moon',
           description: 'Closest Full Moon of 2026 at 221,667 miles from Earth.'},
        ],
      },
      2027: {
        eclipses: [
          {name: 'Annular Solar Eclipse', date: new Date(2027, 1, 6), type: 'eclipse',
           description: 'Visible from S. America, Atlantic, Africa. Ring of fire.'},
          {name: 'Penumbral Lunar Eclipse', date: new Date(2027, 1, 20), type: 'eclipse',
           description: 'Visible from Americas, Europe, Africa. Subtle darkening.'},
          {name: 'Total Solar Eclipse', date: new Date(2027, 7, 2), type: 'eclipse',
           description: 'Path crosses Spain, N. Africa, Middle East. Totality 6m23s!'},
          {name: 'Partial Lunar Eclipse', date: new Date(2027, 7, 17), type: 'eclipse',
           description: 'Visible from Asia, Australia, Pacific.'},
        ],
        planets: [
          {name: 'Jupiter at Opposition', date: new Date(2027, 1, 4), type: 'planet',
           description: 'Jupiter at its brightest in Leo, visible all night.'},
          {name: 'Mars at Opposition', date: new Date(2027, 1, 19), type: 'planet',
           description: 'Mars closest approach. Best viewing until 2029.'},
          {name: 'Saturn at Opposition', date: new Date(2027, 9, 18), type: 'planet',
           description: 'Saturn at its brightest, visible all night.'},
        ],
        moons: [
          {name: 'Supermoon', date: new Date(2027, 0, 22), type: 'moon',
           description: 'First of two supermoons in 2027.'},
          {name: 'Supermoon', date: new Date(2027, 1, 20), type: 'moon',
           description: 'Second supermoon, coincides with penumbral lunar eclipse.'},
        ],
      },
      2028: {
        eclipses: [
          {name: 'Partial Lunar Eclipse', date: new Date(2028, 0, 12), type: 'eclipse',
           description: 'Visible from Americas, Europe, Africa.'},
          {name: 'Annular Solar Eclipse', date: new Date(2028, 0, 26), type: 'eclipse',
           description: 'Visible from S. America, Antarctica. Ring of fire.'},
          {name: 'Partial Lunar Eclipse', date: new Date(2028, 6, 6), type: 'eclipse',
           description: 'Visible from Australia, Asia, Americas.'},
          {name: 'Total Solar Eclipse', date: new Date(2028, 6, 22), type: 'eclipse',
           description: 'Path crosses Australia, New Zealand. Totality up to 5m10s.'},
          {name: 'Total Lunar Eclipse', date: new Date(2028, 11, 31), type: 'eclipse',
           description: 'New Year\'s Eve eclipse! Visible from Europe, Africa, Americas.'},
        ],
        planets: [
          {name: 'Jupiter at Opposition', date: new Date(2028, 2, 12), type: 'planet',
           description: 'Jupiter at its brightest in Leo.'},
          {name: 'Saturn at Opposition', date: new Date(2028, 9, 30), type: 'planet',
           description: 'Saturn at its brightest. Rings well-angled at 18 degrees.'},
        ],
        moons: [],
      },
      2029: {
        eclipses: [
          {name: 'Partial Solar Eclipse', date: new Date(2029, 0, 14), type: 'eclipse',
           description: 'Visible from N. America, Europe.'},
          {name: 'Partial Solar Eclipse', date: new Date(2029, 5, 12), type: 'eclipse',
           description: 'Visible from Arctic, N. Europe, N. Asia.'},
          {name: 'Partial Lunar Eclipse', date: new Date(2029, 5, 26), type: 'eclipse',
           description: 'Visible from Americas, Europe, Africa.'},
          {name: 'Partial Lunar Eclipse', date: new Date(2029, 11, 20), type: 'eclipse',
           description: 'Visible from Americas, Europe, Africa, Asia.'},
        ],
        planets: [
          {name: 'Mars at Opposition', date: new Date(2029, 2, 25), type: 'planet',
           description: 'Mars at its brightest, visible all night.'},
          {name: 'Jupiter at Opposition', date: new Date(2029, 3, 12), type: 'planet',
           description: 'Jupiter at its brightest in Virgo.'},
        ],
        moons: [],
      },
    };

    const data = yearData[year];
    if (!data) return events;

    // Combine all event categories
    return [
      ...events,
      ...(data.eclipses || []),
      ...(data.planets || []),
      ...(data.moons || []),
    ];
  }

  /**
   * Get upcoming events.
   * @returns {!Array<!Object>} Upcoming events sorted by date
   */
  getUpcomingEvents() {
    const now = new Date();
    const events = this.getEvents();

    return events
      .filter((event) => event.date > now)
      .sort((a, b) => a.date - b.date)
      .slice(0, 20);
  }

  /**
   * Show events calendar in the events panel.
   * @param {function(string): void=} openPanel - Function to open panel
   */
  showEventsCalendar() {
    const panel = document.getElementById('events-panel');
    if (!panel) return;

    const content = panel.querySelector('.panel-content');

    // Through the manager, not by adding the class directly: the manager also
    // shows the backdrop, sets body.panel-open, pushes a history entry so the
    // Android back button closes the panel, and emits PANEL_OPENED.
    panelManager.open('events-panel');

    // Get events
    const events = this.getUpcomingEvents();

    let html = '<div class="events-list">';
    events.forEach((event) => {
      const daysUntil = Math.ceil((event.date - new Date()) / (1000 * 60 * 60 * 24));
      const icon = TYPE_ICONS[event.type] || '⭐';
      const dateStr = event.date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      let daysText;
      if (daysUntil <= 0) {
        daysText = 'today';
      } else if (daysUntil === 1) {
        daysText = 'tomorrow';
      } else {
        daysText = `in ${daysUntil} days`;
      }

      const description = event.description || 'Astronomical event';

      html += `<div class="event-item">`;
      html += `<span class="event-icon">${escapeHtml(icon)}</span>`;
      html += `<div class="event-details">`;
      html += `<div class="event-name">${escapeHtml(event.name)}</div>`;
      html += `<div class="event-date">${escapeHtml(dateStr)} (${escapeHtml(daysText)})</div>`;
      html += `<div class="event-desc">${escapeHtml(description)}</div>`;
      html += `</div></div>`;
    });
    html += '</div>';

    if (events.length === 0) {
      html = '<p>No upcoming events found.</p>';
    }

    html += '<div class="events-source">Sources: NASA, TimeandDate.com</div>';

    if (content) content.innerHTML = html;
  }

}

/**
 * Singleton events calendar instance.
 * @type {!EventsCalendar}
 */
export const eventsCalendar = new EventsCalendar();
