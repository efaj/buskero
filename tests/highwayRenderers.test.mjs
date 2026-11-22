import assert from 'node:assert/strict';
import test from 'node:test';
import { getHighwayConfig as getPianoConfig } from '../src/instruments/piano.mjs';
import { getHighwayConfig as getSaxConfig } from '../src/instruments/saxophone.mjs';
import { getHighwayConfig as getViolinConfig } from '../src/instruments/violin.mjs';
import { BaseHighwayRenderer, createHighwayViewSwitcher } from '../src/ui/baseHighwayRenderer.mjs';
import { Highway3DRenderer } from '../src/ui/highway3dRenderer.mjs';
import { Highway2DRenderer, HighwayRenderer } from '../src/ui/highwayRenderer.mjs';

function makeMock2DContext() {
  const noop = () => {};
  return {
    save: noop,
    restore: noop,
    clearRect: noop,
    fillRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    arc: noop,
    rect: noop,
    clip: noop,
    fill: noop,
    stroke: noop,
    fillText: noop,
    setTransform: noop,
    measureText: (t) => ({ width: String(t).length * 7 }),
  };
}

function makeMockWebGLContext() {
  const noop = () => {};
  return {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    DYNAMIC_DRAW: 0x88e8,
    COLOR_BUFFER_BIT: 0x4000,
    BLEND: 0x0be2,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    FLOAT: 0x1406,
    TRIANGLES: 0x0004,
    createShader: () => ({}),
    shaderSource: noop,
    compileShader: noop,
    getShaderParameter: () => true,
    deleteShader: noop,
    createProgram: () => ({}),
    attachShader: noop,
    linkProgram: noop,
    getProgramParameter: () => true,
    deleteProgram: noop,
    createBuffer: () => ({}),
    deleteBuffer: noop,
    getAttribLocation: () => 0,
    getUniformLocation: () => ({}),
    viewport: noop,
    clearColor: noop,
    clear: noop,
    enable: noop,
    blendFunc: noop,
    useProgram: noop,
    uniform2f: noop,
    bindBuffer: noop,
    bufferData: noop,
    enableVertexAttribArray: noop,
    vertexAttribPointer: noop,
    drawArrays: noop,
    getExtension: () => ({ loseContext: noop }),
  };
}

function installDomShim() {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;

  const makeEl = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      children: [],
      parentElement: null,
      hidden: false,
      width: 900,
      height: 580,
      className: '',
      id: '',
      attributes: new Map(),
      setAttribute(k, v) {
        this.attributes.set(k, String(v));
      },
      addEventListener() {},
      removeEventListener() {},
      append(...nodes) {
        for (const n of nodes) this.appendChild(n);
      },
      appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx >= 0) {
          this.children.splice(idx, 1);
          child.parentElement = null;
        }
      },
      querySelector(sel) {
        if (sel === '#highway-canvas') {
          return this.children.find((c) => c.id === 'highway-canvas') ?? null;
        }
        return null;
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 900, height: 580 };
      },
      getContext(type) {
        if (type === '2d') return makeMock2DContext();
        if (type === 'webgl2' || type === 'webgl') return makeMockWebGLContext();
        return null;
      },
    };
    return el;
  };

  globalThis.document = {
    createElement: makeEl,
  };
  globalThis.window = {
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: true }),
  };

  return () => {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  };
}

test('Highway2DRenderer and Highway3DRenderer implement the replaceable BaseHighwayRenderer contract', () => {
  const restoreDom = installDomShim();
  try {
    assert.equal(HighwayRenderer, Highway2DRenderer);

    const container = globalThis.document.createElement('div');
    const sharedCanvas = globalThis.document.createElement('canvas');
    sharedCanvas.id = 'highway-canvas';
    container.appendChild(sharedCanvas);

    const instances = [new Highway2DRenderer({ canvas: sharedCanvas }), new Highway3DRenderer()];

    const pianoCfg = getPianoConfig();
    const frameBase = {
      notes: [],
      songTime: 0,
      bpm: 120,
      activeMidiKeys: new Set([60]),
      detectedPitch: { nearestMidi: 69, noteName: 'A4', centsOff: 4, frequencyHz: 441, confidence: 0.9 },
      gameSnapshot: { isWaiting: false, waitNotes: [], lastJudgment: null, songTime: 0 },
      hitEffects: [],
    };

    for (const renderer of instances) {
      assert.ok(renderer instanceof BaseHighwayRenderer);
      assert.ok(renderer.mode === '2d' || renderer.mode === '3d');

      renderer.mount(container);
      renderer.setLookaheadSec(3.0);
      assert.equal(renderer.lookaheadSec, 3.0);

      // Render all 3 instruments interchangeably through the exact same interface
      renderer.render({ ...frameBase, config: getViolinConfig() });
      renderer.render({ ...frameBase, config: getSaxConfig() });
      renderer.render({ ...frameBase, config: pianoCfg });

      // Both renderers expose Piano hit-testing on the mounted keybed
      assert.equal(typeof renderer.hitTestPianoKey(10, 10), 'object'); // null when outside keybed
      renderer.unmount();
      renderer.dispose();
    }
  } finally {
    restoreDom();
  }
});

