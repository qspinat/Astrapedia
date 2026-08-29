/**
 * @fileoverview Tests for WebGL context-loss recovery.
 *
 * On Android the GPU surface is reclaimed when the app is backgrounded, losing
 * the WebGL context and leaving the sky black on return. The renderer must
 * preventDefault() the loss (or the browser never restores the context) and
 * force a repaint once it is restored.
 */

import {jest} from '@jest/globals';
import {installThreeMock} from './helpers/threeMock.js';

installThreeMock();

const {AstrapediaApp} = await import('../skymap.js');

describe('WebGL context-loss recovery', () => {
  let app;
  let canvas;

  beforeEach(() => {
    app = Object.create(AstrapediaApp.prototype);
    canvas = document.createElement('canvas');
    app.renderer = {domElement: canvas};
    app.stopAnimating = jest.fn();
    app.startAnimating = jest.fn();
    app.requestRender = jest.fn();
    app._fovDirty = false;

    app.setupContextLossHandling_();
  });

  test('a lost context is preventDefaulted so the browser can restore it', () => {
    const event = new Event('webglcontextlost', {cancelable: true});

    canvas.dispatchEvent(event);

    // Without preventDefault the context is never restored.
    expect(event.defaultPrevented).toBe(true);
  });

  test('rendering pauses while the context is lost', () => {
    canvas.dispatchEvent(new Event('webglcontextlost', {cancelable: true}));

    expect(app.stopAnimating).toHaveBeenCalled();
  });

  test('a restored context forces a repaint', () => {
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    expect(app.requestRender).toHaveBeenCalled();
    expect(app.startAnimating).toHaveBeenCalled();
  });

  test('restoring marks FOV-derived sizes stale so they recompute', () => {
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    expect(app._fovDirty).toBe(true);
  });
});
