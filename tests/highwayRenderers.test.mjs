import assert from 'node:assert/strict';
import test from 'node:test';
import { getHighwayConfig as getPianoConfig } from '../src/instruments/piano.mjs';
import { getHighwayConfig as getSaxConfig } from '../src/instruments/saxophone.mjs';
import {
  getHighwayConfig as getStringsConfig,
  mapNoteToHighway as mapStringsNote,
} from '../src/instruments/strings.mjs';
import { BaseHighwayRenderer, createHighwayViewSwitcher } from '../src/ui/baseHighwayRenderer.mjs';
import { computeStringsRackMetrics, desaturateRgb, Highway3DRenderer } from '../src/ui/highway3dRenderer.mjs';
import { Highway2DRenderer, HighwayRenderer } from '../src/ui/highwayRenderer.mjs';
import { createDeckLayout, projectDeckPoint } from '../src/ui/perspective3d.mjs';

function makeMock2DContext(drawCalls = null) {
  const noop = () => {};
  return {
    save: noop,
    restore: noop,
    clearRect: noop,
    fillRect: (...args) => drawCalls?.fillRect.push(args),
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    arc: (...args) => drawCalls?.arc.push(args),
    rect: noop,
    clip: noop,
    fill: noop,
    stroke: noop,
    fillText: (...args) => drawCalls?.fillText.push(args),
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

function installDomShim(drawCalls = null) {
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
        return { left: 0, top: 0, width: el.width, height: el.height };
      },
      getContext(type) {
        if (type === '2d') return makeMock2DContext(drawCalls);
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
      renderer.render({ ...frameBase, config: getStringsConfig() });
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

test('Strings 2D and 3D renderers support violin_4, violin_5, viola_4, full-width open bars, bottom strike alignment, and top intonation gauge', () => {
  const drawCalls = { fillRect: [], fillText: [], arc: [] };
  const restoreDom = installDomShim(drawCalls);
  try {
    const container = globalThis.document.createElement('div');
    const sharedCanvas = globalThis.document.createElement('canvas');
    sharedCanvas.id = 'highway-canvas';
    container.appendChild(sharedCanvas);

    const r2d = new Highway2DRenderer({ canvas: sharedCanvas }).mount(container);
    const r3d = new Highway3DRenderer().mount(container);

    for (const presetId of ['violin_4', 'violin_5', 'viola_4']) {
      drawCalls.fillText.length = 0;
      const config = getStringsConfig({ stringsPreset: presetId });
      const openMidi = config.legend[0].openMidi;
      const openNote = {
        id: 0,
        status: 'pending',
        startTime: 0.4,
        endTime: 1.0,
        duration: 0.6,
        ...mapStringsNote(openMidi, { stringsPreset: presetId }),
      };
      const fingeredNote = {
        id: 1,
        status: 'pending',
        startTime: 1.1,
        endTime: 1.5,
        duration: 0.4,
        ...mapStringsNote(openMidi + 2, { stringsPreset: presetId }),
      };

      const frame = {
        config,
        notes: [openNote, fingeredNote],
        songTime: 0.35,
        bpm: 120,
        activeMidiKeys: new Set(),
        detectedPitch: { nearestMidi: 69, noteName: 'A4', centsOff: -6, frequencyHz: 438.5, confidence: 0.92 },
        gameSnapshot: {
          isWaiting: true,
          waitNotes: [openNote],
          lastJudgment: null,
          songTime: 0.35,
        },
        hitEffects: [
          {
            laneIndices: [],
            openNote: true,
            stringIndex: openNote.stringIndex,
            stringId: openNote.stringId,
            color: openNote.color,
            life: 0.6,
          },
        ],
      };

      r2d.render(frame);
      drawCalls.fillText.length = 0;
      r3d.render(frame);
      assert.ok(r3d.batch.vertexCount > 0);

      // Verify bottom finger labels remain inside canvas bounds and Intonation Gauge is at top
      const fingerLabelCalls = drawCalls.fillText.filter(([text]) => text === 'L1' || text === 'H3/L4');
      assert.ok(fingerLabelCalls.length > 0);
      for (const [, , y] of fingerLabelCalls) {
        assert.ok(y <= 572 && y > 540, `bottom finger label y=${y} must sit cleanly below upright gate`);
      }
      const gaugeReadout = drawCalls.fillText.find(([text]) => String(text).startsWith('Detected: A4'));
      assert.ok(gaugeReadout, '3D Strings must render detected pitch readout in top header');
      assert.ok(gaugeReadout[2] < 56, `top Intonation Gauge readout y=${gaugeReadout[2]} must sit in top header`);
    }

    // Verify zero solid yellow overwrite, taut inactive wires (0.52), 0.25 idle bottom ribbons, and dynamic hurdle height
    const cfg4 = getStringsConfig({ stringsPreset: 'violin_4' });
    const gOpenWait = {
      id: 0,
      status: 'pending',
      startTime: 0.4,
      endTime: 0.8,
      duration: 0.4,
      ...mapStringsNote(55, { stringsPreset: 'violin_4' }), // G3 (#2997ff) -> D, A, E ribbons idle at 0.25 opacity
    };
    r3d.render({
      config: cfg4,
      notes: [gOpenWait],
      songTime: 0.4,
      bpm: 120,
      activeMidiKeys: new Set(),
      detectedPitch: null,
      gameSnapshot: { isWaiting: true, waitNotes: [gOpenWait], lastJudgment: null, songTime: 0.4 },
      hitEffects: [],
    });

    const data = r3d.batch.data;
    let sawSolidYellow = false;
    let sawTautUntouchedWire = false;
    let sawIdleBottomRibbon = false;
    for (let v = 0; v < r3d.batch.vertexCount; v += 1) {
      const r = data[v * 6 + 2];
      const g = data[v * 6 + 3];
      const b = data[v * 6 + 4];
      const a = data[v * 6 + 5];
      if (Math.abs(r - 0.98) < 0.08 && Math.abs(g - 0.78) < 0.08 && Math.abs(b - 0.18) < 0.08 && a > 0.85) {
        sawSolidYellow = true;
      }
      if (a > 0.48 && a < 0.56) {
        sawTautUntouchedWire = true;
      }
      if (a > 0.22 && a < 0.28) {
        sawIdleBottomRibbon = true;
      }
    }
    assert.equal(sawSolidYellow, false, 'waiting note must keep true string color instead of solid yellow');
    assert.equal(sawTautUntouchedWire, true, 'untouched strings in upright 3D block must render as crisp taut wires');
    assert.equal(sawIdleBottomRibbon, true, 'untargeted bottom strike ribbons must drop to 0.25 opacity');

    // Verify desaturateRgb significantly reduces RGB chroma compared to vivid active string color
    const vividCyan = [0.22, 0.74, 0.97];
    const mutedCyan = desaturateRgb(vividCyan, 0.24, true);
    const vividChroma = Math.max(...vividCyan) - Math.min(...vividCyan);
    const mutedChroma = Math.max(...mutedCyan) - Math.min(...mutedCyan);
    assert.ok(mutedChroma < vividChroma * 0.35, 'desaturateRgb must strongly reduce inactive string chroma');

    // Verify dynamic hurdleHeightNorm (stringCount * 0.11) keeps 5-string rowPitchH legible at horizon
    const layout = createDeckLayout({ width: 900, height: 580, headerH: 56, footerH: 40, fovDepth: 2.15 });
    const metrics4 = computeStringsRackMetrics(layout, 4);
    const metrics5 = computeStringsRackMetrics(layout, 5);
    assert.equal(metrics4.hurdleHeightNorm, 0.44);
    assert.equal(metrics5.hurdleHeightNorm, 0.55);
    assert.ok(Math.abs(metrics5.rowPitchH - metrics4.rowPitchH) < 0.05);

    const activeRow = 2; // D string on GDAE
    const yBottomRow = projectDeckPoint(0.5, 0, metrics4.hForRow(activeRow), layout).y;
    const yBlockStrikeRow = projectDeckPoint(0.5, 0, metrics4.hForRow(activeRow), layout).y;
    assert.ok(
      Math.abs(yBlockStrikeRow - yBottomRow) < 0.5,
      'upright block active row must align directly with bottom gate',
    );

    for (const zCenter of [0, 0.5, 0.9]) {
      const rowYs = [0, 1, 2, 3, 4].map((row) => projectDeckPoint(0.5, zCenter, metrics5.hForRow(row), layout).y);
      for (let r = 1; r < rowYs.length; r += 1) {
        assert.ok(
          rowYs[r] - rowYs[r - 1] >= 4.5,
          `5-string row ${r} must maintain >= 4.5px separation below row ${r - 1} at z=${zCenter}`,
        );
      }
    }

    r3d.dispose();
    r2d.dispose();
  } finally {
    restoreDom();
  }
});
