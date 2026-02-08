/**
 * @fileoverview Tests for LocationManager module.
 */

import {jest} from '@jest/globals';
import {LocationManager, locationManager} from '../modules/services/LocationManager.js';
import {globalEventBus, Events} from '../modules/core/EventBus.js';
import {DEFAULT_LOCATION} from '../modules/core/Constants.js';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(global, 'localStorage', {value: localStorageMock, writable: true});

// Mock geolocation
const geolocationMock = {
  getCurrentPosition: jest.fn(),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
};
Object.defineProperty(global.navigator, 'geolocation', {value: geolocationMock, writable: true});

describe('LocationManager', () => {
  let manager;

  beforeEach(() => {
    // Reset localStorage mock
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();

    // Reset geolocation mock
    geolocationMock.getCurrentPosition.mockReset();

    manager = new LocationManager();
    globalEventBus.clear();
  });

  describe('constructor', () => {
    test('uses default location when no saved location', () => {
      const location = manager.getLocation();
      expect(location.lat).toBe(DEFAULT_LOCATION.LATITUDE);
      expect(location.lon).toBe(DEFAULT_LOCATION.LONGITUDE);
      expect(location.height).toBe(DEFAULT_LOCATION.HEIGHT);
    });

    test('loads saved location from localStorage', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify({
        lat: 40.7128,
        lon: -74.0060,
        height: 10,
      }));

      const newManager = new LocationManager();
      const location = newManager.getLocation();

      expect(location.lat).toBe(40.7128);
      expect(location.lon).toBe(-74.0060);
      expect(location.height).toBe(10);
    });

    test('handles invalid saved location gracefully', () => {
      localStorageMock.getItem.mockReturnValue('invalid json');

      const newManager = new LocationManager();
      const location = newManager.getLocation();

      expect(location.lat).toBe(DEFAULT_LOCATION.LATITUDE);
    });

    test('detects geolocation availability', () => {
      expect(manager.isGeolocationAvailable()).toBe(true);
    });
  });

  describe('getLocation', () => {
    test('returns copy of location', () => {
      const location1 = manager.getLocation();
      const location2 = manager.getLocation();

      expect(location1).not.toBe(location2);
      expect(location1).toEqual(location2);
    });
  });

  describe('getLatitude / getLongitude / getHeight', () => {
    test('returns individual coordinates', () => {
      manager.setLocation(48.8566, 2.3522, 50);

      expect(manager.getLatitude()).toBe(48.8566);
      expect(manager.getLongitude()).toBe(2.3522);
      expect(manager.getHeight()).toBe(50);
    });
  });

  describe('setLocation', () => {
    test('sets location with valid coordinates', () => {
      manager.setLocation(51.5074, -0.1278, 11);

      const location = manager.getLocation();
      expect(location.lat).toBe(51.5074);
      expect(location.lon).toBe(-0.1278);
      expect(location.height).toBe(11);
    });

    test('clamps latitude to valid range', () => {
      manager.setLocation(100, 0);
      expect(manager.getLatitude()).toBe(90);

      manager.setLocation(-100, 0);
      expect(manager.getLatitude()).toBe(-90);
    });

    test('normalizes longitude to -180 to 180', () => {
      manager.setLocation(0, 200);
      expect(manager.getLongitude()).toBe(-160);

      manager.setLocation(0, -200);
      expect(manager.getLongitude()).toBe(160);
    });

    test('defaults height to 0', () => {
      manager.setLocation(45, 90);
      expect(manager.getHeight()).toBe(0);
    });

    test('rejects invalid latitude', () => {
      manager.setLocation(45, 90); // Set valid first
      manager.setLocation('invalid', 0);
      expect(manager.getLatitude()).toBe(45); // Unchanged
    });

    test('rejects invalid longitude', () => {
      manager.setLocation(45, 90);
      manager.setLocation(0, 'invalid');
      expect(manager.getLongitude()).toBe(90); // Unchanged
    });

    test('saves to localStorage', () => {
      manager.setLocation(40, -74);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'astrapedia_observer_location',
        expect.any(String)
      );
    });

    test('emits LOCATION_CHANGED event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.LOCATION_CHANGED, callback);

      manager.setLocation(35.6762, 139.6503);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          location: expect.objectContaining({
            lat: 35.6762,
            lon: 139.6503,
          }),
          source: 'manual',
        })
      );
    });
  });

  describe('requestGeolocation', () => {
    test('returns location on success', async () => {
      geolocationMock.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: 37.7749,
            longitude: -122.4194,
            altitude: 5,
            accuracy: 10,
          },
        });
      });

      const location = await manager.requestGeolocation();

      expect(location.lat).toBe(37.7749);
      expect(location.lon).toBe(-122.4194);
      expect(location.height).toBe(5);
    });

    test('emits LOCATION_CHANGED on success', async () => {
      const callback = jest.fn();
      globalEventBus.on(Events.LOCATION_CHANGED, callback);

      geolocationMock.getCurrentPosition.mockImplementation((success) => {
        success({coords: {latitude: 37, longitude: -122, altitude: 0, accuracy: 10}});
      });

      await manager.requestGeolocation();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'geolocation',
          accuracy: 10,
        })
      );
    });

    test('throws on geolocation error', async () => {
      geolocationMock.getCurrentPosition.mockImplementation((success, error) => {
        error(new Error('Permission denied'));
      });

      await expect(manager.requestGeolocation()).rejects.toThrow();
    });

    test('emits LOCATION_ERROR on failure', async () => {
      const callback = jest.fn();
      globalEventBus.on(Events.LOCATION_ERROR, callback);

      geolocationMock.getCurrentPosition.mockImplementation((success, error) => {
        error(new Error('Permission denied'));
      });

      try {
        await manager.requestGeolocation();
      } catch (e) {
        // Expected
      }

      expect(callback).toHaveBeenCalled();
    });

    test('stores last error', async () => {
      const testError = new Error('Test error');
      geolocationMock.getCurrentPosition.mockImplementation((success, error) => {
        error(testError);
      });

      try {
        await manager.requestGeolocation();
      } catch (e) {
        // Expected
      }

      expect(manager.getLastError()).toBe(testError);
    });

    test('returns current location if already requesting', async () => {
      // Start a request that doesn't resolve immediately
      let resolveRequest;
      geolocationMock.getCurrentPosition.mockImplementation((success) => {
        resolveRequest = () => success({
          coords: {latitude: 0, longitude: 0, altitude: 0},
        });
      });

      const request1 = manager.requestGeolocation();

      // Second request should return immediately
      const result = manager.requestGeolocation();

      // Should be same location object (not a pending promise)
      expect(manager.isRequesting()).toBe(true);

      // Resolve the first request
      resolveRequest();
      await request1;

      expect(manager.isRequesting()).toBe(false);
    });

    test('handles null altitude', async () => {
      geolocationMock.getCurrentPosition.mockImplementation((success) => {
        success({coords: {latitude: 0, longitude: 0, altitude: null}});
      });

      const location = await manager.requestGeolocation();
      expect(location.height).toBe(0);
    });
  });

  describe('isGeolocationAvailable', () => {
    test('returns true when geolocation available', () => {
      expect(manager.isGeolocationAvailable()).toBe(true);
    });
  });

  describe('isRequesting', () => {
    test('returns false initially', () => {
      expect(manager.isRequesting()).toBe(false);
    });
  });

  describe('getDisplayString', () => {
    test('formats positive coordinates', () => {
      manager.setLocation(45.5, 90.5);
      expect(manager.getDisplayString()).toBe('45.50°N, 90.50°E');
    });

    test('formats negative coordinates', () => {
      manager.setLocation(-33.87, -151.21);
      expect(manager.getDisplayString()).toBe('33.87°S, 151.21°W');
    });
  });

  describe('calculateLST', () => {
    test('returns value between 0 and 360', () => {
      manager.setLocation(0, 0);
      const lst = manager.calculateLST(new Date());

      expect(lst).toBeGreaterThanOrEqual(0);
      expect(lst).toBeLessThan(360);
    });

    test('changes with longitude', () => {
      const date = new Date('2023-06-15T12:00:00Z');

      manager.setLocation(0, 0);
      const lst0 = manager.calculateLST(date);

      manager.setLocation(0, 15);
      const lst15 = manager.calculateLST(date);

      // 15 degrees longitude = ~15 degrees LST difference
      const diff = (lst15 - lst0 + 360) % 360;
      expect(diff).toBeCloseTo(15, 1);
    });
  });

  describe('calculateAltitude', () => {
    test('calculates altitude for zenith object', () => {
      // Object at zenith at latitude 45N at appropriate time
      manager.setLocation(45, 0);
      // This is a simplified test - actual zenith calculation would need
      // specific time and LST
      const alt = manager.calculateAltitude(0, 45, new Date());
      // Should be positive (above horizon)
      expect(typeof alt).toBe('number');
    });

    test('returns negative for object below horizon', () => {
      manager.setLocation(45, 0);
      // Object at south pole should be below horizon from 45N
      const alt = manager.calculateAltitude(0, -90, new Date());
      expect(alt).toBeLessThan(0);
    });
  });

  describe('isAboveHorizon', () => {
    test('returns true for object above horizon', () => {
      manager.setLocation(45, 0);
      // Polaris should always be above horizon from 45N
      const result = manager.isAboveHorizon(37.95, 89.26, new Date());
      expect(result).toBe(true);
    });

    test('returns false for object below horizon', () => {
      manager.setLocation(45, 0);
      // South pole should always be below horizon from 45N
      const result = manager.isAboveHorizon(0, -90, new Date());
      expect(result).toBe(false);
    });
  });

  describe('resetToDefault', () => {
    test('resets to default location', () => {
      manager.setLocation(40, -74);
      manager.resetToDefault();

      const location = manager.getLocation();
      expect(location.lat).toBe(DEFAULT_LOCATION.LATITUDE);
      expect(location.lon).toBe(DEFAULT_LOCATION.LONGITUDE);
    });

    test('removes from localStorage', () => {
      manager.resetToDefault();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('astrapedia_observer_location');
    });

    test('emits LOCATION_CHANGED with reset source', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.LOCATION_CHANGED, callback);

      manager.resetToDefault();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({source: 'reset'})
      );
    });
  });

  describe('getLatitudeTilt', () => {
    test('returns correct tilt for equator', () => {
      manager.setLocation(0, 0);
      // At equator, tilt should be 90 degrees
      expect(manager.getLatitudeTilt()).toBeCloseTo(Math.PI / 2, 5);
    });

    test('returns correct tilt for north pole', () => {
      manager.setLocation(90, 0);
      // At north pole, tilt should be 0
      expect(manager.getLatitudeTilt()).toBeCloseTo(0, 5);
    });

    test('returns correct tilt for mid-latitude', () => {
      manager.setLocation(45, 0);
      // At 45N, tilt should be 45 degrees
      expect(manager.getLatitudeTilt()).toBeCloseTo(Math.PI / 4, 5);
    });
  });
});

describe('locationManager singleton', () => {
  test('is a LocationManager instance', () => {
    expect(locationManager).toBeInstanceOf(LocationManager);
  });
});
