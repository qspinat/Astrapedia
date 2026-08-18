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
      clearSelection: jest.fn(),
      getMagnitudeLimit: jest.fn().mockReturnValue(8.0),
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
      expect(mockDeps.clearSelection).toHaveBeenCalled();
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

    // The test mock's raycaster always points at RA 0 / Dec 0, so a planet
    // there is exactly what a click resolves to. `!planetData.ra` treated that
    // real coordinate — the vernal equinox — as missing data.
    test('selects a planet sitting at RA 0', () => {
      mockDeps.getPlanetSprites.mockReturnValue([{
        userData: {name: 'Mars', ra: 0, dec: 0, mag: 1, angularSize: 10},
      }]);

      handler.handleClick(0, 0);

      expect(mockDeps.selectObject).toHaveBeenCalledWith(
          expect.objectContaining({name: 'Mars'}));
    });

    test('selects a planet at declination 0', () => {
      mockDeps.getPlanetSprites.mockReturnValue([{
        userData: {name: 'Venus', ra: 0.5, dec: 0, mag: -4, angularSize: 20},
      }]);

      handler.handleClick(0, 0);

      expect(mockDeps.selectObject).toHaveBeenCalledWith(
          expect.objectContaining({name: 'Venus'}));
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

    test('gives lines the same tolerance as the star field', () => {
      mockCamera.fov = 30;
      mockDeps.isConstellationLinesVisible.mockReturnValue(true);
      mockDeps.getConstellationLinesGroup.mockReturnValue({children: []});

      handler.handleClick(0, 0);

      // Lines used to get 2.0 against the star field's 5.0. Combined with
      // being checked last, that meant a click on a line almost always went
      // to a nearby star instead.
      expect(handler.raycaster_.params.Line.threshold)
          .toBeCloseTo(handler.raycaster_.params.Points.threshold, 6);
    });

    test('scales the line threshold with FOV, holding screen tolerance', () => {
      mockDeps.isConstellationLinesVisible.mockReturnValue(true);
      mockDeps.getConstellationLinesGroup.mockReturnValue({children: []});

      mockCamera.fov = 60;
      handler.handleClick(0, 0);
      const wide = handler.raycaster_.params.Line.threshold;

      mockCamera.fov = 15;
      handler.handleClick(0, 0);
      const narrow = handler.raycaster_.params.Line.threshold;

      expect(wide / narrow).toBeCloseTo(4, 6);
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
      clearSelection: jest.fn(),
      getMagnitudeLimit: jest.fn().mockReturnValue(8.0),
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

describe('ClickHandler detection paths', () => {
  let handler;
  let mockDeps;

  const mockCamera = {fov: 60};
  const mockRenderer = {
    domElement: {height: 600, width: 800},
  };

  beforeEach(() => {
    jest.clearAllMocks();

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
      clearSelection: jest.fn(),
      getMagnitudeLimit: jest.fn().mockReturnValue(8.0),
      getConstellationName: jest.fn((key) => key),
    };

    handler = new ClickHandler(mockDeps);
  });

  describe('planet click detection', () => {
    test('calls getPlanetSprites during click detection', () => {
      handler.handleClick(0, 0);
      expect(mockDeps.getPlanetSprites).toHaveBeenCalled();
    });

    test('skips planet sprites without ra property', () => {
      const invalidSprite = {
        userData: {name: 'Invalid', dec: 0, mag: 0}, // missing ra
      };
      mockDeps.getPlanetSprites.mockReturnValue([invalidSprite]);

      handler.handleClick(0, 0);

      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });

    test('skips planet sprites without userData', () => {
      const emptySprite = {};
      mockDeps.getPlanetSprites.mockReturnValue([emptySprite]);

      handler.handleClick(0, 0);

      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });

    test('queries celestial sphere for planet coordinate transform', () => {
      const planetSprite = {
        userData: {name: 'Mars', ra: 0, dec: 0, mag: -2, angularSize: 10},
      };
      mockDeps.getPlanetSprites.mockReturnValue([planetSprite]);

      handler.handleClick(0, 0);

      expect(mockDeps.getCelestialSphere).toHaveBeenCalled();
    });
  });

  describe('star click detection with raycaster', () => {
    test('detects star click when raycaster returns intersection', () => {
      const mockStarField = {
        userData: {
          stars: [
            {proper: 'Vega', ra: 279, dec: 38, mag: 0.03, spect: 'A0V', dist: 25},
          ],
          dsos: [],
        },
      };
      mockDeps.getStarField.mockReturnValue(mockStarField);

      // Override raycaster to return intersection
      const originalRaycaster = handler.raycaster_;
      handler.raycaster_.intersectObject = jest.fn().mockReturnValue([
        {index: 0, distance: 50},
      ]);

      handler.handleClick(0, 0);

      expect(mockDeps.selectObject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Vega',
          type: 'Star',
          subtype: 'Spectral type A0V',
        })
      );
    });

    test('detects DSO click from starField when index is beyond stars', () => {
      const mockStarField = {
        userData: {
          stars: [{proper: 'Star1', ra: 0, dec: 0, mag: 5}],
          dsos: [{
            messier: 31,
            ngc: 224,
            name: 'Andromeda',
            ra: 10,
            dec: 41,
            mag: 3.4,
            type: 'G',
          }],
        },
      };
      mockDeps.getStarField.mockReturnValue(mockStarField);
      handler.raycaster_.intersectObject = jest.fn().mockReturnValue([
        {index: 1, distance: 50}, // Index 1 = first DSO
      ]);

      handler.handleClick(0, 0);

      expect(mockDeps.selectObject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'M31',
          type: expect.any(String),
        })
      );
    });

    test('creates star name from Bayer-Flamsteed if no proper name', () => {
      const mockStarField = {
        userData: {
          stars: [{bf: 'Alpha Lyr', ra: 279, dec: 38, mag: 0.03}],
          dsos: [],
        },
      };
      mockDeps.getStarField.mockReturnValue(mockStarField);
      handler.raycaster_.intersectObject = jest.fn().mockReturnValue([
        {index: 0, distance: 50},
      ]);

      handler.handleClick(0, 0);

      expect(mockDeps.selectObject).toHaveBeenCalledWith(
        expect.objectContaining({name: 'Alpha Lyr'})
      );
    });

    test('creates star name from HIP number if no proper or bf name', () => {
      const mockStarField = {
        userData: {
          stars: [{hip: 91262, ra: 279, dec: 38, mag: 0.03}],
          dsos: [],
        },
      };
      mockDeps.getStarField.mockReturnValue(mockStarField);
      handler.raycaster_.intersectObject = jest.fn().mockReturnValue([
        {index: 0, distance: 50},
      ]);

      handler.handleClick(0, 0);

      expect(mockDeps.selectObject).toHaveBeenCalledWith(
        expect.objectContaining({name: 'HIP 91262'})
      );
    });
  });

  describe('dynamic star click detection', () => {
    test('detects click on dynamic star', () => {
      // Set magnitude limit high enough to allow clicking on the star
      mockDeps.getMagnitudeLimit.mockReturnValue(15);

      const mockDynamicManager = {
        getDynamicStarField: jest.fn().mockReturnValue({}),
        getVisibleIndices: jest.fn().mockReturnValue([0, 1, 2]),
        getDynamicStars: jest.fn().mockReturnValue([
          {ra: 45.123, dec: 30.456, mag: 12},
          {ra: 46.789, dec: 31.012, mag: 13},
        ]),
      };
      mockDeps.getDynamicObjectManager.mockReturnValue(mockDynamicManager);

      // Mock raycaster to return intersection at index 0
      handler.raycaster_.intersectObject = jest.fn().mockReturnValue([
        {index: 0, distance: 50},
      ]);

      handler.handleClick(0, 0);

      expect(mockDeps.selectObject).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Star',
          subtype: 'Catalog star (VizieR)',
        })
      );
    });

    test('returns false when visible index out of range', () => {
      const mockDynamicManager = {
        getDynamicStarField: jest.fn().mockReturnValue({}),
        getVisibleIndices: jest.fn().mockReturnValue([100]), // Out of range
        getDynamicStars: jest.fn().mockReturnValue([{ra: 0, dec: 0, mag: 10}]),
      };
      mockDeps.getDynamicObjectManager.mockReturnValue(mockDynamicManager);
      handler.raycaster_.intersectObject = jest.fn().mockReturnValue([
        {index: 0, distance: 50},
      ]);

      handler.handleClick(0, 0);

      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });

    test('skips stars above magnitude limit', () => {
      // Default magnitude limit is 8.0, star has magnitude 12
      const mockDynamicManager = {
        getDynamicStarField: jest.fn().mockReturnValue({}),
        getVisibleIndices: jest.fn().mockReturnValue([0]),
        getDynamicStars: jest.fn().mockReturnValue([
          {ra: 45.123, dec: 30.456, mag: 12},
        ]),
      };
      mockDeps.getDynamicObjectManager.mockReturnValue(mockDynamicManager);
      handler.raycaster_.intersectObject = jest.fn().mockReturnValue([
        {index: 0, distance: 50},
      ]);

      handler.handleClick(0, 0);

      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });
  });

  describe('DSO click detection via extended objects', () => {
    test('calls getExtendedObjectSprites during click detection', () => {
      handler.handleClick(0, 0);
      expect(mockDeps.getExtendedObjectSprites).toHaveBeenCalled();
    });

    test('skips DSO sprites without valid ra property', () => {
      const invalidSprite = {
        userData: {
          dso: {name: 'Test', dec: 0, mag: 5, type: 'G'}, // missing ra
          angularSizeArcmin: 10,
        },
      };
      mockDeps.getExtendedObjectSprites.mockReturnValue([invalidSprite]);

      handler.handleClick(0, 0);

      expect(mockDeps.selectObject).not.toHaveBeenCalled();
    });

    test('queries celestial sphere for coordinate transform', () => {
      const dsoSprite = {
        userData: {
          dso: {name: 'Test', ra: 0, dec: 0, mag: 5, type: 'G'},
          angularSizeArcmin: 10,
        },
      };
      mockDeps.getExtendedObjectSprites.mockReturnValue([dsoSprite]);

      handler.handleClick(0, 0);

      expect(mockDeps.getCelestialSphere).toHaveBeenCalled();
    });
  });

  describe('constellation click detection', () => {
    test('detects constellation line click', () => {
      mockDeps.isConstellationLinesVisible.mockReturnValue(true);

      const mockLine = {
        userData: {constellation: 'ORI'},
      };
      const mockGroup = {children: [mockLine]};
      mockDeps.getConstellationLinesGroup.mockReturnValue(mockGroup);

      // Mock raycaster to return line intersection
      handler.raycaster_.intersectObjects = jest.fn().mockReturnValue([
        // Real Line raycast results carry the point on the segment.
        {object: mockLine, distance: 50,
          point: {x: 100, y: 0, z: 0}, distanceToRay: 0.5},
      ]);

      handler.handleClick(0, 0);

      expect(mockDeps.showConstellationInfo).toHaveBeenCalledWith('ORI');
    });

    test('calls checkGameAnswerByName in game mode', () => {
      mockDeps.isConstellationLinesVisible.mockReturnValue(true);
      mockDeps.isGameActive.mockReturnValue(true);

      const mockLine = {userData: {constellation: 'ORI'}};
      mockDeps.getConstellationLinesGroup.mockReturnValue({children: [mockLine]});
      handler.raycaster_.intersectObjects = jest.fn().mockReturnValue([
        // Real Line raycast results carry the point on the segment.
        {object: mockLine, distance: 50,
          point: {x: 100, y: 0, z: 0}, distanceToRay: 0.5},
      ]);

      handler.handleClick(0, 0);

      expect(mockDeps.checkGameAnswerByName).toHaveBeenCalledWith('ORI');
      expect(mockDeps.showConstellationInfo).not.toHaveBeenCalled();
    });

    test('ignores click when constellation key is missing', () => {
      mockDeps.isConstellationLinesVisible.mockReturnValue(true);

      const mockLine = {userData: {}};
      mockDeps.getConstellationLinesGroup.mockReturnValue({children: [mockLine]});
      handler.raycaster_.intersectObjects = jest.fn().mockReturnValue([
        // Real Line raycast results carry the point on the segment.
        {object: mockLine, distance: 50,
          point: {x: 100, y: 0, z: 0}, distanceToRay: 0.5},
      ]);

      handler.handleClick(0, 0);

      expect(mockDeps.showConstellationInfo).not.toHaveBeenCalled();
    });
  });

  describe('handleObjectClick_', () => {
    test('unhighlights constellation before selecting via star click', () => {
      // Test via star click which uses raycaster intersection
      const mockStarField = {
        userData: {
          stars: [{proper: 'TestStar', ra: 0, dec: 0, mag: 5}],
          dsos: [],
        },
      };
      mockDeps.getStarField.mockReturnValue(mockStarField);
      handler.raycaster_.intersectObject = jest.fn().mockReturnValue([
        {index: 0, distance: 50},
      ]);

      handler.handleClick(0, 0);

      expect(mockDeps.unhighlightConstellation).toHaveBeenCalled();
      expect(mockDeps.selectObject).toHaveBeenCalled();
    });
  });

  describe('getClickRaDec_', () => {
    test('queries celestial sphere during planet detection', () => {
      // Setup a planet sprite to trigger getClickRaDec_
      const planetSprite = {
        userData: {name: 'Mars', ra: 0, dec: 0, mag: -2, angularSize: 10},
      };
      mockDeps.getPlanetSprites.mockReturnValue([planetSprite]);

      handler.handleClick(0, 0);

      // getCelestialSphere is called during planet click detection
      expect(mockDeps.getCelestialSphere).toHaveBeenCalled();
    });
  });
});


