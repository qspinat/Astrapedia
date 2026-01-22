/**
 * @fileoverview Tests for SkyConditionsHandler class.
 */

import {jest} from '@jest/globals';
import {SkyConditionsHandler} from '../modules/features/SkyConditionsHandler.js';

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
      localStorage.setItem('skymap_light_pollution', 'city');
      const newHandler = new SkyConditionsHandler();
      expect(newHandler.getLightPollution()).toBe('city');
      newHandler.dispose();
    });

    test('ignores invalid localStorage values', () => {
      // Set an invalid value in localStorage
      localStorage.setItem('skymap_light_pollution', 'invalid_value');
      const newHandler = new SkyConditionsHandler();
      expect(newHandler.getLightPollution()).toBe('rural'); // Default
      newHandler.dispose();
    });
  });

  describe('calculateNakedEyeLimit', () => {
    test('returns base magnitude for city conditions', () => {
      handler.lightPollution_ = 'city';
      handler.moonAltitude_ = -10; // Moon below horizon
      expect(handler.calculateNakedEyeLimit()).toBe(4.0);
    });

    test('returns base magnitude for suburban conditions', () => {
      handler.lightPollution_ = 'suburban';
      handler.moonAltitude_ = -10;
      expect(handler.calculateNakedEyeLimit()).toBe(5.5);
    });

    test('returns base magnitude for rural conditions', () => {
      handler.lightPollution_ = 'rural';
      handler.moonAltitude_ = -10;
      expect(handler.calculateNakedEyeLimit()).toBe(6.5);
    });

    test('returns base magnitude for dark sky conditions', () => {
      handler.lightPollution_ = 'dark';
      handler.moonAltitude_ = -10;
      expect(handler.calculateNakedEyeLimit()).toBe(7.5);
    });

    test('reduces magnitude when moon is above horizon', () => {
      handler.lightPollution_ = 'dark';
      handler.moonPhase_ = 0.5; // Full moon
      handler.moonAltitude_ = 45; // High in sky
      const limit = handler.calculateNakedEyeLimit();
      expect(limit).toBeLessThan(7.5);
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
      // January 6, 2000 was a known new moon
      const newMoonDate = new Date(2000, 0, 6, 18, 14, 0);
      handler.estimateMoonPhase_(newMoonDate);
      expect(handler.moonPhase_).toBeCloseTo(0, 1);
    });

    test('calculates phase for date one lunar cycle later', () => {
      // ~29.5 days after new moon should be another new moon
      const knownNewMoon = new Date(2000, 0, 6, 18, 14, 0);
      const nextNewMoon = new Date(knownNewMoon.getTime() + 29.530588853 * 24 * 60 * 60 * 1000);
      handler.estimateMoonPhase_(nextNewMoon);
      // Phase wraps around, so ~0 or ~1 both represent new moon
      const phase = handler.moonPhase_;
      const isNewMoon = phase < 0.05 || phase > 0.95;
      expect(isNewMoon).toBe(true);
    });

    test('calculates phase for date half lunar cycle later (full moon)', () => {
      const knownNewMoon = new Date(2000, 0, 6, 18, 14, 0);
      const fullMoon = new Date(knownNewMoon.getTime() + 14.765 * 24 * 60 * 60 * 1000);
      handler.estimateMoonPhase_(fullMoon);
      expect(handler.moonPhase_).toBeCloseTo(0.5, 1);
    });

    test('sets low moon altitude during daytime', () => {
      const daytime = new Date(2024, 6, 15, 12, 0, 0); // Noon
      handler.estimateMoonPhase_(daytime);
      expect(handler.moonAltitude_).toBe(-10);
    });

    test('estimates moon altitude at night based on illumination', () => {
      const nighttime = new Date(2024, 6, 15, 22, 0, 0); // 10 PM
      handler.estimateMoonPhase_(nighttime);
      // Altitude should be scaled by illumination (0-30)
      expect(handler.moonAltitude_).toBeGreaterThanOrEqual(0);
      expect(handler.moonAltitude_).toBeLessThanOrEqual(30);
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
      handler.lightPollution_ = 'dark'; // Base 7.5
      handler.moonPhase_ = 0.5; // Full moon
      handler.moonAltitude_ = 45; // High in sky

      const limit = handler.calculateNakedEyeLimit();
      // Should be significantly reduced from 7.5
      expect(limit).toBeLessThan(6.0);
      expect(limit).toBeGreaterThanOrEqual(2.0);
    });

    test('new moon has no effect on NELM', () => {
      handler.lightPollution_ = 'dark';
      handler.moonPhase_ = 0; // New moon
      handler.moonAltitude_ = 45;

      const limit = handler.calculateNakedEyeLimit();
      expect(limit).toBeCloseTo(7.5, 1);
    });

    test('city conditions with full moon are very poor', () => {
      handler.lightPollution_ = 'city'; // Base 4.0
      handler.moonPhase_ = 0.5;
      handler.moonAltitude_ = 45;

      const limit = handler.calculateNakedEyeLimit();
      // Should be clamped to minimum
      expect(limit).toBe(2.0);
    });
  });
});
