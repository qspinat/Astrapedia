/**
 * @jest-environment jsdom
 * @fileoverview Tests for naming the object at the screen centre.
 */

import {jest} from '@jest/globals';
import {CenterIdentifier} from '../../modules/features/CenterIdentify.js';
import {findNearestObject} from '../../modules/core/CoordinateUtils.js';
import {globalEventBus, Events} from '../../modules/core/EventBus.js';

describe('findNearestObject', () => {
  const vega = {name: 'Vega', ra: 279.23, dec: 38.78};
  const deneb = {name: 'Deneb', ra: 310.36, dec: 45.28};

  test('picks the closest object in range', () => {
    expect(findNearestObject({ra: 280, dec: 39}, 5, [deneb, vega])).toBe(vega);
  });

  test('finds nothing outside the radius', () => {
    expect(findNearestObject({ra: 0, dec: 0}, 5, [deneb, vega])).toBeNull();
  });
});

describe('CenterIdentifier', () => {
  let identifier;
  let deps;
  const vega = {name: 'Vega', ra: 279.23, dec: 38.78, mag: 0.03};

  beforeEach(() => {
    jest.useFakeTimers();
    globalEventBus.clear();
    document.body.innerHTML = `
      <div id="center-identify"><button id="center-label" hidden></button></div>`;
    deps = {
      getViewCenterRaDec: jest.fn(() => ({ra: 279.5, dec: 38.9})),
      getFov: jest.fn(() => 60),
      getCandidates: jest.fn(() => [vega]),
      selectObject: jest.fn(),
    };
    identifier = new CenterIdentifier(deps);
    identifier.initialize();
  });

  afterEach(() => {
    identifier.dispose();
    jest.useRealTimers();
  });

  const label = () => document.getElementById('center-label');

  test('stays hidden outside compass mode', () => {
    globalEventBus.emit(Events.COMPASS_HEADING, {});
    expect(deps.getCandidates).not.toHaveBeenCalled();
    expect(document.getElementById('center-identify').classList.contains('visible')).toBe(false);
  });

  test('names what the phone points at in compass mode', () => {
    globalEventBus.emit(Events.COMPASS_ENABLED, {enabled: true});
    expect(label().hidden).toBe(false);
    expect(label().textContent).toBe('Vega · mag 0.0');
  });

  test('clears the name when nothing is near the centre', () => {
    globalEventBus.emit(Events.COMPASS_ENABLED, {enabled: true});
    deps.getViewCenterRaDec.mockReturnValue({ra: 100, dec: -40});
    jest.advanceTimersByTime(300);
    globalEventBus.emit(Events.COMPASS_HEADING, {});
    expect(label().hidden).toBe(true);
  });

  test('re-identifies at most every 300 ms while the phone moves', () => {
    globalEventBus.emit(Events.COMPASS_ENABLED, {enabled: true});
    deps.getCandidates.mockClear();
    globalEventBus.emit(Events.COMPASS_HEADING, {});
    expect(deps.getCandidates).not.toHaveBeenCalled();
    jest.advanceTimersByTime(300);
    globalEventBus.emit(Events.COMPASS_HEADING, {});
    expect(deps.getCandidates).toHaveBeenCalledTimes(1);
  });

  test('tapping the name selects the object', () => {
    globalEventBus.emit(Events.COMPASS_ENABLED, {enabled: true});
    label().click();
    expect(deps.selectObject).toHaveBeenCalledWith(vega);
  });

  test('stops when compass mode ends', () => {
    globalEventBus.emit(Events.COMPASS_ENABLED, {enabled: true});
    globalEventBus.emit(Events.COMPASS_DISABLED, {enabled: false});
    deps.getCandidates.mockClear();
    jest.advanceTimersByTime(1000);
    globalEventBus.emit(Events.COMPASS_HEADING, {});
    expect(deps.getCandidates).not.toHaveBeenCalled();
  });
});