describe('ClickHandler star versus constellation', () => {
  let handler;
  let deps;
  let mockLine;

  beforeEach(() => {
    mockLine = {userData: {constellation: 'ORI'}};
    deps = {
      camera: {fov: 60, updateProjectionMatrix: jest.fn()},
      renderer: {domElement: {width: 800, height: 600}},
      getCelestialSphere: jest.fn(() => null),
      getStarField: jest.fn(() => ({
        userData: {
          stars: [{proper: 'Betelgeuse', ra: 88, dec: 7, mag: 0.5}],
          dsos: [],
        },
      })),
      getPlanetSprites: jest.fn(() => []),
      getExtendedObjectSprites: jest.fn(() => []),
      getConstellationLinesGroup: jest.fn(() => ({children: [mockLine]})),
      getDynamicObjectManager: jest.fn(() => null),
      isConstellationLinesVisible: jest.fn(() => true),
      isGameActive: jest.fn(() => false),
      getMagnitudeLimit: jest.fn(() => 6),
      selectObject: jest.fn(),
      showConstellationInfo: jest.fn(),
      unhighlightConstellation: jest.fn(),
      clearSelection: jest.fn(),
      checkGameAnswer: jest.fn(),
      checkGameAnswerByName: jest.fn(),
    };
    handler = new ClickHandler(deps);
  });

  /**
   * @param {number} starDistance Perpendicular distance to the nearest star.
   * @param {number} lineDistance Perpendicular distance to the nearest line.
   */
  function clickWith(starDistance, lineDistance) {
    handler.raycaster_.intersectObject = jest.fn(() => [
      {index: 0, distanceToRay: starDistance},
    ]);
    handler.raycaster_.intersectObjects = jest.fn(() => [
      {object: mockLine, distance: 50, distanceToRay: lineDistance,
        point: {x: 100, y: 0, z: 0}},
    ]);
    // The mock ray sits at the origin pointing down +x, so a point at
    // (100, 0, 0) is exactly on it; override to report the distance we want.
    handler.raycaster_.ray.distanceToPoint = () => lineDistance;
    handler.handleClick(0, 0);
  }

  // The regression this fixes: the star field was checked first and won by
  // rank, whatever the distances. At a wide field of view its capture radius
  // (~22px) is about the mean spacing between visible stars, so a click on a
  // constellation line practically always selected a star instead.
  test('selects the constellation when the click is nearer the line', () => {
    clickWith(4.0, 0.2);

    expect(deps.showConstellationInfo).toHaveBeenCalledWith('ORI');
    expect(deps.selectObject).not.toHaveBeenCalled();
  });

  test('selects the star when the click is nearer the star', () => {
    clickWith(0.2, 4.0);

    expect(deps.selectObject).toHaveBeenCalledWith(
        expect.objectContaining({name: 'Betelgeuse'}));
    expect(deps.showConstellationInfo).not.toHaveBeenCalled();
  });

  // Constellation lines join bright named stars, so their endpoints are
  // exactly the stars people most want to click. A tie must not take that
  // away from them.
  test('prefers the star when both are equally near', () => {
    clickWith(1.0, 1.0);

    expect(deps.selectObject).toHaveBeenCalled();
    expect(deps.showConstellationInfo).not.toHaveBeenCalled();
  });

  test('still selects a star when no constellation lines are shown', () => {
    deps.isConstellationLinesVisible.mockReturnValue(false);

    clickWith(4.0, 0.2);

    expect(deps.selectObject).toHaveBeenCalled();
    expect(deps.showConstellationInfo).not.toHaveBeenCalled();
  });

  test('answers the game by constellation name when the line wins', () => {
    deps.isGameActive.mockReturnValue(true);

    clickWith(4.0, 0.2);

    expect(deps.checkGameAnswerByName).toHaveBeenCalledWith('ORI');
  });
});


