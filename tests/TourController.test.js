/**
 * @fileoverview Tests for TourController module.
 */

import {jest} from '@jest/globals';

// Mock canvas before anything else
const mockContext = {
  clearRect: jest.fn(),
  createRadialGradient: jest.fn(() => ({
    addColorStop: jest.fn(),
  })),
  beginPath: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  fillStyle: '',
};

// Override HTMLCanvasElement.prototype.getContext
HTMLCanvasElement.prototype.getContext = jest.fn(() => mockContext);

// Mock THREE before importing TourController
global.THREE = {
  MathUtils: {
    degToRad: (deg) => deg * Math.PI / 180,
  },
  Vector3: jest.fn().mockImplementation((x, y, z) => ({
    x,
    y,
    z,
    copy: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    normalize: jest.fn().mockReturnThis(),
  })),
  CanvasTexture: jest.fn().mockImplementation(() => ({})),
  SpriteMaterial: jest.fn().mockImplementation(() => ({
    map: {},
    dispose: jest.fn(),
  })),
  Sprite: jest.fn().mockImplementation(() => ({
    position: {copy: jest.fn()},
    scale: {set: jest.fn()},
    material: {
      map: {dispose: jest.fn()},
      dispose: jest.fn(),
      opacity: 1,
    },
    userData: {},
    renderOrder: 0,
  })),
  AdditiveBlending: 2,
};

const {
  TourController,
  initializeTourController,
} = await import('../modules/features/TourController.js');
const {globalEventBus, Events} = await import('../modules/core/EventBus.js');

