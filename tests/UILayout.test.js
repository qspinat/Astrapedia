/**
 * @fileoverview Tests for UI layout and panel positioning.
 * Ensures panels don't overlap at startup and CSS is properly configured.
 * Uses file parsing instead of JSDOM to avoid TextEncoder dependency.
 */

import {jest} from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('UI Layout - HTML Structure', () => {
  let htmlContent;

  beforeAll(() => {
    const htmlPath = path.resolve(process.cwd(), 'app.html');
    htmlContent = fs.readFileSync(htmlPath, 'utf8');
  });

  describe('Panel structure', () => {
    test('game panel exists', () => {
      expect(htmlContent).toContain('id="game-panel"');
    });

    test('settings panel exists', () => {
      expect(htmlContent).toContain('id="settings-panel"');
    });

    test('time controls exist', () => {
      expect(htmlContent).toContain('class="time-controls"');
    });

    test('time picker panel exists', () => {
      expect(htmlContent).toContain('id="time-picker-panel"');
    });

    test('magnitude control exists', () => {
      expect(htmlContent).toContain('class="magnitude-control"');
    });
  });

  describe('Panel controls', () => {
    test('equator line toggle exists (not night mode)', () => {
      expect(htmlContent).toContain('id="equator-line-toggle"');
      expect(htmlContent).not.toContain('id="night-mode-toggle"');
    });

    test('time picker button exists', () => {
      expect(htmlContent).toContain('id="time-picker-btn"');
    });

    test('time picker has date and time inputs', () => {
      expect(htmlContent).toContain('id="date-picker"');
      expect(htmlContent).toContain('id="time-picker"');
      expect(htmlContent).toMatch(/type="date"[^>]*id="date-picker"|id="date-picker"[^>]*type="date"/);
      expect(htmlContent).toMatch(/type="time"[^>]*id="time-picker"|id="time-picker"[^>]*type="time"/);
    });

    test('time picker has apply and cancel buttons', () => {
      expect(htmlContent).toContain('id="time-picker-apply"');
      expect(htmlContent).toContain('id="time-picker-cancel"');
    });
  });

  describe('Game panel structure', () => {
    test('game panel has header (h2)', () => {
      // Game panel should contain an h2
      const gamePanelMatch = htmlContent.match(
        /id="game-panel"[^>]*>[\s\S]*?<h2[^>]*>/
      );
      expect(gamePanelMatch).not.toBeNull();
    });

    test('game panel has pass button', () => {
      expect(htmlContent).toContain('id="pass-btn"');
    });

    test('game panel has stop button', () => {
      expect(htmlContent).toContain('id="stop-game-btn"');
    });
  });
});