test('createHighwayViewSwitcher aligns activeRenderer with 3D initialMode on first Stage mount and switches 2D <-> 3D cleanly', () => {
  const restoreDom = installDomShim();
  try {
    const container = globalThis.document.createElement('div');
    const sharedCanvas = globalThis.document.createElement('canvas');
    sharedCanvas.id = 'highway-canvas';
    container.appendChild(sharedCanvas);

    const renderers = {
      '2d': new Highway2DRenderer({ canvas: sharedCanvas }),
      '3d': new Highway3DRenderer(),
    };
    const modeChanges = [];
    const switcher = createHighwayViewSwitcher({
      renderers,
      gpuCapability: { supported: true, recommendedMode: '3d' },
      initialMode: 'auto',
      getLookaheadSec: () => 2.5,
      onModeChanged: (evt) => modeChanges.push(evt),
    });

    // Regression: before first Stage mount, activeRenderer must already match activeMode ('3d')
    assert.equal(switcher.activeMode, '3d');
    assert.equal(switcher.activeRenderer.mode, '3d');

    // Simulating Start Playing straight from Lobby without touching view-mode radios
    switcher.syncMount(container);
    assert.equal(sharedCanvas.hidden, true);
    assert.equal(
      container.children.some((c) => c.className === 'highway-3d-stage'),
      true,
    );

    // Switching Stage 3D -> 2D unmounts .highway-3d-stage and reveals #highway-canvas
    switcher.switchMode('2d');
    assert.equal(switcher.activeMode, '2d');
    assert.equal(switcher.activeRenderer.mode, '2d');
    assert.equal(sharedCanvas.hidden, false);
    assert.equal(
      container.children.some((c) => c.className === 'highway-3d-stage'),
      false,
    );

    // Switching Stage 2D -> 3D restores .highway-3d-stage and hides #highway-canvas
    switcher.switchMode('3d');
    assert.equal(switcher.activeMode, '3d');
    assert.equal(switcher.activeRenderer.mode, '3d');
    assert.equal(sharedCanvas.hidden, true);
    assert.equal(
      container.children.some((c) => c.className === 'highway-3d-stage'),
      true,
    );
    assert.deepEqual(modeChanges, [
      { mode: '2d', persist: true },
      { mode: '3d', persist: true },
    ]);

    renderers['3d'].dispose();
    renderers['2d'].dispose();
  } finally {
    restoreDom();
  }
});

test('createHighwayViewSwitcher preserves synchronous WebGL fallback when 3D mount fails', () => {
  const restoreDom = installDomShim();
  const baseCreateElement = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => {
    const el = baseCreateElement(tag);
    if (tag === 'canvas') {
      const baseGetContext = el.getContext.bind(el);
      el.getContext = (type, attrs) => (type === '2d' ? baseGetContext('2d', attrs) : null);
    }
    return el;
  };

  try {
    const container = baseCreateElement('div');
    const sharedCanvas = baseCreateElement('canvas');
    sharedCanvas.id = 'highway-canvas';
    container.appendChild(sharedCanvas);

    let fallbackReason = null;
    const renderers = {
      '2d': new Highway2DRenderer({ canvas: sharedCanvas }),
      '3d': new Highway3DRenderer({
        onFallbackNeeded: (reason) => {
          fallbackReason = reason;
          if (switcher.activeMode === '3d') {
            switcher.switchMode('2d', { persist: false });
          }
        },
      }),
    };

    const modeChanges = [];
    const switcher = createHighwayViewSwitcher({
      renderers,
      gpuCapability: { supported: true, recommendedMode: '3d' },
      initialMode: '2d',
      onModeChanged: (evt) => modeChanges.push(evt),
    });

    switcher.syncMount(container);
    assert.equal(switcher.activeMode, '2d');

    const finalMode = switcher.switchMode('3d', { persist: true });
    assert.equal(fallbackReason, 'WebGL unavailable');
    assert.equal(finalMode, '2d');
    assert.equal(switcher.activeMode, '2d');
    assert.equal(switcher.activeRenderer.mode, '2d');
    assert.equal(sharedCanvas.hidden, false);
    assert.deepEqual(modeChanges, [{ mode: '2d', persist: false }]);

    renderers['3d'].dispose();
    renderers['2d'].dispose();
  } finally {
    restoreDom();
  }
});
