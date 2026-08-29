/**
 * @fileoverview Tests for EventsCalendar module.
 */

import {jest} from '@jest/globals';
import {EventsCalendar} from '../modules/features/EventsCalendar.js';

describe('EventsCalendar', () => {
  let calendar;

  beforeEach(() => {
    calendar = new EventsCalendar();
  });

  describe('getFallbackEvents', () => {
    test('returns array of events', () => {
      const events = calendar.getFallbackEvents();
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
    });

    test('includes meteor showers', () => {
      const events = calendar.getFallbackEvents();
      const meteorEvents = events.filter((e) => e.type === 'meteor');
      expect(meteorEvents.length).toBeGreaterThan(0);
      expect(meteorEvents.some((e) => e.name.includes('Perseids'))).toBe(true);
      expect(meteorEvents.some((e) => e.name.includes('Geminids'))).toBe(true);
    });

    test('includes solstices and equinoxes', () => {
      const events = calendar.getFallbackEvents();
      const solsticeEvents = events.filter((e) => e.type === 'solstice');
      const equinoxEvents = events.filter((e) => e.type === 'equinox');
      expect(solsticeEvents.length).toBeGreaterThanOrEqual(2);
      expect(equinoxEvents.length).toBeGreaterThanOrEqual(2);
    });

    test('includes year-specific events', () => {
      const events = calendar.getFallbackEvents();
      const eclipseEvents = events.filter((e) => e.type === 'eclipse');
      const planetEvents = events.filter((e) => e.type === 'planet');
      expect(eclipseEvents.length).toBeGreaterThan(0);
      expect(planetEvents.length).toBeGreaterThan(0);
    });

    test('all events have required properties', () => {
      const events = calendar.getFallbackEvents();
      events.forEach((event) => {
        expect(event).toHaveProperty('name');
        expect(event).toHaveProperty('date');
        expect(event).toHaveProperty('type');
        expect(event).toHaveProperty('description');
        expect(event.date).toBeInstanceOf(Date);
        expect(typeof event.name).toBe('string');
        expect(typeof event.type).toBe('string');
        expect(typeof event.description).toBe('string');
      });
    });

    test('events span multiple years', () => {
      const events = calendar.getFallbackEvents();
      const years = new Set(events.map((e) => e.date.getFullYear()));
      expect(years.size).toBeGreaterThan(1);
    });
  });

  describe('getYearSpecificEvents_', () => {
    test('returns events for 2025', () => {
      const events = calendar.getYearSpecificEvents_(2025);
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
    });

    test('2025 events include eclipses', () => {
      const events = calendar.getYearSpecificEvents_(2025);
      const eclipses = events.filter((e) => e.type === 'eclipse');
      expect(eclipses.length).toBeGreaterThan(0);
      expect(eclipses.some((e) => e.name.includes('Lunar Eclipse'))).toBe(true);
    });

    test('2025 events include planetary oppositions', () => {
      const events = calendar.getYearSpecificEvents_(2025);
      const planets = events.filter((e) => e.type === 'planet');
      expect(planets.length).toBeGreaterThan(0);
      expect(planets.some((e) => e.name.includes('Mars at Opposition'))).toBe(true);
    });

    test('2025 events include supermoons', () => {
      const events = calendar.getYearSpecificEvents_(2025);
      const moons = events.filter((e) => e.type === 'moon');
      expect(moons.length).toBeGreaterThan(0);
      expect(moons.some((e) => e.name.includes('Supermoon'))).toBe(true);
    });

    test('returns events for 2026', () => {
      const events = calendar.getYearSpecificEvents_(2026);
      expect(events.length).toBeGreaterThan(0);
      const eclipses = events.filter((e) => e.type === 'eclipse');
      expect(eclipses.some((e) => e.name.includes('Total Solar Eclipse'))).toBe(true);
    });

    test('returns events for 2027', () => {
      const events = calendar.getYearSpecificEvents_(2027);
      expect(events.length).toBeGreaterThan(0);
    });

    test('returns events for 2028', () => {
      const events = calendar.getYearSpecificEvents_(2028);
      expect(events.length).toBeGreaterThan(0);
    });

    test('returns events for 2029', () => {
      const events = calendar.getYearSpecificEvents_(2029);
      expect(events.length).toBeGreaterThan(0);
    });

    test('returns empty array for unsupported year', () => {
      const events = calendar.getYearSpecificEvents_(2020);
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBe(0);
    });

    test('returns empty array for far future year', () => {
      const events = calendar.getYearSpecificEvents_(2050);
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBe(0);
    });

    test('all events have valid dates in correct year', () => {
      const testYear = 2026;
      const events = calendar.getYearSpecificEvents_(testYear);
      events.forEach((event) => {
        expect(event.date.getFullYear()).toBe(testYear);
      });
    });

    test('event types are valid', () => {
      const validTypes = ['eclipse', 'planet', 'moon'];
      const events = calendar.getYearSpecificEvents_(2025);
      events.forEach((event) => {
        expect(validTypes).toContain(event.type);
      });
    });
  });

  describe('event data integrity', () => {
    test('no duplicate events in same year', () => {
      const events = calendar.getYearSpecificEvents_(2025);
      const eventKeys = events.map((e) => `${e.name}-${e.date.toISOString()}`);
      const uniqueKeys = new Set(eventKeys);
      expect(uniqueKeys.size).toBe(eventKeys.length);
    });

    test('events are sorted chronologically within getFallbackEvents', () => {
      const events = calendar.getFallbackEvents();
      // Group by year first
      const currentYear = new Date().getFullYear();
      const thisYearEvents = events.filter((e) =>
        e.date.getFullYear() === currentYear
      );

      // Check that events of the same type are in order
      const meteorEvents = thisYearEvents.filter((e) => e.type === 'meteor');
      for (let i = 1; i < meteorEvents.length; i++) {
        expect(meteorEvents[i].date.getTime()).toBeGreaterThanOrEqual(
          meteorEvents[i - 1].date.getTime()
        );
      }
    });

    test('eclipse descriptions include visibility information', () => {
      const events = calendar.getYearSpecificEvents_(2025);
      const eclipses = events.filter((e) => e.type === 'eclipse');
      eclipses.forEach((eclipse) => {
        expect(eclipse.description.toLowerCase()).toMatch(/visible|path/);
      });
    });

    test('planet opposition descriptions include brightness info', () => {
      const events = calendar.getYearSpecificEvents_(2025);
      const planets = events.filter((e) => e.type === 'planet');
      planets.forEach((planet) => {
        expect(planet.description.toLowerCase()).toMatch(/brightest|visible|magnitude/);
      });
    });
  });

  describe('getNextEvent', () => {
    test('returns the soonest upcoming event', () => {
      const next = calendar.getNextEvent();
      const upcoming = calendar.getUpcomingEvents();
      expect(next).toBe(upcoming[0]);
    });

    test('the returned event is in the future', () => {
      const next = calendar.getNextEvent();
      expect(next).not.toBeNull();
      expect(next.date.getTime()).toBeGreaterThan(Date.now());
    });

    test('no other upcoming event is sooner', () => {
      const next = calendar.getNextEvent();
      const upcoming = calendar.getUpcomingEvents();
      upcoming.forEach((event) => {
        expect(event.date.getTime()).toBeGreaterThanOrEqual(next.date.getTime());
      });
    });
  });
});
