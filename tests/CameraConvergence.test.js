/**
 * @fileoverview Tests for the camera convergence predicate that gates both
 * the smooth-zoom lerp and PowerManager's idle shutdown.
 *
 * The two must agree. If the power gate is laxer than the lerp, the render
 * loop stops mid-animation and the camera freezes partway through a zoom. If
 * it is stricter, the loop never idles and drains the battery.
 */

import {jest} from '@jest/globals';
import {installThreeMock} from './helpers/threeMock.js';

installThreeMock();

const {AstrapediaApp} = await import('../skymap.js');
const {viewDirection} = await import('../modules/core/CoordinateUtils.js');

/**
 * Builds the minimal slice of app state the convergence predicates read,
 * without running the real constructor (which builds a whole Three.js scene).
 * @param {!Object=} overrides
 * @return {!AstrapediaApp}
 */
function cameraState(overrides = {}) {
  const app = Object.create(AstrapediaApp.prototype);
  Object.assign(app, {
    targetFov: 60,
    camera: {fov: 60, updateProjectionMatrix: () => {}},
    cameraRotation: {theta: 1, phi: 1},
    targetTheta: 1,
    targetPhi: 1,
    zoomLerpSpeed: 0.12,
    updateCameraPosition: () => {},
    gridRenderer_: null,
  }, overrides);
  return app;
}

