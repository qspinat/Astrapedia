/**
 * @fileoverview Tests for the manual "set location" entry point.
 *
 * This path used to parse the prompt input with parseFloat and assign it
 * straight onto the app, with no validation and no persistence. A non-numeric
 * entry produced NaN, which propagated into the scene rotation and blanked
 * the entire sky until reload.
 */

import {jest} from '@jest/globals';
import {installThreeMock} from './helpers/threeMock.js';

installThreeMock();

const {AstrapediaApp} = await import('../skymap.js');
const {locationManager} = await import('../modules/services/LocationManager.js');
const {globalEventBus, Events} = await import('../modules/core/EventBus.js');

describe('setObserverLocation', () => {
  let app;
  let alerts;
  let locationChanges;
  let unsubscribe;

  beforeEach(() => {
    app = Object.create(AstrapediaApp.prototype);
    alerts = [];
    global.alert = (message) => alerts.push(message);

    locationChanges = [];
    unsubscribe = globalEventBus.on(Events.LOCATION_CHANGED, (data) => {
      locationChanges.push(data);
    });

    locationManager.setLocation(0, 0);
    locationChanges.length = 0;
  });

  afterEach(() => {
    unsubscribe?.unsubscribe?.();
  });

  /**
   * @param {?string} lat
   * @param {?string} lon
   */
  function answerPrompts(lat, lon) {
    const answers = [lat, lon];
    global.prompt = () => answers.shift();
  }

  test('applies a valid location through LocationManager', () => {
    answerPrompts('48.8566', '2.3522');

    app.setObserverLocation();

    expect(locationManager.getLocation()).toMatchObject({
      lat: 48.8566,
      lon: 2.3522,
    });
    expect(locationChanges).toHaveLength(1);
  });

  // The bug: parseFloat('north') is NaN, which reached
  // latitudeTiltGroup.rotation.x and propagated through the world matrix, so
  // every star, planet, DSO and constellation line vanished.
  test('rejects non-numeric input instead of emitting NaN', () => {
    answerPrompts('north', '2.3522');

    app.setObserverLocation();

    expect(locationChanges).toHaveLength(0);
    expect(locationManager.getLocation().lat).toBe(0);
    expect(alerts[0]).toMatch(/numeric/i);
  });

  test('rejects a non-numeric longitude', () => {
    answerPrompts('48.8566', 'east');

    app.setObserverLocation();

    expect(locationChanges).toHaveLength(0);
  });

  test('rejects an empty entry', () => {
    answerPrompts('', '');

    app.setObserverLocation();

    expect(locationChanges).toHaveLength(0);
  });

  // `if (lat && lon)` treated "0" as a refusal, so the equator and the prime
  // meridian were unreachable.
  test('accepts zero coordinates', () => {
    locationManager.setLocation(45, 45);
    locationChanges.length = 0;
    answerPrompts('0', '0');

    app.setObserverLocation();

    expect(locationChanges).toHaveLength(1);
    expect(locationManager.getLocation()).toMatchObject({lat: 0, lon: 0});
  });

  test('cancelling the latitude prompt changes nothing', () => {
    answerPrompts(null, '2.3522');

    app.setObserverLocation();

    expect(locationChanges).toHaveLength(0);
    expect(alerts).toHaveLength(0);
  });

  test('cancelling the longitude prompt changes nothing', () => {
    answerPrompts('48.8566', null);

    app.setObserverLocation();

    expect(locationChanges).toHaveLength(0);
    expect(alerts).toHaveLength(0);
  });

  test('clamps an out-of-range latitude rather than accepting it', () => {
    answerPrompts('120', '2.3522');

    app.setObserverLocation();

    expect(locationManager.getLocation().lat).toBe(90);
  });

  test('normalizes an out-of-range longitude', () => {
    answerPrompts('48.8566', '200');

    app.setObserverLocation();

    expect(locationManager.getLocation().lon).toBe(-160);
  });

  // Persistence itself is covered by LocationManager.test.js; what matters
  // here is that this entry point delegates to LocationManager at all, which
  // the LOCATION_CHANGED assertions above establish. Before this change it
  // assigned straight onto the app, so nothing was ever saved.

  test('reports the applied location, not the raw input', () => {
    answerPrompts('120', '2.3522');

    app.setObserverLocation();

    expect(alerts[0]).toContain('90');
  });
});
