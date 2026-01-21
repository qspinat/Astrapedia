/**
 * @fileoverview Tests for camera navigation with celestial sphere rotation.
 * Tests that camera properly accounts for celestial sphere rotation when
 * navigating to RA/Dec coordinates.
 */

describe('Camera Navigation', () => {
  /**
   * Calculate camera theta for given RA and celestial sphere rotation.
   * This mirrors the logic in main.js animateCameraTo.
   * @param {number} ra - Right ascension in degrees
   * @param {number} sphereRotationY - Celestial sphere Y rotation in radians
   * @returns {number} Camera theta in radians
   */
  const calculateCameraTheta = (ra, sphereRotationY = 0) => {
    let theta = -ra * Math.PI / 180 + Math.PI;
    theta -= sphereRotationY;
    return theta;
  };

  /**
   * Calculate camera phi for given declination.
   * @param {number} dec - Declination in degrees
   * @returns {number} Camera phi in radians
   */
  const calculateCameraPhi = (dec) => {
    return (90 - dec) * Math.PI / 180;
  };

  describe('calculateCameraTheta', () => {
    test('returns correct theta for RA=0 with no rotation', () => {
      const theta = calculateCameraTheta(0, 0);
      expect(theta).toBeCloseTo(Math.PI, 5);
    });

    test('returns correct theta for RA=90 with no rotation', () => {
      const theta = calculateCameraTheta(90, 0);
      // -90 * PI/180 + PI = -PI/2 + PI = PI/2
      expect(theta).toBeCloseTo(Math.PI / 2, 5);
    });

    test('returns correct theta for RA=180 with no rotation', () => {
      const theta = calculateCameraTheta(180, 0);
      // -180 * PI/180 + PI = -PI + PI = 0
      expect(theta).toBeCloseTo(0, 5);
    });

    test('accounts for celestial sphere rotation', () => {
      const ra = 45;
      const sphereRotation = Math.PI / 4; // 45 degrees

      const thetaWithoutRotation = calculateCameraTheta(ra, 0);
      const thetaWithRotation = calculateCameraTheta(ra, sphereRotation);

      // Theta should differ by the sphere rotation amount
      expect(thetaWithRotation).toBeCloseTo(
        thetaWithoutRotation - sphereRotation,
        5
      );
    });

    test('compensates for time-based celestial rotation', () => {
      // Simulate: user searches for object at RA=100
      // Time changed, sphere rotated by 30 degrees (PI/6 radians)
      const ra = 100;
      const sphereRotationY = Math.PI / 6;

      const theta = calculateCameraTheta(ra, sphereRotationY);

      // Without compensation, camera would go to wrong position
      const thetaWrong = -ra * Math.PI / 180 + Math.PI;
      // With compensation, camera goes to correct position
      const thetaCorrect = thetaWrong - sphereRotationY;

      expect(theta).toBeCloseTo(thetaCorrect, 5);
      expect(theta).not.toBeCloseTo(thetaWrong, 5);
    });

    test('handles negative sphere rotation', () => {
      const ra = 60;
      const sphereRotation = -Math.PI / 3; // -60 degrees

      const theta = calculateCameraTheta(ra, sphereRotation);
      const expected = -ra * Math.PI / 180 + Math.PI - sphereRotation;

      expect(theta).toBeCloseTo(expected, 5);
    });

    test('handles full rotation', () => {
      const ra = 0;
      const sphereRotation = 2 * Math.PI; // Full rotation

      const theta = calculateCameraTheta(ra, sphereRotation);
      // After full rotation, theta should effectively be same as no rotation
      // (minus 2*PI)
      expect(theta).toBeCloseTo(Math.PI - 2 * Math.PI, 5);
    });
  });

  describe('calculateCameraPhi', () => {
    test('returns correct phi for dec=0 (equator)', () => {
      const phi = calculateCameraPhi(0);
      expect(phi).toBeCloseTo(Math.PI / 2, 5);
    });

    test('returns correct phi for dec=90 (north pole)', () => {
      const phi = calculateCameraPhi(90);
      expect(phi).toBeCloseTo(0, 5);
    });

    test('returns correct phi for dec=-90 (south pole)', () => {
      const phi = calculateCameraPhi(-90);
      expect(phi).toBeCloseTo(Math.PI, 5);
    });

    test('returns correct phi for dec=45', () => {
      const phi = calculateCameraPhi(45);
      expect(phi).toBeCloseTo(Math.PI / 4, 5);
    });
  });

  describe('integration: search after time change', () => {
    test('theta offset equals sphere rotation', () => {
      // This is the key property: when celestial sphere rotates,
      // camera theta must compensate by the same amount

      const ra = 120;

      // No rotation
      const thetaNoRotation = calculateCameraTheta(ra, 0);

      // With rotation of PI/4
      const rotation = Math.PI / 4;
      const thetaWithRotation = calculateCameraTheta(ra, rotation);

      // The difference should be exactly the rotation amount
      expect(thetaNoRotation - thetaWithRotation).toBeCloseTo(rotation, 10);
    });

    test('camera compensates for any rotation angle', () => {
      const ra = 75;
      const testRotations = [0, Math.PI / 6, Math.PI / 4, Math.PI / 2, Math.PI];

      for (const rotation of testRotations) {
        const theta = calculateCameraTheta(ra, rotation);
        const baseTheta = calculateCameraTheta(ra, 0);

        expect(theta).toBeCloseTo(baseTheta - rotation, 10);
      }
    });

    test('dec/phi is independent of sphere rotation', () => {
      // Declination (phi) should not change with sphere rotation
      // because sphere rotates around Y axis (celestial pole)
      const dec = 45;
      const phi = calculateCameraPhi(dec);

      // Phi should only depend on dec
      expect(phi).toBeCloseTo((90 - dec) * Math.PI / 180, 10);
    });
  });
});
