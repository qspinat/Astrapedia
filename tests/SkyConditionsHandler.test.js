/**
 * @fileoverview Tests for SkyConditionsHandler class.
 */

import {jest} from '@jest/globals';
import {SkyConditionsHandler} from '../modules/features/SkyConditionsHandler.js';
import {globalEventBus, Events} from '../modules/core/EventBus.js';

describe('SkyConditionsHandler', () => {
  let handler;

  beforeEach(() => {
    // Clear localStorage before each test (setup.js provides the mock)
    localStorage.clear();
    jest.clearAllMocks();
    handler = new SkyConditionsHandler();
  });

  afterEach(() => {
    if (handler) {
      handler.dispose();
    }
  });

  describe('constructor', () => {
    test('initializes with default light pollution (rural)', () => {
      expect(handler.getLightPollution()).toBe('rural');
    });

    test('loads saved light pollution from localStorage', () => {
      // Set a value in localStorage before creating handler
      localStorage.setItem('astrapedia_light_pollution', 'city');
      const newHandler = new SkyConditionsHandler();
      expect(newHandler.getLightPollution()).toBe('city');
      newHandler.dispose();
    });

    test('ignores invalid localStorage values', () => {
      // Set an invalid value in localStorage
      localStorage.setItem('astrapedia_light_pollution', 'invalid_value');
      const newHandler = new SkyConditionsHandler();
      expect(newHandler.getLightPollution()).toBe('rural'); // Default
      newHandler.dispose();
    });
  });

  describe('calculateNakedEyeLimit', () => {
    test('returns base magnitude for city conditions', () => {
      handler.lightPollution_ = 'city';
      handler.moonAltitude_ = -10; // Moon below horizon
      expect(handler.calculateNakedEyeLimit()).toBe(3.8);
    });

    test('returns base magnitude for suburban conditions', () => {
      handler.lightPollution_ = 'suburban';
      handler.moonAltitude_ = -10;
      expect(handler.calculateNakedEyeLimit()).toBe(5.3);
    });

    test('returns base magnitude for rural conditions', () => {
      handler.lightPollution_ = 'rural';
      handler.moonAltitude_ = -10;
      expect(handler.calculateNakedEyeLimit()).toBe(6.3);
    });

    test('returns base magnitude for dark sky conditions', () => {
      handler.lightPollution_ = 'dark';
      handler.moonAltitude_ = -10;
      expect(handler.calculateNakedEyeLimit()).toBe(7.3);
    });

    test('reduces magnitude when moon is above horizon', () => {
      handler.lightPollution_ = 'dark';
      handler.moonPhase_ = 0.5; // Full moon
      handler.moonAltitude_ = 45; // High in sky
      const limit = handler.calculateNakedEyeLimit();
      expect(limit).toBeLessThan(7.3);
    });

    test('never returns below minimum of 2.0', () => {
      handler.lightPollution_ = 'city';
      handler.moonPhase_ = 0.5; // Full moon
      handler.moonAltitude_ = 90; // Zenith
      expect(handler.calculateNakedEyeLimit()).toBeGreaterThanOrEqual(2.0);
    });
  });

  describe('getMoonIllumination_', () => {
    test('returns 1.0 for full moon (phase 0.5)', () => {
      const illumination = handler.getMoonIllumination_(0.5);
      expect(illumination).toBeCloseTo(1.0, 5);
    });

    test('returns 0.0 for new moon (phase 0)', () => {
      const illumination = handler.getMoonIllumination_(0);
      expect(illumination).toBeCloseTo(0.0, 5);
    });

    test('returns 0.0 for new moon (phase 1)', () => {
      const illumination = handler.getMoonIllumination_(1.0);
      expect(illumination).toBeCloseTo(0.0, 5);
    });

    test('returns ~0.5 for quarter moons', () => {
      const firstQuarter = handler.getMoonIllumination_(0.25);
      const lastQuarter = handler.getMoonIllumination_(0.75);
      expect(firstQuarter).toBeCloseTo(0.5, 1);
      expect(lastQuarter).toBeCloseTo(0.5, 1);
    });
  });

  describe('getMoonMagnitudeReduction_', () => {
    test('returns 0 when moon is below horizon', () => {
      handler.moonAltitude_ = -10;
      handler.moonPhase_ = 0.5; // Full moon
      expect(handler.getMoonMagnitudeReduction_()).toBe(0);
    });

    test('returns 0 at horizon', () => {
      handler.moonAltitude_ = 0;
      handler.moonPhase_ = 0.5;
      expect(handler.getMoonMagnitudeReduction_()).toBe(0);
    });

    test('returns max reduction for full moon high in sky', () => {
      handler.moonAltitude_ = 45;
      handler.moonPhase_ = 0.5; // Full moon
      const reduction = handler.getMoonMagnitudeReduction_();
      expect(reduction).toBeCloseTo(2.5, 1);
    });

    test('returns partial reduction for lower altitude', () => {
      handler.moonAltitude_ = 22.5; // Half of full effect altitude
      handler.moonPhase_ = 0.5;
      const reduction = handler.getMoonMagnitudeReduction_();
      expect(reduction).toBeCloseTo(1.25, 1);
    });

    test('returns reduced effect for crescent moon', () => {
      handler.moonAltitude_ = 45;
      handler.moonPhase_ = 0.125; // Waxing crescent
      const reduction = handler.getMoonMagnitudeReduction_();
      expect(reduction).toBeLessThan(2.5);
      expect(reduction).toBeGreaterThan(0);
    });
  });

  describe('getMoonPhaseName_', () => {
    test('returns New Moon for phase 0', () => {
      const result = handler.getMoonPhaseName_(0);
      expect(result.name).toBe('New Moon');
      expect(result.emoji).toBe('🌑');
    });

    test('returns Full Moon for phase 0.5', () => {
      const result = handler.getMoonPhaseName_(0.5);
      expect(result.name).toBe('Full Moon');
      expect(result.emoji).toBe('🌕');
    });

    test('returns First Quarter for phase 0.25', () => {
      const result = handler.getMoonPhaseName_(0.25);
      expect(result.name).toBe('First Quarter');
      expect(result.emoji).toBe('🌓');
    });

    test('returns Last Quarter for phase 0.75', () => {
      const result = handler.getMoonPhaseName_(0.75);
      expect(result.name).toBe('Last Quarter');
      expect(result.emoji).toBe('🌗');
    });

    test('returns Waxing Crescent for phase 0.125', () => {
      const result = handler.getMoonPhaseName_(0.125);
      expect(result.name).toBe('Waxing Crescent');
      expect(result.emoji).toBe('🌒');
    });

    test('returns Waxing Gibbous for phase 0.375', () => {
      const result = handler.getMoonPhaseName_(0.375);
      expect(result.name).toBe('Waxing Gibbous');
      expect(result.emoji).toBe('🌔');
    });

    test('returns Waning Gibbous for phase 0.625', () => {
      const result = handler.getMoonPhaseName_(0.625);
      expect(result.name).toBe('Waning Gibbous');
      expect(result.emoji).toBe('🌖');
    });

    test('returns Waning Crescent for phase 0.875', () => {
      const result = handler.getMoonPhaseName_(0.875);
      expect(result.name).toBe('Waning Crescent');
      expect(result.emoji).toBe('🌘');
    });

    test('returns New Moon for phase near 1.0', () => {
      const result = handler.getMoonPhaseName_(0.97);
      expect(result.name).toBe('New Moon');
      expect(result.emoji).toBe('🌑');
    });
  });

  describe('estimateMoonPhase_', () => {
    test('calculates phase for known new moon date', () => {
      // 6 January 2000, 18:14 UTC was a new moon. Built with Date.UTC, like
      // the epoch it is compared against — the local-time constructor shifts
      // the instant by the runner's offset, which is the bug this pins.
      const newMoonDate = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
      handler.estimateMoonPhase_(newMoonDate);
      expect(handler.moonPhase_).toBeCloseTo(0, 1);
    });

    test('calculates phase for date one lunar cycle later', () => {
      // ~29.5 days after new moon should be another new moon
      const knownNewMoon = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
      const nextNewMoon = new Date(knownNewMoon.getTime() + 29.530588853 * 24 * 60 * 60 * 1000);
      handler.estimateMoonPhase_(nextNewMoon);
      // Phase wraps around, so ~0 or ~1 both represent new moon
      const phase = handler.moonPhase_;
      const isNewMoon = phase < 0.05 || phase > 0.95;
      expect(isNewMoon).toBe(true);
    });

    test('calculates phase for date half lunar cycle later (full moon)', () => {
      const knownNewMoon = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
      const fullMoon = new Date(knownNewMoon.getTime() + 14.765 * 24 * 60 * 60 * 1000);
      handler.estimateMoonPhase_(fullMoon);
      expect(handler.moonPhase_).toBeCloseTo(0.5, 1);
    });

    test('calculates phase for first quarter (7.4 days after new moon)', () => {
      const knownNewMoon = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
      const firstQuarter = new Date(knownNewMoon.getTime() + 7.38 * 24 * 60 * 60 * 1000);
      handler.estimateMoonPhase_(firstQuarter);
      expect(handler.moonPhase_).toBeCloseTo(0.25, 1);
    });

    test('calculates phase for last quarter (22.1 days after new moon)', () => {
      const knownNewMoon = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
      const lastQuarter = new Date(knownNewMoon.getTime() + 22.14 * 24 * 60 * 60 * 1000);
      handler.estimateMoonPhase_(lastQuarter);
      expect(handler.moonPhase_).toBeCloseTo(0.75, 1);
    });

    describe('moon altitude estimation', () => {
      test('new moon at noon has moon below horizon', () => {
        // New moon transits at noon, so at noon it should be highest
        // But we use a simplified model - test that it's reasonable
        const knownNewMoon = new Date(2000, 0, 6, 12, 0, 0); // Noon on new moon
        handler.estimateMoonPhase_(knownNewMoon);
        // New moon transits at noon, so at noon altitude should be high
        expect(handler.moonAltitude_).toBeGreaterThan(0);
      });

      test('full moon at midnight has moon high in sky', () => {
        // Full moon transits at midnight
        const knownNewMoon = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
        const fullMoonMidnight = new Date(knownNewMoon.getTime() + 14.765 * 24 * 60 * 60 * 1000);
        fullMoonMidnight.setHours(0, 0, 0, 0); // Midnight
        handler.estimateMoonPhase_(fullMoonMidnight);
        expect(handler.moonAltitude_).toBeGreaterThan(30);
      });

      test('full moon at noon has moon below horizon', () => {
        // Full moon transits at midnight, so at noon it should be below horizon
        const knownNewMoon = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
        const fullMoonNoon = new Date(knownNewMoon.getTime() + 14.765 * 24 * 60 * 60 * 1000);
        fullMoonNoon.setHours(12, 0, 0, 0); // Noon
        handler.estimateMoonPhase_(fullMoonNoon);
        expect(handler.moonAltitude_).toBeLessThan(0);
      });

      test('first quarter moon at 6pm has moon high in sky', () => {
        // First quarter transits at ~6pm
        const knownNewMoon = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
        const firstQuarter = new Date(knownNewMoon.getTime() + 7.38 * 24 * 60 * 60 * 1000);
        firstQuarter.setHours(18, 0, 0, 0); // 6 PM
        handler.estimateMoonPhase_(firstQuarter);
        expect(handler.moonAltitude_).toBeGreaterThan(30);
      });

      test('altitude varies with time of day', () => {
        // Test that moon altitude changes throughout the day
        const testDate = new Date(2024, 6, 15);

        const altitudes = [];
        for (let hour = 0; hour < 24; hour += 6) {
          testDate.setHours(hour, 0, 0, 0);
          handler.estimateMoonPhase_(testDate);
          altitudes.push(handler.moonAltitude_);
        }

        // Should have variation in altitudes
        const minAlt = Math.min(...altitudes);
        const maxAlt = Math.max(...altitudes);
        expect(maxAlt - minAlt).toBeGreaterThan(20);
      });

      test('moon is above horizon for about 12 hours', () => {
        const testDate = new Date(2024, 6, 15);
        let hoursAboveHorizon = 0;

        for (let hour = 0; hour < 24; hour++) {
          testDate.setHours(hour, 0, 0, 0);
          handler.estimateMoonPhase_(testDate);
          if (handler.moonAltitude_ > 0) {
            hoursAboveHorizon++;
          }
        }

        // Moon should be above horizon for roughly 12 hours (±2)
        expect(hoursAboveHorizon).toBeGreaterThanOrEqual(10);
        expect(hoursAboveHorizon).toBeLessThanOrEqual(14);
      });
    });
  });

  describe('onChange', () => {
    test('registers callback', () => {
      const callback = jest.fn();
      handler.onChange(callback);
      handler.notifyChange_();
      expect(callback).toHaveBeenCalled();
    });

    test('supports multiple callbacks', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      handler.onChange(callback1);
      handler.onChange(callback2);
      handler.notifyChange_();
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('getNakedEyeLimit', () => {
    test('returns same value as calculateNakedEyeLimit', () => {
      handler.lightPollution_ = 'dark';
      handler.moonAltitude_ = -10;
      expect(handler.getNakedEyeLimit()).toBe(handler.calculateNakedEyeLimit());
    });
  });

  describe('getLightPollution', () => {
    test('returns current light pollution setting', () => {
      handler.lightPollution_ = 'suburban';
      expect(handler.getLightPollution()).toBe('suburban');
    });
  });

  describe('dispose', () => {
    test('clears update interval', () => {
      jest.useFakeTimers();
      handler.updateInterval_ = setInterval(() => {}, 1000);
      handler.dispose();
      expect(handler.updateInterval_).toBeNull();
      jest.useRealTimers();
    });

    test('handles null interval gracefully', () => {
      handler.updateInterval_ = null;
      expect(() => handler.dispose()).not.toThrow();
    });
  });

  describe('integration', () => {
    test('full moon in dark sky reduces NELM significantly', () => {
      handler.lightPollution_ = 'dark'; // Base 7.3
      handler.moonPhase_ = 0.5; // Full moon
      handler.moonAltitude_ = 45; // High in sky

      const limit = handler.calculateNakedEyeLimit();
      // Should be significantly reduced from 7.3
      expect(limit).toBeLessThan(6.0);
      expect(limit).toBeGreaterThanOrEqual(2.0);
    });

    test('new moon has no effect on NELM', () => {
      handler.lightPollution_ = 'dark';
      handler.moonPhase_ = 0; // New moon
      handler.moonAltitude_ = 45;

      const limit = handler.calculateNakedEyeLimit();
      expect(limit).toBeCloseTo(7.3, 1);
    });

    test('city conditions with full moon are very poor', () => {
      handler.lightPollution_ = 'city'; // Base 3.8
      handler.moonPhase_ = 0.5;
      handler.moonAltitude_ = 45;

      const limit = handler.calculateNakedEyeLimit();
      // Should be clamped to minimum
      expect(limit).toBe(2.0);
    });
  });

  describe('EventBus integration', () => {
    beforeEach(() => {
      // Set up event listeners (normally done by UI setup)
      handler.setupEventListeners();
    });

    test('TIME_CHANGED event updates simulationTime_', () => {
      const testTime = new Date('2025-06-15T22:00:00Z');
      globalEventBus.emit(Events.TIME_CHANGED, {time: testTime});

      expect(handler.simulationTime_).toEqual(testTime);
    });

    test('LOCATION_CHANGED event updates observerLocation_', () => {
      const testLocation = {lat: 48.8566, lon: 2.3522};
      globalEventBus.emit(Events.LOCATION_CHANGED, {location: testLocation});

      expect(handler.observerLocation_.lat).toBe(48.8566);
      expect(handler.observerLocation_.lon).toBe(2.3522);
    });

    test('PLANETS_UPDATED event updates moon data', () => {
      const moonData = {
        name: 'Moon',
        ra: 120,
        dec: 15,
        phase: 0.35,
      };
      globalEventBus.emit(Events.PLANETS_UPDATED, {
        planets: [moonData],
        moon: moonData,
      });

      expect(handler.moonPhase_).toBe(0.35);
      expect(handler.cachedMoonData_).toEqual(moonData);
    });

    test('PLANETS_UPDATED event handles missing moon gracefully', () => {
      const originalPhase = handler.moonPhase_;
      globalEventBus.emit(Events.PLANETS_UPDATED, {
        planets: [],
        moon: null,
      });

      // Should not change when no moon data
      expect(handler.moonPhase_).toBe(originalPhase);
    });

    test('dispose() cleans up EventBus subscriptions', () => {
      const initialListenerCount = globalEventBus.listenerCount(Events.TIME_CHANGED);

      handler.dispose();

      // Listener count should decrease after dispose
      const finalListenerCount = globalEventBus.listenerCount(Events.TIME_CHANGED);
      expect(finalListenerCount).toBeLessThan(initialListenerCount);
    });

    test('subscriptions_ array is cleared after dispose', () => {
      expect(handler.subscriptions_.length).toBeGreaterThan(0);

      handler.dispose();

      expect(handler.subscriptions_.length).toBe(0);
    });
  });
});
