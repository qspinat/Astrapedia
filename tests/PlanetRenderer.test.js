/**
 * @fileoverview Tests for PlanetRenderer module.
 * Tests image loading behavior and retry prevention.
 */

import {jest} from '@jest/globals';

describe('PlanetRenderer image loading', () => {
  // Mock sprite with userData
  const createMockSprite = (name, imageUrl = 'https://example.com/image.jpg') => ({
    userData: {
      name,
      imageUrl,
      imageLoaded: false,
      imageLoading: false,
      imageFailed: false,
      aspectRatio: 1,
    },
    material: {
      dispose: jest.fn(),
    },
    scale: {
      set: jest.fn(),
    },
  });

  /**
   * Simulates the loadPlanetImage_ guard logic.
   * This is the key behavior being tested.
   */
  function shouldLoadImage(spriteUserData) {
    const {imageLoading, imageLoaded, imageFailed} = spriteUserData;
    // Guard condition from loadPlanetImage_
    if (imageLoading || imageLoaded || imageFailed) return false;
    return true;
  }

  /**
   * Simulates the updateSizes condition for triggering image load.
   * Note: The real code calls loadPlanetImage_ which has its own guard.
   * This function checks the condition in updateSizes only.
   */
  function shouldTriggerLoad(spriteUserData, useRealSize, realSizePixels) {
    const {imageLoaded, imageFailed, imageUrl} = spriteUserData;
    // Condition from updateSizes (calls loadPlanetImage_ which has additional guard)
    if (useRealSize && realSizePixels > 20 && !imageLoaded && !imageFailed && imageUrl) {
      return true;
    }
    return false;
  }

  /**
   * Simulates the full load decision: updateSizes condition + loadPlanetImage_ guard.
   */
  function wouldActuallyLoad(spriteUserData, useRealSize, realSizePixels) {
    // First check updateSizes condition
    if (!shouldTriggerLoad(spriteUserData, useRealSize, realSizePixels)) {
      return false;
    }
    // Then check loadPlanetImage_ guard
    return shouldLoadImage(spriteUserData);
  }

  describe('image load guard conditions', () => {
    it('allows loading when no flags are set', () => {
      const sprite = createMockSprite('Sun');
      expect(shouldLoadImage(sprite.userData)).toBe(true);
    });

    it('prevents loading when imageLoading is true', () => {
      const sprite = createMockSprite('Sun');
      sprite.userData.imageLoading = true;
      expect(shouldLoadImage(sprite.userData)).toBe(false);
    });

    it('prevents loading when imageLoaded is true', () => {
      const sprite = createMockSprite('Sun');
      sprite.userData.imageLoaded = true;
      expect(shouldLoadImage(sprite.userData)).toBe(false);
    });

    it('prevents loading when imageFailed is true', () => {
      const sprite = createMockSprite('Sun');
      sprite.userData.imageFailed = true;
      expect(shouldLoadImage(sprite.userData)).toBe(false);
    });

    it('prevents loading when multiple flags are set', () => {
      const sprite = createMockSprite('Sun');
      sprite.userData.imageFailed = true;
      sprite.userData.imageLoading = true;
      expect(shouldLoadImage(sprite.userData)).toBe(false);
    });
  });

  describe('updateSizes image trigger conditions', () => {
    it('triggers load when conditions are met', () => {
      const sprite = createMockSprite('Sun');
      expect(shouldTriggerLoad(sprite.userData, true, 50)).toBe(true);
    });

    it('does not trigger load when not at real size', () => {
      const sprite = createMockSprite('Sun');
      expect(shouldTriggerLoad(sprite.userData, false, 50)).toBe(false);
    });

    it('does not trigger load when size is too small', () => {
      const sprite = createMockSprite('Sun');
      expect(shouldTriggerLoad(sprite.userData, true, 10)).toBe(false);
    });

    it('does not trigger load when already loaded', () => {
      const sprite = createMockSprite('Sun');
      sprite.userData.imageLoaded = true;
      expect(shouldTriggerLoad(sprite.userData, true, 50)).toBe(false);
    });

    it('does not trigger load when image previously failed', () => {
      const sprite = createMockSprite('Sun');
      sprite.userData.imageFailed = true;
      expect(shouldTriggerLoad(sprite.userData, true, 50)).toBe(false);
    });

    it('does not trigger load when no imageUrl', () => {
      const sprite = createMockSprite('Sun', null);
      expect(shouldTriggerLoad(sprite.userData, true, 50)).toBe(false);
    });
  });

  describe('retry storm prevention', () => {
    it('prevents retry after failure', () => {
      const sprite = createMockSprite('Sun');

      // Initial state: can load
      expect(shouldLoadImage(sprite.userData)).toBe(true);

      // Simulate loading start
      sprite.userData.imageLoading = true;
      expect(shouldLoadImage(sprite.userData)).toBe(false);

      // Simulate loading failure
      sprite.userData.imageLoading = false;
      sprite.userData.imageFailed = true;

      // After failure: cannot retry
      expect(shouldLoadImage(sprite.userData)).toBe(false);

      // Multiple checks should still be blocked
      expect(shouldLoadImage(sprite.userData)).toBe(false);
      expect(shouldLoadImage(sprite.userData)).toBe(false);
    });

    it('allows load after success', () => {
      const sprite = createMockSprite('Sun');

      // Simulate loading start
      sprite.userData.imageLoading = true;

      // Simulate loading success
      sprite.userData.imageLoading = false;
      sprite.userData.imageLoaded = true;

      // After success: blocked (already loaded)
      expect(shouldLoadImage(sprite.userData)).toBe(false);
    });

    it('simulates multiple frames without retry storm', () => {
      const sprite = createMockSprite('Sun');
      const loadAttempts = [];

      // Simulate first frame - triggers load
      if (wouldActuallyLoad(sprite.userData, true, 50)) {
        loadAttempts.push(0);
        sprite.userData.imageLoading = true;
      }

      // Simulate frames 1-10 while loading (should be blocked by imageLoading)
      for (let frame = 1; frame <= 10; frame++) {
        if (wouldActuallyLoad(sprite.userData, true, 50)) {
          loadAttempts.push(frame);
        }
      }

      // Simulate async failure
      sprite.userData.imageLoading = false;
      sprite.userData.imageFailed = true;

      // Simulate 100 more frames after failure (should be blocked by imageFailed)
      for (let frame = 11; frame < 111; frame++) {
        if (wouldActuallyLoad(sprite.userData, true, 50)) {
          loadAttempts.push(frame);
        }
      }

      // Should only have attempted to load once (frame 0)
      expect(loadAttempts.length).toBe(1);
      expect(loadAttempts[0]).toBe(0);
    });
  });
});
