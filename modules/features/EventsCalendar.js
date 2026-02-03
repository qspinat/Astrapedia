/**
 * @fileoverview Astronomy events calendar module.
 * Handles fetching, parsing, and displaying astronomical events.
 */

import {escapeHtml} from '../core/SecurityUtils.js';

/**
 * Cache duration for events (24 hours in ms).
 * @const {number}
 */
const EVENTS_CACHE_DURATION = 24 * 60 * 60 * 1000;

/**
 * iCal calendar URL for astronomy events.
 * @const {string}
 */
const ICAL_URL = 'https://raw.githubusercontent.com/toupeira/AstroCalendar/master/AstroCalendar.ics';

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

    /** @private {?number} */
    this.cacheTime_ = null;
  }

  /**
   * Parse iCal format events data.
   * @param {string} icalData - Raw iCal data
   * @returns {!Array<!Object>} Parsed events
   */
  parseICalEvents(icalData) {
    const events = [];
    const lines = icalData.split(/\r?\n/);

    let currentEvent = null;
    let currentField = '';
    let currentValue = '';

    for (const line of lines) {
      // Handle line continuation (lines starting with space or tab)
      if (line.startsWith(' ') || line.startsWith('\t')) {
        currentValue += line.substring(1);
        continue;
      }

      // Process previous field if we have one
      if (currentEvent && currentField) {
        this.processICalField_(currentEvent, currentField, currentValue);
      }

      // Check for event boundaries
      if (line === 'BEGIN:VEVENT') {
        currentEvent = {};
      } else if (line === 'END:VEVENT' && currentEvent) {
        if (currentEvent.name && currentEvent.date) {
          events.push(currentEvent);
        }
        currentEvent = null;
      } else if (currentEvent && line.includes(':')) {
        const colonIndex = line.indexOf(':');
        currentField = line.substring(0, colonIndex).split(';')[0];
        currentValue = line.substring(colonIndex + 1);
      }
    }

    return events;
  }

  /**
   * Process a single iCal field.
   * @param {!Object} event - Event object to populate
   * @param {string} field - Field name
   * @param {string} value - Field value
   * @private
   */
  processICalField_(event, field, value) {
    switch (field) {
      case 'SUMMARY':
        event.name = value;
        event.type = this.determineEventType_(value);
        break;
      case 'DTSTART':
      case 'DTSTART;VALUE=DATE':
        const dateStr = value.replace(/[TZ]/g, '');
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        event.date = new Date(year, month, day);
        break;
      case 'DESCRIPTION':
        event.description = value
          .replace(/\\n/g, ' ')
          .replace(/\\,/g, ',')
          .replace(/\s+/g, ' ')
          .trim();
        break;
    }
  }

  /**
   * Determine event type from name.
   * @param {string} name - Event name
   * @returns {string} Event type
   * @private
   */
  determineEventType_(name) {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('meteor') || nameLower.includes('shower')) {
      return 'meteor';
    } else if (nameLower.includes('eclipse')) {
      return 'eclipse';
    } else if (nameLower.includes('solstice')) {
      return 'solstice';
    } else if (nameLower.includes('equinox')) {
      return 'equinox';
    } else if (nameLower.includes('opposition') || nameLower.includes('conjunction') ||
               nameLower.includes('venus') || nameLower.includes('mars') ||
               nameLower.includes('jupiter') || nameLower.includes('saturn') ||
               nameLower.includes('mercury') || nameLower.includes('uranus') ||
               nameLower.includes('neptune')) {
      return 'planet';
    } else if (nameLower.includes('moon') || nameLower.includes('lunar')) {
      return 'moon';
    }
    return 'other';
  }

  /**
   * Fetch astronomy events from online iCal calendar.
   * @returns {!Promise<?Array<!Object>>} Array of event objects or null on failure
   */
  async fetchAstronomyEvents() {
    // Check cache first
    if (this.eventsCache_ && this.cacheTime_ &&
        (Date.now() - this.cacheTime_) < EVENTS_CACHE_DURATION) {
      return this.eventsCache_;
    }

    try {
      const response = await fetch(ICAL_URL);
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const icalData = await response.text();
      const events = this.parseICalEvents(icalData);

      // Cache the results
      this.eventsCache_ = events;
      this.cacheTime_ = Date.now();

      console.log(`✓ Fetched ${events.length} astronomy events from online calendar`);
      return events;
    } catch (error) {
      console.warn('Failed to fetch astronomy events:', error);
      return null;
    }
  }

  /**
   * Get fallback events when online fetch fails.
   * @returns {!Array<!Object>} Fallback events
   */
  getFallbackEvents() {
    const now = new Date();
    const year = now.getFullYear();
    const nextYear = year + 1;

    return [
      // Meteor Showers
      {name: 'Quadrantids Meteor Shower', date: new Date(year, 0, 3), type: 'meteor',
       description: 'Up to 120 meteors/hour. Best viewed from Northern Hemisphere.'},
      {name: 'Lyrids Meteor Shower', date: new Date(year, 3, 22), type: 'meteor',
       description: 'Up to 20 meteors/hour. Active April 16-25.'},
      {name: 'Eta Aquarids Meteor Shower', date: new Date(year, 4, 6), type: 'meteor',
       description: 'Up to 60 meteors/hour. Debris from Halley\'s Comet.'},
      {name: 'Delta Aquarids Meteor Shower', date: new Date(year, 6, 30), type: 'meteor',
       description: 'Up to 20 meteors/hour. Best from Southern Hemisphere.'},
      {name: 'Perseids Meteor Shower', date: new Date(year, 7, 12), type: 'meteor',
       description: 'Up to 100 meteors/hour. One of the best annual showers.'},
      {name: 'Orionids Meteor Shower', date: new Date(year, 9, 21), type: 'meteor',
       description: 'Up to 20 meteors/hour. Debris from Halley\'s Comet.'},
      {name: 'Leonids Meteor Shower', date: new Date(year, 10, 17), type: 'meteor',
       description: 'Up to 15 meteors/hour. Produces meteor storms every 33 years.'},
      {name: 'Geminids Meteor Shower', date: new Date(year, 11, 14), type: 'meteor',
       description: 'Up to 150 meteors/hour. Best meteor shower of the year.'},
      {name: 'Ursids Meteor Shower', date: new Date(year, 11, 22), type: 'meteor',
       description: 'Up to 10 meteors/hour. Often overlooked due to holidays.'},
      // Solstices and Equinoxes
      {name: 'Vernal Equinox', date: new Date(year, 2, 20), type: 'equinox',
       description: 'Spring begins in Northern Hemisphere.'},
      {name: 'Summer Solstice', date: new Date(year, 5, 21), type: 'solstice',
       description: 'Longest day of the year in Northern Hemisphere.'},
      {name: 'Autumnal Equinox', date: new Date(year, 8, 22), type: 'equinox',
       description: 'Fall begins in Northern Hemisphere.'},
      {name: 'Winter Solstice', date: new Date(year, 11, 21), type: 'solstice',
       description: 'Shortest day of the year in Northern Hemisphere.'},
      // Next year
      {name: 'Quadrantids Meteor Shower', date: new Date(nextYear, 0, 3), type: 'meteor',
       description: 'Up to 120 meteors/hour.'},
    ];
  }

  /**
   * Get upcoming events.
   * @returns {!Array<!Object>} Upcoming events sorted by date
   */
  getUpcomingEvents() {
    const now = new Date();
    const events = this.eventsCache_ || this.getFallbackEvents();

    return events
      .filter((event) => event.date > now)
      .sort((a, b) => a.date - b.date)
      .slice(0, 20);
  }

  /**
   * Show events calendar in the events panel.
   * @param {function(string): void=} openPanel - Function to open panel
   */
  async showEventsCalendar(openPanel) {
    const panel = document.getElementById('events-panel');
    if (!panel) return;

    const content = panel.querySelector('.panel-content');

    // Open panel first with loading state
    if (openPanel) {
      openPanel('events-panel');
    } else if (window.openPanel) {
      window.openPanel('events-panel');
    } else {
      panel.classList.add('visible');
    }

    // Show loading state
    if (content) {
      content.innerHTML = '<div class="events-loading">Loading astronomy events...</div>';
    }

    // Try to fetch online events
    await this.fetchAstronomyEvents();

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

    // Add source attribution
    if (this.eventsCache_) {
      html += '<div class="events-source">Data from AstroCalendar (GitHub)</div>';
    }

    if (content) content.innerHTML = html;
  }

  /**
   * Check if events are cached.
   * @returns {boolean} True if events are cached
   */
  hasCachedEvents() {
    return this.eventsCache_ !== null;
  }

  /**
   * Clear cached events.
   */
  clearCache() {
    this.eventsCache_ = null;
    this.cacheTime_ = null;
  }
}

/**
 * Singleton events calendar instance.
 * @type {!EventsCalendar}
 */
export const eventsCalendar = new EventsCalendar();
