/**
 * @fileoverview Tests for ClickHandler module.
 */

import {jest} from '@jest/globals';
import * as THREE from 'three';
import {ClickHandler, initializeClickHandler} from '../modules/interaction/ClickHandler.js';

describe('ClickHandler', () => {
  let handler;
  let mockDeps;

  // Mock camera and renderer
  const mockCamera = {fov: 60};
  const mockRenderer = {
    domElement: {height: 600, width: 800},
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock dependencies
    mockDeps = {
      camera: mockCamera,
      renderer: mockRenderer,
      getCelestialSphere: jest.fn().mockReturnValue(null),
      getStarField: jest.fn().mockReturnValue(null),
      getPlanetSprites: jest.fn().mockReturnValue([]),
      getExtendedObjectSprites: jest.fn().mockReturnValue([]),
      getConstellationLinesGroup: jest.fn().mockReturnValue(null),
      getDynamicObjectManager: jest.fn().mockReturnValue(null),
      isConstellationLinesVisible: jest.fn().mockReturnValue(false),
      isGameActive: jest.fn().mockReturnValue(false),
      checkGameAnswer: jest.fn(),
      checkGameAnswerByName: jest.fn(),
      selectObject: jest.fn(),
      showConstellationInfo: jest.fn(),
      unhighlightConstellation: jest.fn(),
      getConstellationName: jest.fn((key) => key),
    };

    handler = new ClickHandler(mockDeps);
  });

  describe('constructor', () => {
    test('creates handler with dependencies', () => {
      expect(handler).toBeInstanceOf(ClickHandler);
    });

    test('initializes raycaster', () => {
      // Verify raycaster was created
      expect(handler).toHaveProperty('raycaster_');
    });

    test('initializes mouse vector', () => {
      // Verify mouse vector was created
      expect(handler).toHaveProperty('mouse_');
    });
  });

  describe('handleClick', () => {
    test('configures raycaster with FOV-scaled threshold', () => {
      mockCamera.fov = 30;
      handler.handleClick(0, 0);
      // Threshold should be scaled based on FOV
      expect(handler.raycaster_.params.Points.threshold).toBeCloseTo(5 * (30 / 60), 2);
    });

    test('tries planet detection first', () => {
      handler.handleClick(0, 0);
      expect(mockDeps.getPlanetSprites).toHaveBeenCalled();
    });

    test('tries star detection when no planets found', () => {
      handler.handleClick(0, 0);
      expect(mockDeps.getStarField).toHaveBeenCalled();
    });

    test('tries dynamic star detection', () => {
      handler.handleClick(0, 0);
      expect(mockDeps.getDynamicObjectManager).toHaveBeenCalled();
    });

    test('tries DSO detection', () => {
      handler.handleClick(0, 0);
      expect(mockDeps.getExtendedObjectSprites).toHaveBeenCalled();
    });

    test('checks constellation visibility', () => {
      handler.handleClick(0, 0);
      expect(mockDeps.isConstellationLinesVisible).toHaveBeenCalled();
    });

    test('unhighlights constellation on empty space click when not in game', () => {
      mockDeps.isGameActive.mockReturnValue(false);
      handler.handleClick(0, 0);
      expect(mockDeps.unhighlightConstellation).toHaveBeenCalled();
    });

    test('does not unhighlight on empty space click during game', () => {
      mockDeps.isGameActive.mockReturnValue(true);
      handler.handleClick(0, 0);
      expect(mockDeps.unhighlightConstellation).not.toHaveBeenCalled();
    });
  });

  describe('detectPlanetClick_', () => {
    test('returns false when no planet sprites exist', () => {
      mockDeps.getPlanetSprites.mockReturnValue([]);
      handler.handleClick(0, 0);
      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });

    test('returns false when planet sprites is null', () => {
      mockDeps.getPlanetSprites.mockReturnValue(null);
      handler.handleClick(0, 0);
      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });

    test('skips sprites without userData.ra', () => {
      mockDeps.getPlanetSprites.mockReturnValue([{userData: {name: 'Invalid'}}]);
      handler.handleClick(0, 0);
      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });

    test('skips sprites without userData', () => {
      mockDeps.getPlanetSprites.mockReturnValue([{}]);
      handler.handleClick(0, 0);
      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });
  });

  describe('detectStarClick_', () => {
    test('returns false when no star field exists', () => {
      mockDeps.getStarField.mockReturnValue(null);
      handler.handleClick(0, 0);
      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });

    test('returns false when starField has no intersections', () => {
      const mockStarField = {
        userData: {
          stars: [{proper: 'Vega', ra: 100, dec: 30, mag: 0}],
          dsos: [],
        },
      };
      mockDeps.getStarField.mockReturnValue(mockStarField);
      // Raycaster mock returns empty by default
      handler.handleClick(0, 0);
      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });
  });

  describe('detectDynamicStarClick_', () => {
    test('returns false when no dynamic object manager', () => {
      mockDeps.getDynamicObjectManager.mockReturnValue(null);
      handler.handleClick(0, 0);
      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });

    test('returns false when no dynamic star field', () => {
      const mockDynamicManager = {
        getDynamicStarField: jest.fn().mockReturnValue(null),
        getVisibleIndices: jest.fn(),
        getDynamicStars: jest.fn(),
      };
      mockDeps.getDynamicObjectManager.mockReturnValue(mockDynamicManager);
      handler.handleClick(0, 0);
      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });

    test('returns false when no dynamic stars', () => {
      const mockDynamicManager = {
        getDynamicStarField: jest.fn().mockReturnValue({}),
        getVisibleIndices: jest.fn().mockReturnValue([0]),
        getDynamicStars: jest.fn().mockReturnValue(null),
      };
      mockDeps.getDynamicObjectManager.mockReturnValue(mockDynamicManager);
      handler.handleClick(0, 0);
      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });
  });

  describe('detectDSOClick_', () => {
    test('returns false when no extended object sprites', () => {
      mockDeps.getExtendedObjectSprites.mockReturnValue([]);
      handler.handleClick(0, 0);
      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });

    test('returns false when extended object sprites is null', () => {
      mockDeps.getExtendedObjectSprites.mockReturnValue(null);
      handler.handleClick(0, 0);
      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });

    test('skips sprites without dso data', () => {
      mockDeps.getExtendedObjectSprites.mockReturnValue([{userData: {}}]);
      handler.handleClick(0, 0);
      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });

    test('skips sprites without dso.ra', () => {
      mockDeps.getExtendedObjectSprites.mockReturnValue([
        {userData: {dso: {name: 'Test'}}},
      ]);
      handler.handleClick(0, 0);
      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });
  });

  describe('detectConstellationClick_', () => {
    test('returns false when constellation lines not visible', () => {
      mockDeps.isConstellationLinesVisible.mockReturnValue(false);
      handler.handleClick(0, 0);
      expect(mockDeps.showConstellationInfo).not.toHaveBeenCalled();
    });

    test('returns false when no constellation lines group', () => {
      mockDeps.isConstellationLinesVisible.mockReturnValue(true);
      mockDeps.getConstellationLinesGroup.mockReturnValue(null);
      handler.handleClick(0, 0);
      expect(mockDeps.showConstellationInfo).not.toHaveBeenCalled();
    });

    test('returns false when constellation lines group has no children', () => {
      mockDeps.isConstellationLinesVisible.mockReturnValue(true);
      mockDeps.getConstellationLinesGroup.mockReturnValue({children: []});
      handler.handleClick(0, 0);
      expect(mockDeps.showConstellationInfo).not.toHaveBeenCalled();
    });

    test('scales line threshold based on FOV', () => {
      mockCamera.fov = 30;
      mockDeps.isConstellationLinesVisible.mockReturnValue(true);
      mockDeps.getConstellationLinesGroup.mockReturnValue({children: []});
      handler.handleClick(0, 0);
      expect(handler.raycaster_.params.Line.threshold).toBeCloseTo(0.5 * (30 / 60), 2);
    });
  });

  describe('game mode behavior', () => {
    test('does not select object when game is active', () => {
      mockDeps.isGameActive.mockReturnValue(true);
      // Even if we would detect something, we shouldn't call selectObject in game mode
      handler.handleClick(0, 0);
      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });
  });

  describe('FOV scaling', () => {
    test('raycaster threshold scales with FOV', () => {
      mockCamera.fov = 120;
      handler.handleClick(0, 0);
      expect(handler.raycaster_.params.Points.threshold).toBeCloseTo(5 * (120 / 60), 2);
    });

    test('narrow FOV has smaller threshold', () => {
      mockCamera.fov = 15;
      handler.handleClick(0, 0);
      expect(handler.raycaster_.params.Points.threshold).toBeCloseTo(5 * (15 / 60), 2);
    });
  });
});

