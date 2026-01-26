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
    // Time picker functionality is in the modular TimeUI
    const jsPath = path.resolve(process.cwd(), 'modules/features/TimeUI.js');
    jsContent = fs.readFileSync(jsPath, 'utf8');
  });

  test('implements backdrop click to close time picker', () => {
    // Should have document click listener that checks for clicks outside panel
    expect(jsContent).toContain('document.addEventListener(\'click\'');
    // Uses contains() checks instead of separate boolean variables
    expect(jsContent).toContain('pickerPanel.contains(e.target)');
    expect(jsContent).toContain('pickerBtn.contains(e.target)');
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

describe('UI Controller event wiring', () => {
  let uiControllerContent;
  let timeUIContent;

  beforeAll(() => {
    // Settings handler is in modular UIController
    const uiPath = path.resolve(process.cwd(), 'modules/ui/UIController.js');
    uiControllerContent = fs.readFileSync(uiPath, 'utf8');
    // Time controls are in TimeUI
    const timePath = path.resolve(process.cwd(), 'modules/features/TimeUI.js');
    timeUIContent = fs.readFileSync(timePath, 'utf8');
  });

  describe('SettingsHandler', () => {
    test('retrieves equator-line-toggle element', () => {
      expect(uiControllerContent).toContain('getElementById(\'equator-line-toggle\')');
    });

    test('adds change event listener to equator toggle', () => {
      // Check that there's a change event listener on the equator toggle
      expect(uiControllerContent).toMatch(
        /equatorToggle.*addEventListener\s*\(\s*['"]change['"]/s
      );
    });

    test('calls setEquatorLineVisible on change', () => {
      expect(uiControllerContent).toContain('setEquatorLineVisible?.(e.target.checked)');
    });

    test('retrieves constellation-lines-toggle element', () => {
      expect(uiControllerContent).toContain('getElementById(\'constellation-lines-toggle\')');
    });

    test('retrieves magnitude-slider element', () => {
      expect(uiControllerContent).toContain('getElementById(\'magnitude-slider\')');
    });
  });

  describe('TimeUI', () => {
    test('retrieves time-picker-btn element', () => {
      expect(timeUIContent).toContain('getElementById(\'time-picker-btn\')');
    });

    test('retrieves time-picker-panel element', () => {
      expect(timeUIContent).toContain('getElementById(\'time-picker-panel\')');
    });

    test('adds click event listener to time picker button', () => {
      expect(timeUIContent).toMatch(
        /pickerBtn.*addEventListener\s*\(\s*['"]click['"]/s
      );
    });

    test('toggles visible class on time picker panel', () => {
      expect(timeUIContent).toContain('pickerPanel.classList.toggle(\'visible\')');
    });

    test('retrieves date-picker and time-picker inputs', () => {
      expect(timeUIContent).toContain('getElementById(\'date-picker\')');
      expect(timeUIContent).toContain('getElementById(\'time-picker\')');
    });

    test('retrieves apply and cancel buttons', () => {
      expect(timeUIContent).toContain('getElementById(\'time-picker-apply\')');
      expect(timeUIContent).toContain('getElementById(\'time-picker-cancel\')');
    });

    test('calls jumpToTime on apply', () => {
      // Uses optional chaining in modular version
      expect(timeUIContent).toMatch(/jumpToTime\?\.\s*\(\s*newDate\s*\)/);
    });
  });

  describe('UIController initialization', () => {
    test('uses dependency injection pattern', () => {
      // Modular UIController receives dependencies in constructor
      expect(uiControllerContent).toContain('constructor(dependencies)');
    });

    test('initializes all handlers', () => {
      expect(uiControllerContent).toContain('this.searchController_.initialize()');
      expect(uiControllerContent).toContain('this.settingsHandler_.initialize()');
      expect(uiControllerContent).toContain('this.timeUI_.initialize()');
    });

    test('logs initialization status', () => {
      expect(uiControllerContent).toContain('UI Controller initialized');
    });
  });
});

describe('Skymap equator line methods', () => {
  let jsContent;
  let gridRendererContent;

  beforeAll(() => {
    const jsPath = path.resolve(process.cwd(), 'skymap.js');
    jsContent = fs.readFileSync(jsPath, 'utf8');
    // GridRenderer now handles the implementation details
    const gridRendererPath = path.resolve(process.cwd(), 'modules/rendering/GridRenderer.js');
    gridRendererContent = fs.readFileSync(gridRendererPath, 'utf8');
  });

  test('has setEquatorLineVisible method', () => {
    expect(jsContent).toMatch(/setEquatorLineVisible\s*\(\s*visible\s*\)/);
  });

  test('setEquatorLineVisible delegates to gridRenderer or fallback', () => {
    // Either delegates to gridRenderer (with optional chaining) or uses direct fallback
    expect(jsContent).toMatch(/gridRenderer_\??\.setEquatorVisible|this\.equatorLine\.visible/);
  });

  test('setEquatorLineVisible sets visible property (in GridRenderer)', () => {
    // Implementation is now in GridRenderer
    expect(gridRendererContent).toContain('.visible = visible');
  });

  test('creates equatorLine in GridRenderer', () => {
    // equatorLine creation is now in GridRenderer
    expect(gridRendererContent).toContain('this.equatorLine_ = new THREE.Line');
  });

  test('adds equatorLine to celestialSphere (in GridRenderer)', () => {
    // Implementation is now in GridRenderer
    expect(gridRendererContent).toContain('this.celestialSphere_.add(this.equatorLine_)');
  });

  test('equatorLine managed by GridRenderer', () => {
    // equatorLine is now managed entirely by GridRenderer, not skymap.js
    expect(gridRendererContent).toContain('this.equatorLine_');
  });
});

describe('GameUI game panel drag functionality', () => {
  let jsContent;

  beforeAll(() => {
    const jsPath = path.resolve(process.cwd(), 'modules/features/GameUI.js');
    jsContent = fs.readFileSync(jsPath, 'utf8');
  });

  test('has setupPanelDrag_ method', () => {
    expect(jsContent).toMatch(/setupPanelDrag_\s*\(\s*\)/);
  });

  test('has guard against multiple setup calls', () => {
    expect(jsContent).toContain('if (this.panelDragSetup_) return');
  });

  test('initializes panelDragSetup_ flag to false', () => {
    expect(jsContent).toContain('this.panelDragSetup_ = false');
  });

  test('sets panelDragSetup_ flag after setup', () => {
    expect(jsContent).toContain('this.panelDragSetup_ = true');
  });

  test('gets game panel element from domCache', () => {
    expect(jsContent).toContain('domCache.gamePanel');
  });

  test('gets header element for drag handle', () => {
    expect(jsContent).toMatch(/querySelector\s*\(\s*['"]h2['"]\s*\)/);
  });

  test('adds mousedown listener to header', () => {
    expect(jsContent).toMatch(
      /header\.addEventListener\s*\(\s*['"]mousedown['"]/
    );
  });

  test('adds touchstart listener to header', () => {
    expect(jsContent).toMatch(
      /header\.addEventListener\s*\(\s*['"]touchstart['"]/
    );
  });

  test('removes event listeners on drag end to prevent memory leaks', () => {
    expect(jsContent).toContain('document.removeEventListener(\'mousemove\'');
    expect(jsContent).toContain('document.removeEventListener(\'mouseup\'');
    expect(jsContent).toContain('document.removeEventListener(\'touchmove\'');
    expect(jsContent).toContain('document.removeEventListener(\'touchend\'');
  });

  test('constrains panel to viewport bounds', () => {
    expect(jsContent).toContain('window.innerWidth - panelRect.width');
    expect(jsContent).toContain('window.innerHeight - panelRect.height');
    // Uses clamp() to constrain values to viewport
    expect(jsContent).toMatch(/clamp\s*\(\s*new/);
    expect(jsContent).toMatch(/maxLeft|maxTop/);
  });

  test('has drag state management', () => {
    // isDragging_ flag is used to track drag state
    expect(jsContent).toMatch(/isDragging_/);
  });
});

describe('Skymap search index planet updates (delegated to SearchManager)', () => {
  let jsContent;
  let searchManagerContent;

  beforeAll(() => {
    const jsPath = path.resolve(process.cwd(), 'skymap.js');
    jsContent = fs.readFileSync(jsPath, 'utf8');
    const smPath = path.resolve(process.cwd(), 'modules/features/SearchManager.js');
    searchManagerContent = fs.readFileSync(smPath, 'utf8');
  });

  test('calls searchManager_.updatePlanets from createPlanets', () => {
    // Verify skymap.js delegates to SearchManager for planet updates
    expect(jsContent).toMatch(
      /createPlanets\s*\(\s*\)[\s\S]*?this\.searchManager_\?\s*\.updatePlanets\s*\(\s*this\.planets\s*\)/
    );
  });

  test('SearchManager.updatePlanets removes old planet entries before adding new ones', () => {
    expect(searchManagerContent).toMatch(
      /this\.index_\s*=\s*this\.index_\.filter\s*\(\s*\([^)]*\)\s*=>\s*[^)]*\.type\s*!==\s*['"]Planet['"]/
    );
  });

  test('SearchManager.updatePlanets adds planets with required fields', () => {
    // Check that planet entries include name, type, ra, dec in SearchManager
    expect(searchManagerContent).toMatch(
      /updatePlanets[\s\S]*?this\.index_\.push\s*\(\s*\{[\s\S]*?name:\s*planet\.name/
    );
    expect(searchManagerContent).toMatch(
      /updatePlanets[\s\S]*?type:\s*['"]Planet['"]/
    );
    expect(searchManagerContent).toMatch(
      /updatePlanets[\s\S]*?ra:\s*planet\.ra/
    );
    expect(searchManagerContent).toMatch(
      /updatePlanets[\s\S]*?dec:\s*planet\.dec/
    );
  });
});