describe('CSS Layout Rules', () => {
  let cssContent;

  beforeAll(() => {
    const cssPath = path.resolve(process.cwd(), 'styles.css');
    cssContent = fs.readFileSync(cssPath, 'utf8');
  });

  describe('Panel positioning', () => {
    test('time-picker-panel has position: fixed', () => {
      expect(cssContent).toMatch(/\.time-picker-panel\s*\{[^}]*position:\s*fixed/);
    });

    test('time-picker-panel is positioned above time-controls', () => {
      // Extract bottom values
      const timePickerMatch = cssContent.match(
        /\.time-picker-panel\s*\{[^}]*bottom:\s*calc\((\d+)px/
      );
      const timeControlsMatch = cssContent.match(
        /\.time-controls\s*\{[^}]*bottom:\s*calc\((\d+)px/
      );

      expect(timePickerMatch).not.toBeNull();
      expect(timeControlsMatch).not.toBeNull();

      const timePickerBottom = parseInt(timePickerMatch[1], 10);
      const timeControlsBottom = parseInt(timeControlsMatch[1], 10);

      // Time picker should be higher (larger bottom value) than time controls
      expect(timePickerBottom).toBeGreaterThan(timeControlsBottom);
    });

    test('time-picker-panel has z-index defined', () => {
      expect(cssContent).toMatch(/\.time-picker-panel\s*\{[^}]*z-index:/);
    });
  });

  describe('Game panel draggable styling', () => {
    test('game panel header has cursor: move', () => {
      expect(cssContent).toMatch(/\.game-panel\s+h2\s*\{[^}]*cursor:\s*move/);
    });

    test('game panel header has user-select: none', () => {
      expect(cssContent).toMatch(/\.game-panel\s+h2\s*\{[^}]*user-select:\s*none/);
    });
  });

  describe('Secondary button styling', () => {
    test('secondary time button has distinct styling', () => {
      expect(cssContent).toMatch(/\.time-btn\.small\.secondary/);
    });
  });
});

describe('Panel non-overlap validation', () => {
  let cssContent;

  beforeAll(() => {
    const cssPath = path.resolve(process.cwd(), 'styles.css');
    cssContent = fs.readFileSync(cssPath, 'utf8');
  });

  /**
   * Extract bottom position value from CSS for a selector.
   * @param {string} selectorPattern - Regex pattern for CSS selector
   * @returns {number|null} Bottom value in pixels or null
   */
  function extractBottomValue(selectorPattern) {
    const regex = new RegExp(
      selectorPattern + '\\s*\\{[^}]*bottom:\\s*calc\\((\\d+)px'
    );
    const match = cssContent.match(regex);
    return match ? parseInt(match[1], 10) : null;
  }

  test('bottom UI elements have distinct vertical positions', () => {
    // Get bottom positions of key elements
    const timeControlsBottom = extractBottomValue('\\.time-controls');
    const magControlBottom = extractBottomValue('\\.magnitude-control');
    const timePickerBottom = extractBottomValue('\\.time-picker-panel');

    // All should be defined
    expect(timeControlsBottom).not.toBeNull();
    expect(magControlBottom).not.toBeNull();
    expect(timePickerBottom).not.toBeNull();

    // Time controls is lowest, magnitude and picker are higher
    expect(timeControlsBottom).toBeLessThanOrEqual(magControlBottom);
    expect(timeControlsBottom).toBeLessThanOrEqual(timePickerBottom);
  });

  test('game panel has fixed positioning', () => {
    expect(cssContent).toMatch(/\.game-panel\s*\{[^}]*position:\s*fixed/);
  });

  test('game panel has defined position (top and left)', () => {
    expect(cssContent).toMatch(/\.game-panel\s*\{[^}]*top:/);
    expect(cssContent).toMatch(/\.game-panel\s*\{[^}]*left:/);
  });

  test('slide panel (settings) has fixed positioning', () => {
    // Settings panel uses .slide-panel class
    expect(cssContent).toMatch(/\.slide-panel\s*\{[^}]*position:\s*fixed/);
  });

  test('slide panel and game panel have different default positions', () => {
    // Slide panel slides in from left (transform: translateX(-100%))
    // Game panel has explicit top/left positioning
    expect(cssContent).toMatch(/\.slide-panel\s*\{[^}]*transform:\s*translateX\(-100%\)/);
    expect(cssContent).toMatch(/\.game-panel\s*\{[^}]*top:/);
  });

  test('game panel and slide panel do not visually overlap at default state', () => {
    // Slide panel is hidden by default (transform: translateX(-100%))
    // So it doesn't overlap with game panel which is visible at top-left
    const slidePanelHidden = cssContent.match(
      /\.slide-panel\s*\{[^}]*transform:\s*translateX\(-100%\)/
    );
    expect(slidePanelHidden).not.toBeNull();

    // Game panel has top-left positioning
    const gamePanelTop = cssContent.match(/\.game-panel\s*\{[^}]*top:/);
    expect(gamePanelTop).not.toBeNull();
  });
});

describe('Date picker input styling', () => {
  let cssContent;

  beforeAll(() => {
    const cssPath = path.resolve(process.cwd(), 'styles.css');
    cssContent = fs.readFileSync(cssPath, 'utf8');
  });

  test('time-input class is defined', () => {
    expect(cssContent).toMatch(/\.time-input\s*\{/);
  });

  test('time-picker-inputs container uses flexbox', () => {
    expect(cssContent).toMatch(/\.time-picker-inputs\s*\{[^}]*display:\s*flex/);
  });

  test('time-picker-actions container is defined', () => {
    expect(cssContent).toMatch(/\.time-picker-actions\s*\{/);
  });
});

describe('Time picker accessibility and UX', () => {
  let jsContent;

  beforeAll(() => {
    const jsPath = path.resolve(process.cwd(), 'ui-controller.js');
    jsContent = fs.readFileSync(jsPath, 'utf8');
  });

  test('implements backdrop click to close time picker', () => {
    // Should have document click listener that checks for clicks outside panel
    expect(jsContent).toContain('document.addEventListener(\'click\'');
    expect(jsContent).toContain('isClickInsidePanel');
    expect(jsContent).toContain('isClickOnButton');
  });

  test('implements Escape key to close time picker', () => {
    // Should have keydown listener for Escape key
    expect(jsContent).toContain('document.addEventListener(\'keydown\'');
    expect(jsContent).toMatch(/e\.key\s*===\s*['"]Escape['"]/);
  });

  test('prevents event propagation on Escape', () => {
    // Should call preventDefault to stop Escape from affecting other elements
    expect(jsContent).toMatch(/Escape.*preventDefault|preventDefault.*Escape/s);
  });
});
