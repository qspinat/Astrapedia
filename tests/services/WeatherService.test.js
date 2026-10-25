/**
 * @jest-environment jsdom
 * @fileoverview Tests for the optional cloud forecast.
 */

import {jest} from '@jest/globals';
import {
  WeatherService,
  dewRisk,
  parseForecast,
} from '../../modules/services/WeatherService.js';

const RESPONSE = {
  hourly: {
    time: [1798160400, 1798164000],
    cloud_cover: [10, 80],
    cloud_cover_low: [0, 50],
    cloud_cover_mid: [5, 20],
    cloud_cover_high: [5, 10],
    relative_humidity_2m: [70, 95],
    dew_point_2m: [2, 4.5],
    temperature_2m: [8, 5],
    wind_speed_10m: [5, 7],
  },
};

const PARIS = {lat: 48.8566, lon: 2.3522};

describe('parseForecast', () => {
  test('turns columns into one record per hour', () => {
    const [first] = parseForecast(RESPONSE);
    expect(first).toMatchObject({cloudCover: 10, temperature: 8, dewPoint: 2});
    expect(first.time.getTime()).toBe(1798160400 * 1000);
  });

  test('copes with a malformed response', () => {
    expect(parseForecast({})).toEqual([]);
  });
});

describe('dewRisk', () => {
  test('flags air within 2 degrees of its dew point', () => {
    const [dry, damp] = parseForecast(RESPONSE);
    expect(dewRisk(dry)).toBe(false);
    expect(dewRisk(damp)).toBe(true);
  });
});

describe('WeatherService', () => {
  let now;
  let fetchMock;
  let service;

  beforeEach(() => {
    localStorage.clear();
    now = 1_000_000;
    fetchMock = jest.fn(async () => ({ok: true, json: async () => RESPONSE}));
    service = new WeatherService({fetch: fetchMock, now: () => now});
  });

  test('sends only a rounded location', async () => {
    await service.getForecast(PARIS);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('latitude=48.9&longitude=2.4');
    expect(url).not.toContain('48.8566');
  });

  test('serves a recent forecast from cache', async () => {
    await service.getForecast(PARIS);
    now += 30 * 60 * 1000;
    const hours = await service.getForecast(PARIS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hours).toHaveLength(2);
  });

  test('falls back to the cached forecast when offline', async () => {
    await service.getForecast(PARIS);
    now += 2 * 60 * 60 * 1000;
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await service.getForecast(PARIS)).toHaveLength(2);
  });

  test('gives null offline with nothing cached', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await service.getForecast(PARIS)).toBeNull();
  });

  test('does not use a cache from another place', async () => {
    await service.getForecast(PARIS);
    await service.getForecast({lat: 40.7, lon: -74});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('turned off, it never calls the network', async () => {
    service.setEnabled(false);
    expect(await service.getForecast(PARIS)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(new WeatherService({fetch: fetchMock}).isEnabled()).toBe(false);
  });
});