describe('TourController', () => {
  let controller;
  let mockDependencies;

  const mockPlanets = [
    {name: 'Mars', ra: 100, dec: 10, mag: 0.5, angularSize: 15},
    {name: 'Jupiter', ra: 200, dec: 20, mag: -2.5, angularSize: 40},
    {name: 'Saturn', ra: 250, dec: -15, mag: 0.8, angularSize: 18},
  ];

  const mockDSOs = [
    {name: 'Orion Nebula', messier: 42, ra: 83.82, dec: -5.39, mag: 4.0, type: 'Neb'},
    {name: 'Andromeda Galaxy', messier: 31, ra: 10.68, dec: 41.27, mag: 3.4, type: 'G'},
    {ngc: 7293, ra: 337.41, dec: -20.84, mag: 7.6, type: 'PN', common_names: 'Helix Nebula'},
  ];

  const mockStars = [
    {proper: 'Sirius', ra: 101.29, dec: -16.72, mag: -1.46},
    {proper: 'Vega', ra: 279.23, dec: 38.78, mag: 0.03},
  ];

  beforeEach(() => {
    mockDependencies = {
      navigateToRaDec: jest.fn(),
      highlightConstellation: jest.fn(),
      unhighlightConstellation: jest.fn(),
      showObjectInfo: jest.fn(),
      showConstellationInfo: jest.fn(),
      getLST: jest.fn().mockReturnValue(180),
      getLocation: jest.fn().mockReturnValue({lat: 45, lon: 0}),
      getPlanets: jest.fn().mockReturnValue(mockPlanets),
      getDeepSkyObjects: jest.fn().mockReturnValue(mockDSOs),
      getStars: jest.fn().mockReturnValue(mockStars),
      getFOV: jest.fn().mockReturnValue(60),
      setFOV: jest.fn(),
      getConstellationName: jest.fn().mockImplementation((name) => name),
    };
    controller = new TourController(mockDependencies);
    globalEventBus.clear();

    // Mock requestAnimationFrame
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((cb) => {
      cb();
      return 1;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('initializes with no active tour', () => {
      expect(controller.isActive()).toBe(false);
      expect(controller.getCurrentTour()).toBeNull();
      expect(controller.getCurrentStep()).toBe(0);
      expect(controller.getTotalSteps()).toBe(0);
    });
  });

  describe('isActive', () => {
    test('returns false when no tour active', () => {
      expect(controller.isActive()).toBe(false);
    });

    test('returns true when tour is active', () => {
      controller.start('winter-sky');
      expect(controller.isActive()).toBe(true);
    });
  });

  describe('start', () => {
    test('starts a valid tour', () => {
      controller.start('winter-sky');
      expect(controller.isActive()).toBe(true);
      expect(controller.getCurrentTour()).not.toBeNull();
      expect(controller.getCurrentTour().name).toBe('Winter Sky Highlights');
    });

    test('emits TOUR_STARTED event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.TOUR_STARTED, callback);

      controller.start('winter-sky');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          tourName: 'winter-sky',
          tour: expect.any(Object),
        })
      );
    });

    test('logs warning for invalid tour name', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      controller.start('invalid-tour-name');
      expect(warnSpy).toHaveBeenCalledWith('[TourController]', 'Tour not found: invalid-tour-name');
      expect(controller.isActive()).toBe(false);
    });

    test('sets step index to 0', () => {
      controller.start('winter-sky');
      expect(controller.getCurrentStep()).toBe(0);
    });

    test('navigates to first step coordinates', () => {
      controller.start('winter-sky');
      expect(mockDependencies.navigateToRaDec).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    beforeEach(() => {
      controller.start('winter-sky');
    });

    test('deactivates tour', () => {
      controller.stop();
      expect(controller.isActive()).toBe(false);
      expect(controller.getCurrentTour()).toBeNull();
    });

    test('resets step to 0', () => {
      controller.next();
      controller.stop();
      expect(controller.getCurrentStep()).toBe(0);
    });

    test('emits TOUR_ENDED event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.TOUR_ENDED, callback);

      controller.stop();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          tourName: 'Winter Sky Highlights',
        })
      );
    });

    test('calls unhighlightConstellation', () => {
      controller.stop();
      expect(mockDependencies.unhighlightConstellation).toHaveBeenCalled();
    });

    test('does nothing if no tour active', () => {
      controller.stop();
      const callback = jest.fn();
      globalEventBus.on(Events.TOUR_ENDED, callback);
      controller.stop();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('next', () => {
    beforeEach(() => {
      controller.start('winter-sky');
    });

    test('advances to next step', () => {
      controller.next();
      expect(controller.getCurrentStep()).toBe(1);
    });

    test('emits TOUR_STEP_CHANGED event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.TOUR_STEP_CHANGED, callback);

      controller.next();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          stepIndex: 1,
          totalSteps: expect.any(Number),
        })
      );
    });

    test('calls unhighlightConstellation before advancing', () => {
      controller.next();
      expect(mockDependencies.unhighlightConstellation).toHaveBeenCalled();
    });

    test('stops tour when reaching end', () => {
      const tour = controller.getCurrentTour();
      const totalSteps = tour.steps.length;

      for (let i = 0; i < totalSteps; i++) {
        controller.next();
      }

      expect(controller.isActive()).toBe(false);
    });

    test('does nothing if no tour active', () => {
      controller.stop();
      controller.next();
      expect(controller.getCurrentStep()).toBe(0);
    });
  });

  describe('previous', () => {
    beforeEach(() => {
      controller.start('winter-sky');
      controller.next();
      controller.next();
    });

    test('goes back to previous step', () => {
      expect(controller.getCurrentStep()).toBe(2);
      controller.previous();
      expect(controller.getCurrentStep()).toBe(1);
    });

    test('does not go below step 0', () => {
      controller.previous();
      controller.previous();
      controller.previous();
      controller.previous();
      expect(controller.getCurrentStep()).toBe(0);
    });

    test('does nothing if no tour active', () => {
      controller.stop();
      controller.previous();
      expect(controller.getCurrentStep()).toBe(0);
    });
  });

  describe('goToStep', () => {
    beforeEach(() => {
      controller.start('winter-sky');
    });

    test('jumps to specific step', () => {
      controller.goToStep(5);
      expect(controller.getCurrentStep()).toBe(5);
    });

    test('ignores negative step index', () => {
      controller.goToStep(-1);
      expect(controller.getCurrentStep()).toBe(0);
    });

    test('ignores step index beyond total', () => {
      const tour = controller.getCurrentTour();
      controller.goToStep(tour.steps.length + 10);
      expect(controller.getCurrentStep()).toBe(0);
    });

    test('does nothing if no tour active', () => {
      controller.stop();
      controller.goToStep(5);
      expect(controller.getCurrentStep()).toBe(0);
    });
  });

  describe('getTotalSteps', () => {
    test('returns 0 when no tour active', () => {
      expect(controller.getTotalSteps()).toBe(0);
    });

    test('returns correct count when tour active', () => {
      controller.start('winter-sky');
      expect(controller.getTotalSteps()).toBe(10);
    });
  });

  describe('getAvailableTours', () => {
    test('returns all available tours', () => {
      const tours = controller.getAvailableTours();

      expect(tours['winter-sky']).toBeDefined();
      expect(tours['messier-marathon']).toBeDefined();
      expect(tours['constellations']).toBeDefined();
      expect(tours['planets']).toBeDefined();
      expect(tours['best-messier']).toBeDefined();
      expect(tours['best-ngc']).toBeDefined();
      expect(tours['best-nebulae']).toBeDefined();
      expect(tours['best-galaxies']).toBeDefined();
      expect(tours['tonight-best']).toBeDefined();
      expect(tours['best-clusters']).toBeDefined();
    });

    test('planets tour has steps from getPlanets', () => {
      const tours = controller.getAvailableTours();
      const planetsTour = tours['planets'];

      expect(planetsTour.steps.length).toBe(mockPlanets.length);
      expect(planetsTour.steps[0].name).toBe('Mars');
    });

    test('each tour has name and steps', () => {
      const tours = controller.getAvailableTours();

      Object.values(tours).forEach((tour) => {
        expect(tour.name).toBeDefined();
        expect(Array.isArray(tour.steps)).toBe(true);
      });
    });
  });

  describe('getPlanetDescription', () => {
    test('returns description for known planets', () => {
      expect(controller.getPlanetDescription('Mars')).toContain('Red Planet');
      expect(controller.getPlanetDescription('Jupiter')).toContain('Largest planet');
      expect(controller.getPlanetDescription('Saturn')).toContain('ring system');
    });

    test('returns default for unknown planet', () => {
      expect(controller.getPlanetDescription('Unknown')).toBe('Solar System object');
    });
  });

  describe('getBestVisibleObjectsTonight', () => {
    test('returns array of visible objects', () => {
      const objects = controller.getBestVisibleObjectsTonight();
      expect(Array.isArray(objects)).toBe(true);
    });

    test('excludes Sun and Moon from planets', () => {
      mockDependencies.getPlanets.mockReturnValue([
        {name: 'Sun', ra: 0, dec: 0, mag: -26},
        {name: 'Moon', ra: 10, dec: 5, mag: -12},
        ...mockPlanets,
      ]);

      const objects = controller.getBestVisibleObjectsTonight();
      const names = objects.map((o) => o.name);

      expect(names).not.toContain('Sun');
      expect(names).not.toContain('Moon');
    });

    test('sorts by magnitude (brightest first)', () => {
      const objects = controller.getBestVisibleObjectsTonight();

      for (let i = 1; i < objects.length; i++) {
        expect(objects[i].mag).toBeGreaterThanOrEqual(objects[i - 1].mag);
      }
    });

    test('limits to 50 objects', () => {
      const objects = controller.getBestVisibleObjectsTonight();
      expect(objects.length).toBeLessThanOrEqual(50);
    });
  });

  describe('setSceneCallbacks', () => {
    test('stores add and remove callbacks', () => {
      const addCb = jest.fn();
      const removeCb = jest.fn();

      controller.setSceneCallbacks(addCb, removeCb);

      // These should be stored internally
      expect(controller.addHighlightToScene_).toBe(addCb);
      expect(controller.removeHighlightFromScene_).toBe(removeCb);
    });
  });

  describe('updateHighlight', () => {
    beforeEach(() => {
      const addCb = jest.fn();
      const removeCb = jest.fn();
      controller.setSceneCallbacks(addCb, removeCb);
      controller.start('best-messier');
    });

    test('does nothing when no highlight exists', () => {
      controller.tourHighlight_ = null;
      // Should not throw
      controller.updateHighlight(60, 800);
    });

    test('updates opacity and scale when highlight exists', () => {
      // Create mock highlight
      controller.tourHighlight_ = {
        material: {opacity: 1},
        scale: {set: jest.fn()},
        userData: {
          startTime: Date.now() - 1000,
          angularSizeArcmin: 10,
          realWorldSize: 5,
          maxWorldSize: 15,
        },
      };

      controller.updateHighlight(30, 800);

      expect(controller.tourHighlight_.scale.set).toHaveBeenCalled();
    });
  });

  describe('constellation tour', () => {
    test('highlights constellation and shows info', () => {
      controller.start('constellations');

      expect(mockDependencies.highlightConstellation).toHaveBeenCalled();
      expect(mockDependencies.showConstellationInfo).toHaveBeenCalled();
    });
  });

  describe('planets tour', () => {
    test('shows planet info', () => {
      controller.start('planets');

      expect(mockDependencies.showObjectInfo).toHaveBeenCalled();
    });
  });
});