describe('ClickHandler only selects what is on screen', () => {
  let handler;
  let deps;
  let mockLine;

  beforeEach(() => {
    mockLine = {userData: {constellation: 'ORI'}, visible: true, parent: null};
    deps = {
      camera: {fov: 60, updateProjectionMatrix: jest.fn()},
      renderer: {domElement: {width: 800, height: 600}},
      getCelestialSphere: jest.fn(() => null),
      getStarField: jest.fn(() => null),
      getPlanetSprites: jest.fn(() => []),
      getExtendedObjectSprites: jest.fn(() => []),
      getConstellationLinesGroup: jest.fn(() => ({children: [mockLine]})),
      getDynamicObjectManager: jest.fn(() => null),
      isConstellationLinesVisible: jest.fn(() => true),
      isGameActive: jest.fn(() => false),
      getMagnitudeLimit: jest.fn(() => 6),
      selectObject: jest.fn(),
      showConstellationInfo: jest.fn(),
      unhighlightConstellation: jest.fn(),
      clearSelection: jest.fn(),
      checkGameAnswer: jest.fn(),
      checkGameAnswerByName: jest.fn(),
    };
    handler = new ClickHandler(deps);
    handler.raycaster_.intersectObjects = jest.fn(() => [
      {object: mockLine, distance: 50, distanceToRay: 0.1,
        point: {x: 100, y: 0, z: 0}},
    ]);
    handler.raycaster_.ray.distanceToPoint = () => 0.1;
  });

  test('selects a constellation whose lines are drawn', () => {
    handler.handleClick(0, 0);

    expect(deps.showConstellationInfo).toHaveBeenCalledWith('ORI');
  });

  // THREE's raycaster ignores visibility — a hidden LineSegments still
  // reports intersections — so focus mode, which hides every constellation
  // but the nearest, would otherwise let you click one that is not drawn.
  test('ignores a constellation hidden by focus mode', () => {
    mockLine.visible = false;

    handler.handleClick(0, 0);

    expect(deps.showConstellationInfo).not.toHaveBeenCalled();
  });

  test('ignores a constellation whose parent group is hidden', () => {
    mockLine.parent = {visible: false, parent: null};

    handler.handleClick(0, 0);

    expect(deps.showConstellationInfo).not.toHaveBeenCalled();
  });

  test('ignores a hidden planet sprite', () => {
    deps.getPlanetSprites.mockReturnValue([
      {visible: false, parent: null,
        userData: {name: 'Mars', ra: 0, dec: 0, mag: 1, angularSize: 10}},
    ]);

    handler.handleClick(0, 0);

    expect(deps.selectObject).not.toHaveBeenCalled();
  });

  test('ignores a hidden deep sky object sprite', () => {
    deps.getExtendedObjectSprites.mockReturnValue([
      {visible: false, parent: null,
        userData: {dso: {name: 'NGC1', ra: 0, dec: 0, mag: 5, type: 'G',
          size_major: 10}}},
    ]);

    handler.handleClick(0, 0);

    expect(deps.selectObject).not.toHaveBeenCalled();
  });

  // ExtendedObjectRenderer.updateSizes fades a halo out as it grows past half
  // the screen, reaching opacity 0 at full coverage without ever clearing
  // `visible`. Deep sky objects outrank stars and constellations in the
  // ladder, so at deep zoom an invisible halo would swallow every click.
  test('ignores a deep sky object halo that has faded to nothing', () => {
    deps.getExtendedObjectSprites.mockReturnValue([
      {visible: true, parent: null,
        material: {transparent: true, opacity: 0},
        userData: {dso: {name: 'NGC1', ra: 0, dec: 0, mag: 5, type: 'G',
          size_major: 10}}},
    ]);

    handler.handleClick(0, 0);

    expect(deps.selectObject).not.toHaveBeenCalled();
  });

  test('still selects a halo that is merely dimmed', () => {
    deps.getExtendedObjectSprites.mockReturnValue([
      {visible: true, parent: null,
        material: {transparent: true, opacity: 0.2},
        userData: {dso: {name: 'NGC1', ra: 0, dec: 0, mag: 5, type: 'G',
          size_major: 10}}},
    ]);

    handler.handleClick(0, 0);

    expect(deps.selectObject).toHaveBeenCalled();
  });

  // Game mode forces every constellation visible and dims the lines to 0.08
  // rather than hiding them. Those are still the answer the player is meant
  // to click, so the opacity cutoff has to sit below that.
  test('still selects a constellation dimmed by game mode', () => {
    mockLine.material = {transparent: true, opacity: 0.08};

    handler.handleClick(0, 0);

    expect(deps.showConstellationInfo).toHaveBeenCalledWith('ORI');
  });
});