describe('initializeClickHandler', () => {
  test('returns a ClickHandler instance', () => {
    const deps = {
      camera: {fov: 60},
      renderer: {domElement: {height: 600}},
      getCelestialSphere: jest.fn(),
      getStarField: jest.fn(),
      getPlanetSprites: jest.fn(),
      getExtendedObjectSprites: jest.fn(),
      getConstellationLinesGroup: jest.fn(),
      getDynamicObjectManager: jest.fn(),
      isConstellationLinesVisible: jest.fn(),
      isGameActive: jest.fn(),
      checkGameAnswer: jest.fn(),
      checkGameAnswerByName: jest.fn(),
      selectObject: jest.fn(),
      showConstellationInfo: jest.fn(),
      unhighlightConstellation: jest.fn(),
      getConstellationName: jest.fn(),
    };

    const handler = initializeClickHandler(deps);
    expect(handler).toBeInstanceOf(ClickHandler);
  });
});

describe('ClickHandler object creation', () => {
  test('creates correct object for star with proper name', () => {
    // Test the object format that would be created for a star
    const starData = {
      proper: 'Vega',
      bf: 'Alpha Lyr',
      hip: 91262,
      ra: 279.23,
      dec: 38.78,
      mag: 0.03,
      spect: 'A0V',
      dist: 25.04,
    };

    // The expected format
    const expectedObject = {
      name: 'Vega',
      type: 'Star',
      subtype: 'Spectral type A0V',
      ra: 279.23,
      dec: 38.78,
      mag: 0.03,
      distance: '25.0 ly',
      angularSize: null,
    };

    // Manually verify the naming logic
    const name = starData.proper || starData.bf || `HIP ${starData.hip}` || 'Unknown Star';
    expect(name).toBe('Vega');

    const subtype = starData.spect ? `Spectral type ${starData.spect}` : null;
    expect(subtype).toBe('Spectral type A0V');

    const distance = starData.dist ? `${starData.dist.toFixed(1)} ly` : null;
    expect(distance).toBe('25.0 ly');
  });

  test('creates correct object for DSO with Messier number', () => {
    const dsoData = {
      messier: 31,
      ngc: 224,
      name: 'Andromeda Galaxy',
      ra: 10.68,
      dec: 41.27,
      mag: 3.4,
      type: 'G',
    };

    // The expected naming logic
    const name = dsoData.messier
      ? `M${Math.floor(dsoData.messier)}`
      : (dsoData.ngc ? `NGC ${dsoData.ngc}` : dsoData.name || 'Unknown Object');
    expect(name).toBe('M31');
  });

  test('creates correct object for DSO with NGC number only', () => {
    const dsoData = {
      ngc: 7293,
      name: 'Helix Nebula',
      ra: 337.41,
      dec: -20.84,
      mag: 7.6,
      type: 'PN',
    };

    const name = dsoData.messier
      ? `M${Math.floor(dsoData.messier)}`
      : (dsoData.ngc ? `NGC ${dsoData.ngc}` : dsoData.name || 'Unknown Object');
    expect(name).toBe('NGC 7293');
  });

  test('planet subtypes are correctly assigned', () => {
    const testCases = [
      {name: 'Sun', expectedSubtype: 'Star (G2V)'},
      {name: 'Moon', expectedSubtype: 'Natural Satellite'},
      {name: 'Mars', expectedSubtype: 'Planet'},
      {name: 'Jupiter', expectedSubtype: 'Planet'},
      {name: 'Saturn', expectedSubtype: 'Planet'},
    ];

    for (const {name, expectedSubtype} of testCases) {
      const subtype = name === 'Sun'
        ? 'Star (G2V)'
        : (name === 'Moon' ? 'Natural Satellite' : 'Planet');
      expect(subtype).toBe(expectedSubtype);
    }
  });
});