describe('initializeTourController', () => {
  test('creates and returns TourController instance', () => {
    const mockDeps = {
      navigateToRaDec: jest.fn(),
      highlightConstellation: jest.fn(),
      unhighlightConstellation: jest.fn(),
      showObjectInfo: jest.fn(),
      showConstellationInfo: jest.fn(),
      getLST: jest.fn(),
      getLocation: jest.fn(),
      getPlanets: jest.fn().mockReturnValue([]),
      getDeepSkyObjects: jest.fn().mockReturnValue([]),
      getStars: jest.fn().mockReturnValue([]),
      getFOV: jest.fn(),
      setFOV: jest.fn(),
    };

    const result = initializeTourController(mockDeps);
    expect(result).toBeInstanceOf(TourController);
  });
});

describe('TourController EventBus integration', () => {
  let controller;

  beforeEach(() => {
    controller = new TourController({
      navigateToRaDec: jest.fn(),
      highlightConstellation: jest.fn(),
      unhighlightConstellation: jest.fn(),
      showObjectInfo: jest.fn(),
      showConstellationInfo: jest.fn(),
      getLST: jest.fn().mockReturnValue(180),
      getLocation: jest.fn().mockReturnValue({lat: 45, lon: 0}),
      getPlanets: jest.fn().mockReturnValue([]),
      getDeepSkyObjects: jest.fn().mockReturnValue([]),
      getStars: jest.fn().mockReturnValue([]),
      getFOV: jest.fn().mockReturnValue(60),
      setFOV: jest.fn(),
    });
    globalEventBus.clear();

    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((cb) => {
      cb();
      return 1;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('TOUR_STARTED includes tour data', () => {
    const callback = jest.fn();
    globalEventBus.on(Events.TOUR_STARTED, callback);

    controller.start('winter-sky');

    expect(callback).toHaveBeenCalledWith({
      tourName: 'winter-sky',
      tour: expect.objectContaining({
        name: 'Winter Sky Highlights',
        steps: expect.any(Array),
      }),
    });
  });

  test('TOUR_STEP_CHANGED includes step and index data', () => {
    const callback = jest.fn();
    globalEventBus.on(Events.TOUR_STEP_CHANGED, callback);

    controller.start('winter-sky');

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        tour: expect.any(Object),
        step: expect.any(Object),
        stepIndex: 0,
        totalSteps: 10,
      })
    );
  });

  test('TOUR_ENDED emits tour name', () => {
    controller.start('winter-sky');

    const callback = jest.fn();
    globalEventBus.on(Events.TOUR_ENDED, callback);

    controller.stop();

    expect(callback).toHaveBeenCalledWith({
      tourName: 'Winter Sky Highlights',
    });
  });
});
