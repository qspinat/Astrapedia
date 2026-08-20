/**
 * @fileoverview Tests for the manual "set location" entry point.
 *
 * The entry used to be a native prompt() parsed with parseFloat and assigned
 * straight onto the app — no validation, no persistence — so a non-numeric
 * entry produced NaN that propagated into the scene rotation and blanked the
 * sky. It is now a styled dialog (LocationDialog) that validates input and
 * routes through LocationManager, the owner that clamps, normalizes, persists
 * and emits LOCATION_CHANGED.
 */

import {jest} from '@jest/globals';

const {LocationDialog} =
    await import('../modules/ui/LocationDialog.js');
const {locationManager} =
    await import('../modules/services/LocationManager.js');
const {panelManager} = await import('../modules/ui/PanelManager.js');
const {globalEventBus, Events} = await import('../modules/core/EventBus.js');

describe('LocationDialog', () => {
  let dialog;
  let locationChanges;
  let unsubscribe;
  let notifySpy;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="location-dialog">
        <input id="location-lat">
        <input id="location-lon">
        <p id="location-dialog-error" hidden></p>
        <button id="location-set-btn"></button>
        <button id="location-cancel-btn"></button>
      </div>`;

    dialog = new LocationDialog();
    dialog.initialize();

    notifySpy = jest.spyOn(panelManager, 'showNotification')
        .mockImplementation(() => {});

    locationChanges = [];
    unsubscribe = globalEventBus.on(Events.LOCATION_CHANGED, (data) => {
      locationChanges.push(data);
    });

    locationManager.setLocation(0, 0);
    locationChanges.length = 0;
  });

  afterEach(() => {
    unsubscribe?.unsubscribe?.();
    notifySpy.mockRestore();
  });

  /**
   * @param {string} lat
   * @param {string} lon
   */
  function enterAndSubmit(lat, lon) {
    document.getElementById('location-lat').value = lat;
    document.getElementById('location-lon').value = lon;
    document.getElementById('location-set-btn').click();
  }

  test('applies a valid location through LocationManager', () => {
    enterAndSubmit('48.8566', '2.3522');

    expect(locationManager.getLocation()).toMatchObject({
      lat: 48.8566,
      lon: 2.3522,
    });
    expect(locationChanges).toHaveLength(1);
  });

  test('closes and reports the applied location on success', () => {
    dialog.show();
    enterAndSubmit('48.8566', '2.3522');

    expect(document.getElementById('location-dialog')
        .classList.contains('visible')).toBe(false);
    expect(notifySpy).toHaveBeenCalledWith(expect.stringContaining('48.8566'));
  });

  // parseFloat('north') is NaN, which used to reach the tilt-group rotation
  // and vanish every object; the dialog now rejects it with a message.
  test('rejects non-numeric input instead of emitting NaN', () => {
    enterAndSubmit('north', '2.3522');

    expect(locationChanges).toHaveLength(0);
    expect(locationManager.getLocation().lat).toBe(0);
    const error = document.getElementById('location-dialog-error');
    expect(error.hidden).toBe(false);
    expect(error.textContent).toMatch(/numeric/i);
  });

  test('rejects a non-numeric longitude', () => {
    enterAndSubmit('48.8566', 'east');

    expect(locationChanges).toHaveLength(0);
  });

  test('rejects an empty entry', () => {
    enterAndSubmit('', '');

    expect(locationChanges).toHaveLength(0);
  });

  // `if (lat && lon)` once treated "0" as a refusal, stranding the equator
  // and prime meridian.
  test('accepts zero coordinates', () => {
    locationManager.setLocation(45, 45);
    locationChanges.length = 0;

    enterAndSubmit('0', '0');

    expect(locationChanges).toHaveLength(1);
    expect(locationManager.getLocation()).toMatchObject({lat: 0, lon: 0});
  });

  test('clamps an out-of-range latitude via LocationManager', () => {
    enterAndSubmit('120', '2.3522');

    expect(locationManager.getLocation().lat).toBe(90);
  });

  test('normalizes an out-of-range longitude via LocationManager', () => {
    enterAndSubmit('48.8566', '200');

    expect(locationManager.getLocation().lon).toBe(-160);
  });

  test('cancel closes the dialog without changing location', () => {
    dialog.show();
    document.getElementById('location-lat').value = '48.8566';
    document.getElementById('location-cancel-btn').click();

    expect(locationChanges).toHaveLength(0);
    expect(document.getElementById('location-dialog')
        .classList.contains('visible')).toBe(false);
  });

  test('prefills the current location when shown', () => {
    locationManager.setLocation(51.5, -0.12);

    dialog.show();

    expect(document.getElementById('location-lat').value).toBe('51.5');
    expect(document.getElementById('location-lon').value).toBe('-0.12');
  });
});
