/**
 * @fileoverview Tests for AppContext module.
 */

import {jest} from '@jest/globals';
import {
  AppContext,
  initializeAppContext,
  getAppContext,
} from '../../modules/core/AppContext.js';

describe('AppContext', () => {
  let mockApp;
  let context;

  beforeEach(() => {
    // Create mock app with all expected methods and properties
    mockApp = {
      animateCameraTo: jest.fn(),
      resetCamera: jest.fn(),
      targetFov: 60,
      requestRender: jest.fn(),
      selectObject: jest.fn(),
      performSearch: jest.fn().mockReturnValue([]),
      selectedObject: null,
      setMagnitudeLimit: jest.fn(),
      currentMagnitude: 8.0,
      setEquatorLineVisible: jest.fn(),
      setConstellationLanguage: jest.fn(),
      highlightConstellation: jest.fn(),
      unhighlightConstellation: jest.fn(),
      setTimeSpeed: jest.fn(),
      timeSpeed: 0,
      isTimePlaying: false,
      jumpToTime: jest.fn(),
      simulationTime: new Date('2024-01-01T12:00:00Z'),
      requestGeolocation: jest.fn(),
      showLocationDialog: jest.fn(),
      observerLocation: {lat: 45, lon: 0, height: 0},
      toggleCompassMode: jest.fn(),
      compassMode: false,
      startGame: jest.fn(),
      stopGame: jest.fn(),
      passCurrentObject: jest.fn(),
      gameActive: false,
      startTour: jest.fn(),
      endTour: jest.fn(),
      stars: [{name: 'Sirius'}],
      deepSkyObjects: [{name: 'M31'}],
      constellations: {UMa: {name: 'Ursa Major'}},
      planets: [{name: 'Mars'}],
      maxDynamicStars: 30000,
      telescopeModeActive: false,
    };

    context = new AppContext(mockApp);
  });

  describe('Navigation & Camera', () => {
    it('navigateToRaDec calls app method', () => {
      context.navigateToRaDec(100, 45);
      expect(mockApp.animateCameraTo).toHaveBeenCalledWith(100, 45);
    });

    it('resetCamera calls app method', () => {
      context.resetCamera();
      expect(mockApp.resetCamera).toHaveBeenCalled();
    });

    it('getTargetFov returns app value', () => {
      expect(context.getTargetFov()).toBe(60);
    });

    it('getTargetFov returns default when app value missing', () => {
      mockApp.targetFov = undefined;
      expect(context.getTargetFov()).toBe(60);
    });

    it('setTargetFov sets app value', () => {
      context.setTargetFov(30);
      expect(mockApp.targetFov).toBe(30);
    });

    it('requestRender calls app method', () => {
      context.requestRender();
      expect(mockApp.requestRender).toHaveBeenCalled();
    });
  });

  describe('Selection & Search', () => {
    it('selectObject calls app method', () => {
      const obj = {name: 'Test'};
      context.selectObject(obj);
      expect(mockApp.selectObject).toHaveBeenCalledWith(obj);
    });

    it('performSearch returns results', () => {
      mockApp.performSearch.mockReturnValue([{name: 'Result'}]);
      const results = context.performSearch('test');
      expect(results).toEqual([{name: 'Result'}]);
    });

    it('performSearch returns empty array when no results', () => {
      mockApp.performSearch = undefined;
      const results = context.performSearch('test');
      expect(results).toEqual([]);
    });

    it('getSelectedObject returns app value', () => {
      mockApp.selectedObject = {name: 'Selected'};
      expect(context.getSelectedObject()).toEqual({name: 'Selected'});
    });
  });

  describe('Magnitude & Visibility', () => {
    it('setMagnitudeLimit calls app method', () => {
      context.setMagnitudeLimit(10);
      expect(mockApp.setMagnitudeLimit).toHaveBeenCalledWith(10);
    });

    it('getMagnitudeLimit returns app value', () => {
      expect(context.getMagnitudeLimit()).toBe(8.0);
    });

    it('getMagnitudeLimit returns default when missing', () => {
      mockApp.currentMagnitude = undefined;
      expect(context.getMagnitudeLimit()).toBe(8.0);
    });
  });

  describe('Time Simulation', () => {
    it('setTimeSpeed calls app method', () => {
      context.setTimeSpeed(100);
      expect(mockApp.setTimeSpeed).toHaveBeenCalledWith(100);
    });

    it('getTimeSpeed returns app value', () => {
      mockApp.timeSpeed = 100;
      expect(context.getTimeSpeed()).toBe(100);
    });

    it('isTimePlaying returns app value', () => {
      mockApp.isTimePlaying = true;
      expect(context.isTimePlaying()).toBe(true);
    });

    it('setTimePlaying sets app value', () => {
      context.setTimePlaying(true);
      expect(mockApp.isTimePlaying).toBe(true);
    });

    it('jumpToTime calls app method', () => {
      const date = new Date();
      context.jumpToTime(date);
      expect(mockApp.jumpToTime).toHaveBeenCalledWith(date);
    });

    it('getSimulationTime returns app value', () => {
      const date = mockApp.simulationTime;
      expect(context.getSimulationTime()).toBe(date);
    });
  });

  describe('Data Access', () => {
    it('getStars returns app stars', () => {
      expect(context.getStars()).toEqual([{name: 'Sirius'}]);
    });

    it('getStars returns empty array when missing', () => {
      mockApp.stars = undefined;
      expect(context.getStars()).toEqual([]);
    });

    it('getDSOs returns app DSOs', () => {
      expect(context.getDSOs()).toEqual([{name: 'M31'}]);
    });

    it('getConstellations returns app constellations', () => {
      expect(context.getConstellations()).toEqual({UMa: {name: 'Ursa Major'}});
    });

    it('getPlanets returns app planets', () => {
      expect(context.getPlanets()).toEqual([{name: 'Mars'}]);
    });
  });

  describe('Dynamic Data', () => {
    it('setMaxDynamicStars sets app value', () => {
      context.setMaxDynamicStars(50000);
      expect(mockApp.maxDynamicStars).toBe(50000);
    });

    it('getMaxDynamicStars returns app value', () => {
      expect(context.getMaxDynamicStars()).toBe(30000);
    });
  });

  describe('Telescope Mode', () => {
    it('isTelescopeModeActive returns app value', () => {
      mockApp.telescopeModeActive = true;
      expect(context.isTelescopeModeActive()).toBe(true);
    });

    it('setTelescopeModeActive sets app value', () => {
      context.setTelescopeModeActive(true);
      expect(mockApp.telescopeModeActive).toBe(true);
    });
  });

  describe('initializeAppContext', () => {
    it('creates and returns context', () => {
      const result = initializeAppContext(mockApp);
      expect(result).toBeInstanceOf(AppContext);
    });
  });

  describe('getAppContext', () => {
    it('returns initialized context', () => {
      initializeAppContext(mockApp);
      const result = getAppContext();
      expect(result).toBeInstanceOf(AppContext);
    });

    it('returns same instance on subsequent calls (caching)', () => {
      initializeAppContext(mockApp);
      const result1 = getAppContext();
      const result2 = getAppContext();
      expect(result1).toBe(result2);
    });

    it('initialized context provides access to app data', () => {
      initializeAppContext(mockApp);
      const ctx = getAppContext();

      // Verify the cached context works correctly
      expect(ctx.getStars()).toEqual([{name: 'Sirius'}]);
      expect(ctx.getDSOs()).toEqual([{name: 'M31'}]);
      expect(ctx.getMagnitudeLimit()).toBe(8.0);
    });

    it('initialized context can call app methods', () => {
      initializeAppContext(mockApp);
      const ctx = getAppContext();

      ctx.navigateToRaDec(100, 45);
      expect(mockApp.animateCameraTo).toHaveBeenCalledWith(100, 45);

      ctx.setMagnitudeLimit(10);
      expect(mockApp.setMagnitudeLimit).toHaveBeenCalledWith(10);
    });
  });
});