describe('camera convergence', () => {
  describe('isCameraConverging_', () => {
    test('is false when the camera is already at its target', () => {
      expect(cameraState().isCameraConverging_()).toBe(false);
    });

    test('is false before a target FOV has been set', () => {
      const app = cameraState({targetFov: null, camera: {fov: 60}});

      expect(app.isCameraConverging_()).toBe(false);
    });

    test('is true while the FOV is still far from its target', () => {
      const app = cameraState({targetFov: 5, camera: {fov: 60}});

      expect(app.isCameraConverging_()).toBe(true);
    });

    test('is true while the camera is still rotating', () => {
      const app = cameraState({targetTheta: 2.5});

      expect(app.isCameraConverging_()).toBe(true);
    });

    test('is true while phi is still moving', () => {
      const app = cameraState({targetPhi: 1.8});

      expect(app.isCameraConverging_()).toBe(true);
    });

    // The whole point of the proportional threshold: at FOV 0.001 a fixed
    // 0.001 epsilon would call a 40% remaining gap "settled".
    test('still converges at extreme zoom, where a fixed epsilon would not',
        () => {
          const app = cameraState({
            targetFov: 0.0006,
            camera: {fov: 0.001, updateProjectionMatrix: () => {}},
          });

          expect(app.isCameraConverging_()).toBe(true);
        });

    // Guards the regression the obvious `!!this.targetFov` fix would cause:
    // targetFov is assigned a non-zero value during init and never reset to
    // null, so a truthiness check is permanently true, PowerManager can never
    // stop the loop, and the app renders at 60fps forever.
    test('does not report converging merely because a target FOV exists',
        () => {
          const app = cameraState({targetFov: 60, camera: {fov: 60}});

          expect(app.targetFov).toBeTruthy();
          expect(app.isCameraConverging_()).toBe(false);
        });

    test('takes the short way around the theta wraparound', () => {
      // 0.05 short of a full turn away — a naive difference reads this as
      // nearly 2*PI of travel still to go.
      const app = cameraState({
        cameraRotation: {theta: 0.02, phi: 1},
        targetTheta: 2 * Math.PI - 0.02,
      });

      expect(Math.abs(app.thetaDiffToTarget_())).toBeLessThan(0.05);
      expect(app.isCameraConverging_()).toBe(true);
    });
  });

  describe('updateSmoothZoom agrees with the predicate', () => {
    test('reports no change exactly when not converging', () => {
      const app = cameraState();

      expect(app.isCameraConverging_()).toBe(false);
      expect(app.updateSmoothZoom()).toBe(false);
    });

    test('reports a change while converging', () => {
      const app = cameraState({targetFov: 5, camera: {
        fov: 60,
        updateProjectionMatrix: () => {},
      }});

      expect(app.updateSmoothZoom()).toBe(true);
    });

    test('a zoom settles, and the loop is allowed to idle once it has', () => {
      const app = cameraState({
        targetFov: 5,
        camera: {fov: 60, updateProjectionMatrix: () => {}},
      });

      // Run the lerp to completion the way animate() would.
      let frames = 0;
      while (app.isCameraConverging_() && frames < 1000) {
        app.updateSmoothZoom();
        frames++;
      }

      expect(frames).toBeLessThan(1000);
      expect(app.camera.fov).toBeCloseTo(5, 2);
      expect(app.isCameraConverging_()).toBe(false);
      expect(app.updateSmoothZoom()).toBe(false);
    });

    test('the loop stays alive for every frame of a deep zoom', () => {
      const app = cameraState({
        targetFov: 0.0001,
        camera: {fov: 60, updateProjectionMatrix: () => {}},
      });

      // If the gate went false before the lerp settled, the camera would
      // freeze here at an intermediate FOV.
      let frames = 0;
      while (app.isCameraConverging_() && frames < 5000) {
        app.updateSmoothZoom();
        frames++;
      }

      expect(app.camera.fov).toBeCloseTo(0.0001, 5);
    });
  });

  describe('refresh rate', () => {
    /**
     * Frames until a zoom from 60 to 5 degrees settles within 1%.
     * @param {number} frameMs
     * @returns {number} Elapsed ms
     */
    const zoomTime = (frameMs) => {
      const app = cameraState({targetFov: 5, camera: {fov: 60, updateProjectionMatrix: () => {}}});
      let elapsed = 0;
      while (Math.abs(app.camera.fov - 5) > 0.05) {
        app.updateSmoothZoom(frameMs);
        elapsed += frameMs;
      }
      return elapsed;
    };

    test('a zoom takes as long on a 120 Hz screen as on a 60 Hz one', () => {
      expect(Math.abs(zoomTime(1000 / 120) - zoomTime(1000 / 60))).toBeLessThan(20);
    });
  });

  describe('fly-to', () => {
    /** @returns {!AstrapediaApp} An app flying a quarter turn in theta. */
    function flyingApp() {
      const app = cameraState({
        cameraRotation: {theta: 0, phi: Math.PI / 2},
        isCompassModeEnabled: () => false,
      });
      const to = {theta: Math.PI / 2, phi: Math.PI / 2};
      app.targetTheta = to.theta;
      app.targetPhi = to.phi;
      app.flight_ = {
        from: viewDirection(0, Math.PI / 2), to: viewDirection(to.theta, to.phi),
        theta: to.theta, phi: to.phi, elapsed: 0, duration: 1000,
      };
      return app;
    }

    test('arrives exactly at the target when the time is up', () => {
      const app = flyingApp();
      for (let t = 0; t < 1100; t += 16) app.updateSmoothZoom(16);
      expect(app.cameraRotation.theta).toBe(Math.PI / 2);
      expect(app.flight_).toBeNull();
      expect(app.isCameraConverging_()).toBe(false);
    });

    test('starts gently', () => {
      const app = flyingApp();
      app.updateSmoothZoom(50);
      // Linear would be 5% of the way after 50 of 1000 ms.
      expect(app.cameraRotation.theta).toBeLessThan(0.05 * Math.PI / 2);
    });

    test('a drag during the flight takes over', () => {
      const app = flyingApp();
      app.updateSmoothZoom(100);
      app.targetTheta = 0.2;
      app.updateSmoothZoom(16);
      expect(app.flight_).toBeNull();
    });
  });

  describe('resetView', () => {
    /**
     * @param {!Object=} overrides
     * @return {!AstrapediaApp}
     */
    function resettableApp(overrides = {}) {
      return cameraState({
        camera: {fov: 1.3, updateProjectionMatrix: () => {}},
        cameraDistance: 50,
        computeFovForDistance_: () => 106,
        requestRender: () => {},
        ...overrides,
      });
    }

    test('restores the default camera targets', () => {
      const app = resettableApp();

      app.resetView();

      expect(app.camera.fov).toBe(106);
      expect(app.targetFov).toBe(106);
      expect(app.isCameraConverging_()).toBe(false);
    });

    // Telescope mode locks zoom, so resetting the FOV without leaving the mode
    // strands the user at ~106 degrees with no way back in.
    /**
     * @param {boolean} active
     * @return {{isActive: function(): boolean, deactivateTelescopeMode: !Function}}
     */
    function fakeTelescope(active) {
      return {isActive: () => active, deactivateTelescopeMode: jest.fn()};
    }

    test('leaves telescope mode before resetting', () => {
      const telescope = fakeTelescope(true);
      const app = resettableApp();
      app.setTelescopeController(telescope);

      app.resetView();

      expect(telescope.deactivateTelescopeMode).toHaveBeenCalledTimes(1);
    });

    test('does not touch telescope mode when it is not active', () => {
      const telescope = fakeTelescope(false);
      const app = resettableApp();
      app.setTelescopeController(telescope);

      app.resetView();

      expect(telescope.deactivateTelescopeMode).not.toHaveBeenCalled();
    });

    test('still resets when no telescope is wired', () => {
      const app = resettableApp();

      expect(() => app.resetView()).not.toThrow();
      expect(app.targetFov).toBe(106);
    });
  });
});
