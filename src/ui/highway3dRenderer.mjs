import { midiToSaxNoteName } from '../instruments/saxophone.mjs';
import {
  BaseHighwayRenderer,
  computeLaneGeometries,
  drawCenterPill,
  drawHeaderBar,
  drawIntonationGauge,
  drawShapeSymbol,
  getStagePalette,
  roundRectPath,
} from './baseHighwayRenderer.mjs';
import {
  computeNormalizedLaneSpans,
  createDeckLayout,
  pointInQuad,
  projectDeckPoint,
  unprojectScreenToDeck,
} from './perspective3d.mjs';

const VERTEX_SHADER_SRC = `
  attribute vec2 a_pos;
  attribute vec4 a_color;
  uniform vec2 u_resolution;
  varying vec4 v_color;
  void main() {
    vec2 zeroToOne = a_pos / u_resolution;
    vec2 clip = zeroToOne * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    v_color = a_color;
  }
`;

const FRAGMENT_SHADER_SRC = `
  precision mediump float;
  varying vec4 v_color;
  void main() {
    gl_FragColor = v_color;
  }
`;

function hexToRgb(hex) {
  const clean = String(hex || '#38bdf8').replace('#', '');
  if (clean.length === 3) {
    return [
      Number.parseInt(clean[0] + clean[0], 16) / 255,
      Number.parseInt(clean[1] + clean[1], 16) / 255,
      Number.parseInt(clean[2] + clean[2], 16) / 255,
    ];
  }
  const num = Number.parseInt(clean.slice(0, 6), 16);
  if (Number.isNaN(num)) return [0.22, 0.74, 0.97];
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

function shadeRgb(rgb, factor, fog = 1, bgRgb = [0.04, 0.06, 0.11]) {
  const lit = [Math.min(1, rgb[0] * factor), Math.min(1, rgb[1] * factor), Math.min(1, rgb[2] * factor)];
  return [
    bgRgb[0] + (lit[0] - bgRgb[0]) * fog,
    bgRgb[1] + (lit[1] - bgRgb[1]) * fog,
    bgRgb[2] + (lit[2] - bgRgb[2]) * fog,
  ];
}

class MeshBatch {
  constructor(initialVertices = 16384) {
    this.floatsPerVertex = 6; // x, y, r, g, b, a
    this.data = new Float32Array(initialVertices * this.floatsPerVertex);
    this.vertexCount = 0;
  }

  reset() {
    this.vertexCount = 0;
  }

  _ensure(extraVertices) {
    const needed = (this.vertexCount + extraVertices) * this.floatsPerVertex;
    if (needed <= this.data.length) return;
    let nextLen = this.data.length * 2;
    while (nextLen < needed) nextLen *= 2;
    const grown = new Float32Array(nextLen);
    grown.set(this.data.subarray(0, this.vertexCount * this.floatsPerVertex));
    this.data = grown;
  }

  pushVertex(x, y, r, g, b, a = 1) {
    this._ensure(1);
    const idx = this.vertexCount * this.floatsPerVertex;
    this.data[idx] = x;
    this.data[idx + 1] = y;
    this.data[idx + 2] = r;
    this.data[idx + 3] = g;
    this.data[idx + 4] = b;
    this.data[idx + 5] = a;
    this.vertexCount += 1;
  }

  pushQuad(p0, p1, p2, p3, rgb, alpha = 1) {
    this._ensure(6);
    const [r, g, b] = rgb;
    this.pushVertex(p0.x, p0.y, r, g, b, alpha);
    this.pushVertex(p1.x, p1.y, r, g, b, alpha);
    this.pushVertex(p2.x, p2.y, r, g, b, alpha);

    this.pushVertex(p0.x, p0.y, r, g, b, alpha);
    this.pushVertex(p2.x, p2.y, r, g, b, alpha);
    this.pushVertex(p3.x, p3.y, r, g, b, alpha);
  }
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/**
 * Desaturate an RGB color (`[r, g, b]` in `0..1`) toward a balanced neutral slate
 * so inactive Strings lanes/slots recede visually behind the active bowed string.
 */
export function desaturateRgb(rgb, saturation = 0.25, isDark = true) {
  const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const neutral = isDark ? Math.max(0.42, Math.min(0.62, luma * 0.82)) : Math.max(0.32, Math.min(0.54, luma * 0.72));
  const s = Math.max(0, Math.min(1, Number(saturation) || 0));
  return [neutral * (1 - s) + rgb[0] * s, neutral * (1 - s) + rgb[1] * s, neutral * (1 - s) + rgb[2] * s];
}

/**
 * Compute upright vertical rack metrics (in `heightPx` above the deck surface) for
 * both the bottom Strings gate at `z = 0` and camera-facing 3D note blocks.
 * Using `heightPx` causes vertical row spacing to scale with `scale^1`, avoiding
 * `scale^2` foreshortening squash down the highway.
 */
export function computeStringsRackMetrics(_layout, stringCount = 4) {
  const safeCount = Math.max(1, Number(stringCount) || 4);
  const rowPitchH = safeCount >= 5 ? 14.5 : 17.0;
  const baseCenterH = safeCount >= 5 ? 10.0 : 11.5;
  const hForRow = (row) => baseCenterH + (safeCount - 1 - row) * rowPitchH;
  const frameBottomH = 2.0;
  const frameTopH = hForRow(0) + (safeCount >= 5 ? 8.0 : 9.0);
  const activeHalfH = safeCount >= 5 ? 4.6 : 5.2;
  const inactiveHalfH = safeCount >= 5 ? 2.6 : 3.0;
  return {
    stringCount: safeCount,
    rowPitchH,
    baseCenterH,
    hForRow,
    frameBottomH,
    frameTopH,
    activeHalfH,
    inactiveHalfH,
  };
}

/**
 * WebGL2 / WebGL1 Guitar Hero-style 3D tilted highway renderer paired with a
 * crisp transparent 2D HUD canvas for badges, Strings shapes, headers, and gauges.
 * Implements the exact BaseHighwayRenderer interface so it is 100% replaceable
 * with Highway2DRenderer.
 */
export class Highway3DRenderer extends BaseHighwayRenderer {
  constructor(options = {}) {
    super(options);
    this.onFallbackNeeded = options.onFallbackNeeded ?? null;
    this.stageEl = null;
    this.glCanvas = null;
    this.hudCanvas = null;
    this.gl = null;
    this.hudCtx = null;
    this.program = null;
    this.buffer = null;
    this.posLoc = -1;
    this.colorLoc = -1;
    this.resLoc = null;
    this.batch = new MeshBatch();
    this.pianoHitQuads = [];
    this.lastLayout = null;
    this.lastLaneSpans = [];
    this._onContextLost = (e) => {
      e.preventDefault();
      this.onFallbackNeeded?.('WebGL context lost');
    };
  }

  get mode() {
    return '3d';
  }

  mount(containerEl) {
    super.mount(containerEl);
    if (!containerEl || typeof document === 'undefined') return this;

    const existing2D = containerEl.querySelector?.('#highway-canvas');
    if (existing2D) existing2D.hidden = true;

    if (!this.stageEl) {
      this.stageEl = document.createElement('div');
      this.stageEl.className = 'highway-3d-stage';

      this.glCanvas = document.createElement('canvas');
      this.glCanvas.className = 'highway-gl-canvas';
      this.glCanvas.setAttribute('aria-hidden', 'true');

      this.hudCanvas = document.createElement('canvas');
      this.hudCanvas.className = 'highway-hud-canvas';
      this.hudCanvas.setAttribute('aria-label', '3D scrolling instrument fingering highway');

      this.stageEl.append(this.glCanvas, this.hudCanvas);
      this.glCanvas.addEventListener('webglcontextlost', this._onContextLost);
    }

    if (!this.stageEl.parentElement) {
      containerEl.appendChild(this.stageEl);
    }

    this._initWebGL();
    this.hudCtx = this.hudCanvas.getContext('2d');
    return this;
  }

  _initWebGL() {
    if (!this.glCanvas || this.gl) return Boolean(this.gl);
    const attrs = {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: true,
    };
    const gl = this.glCanvas.getContext('webgl2', attrs) || this.glCanvas.getContext('webgl', attrs);
    if (!gl) {
      this.onFallbackNeeded?.('WebGL unavailable');
      return false;
    }

    const program = createProgram(gl);
    if (!program) {
      this.onFallbackNeeded?.('WebGL shader initialization failed');
      return false;
    }

    this.gl = gl;
    this.program = program;
    this.buffer = gl.createBuffer();
    this.posLoc = gl.getAttribLocation(program, 'a_pos');
    this.colorLoc = gl.getAttribLocation(program, 'a_color');
    this.resLoc = gl.getUniformLocation(program, 'u_resolution');
    return true;
  }

  unmount() {
    this.pianoHitQuads = [];
    if (this.stageEl?.parentElement) {
      this.stageEl.parentElement.removeChild(this.stageEl);
    }
    super.unmount();
  }

  dispose() {
    this.unmount();
    if (this.glCanvas) {
      this.glCanvas.removeEventListener('webglcontextlost', this._onContextLost);
    }
    if (this.gl) {
      if (this.buffer) this.gl.deleteBuffer(this.buffer);
      if (this.program) this.gl.deleteProgram(this.program);
      this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    this.gl = null;
    this.program = null;
    this.buffer = null;
    this.hudCtx = null;
    this.stageEl = null;
    this.glCanvas = null;
    this.hudCanvas = null;
  }

  _syncCanvases() {
    const target = this.stageEl ?? this.container;
    if (!target || !this.glCanvas || !this.hudCanvas || !this.hudCtx) {
      return { width: 800, height: 560, dpr: 1 };
    }
    const rect = target.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(220, Math.floor(rect.height));
    const pixelW = Math.floor(width * dpr);
    const pixelH = Math.floor(height * dpr);

    if (this.glCanvas.width !== pixelW || this.glCanvas.height !== pixelH) {
      this.glCanvas.width = pixelW;
      this.glCanvas.height = pixelH;
    }
    if (this.hudCanvas.width !== pixelW || this.hudCanvas.height !== pixelH) {
      this.hudCanvas.width = pixelW;
      this.hudCanvas.height = pixelH;
    }

    this.hudCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.lastWidth = width;
    this.lastHeight = height;
    return { width, height, dpr };
  }

  hitTestPianoKey(clientX, clientY) {
    const target = this.hudCanvas ?? this.stageEl;
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // 1. Check projected 3D black-key polygons first (elevated above white keys)
    for (let i = this.pianoHitQuads.length - 1; i >= 0; i -= 1) {
      const zone = this.pianoHitQuads[i];
      if (!zone.isBlack) continue;
      if (zone.quads.some((q) => pointInQuad(x, y, q))) {
        return zone.midi;
      }
    }

    // 2. Check projected 3D white-key polygons
    for (let i = 0; i < this.pianoHitQuads.length; i += 1) {
      const zone = this.pianoHitQuads[i];
      if (zone.isBlack) continue;
      if (zone.quads.some((q) => pointInQuad(x, y, q))) {
        return zone.midi;
      }
    }

    // 3. Analytical deck unprojection fallback
    if (this.lastLayout && this.lastLaneSpans.length > 0) {
      const hit = unprojectScreenToDeck(x, y, this.lastLayout, 4);
      if (hit && hit.zNorm >= -0.22 && hit.zNorm <= 0.03) {
        const match = this.lastLaneSpans.find((s) => !s.isAccidental && hit.uNorm >= s.u0 && hit.uNorm <= s.u1);
        if (match) return match.midi;
      }
    }

    return null;
  }

  _emitDeckQuad(u0, u1, zNear, zFar, heightPx, rgb, alpha, layout, bgRgb) {
    const bl = projectDeckPoint(u0, zNear, heightPx, layout);
    const br = projectDeckPoint(u1, zNear, heightPx, layout);
    const tr = projectDeckPoint(u1, zFar, heightPx, layout);
    const tl = projectDeckPoint(u0, zFar, heightPx, layout);
    const fog = (bl.fog + tr.fog) * 0.5;
    this.batch.pushQuad(bl, br, tr, tl, shadeRgb(rgb, 1, fog, bgRgb), alpha);
  }

  _emitUprightQuad(u0, u1, z, hBottom, hTop, rgb, alpha, layout, bgRgb) {
    const bl = projectDeckPoint(u0, z, hBottom, layout);
    const br = projectDeckPoint(u1, z, hBottom, layout);
    const tr = projectDeckPoint(u1, z, hTop, layout);
    const tl = projectDeckPoint(u0, z, hTop, layout);
    const fog = Math.max(0.22, (bl.fog + tr.fog) * 0.5);
    this.batch.pushQuad(bl, br, tr, tl, shadeRgb(rgb, 1, fog, bgRgb), alpha);
  }

  _emitExtrudedPrism(u0, u1, zNear, zFar, hBottom, hTop, rgb, alpha, layout, bgRgb) {
    const bNearL = projectDeckPoint(u0, zNear, hBottom, layout);
    const bNearR = projectDeckPoint(u1, zNear, hBottom, layout);
    const bFarR = projectDeckPoint(u1, zFar, hBottom, layout);
    const bFarL = projectDeckPoint(u0, zFar, hBottom, layout);

    const tNearL = projectDeckPoint(u0, zNear, hTop, layout);
    const tNearR = projectDeckPoint(u1, zNear, hTop, layout);
    const tFarR = projectDeckPoint(u1, zFar, hTop, layout);
    const tFarL = projectDeckPoint(u0, zFar, hTop, layout);

    const fog = Math.max(0.15, (tNearL.fog + tFarR.fog) * 0.5);

    // Side faces facing inward toward the camera center
    if ((u0 + u1) * 0.5 < 0.5) {
      this.batch.pushQuad(bNearR, bFarR, tFarR, tNearR, shadeRgb(rgb, 0.72, fog, bgRgb), alpha);
    } else {
      this.batch.pushQuad(bFarL, bNearL, tNearL, tFarL, shadeRgb(rgb, 0.72, fog, bgRgb), alpha);
    }

    // Top face (brightest)
    this.batch.pushQuad(tNearL, tNearR, tFarR, tFarL, shadeRgb(rgb, 1.12, fog, bgRgb), alpha);

    // Front bevel face (facing player)
    this.batch.pushQuad(bNearL, bNearR, tNearR, tNearL, shadeRgb(rgb, 0.85, fog, bgRgb), alpha);

    return {
      topQuad: [tNearL, tNearR, tFarR, tFarL],
      frontQuad: [bNearL, bNearR, tNearR, tNearL],
      center: {
        x: (tNearL.x + tNearR.x + tFarR.x + tFarL.x) / 4,
        y: (tNearL.y + tNearR.y + tFarR.y + tFarL.y) / 4,
        scale: (tNearL.scale + tFarR.scale) * 0.5,
      },
    };
  }

  render({ config, notes, songTime, bpm, activeMidiKeys, detectedPitch, gameSnapshot, hitEffects }) {
    if (!this.glCanvas || !this.hudCanvas || !this.hudCtx) return;
    const { width, height, dpr } = this._syncCanvases();
    const isDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
    const palette = getStagePalette(isDark);
    const bgRgb = isDark ? [0.03, 0.047, 0.085] : [0.92, 0.94, 0.97];

    const stringCount = config.legend?.length ?? 4;
    const isStrings = config.id === 'strings';
    const headerH = isStrings ? 56 : 54;
    const footerH = config.id === 'piano' ? 124 : config.id === 'saxophone' ? 116 : 40;
    const layout = createDeckLayout({ width, height, headerH, footerH, fovDepth: 2.15 });
    const rackMetrics = isStrings ? computeStringsRackMetrics(layout, stringCount) : null;
    const laneSpans = computeNormalizedLaneSpans(config);
    this.lastLayout = layout;
    this.lastLaneSpans = laneSpans;

    const liveMidiSet = new Set(activeMidiKeys ?? []);
    if (detectedPitch && detectedPitch.confidence >= 0.6) {
      liveMidiSet.add(detectedPitch.nearestMidi);
    }

    const activeLaneSet = new Set();
    const activeLaneColors = new Map();
    const activeStringIds = new Set();
    if (config.id === 'piano') {
      for (const s of laneSpans) {
        if (liveMidiSet.has(s.midi)) activeLaneSet.add(s.index);
      }
    } else if (detectedPitch && detectedPitch.confidence >= 0.6) {
      for (const n of notes) {
        if (Math.abs(n.startTime - songTime) <= 0.45 && n.targetMidi === detectedPitch.nearestMidi) {
          const nRgb = hexToRgb(n.color);
          if (n.stringId) activeStringIds.add(n.stringId);
          for (const idx of n.laneIndices ?? []) {
            activeLaneSet.add(idx);
            activeLaneColors.set(idx, nRgb);
          }
        }
      }
    }

    const waitSet = new Set((gameSnapshot?.waitNotes ?? []).map((n) => n.id));
    const targetLaneSet = new Set();
    const targetLaneColors = new Map();
    const targetStringIds = new Set();
    let waitPrimaryColor = null;
    for (const wn of gameSnapshot?.waitNotes ?? []) {
      const wnRgb = hexToRgb(wn.color);
      if (!waitPrimaryColor) waitPrimaryColor = wnRgb;
      if (wn.stringId) targetStringIds.add(wn.stringId);
      for (const idx of wn.laneIndices ?? []) {
        targetLaneSet.add(idx);
        targetLaneColors.set(idx, wnRgb);
      }
    }

    let imminentStringId = null;
    if (isStrings && targetStringIds.size === 0 && activeStringIds.size === 0) {
      for (let i = 0; i < notes.length; i += 1) {
        const n = notes[i];
        if (n.status !== 'pending') continue;
        if (n.startTime < songTime - 0.08) continue;
        if (n.startTime > songTime + 0.5) break;
        imminentStringId = n.stringId ?? null;
        break;
      }
    }
    const highlightedStringIds = new Set([...targetStringIds, ...activeStringIds]);
    if (imminentStringId) highlightedStringIds.add(imminentStringId);

    this.batch.reset();

    // 1. Horizon atmosphere glow & receding deck surface
    const deckNearZ = isStrings ? -0.025 : -0.02;
    const deckBaseRgb = isDark ? [0.06, 0.095, 0.175] : [0.88, 0.91, 0.96];
    this._emitDeckQuad(
      -0.04,
      1.04,
      -0.22,
      1.08,
      -2,
      isDark ? [0.04, 0.065, 0.125] : [0.8, 0.85, 0.92],
      1,
      layout,
      bgRgb,
    );
    this._emitDeckQuad(0, 1, deckNearZ, 1.02, 0, deckBaseRgb, 1, layout, bgRgb);

    // Glowing side rails (left & right Guitar Hero fretboard borders)
    const railRgb = hexToRgb(palette.hitLine);
    this._emitExtrudedPrism(-0.025, 0, deckNearZ, 1.02, 0, 8, railRgb, 0.92, layout, bgRgb);
    this._emitExtrudedPrism(1, 1.025, deckNearZ, 1.02, 0, 8, railRgb, 0.92, layout, bgRgb);

    // 2. Perspective lane strips + active lane illumination beams
    const laneNearZ = 0;
    for (let i = 0; i < laneSpans.length; i += 1) {
      const s = laneSpans[i];
      if (config.id === 'piano' && s.isAccidental) continue;
      const laneRgb = s.isAccidental
        ? isDark
          ? [0.11, 0.14, 0.24]
          : [0.86, 0.89, 0.98]
        : i % 2 === 0
          ? isDark
            ? [0.07, 0.11, 0.2]
            : [0.97, 0.98, 1.0]
          : isDark
            ? [0.085, 0.13, 0.23]
            : [0.93, 0.95, 0.98];

      this._emitDeckQuad(s.u0, s.u1, laneNearZ, 1.0, 0.4, laneRgb, 1, layout, bgRgb);

      // Subtle lane divider groove
      this._emitDeckQuad(
        s.u0,
        s.u0 + 0.003,
        laneNearZ,
        1.0,
        0.6,
        isDark ? [0.22, 0.3, 0.44] : [0.65, 0.72, 0.82],
        0.55,
        layout,
        bgRgb,
      );

      if (activeLaneSet.has(s.index) || targetLaneSet.has(s.index)) {
        const beamRgb = targetLaneColors.get(s.index) ?? activeLaneColors.get(s.index) ?? hexToRgb(s.color);
        this._emitDeckQuad(s.u0 + 0.004, s.u1 - 0.004, laneNearZ, 0.88, 0.8, beamRgb, 0.24, layout, bgRgb);
      }
    }

    // Piano black-key lane guide stripes
    if (config.id === 'piano') {
      for (const s of laneSpans) {
        if (!s.isAccidental) continue;
        this._emitDeckQuad(
          s.u0,
          s.u1,
          0,
          1.0,
          0.8,
          isDark ? [0.04, 0.06, 0.12] : [0.78, 0.82, 0.9],
          0.65,
          layout,
          bgRgb,
        );
      }
    }

    // Saxophone LH / RH center divider rail
    if (config.id === 'saxophone' && laneSpans.length >= 7) {
      const splitU = (laneSpans[5].u1 + laneSpans[6].u0) * 0.5;
      this._emitExtrudedPrism(splitU - 0.005, splitU + 0.005, 0, 1.0, 0, 3, railRgb, 0.85, layout, bgRgb);
    }

    // 3. 3D Beat & Measure fretbars across the tilted deck
    const secPerBeat = 60 / Math.max(30, bpm || 120);
    const minBeat = Math.floor((songTime - 0.1) / secPerBeat);
    const maxBeat = Math.ceil((songTime + this.lookaheadSec + 0.2) / secPerBeat);
    for (let b = minBeat; b <= maxBeat; b += 1) {
      const z = (b * secPerBeat - songTime) / this.lookaheadSec;
      if (z < 0 || z > 1) continue;
      const isMeasure = b % 4 === 0;
      const fretRgb = isDark ? [0.58, 0.65, 0.78] : [0.35, 0.42, 0.55];
      this._emitDeckQuad(0, 1, z, z + (isMeasure ? 0.011 : 0.005), 1, fretRgb, isMeasure ? 0.55 : 0.24, layout, bgRgb);
    }

    // 4. Strike line bar at z = 0
    const strikeRgb = gameSnapshot?.isWaiting ? [0.96, 0.62, 0.04] : railRgb;
    this._emitExtrudedPrism(0, 1, -0.014, 0.014, 0, 4.5, strikeRgb, 0.95, layout, bgRgb);

    // 5. Sort visible notes far-to-near (painter's order) and emit 3D sustains + extruded gems
    const maxVisibleTime = songTime + this.lookaheadSec + 0.25;
    const minVisibleTime = songTime - 0.35;
    const visibleNotes = [];
    for (let i = 0; i < notes.length; i += 1) {
      const note = notes[i];
      if (note.endTime < minVisibleTime) continue;
      if (note.startTime > maxVisibleTime) break;
      visibleNotes.push(note);
    }
    visibleNotes.sort((a, b) => b.startTime - a.startTime);

    const hudLabels = [];
    for (const note of visibleNotes) {
      const zNear = (note.startTime - songTime) / this.lookaheadSec;
      if (zNear < -0.05 || zNear > 1.06) continue;
      const zEnd = Math.min(1.06, Math.max(zNear + 0.045, (note.endTime - songTime) / this.lookaheadSec));
      const isWaitingTarget = waitSet.has(note.id);
      const alpha = note.status === 'miss' ? 0.32 : note.status === 'perfect' || note.status === 'good' ? 0.52 : 1;
      const noteRgb = isWaitingTarget ? [0.98, 0.78, 0.18] : hexToRgb(note.color);
      const gemDepth = 0.046;

      if (config.id === 'saxophone' && note.openNote) {
        const l1 = laneSpans[2];
        const r3 = laneSpans[8];
        if (l1 && r3) {
          const arch = this._emitExtrudedPrism(
            l1.u0 + 0.008,
            r3.u1 - 0.008,
            zNear,
            Math.min(1.04, zNear + gemDepth),
            2,
            15,
            [0.66, 0.33, 0.97],
            alpha * 0.88,
            layout,
            bgRgb,
          );
          hudLabels.push({
            kind: 'sax-open',
            note,
            alpha,
            center: arch.center,
          });
        }
        continue;
      }

      const activeLanes = config.id === 'saxophone' ? (note.laneIndices ?? []) : [note.primaryLane];
      if (activeLanes.length === 0) continue;

      if (config.id === 'saxophone' && activeLanes.length > 1) {
        const first = laneSpans[activeLanes[0]];
        const last = laneSpans[activeLanes[activeLanes.length - 1]];
        if (first && last) {
          this._emitExtrudedPrism(
            first.uCenter,
            last.uCenter,
            zNear + gemDepth * 0.35,
            Math.min(1.04, zNear + gemDepth * 0.65),
            4,
            10,
            noteRgb,
            alpha * 0.85,
            layout,
            bgRgb,
          );
        }
      }

      for (const laneIdx of activeLanes) {
        const span = laneSpans[laneIdx];
        if (!span) continue;
        const inset = config.id === 'piano' ? span.uWidth * 0.08 : span.uWidth * 0.14;
        const u0 = span.u0 + inset;
        const u1 = span.u1 - inset;

        // 3D Sustain Ribbon along the deck
        if (zEnd - zNear > 0.06) {
          const tailInset = (u1 - u0) * 0.28;
          this._emitExtrudedPrism(
            u0 + tailInset,
            u1 - tailInset,
            zNear + gemDepth * 0.6,
            zEnd,
            1.5,
            7,
            noteRgb,
            alpha * 0.55,
            layout,
            bgRgb,
          );
        }

        const gemRgb = config.id === 'saxophone' && span.isAccidental ? [0.96, 0.62, 0.04] : noteRgb;
        const gemHeight = isWaitingTarget ? 22 : 17;
        const prism = this._emitExtrudedPrism(
          u0,
          u1,
          zNear,
          Math.min(1.05, zNear + gemDepth),
          1.5,
          gemHeight,
          gemRgb,
          alpha,
          layout,
          bgRgb,
        );

        hudLabels.push({
          kind: config.id,
          note,
          span,
          laneIdx,
          alpha,
          isWaitingTarget,
          center: prism.center,
        });
      }
    }

    // 6. Hit effects along strike bar
    for (const eff of hitEffects ?? []) {
      const targets = eff.openNote ? [5] : (eff.laneIndices ?? []);
      const effRgb = hexToRgb(eff.color);
      for (const laneIdx of targets) {
        const span = laneSpans[laneIdx];
        if (!span) continue;
        const expand = (1 - eff.life) * 0.025;
        this._emitExtrudedPrism(
          span.u0 - expand,
          span.u1 + expand,
          -0.025,
          0.035,
          0,
          12 + eff.life * 20,
          effRgb,
          Math.max(0, eff.life * 0.72),
          layout,
          bgRgb,
        );
      }
    }

    // 7. Front Receptor / Keybed 3D Geometry
    this.pianoHitQuads = [];
    if (config.id === 'piano') {
      // White keys first
      for (const s of laneSpans) {
        if (s.isAccidental) continue;
        const pressed = liveMidiSet.has(s.midi);
        const keyRgb = pressed ? [0.22, 0.74, 0.97] : [0.95, 0.97, 0.99];
        const keyH = pressed ? 3 : 7;
        const prism = this._emitExtrudedPrism(
          s.u0 + 0.001,
          s.u1 - 0.001,
          -0.18,
          -0.012,
          0,
          keyH,
          keyRgb,
          1,
          layout,
          bgRgb,
        );
        this.pianoHitQuads.push({
          midi: s.midi,
          isBlack: false,
          quads: [prism.topQuad, prism.frontQuad],
          center: prism.center,
          span: s,
          pressed,
        });
      }
      // Black keys on top
      for (const s of laneSpans) {
        if (!s.isAccidental) continue;
        const pressed = liveMidiSet.has(s.midi);
        const keyRgb = pressed ? [0.75, 0.52, 0.99] : [0.09, 0.13, 0.22];
        const keyH = pressed ? 10 : 15;
        const prism = this._emitExtrudedPrism(s.u0, s.u1, -0.12, -0.012, 6, keyH, keyRgb, 1, layout, bgRgb);
        this.pianoHitQuads.push({
          midi: s.midi,
          isBlack: true,
          quads: [prism.topQuad, prism.frontQuad],
          center: prism.center,
          span: s,
          pressed,
        });
      }
    } else if (isStrings) {
      // Low-profile finger lane receptor tabs tucked cleanly in front of the upright gate
      for (const s of laneSpans) {
        const isLit = targetLaneSet.has(s.index) || activeLaneSet.has(s.index);
        const recRgb =
          targetLaneColors.get(s.index) ??
          activeLaneColors.get(s.index) ??
          (isDark ? [0.15, 0.22, 0.34] : [0.72, 0.78, 0.87]);
        this._emitExtrudedPrism(
          s.u0 + 0.008,
          s.u1 - 0.008,
          -0.022,
          -0.004,
          0,
          isLit ? 4.5 : 2.0,
          recRgb,
          0.95,
          layout,
          bgRgb,
        );
      }
    } else {
      const saxDyDz = (layout.depthSpan * layout.fovDepth) / (1 - layout.farScale);
      const saxTabNear = -Math.min(0.06, 26 / Math.max(200, saxDyDz));
      for (const s of laneSpans) {
        const isLit = targetLaneSet.has(s.index) || activeLaneSet.has(s.index);
        const recRgb =
          targetLaneColors.get(s.index) ??
          activeLaneColors.get(s.index) ??
          (isDark ? [0.15, 0.22, 0.34] : [0.72, 0.78, 0.87]);
        this._emitExtrudedPrism(
          s.u0 + 0.006,
          s.u1 - 0.006,
          saxTabNear,
          -0.008,
          0,
          isLit ? 10 : 5,
          recRgb,
          0.95,
          layout,
          bgRgb,
        );
      }
    }

    // 8. Flush WebGL frame
    if (this.gl && this.program && this.buffer) {
      const gl = this.gl;
      gl.viewport(0, 0, Math.floor(width * dpr), Math.floor(height * dpr));
      gl.clearColor(bgRgb[0], bgRgb[1], bgRgb[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(this.program);
      gl.uniform2f(this.resLoc, width, height);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        this.batch.data.subarray(0, this.batch.vertexCount * this.batch.floatsPerVertex),
        gl.DYNAMIC_DRAW,
      );

      const stride = this.batch.floatsPerVertex * Float32Array.BYTES_PER_ELEMENT;
      gl.enableVertexAttribArray(this.posLoc);
      gl.vertexAttribPointer(this.posLoc, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(this.colorLoc);
      gl.vertexAttribPointer(this.colorLoc, 4, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
      gl.drawArrays(gl.TRIANGLES, 0, this.batch.vertexCount);
    }

    // 9. Crisp 2D HUD Overlay (Strings badges, note/finger labels, headers, Intonation Gauge)
    this._renderHudOverlay(this.hudCtx, {
      width,
      height,
      headerH,
      layout,
      rackMetrics,
      highlightedStringIds,
      laneSpans,
      config,
      hudLabels,
      detectedPitch,
      gameSnapshot,
      palette,
      isDark,
    });
  }

  _emitStringsBottomGate({ config, rackMetrics, highlightedStringIds, railRgb, layout, bgRgb, isDark }) {
    const legend = config.legend ?? [];
    const sCount = rackMetrics.stringCount;
    const hasHighlight = highlightedStringIds.size > 0;
    const gateRgb = isDark ? [0.025, 0.04, 0.085] : [0.85, 0.89, 0.94];

    // Translucent upright frame backdrop & side posts at z = 0
    this._emitUprightQuad(0, 1, 0, rackMetrics.frameBottomH, rackMetrics.frameTopH, gateRgb, 0.22, layout, bgRgb);
    this._emitExtrudedPrism(
      -0.012,
      0,
      -0.004,
      0.004,
      rackMetrics.frameBottomH,
      rackMetrics.frameTopH,
      railRgb,
      0.85,
      layout,
      bgRgb,
    );
    this._emitExtrudedPrism(
      1,
      1.012,
      -0.004,
      0.004,
      rackMetrics.frameBottomH,
      rackMetrics.frameTopH,
      railRgb,
      0.85,
      layout,
      bgRgb,
    );

    for (let row = 0; row < sCount; row += 1) {
      const str = legend[sCount - 1 - row];
      if (!str) continue;
      const hCenter = rackMetrics.hForRow(row);
      const rawRgb = hexToRgb(str.color);
      const isLit = highlightedStringIds.has(str.id);
      const wireRgb = isLit ? rawRgb : desaturateRgb(rawRgb, hasHighlight ? 0.42 : 0.68, isDark);
      const halfH = isLit ? 3.2 : 1.9;
      const alpha = isLit ? 0.98 : hasHighlight ? 0.62 : 0.76;

      this._emitExtrudedPrism(0, 1, -0.003, 0.003, hCenter - halfH, hCenter + halfH, wireRgb, alpha, layout, bgRgb);
    }
  }

  _emitStringsNoteBlock(
    note,
    { zNear, zEnd, alpha, isWaitingTarget, config, laneSpans, rackMetrics, layout, bgRgb, isDark, hudLabels },
  ) {
    const legend = config.legend ?? [];
    const sCount = Math.max(1, legend.length);
    let activeStrIdx = Number.isInteger(note.stringIndex)
      ? note.stringIndex
      : legend.findIndex((s) => s.id === note.stringId);
    if (activeStrIdx < 0 || activeStrIdx >= sCount) activeStrIdx = 0;
    const activeRow = sCount - 1 - activeStrIdx;

    let u0 = 0.008;
    let u1 = 0.992;
    if (!note.openNote) {
      const span = laneSpans[note.primaryLane];
      if (!span) return;
      const inset = span.uWidth * 0.08;
      u0 = span.u0 + inset;
      u1 = span.u1 - inset;
    }

    // Sustain ribbon trails behind the upright note block at the bowed string's height
    if (zEnd > zNear + 0.025) {
      const tailInset = note.openNote ? 0.04 : (u1 - u0) * 0.28;
      const tailAlpha = note.openNote ? alpha * 0.24 : alpha * 0.44;
      const activeRgb = hexToRgb(legend[activeStrIdx]?.color ?? note.color);
      const tailRgb = desaturateRgb(activeRgb, 0.85, isDark);
      const tailH = rackMetrics.hForRow(activeRow);
      this._emitExtrudedPrism(
        u0 + tailInset,
        u1 - tailInset,
        zNear + 0.008,
        zEnd,
        tailH - 2.0,
        tailH + 2.0,
        tailRgb,
        tailAlpha,
        layout,
        bgRgb,
      );
    }

    // Upright camera-facing dark backing card + side posts
    const cardRgb = isDark ? [0.03, 0.048, 0.095] : [0.91, 0.94, 0.98];
    this._emitUprightQuad(
      u0,
      u1,
      zNear + 0.005,
      rackMetrics.frameBottomH,
      rackMetrics.frameTopH,
      cardRgb,
      alpha * 0.9,
      layout,
      bgRgb,
    );

    const noteRgb = hexToRgb(note.color);
    const bracketW = note.openNote ? 0.009 : Math.max(0.004, (u1 - u0) * 0.055);
    const frameRgb = isWaitingTarget ? noteRgb : isDark ? [0.35, 0.45, 0.62] : [0.42, 0.5, 0.62];
    this._emitExtrudedPrism(
      u0,
      u0 + bracketW,
      zNear,
      Math.min(1.06, zNear + 0.007),
      rackMetrics.frameBottomH,
      rackMetrics.frameTopH,
      frameRgb,
      alpha * 0.88,
      layout,
      bgRgb,
    );
    this._emitExtrudedPrism(
      u1 - bracketW,
      u1,
      zNear,
      Math.min(1.06, zNear + 0.007),
      rackMetrics.frameBottomH,
      rackMetrics.frameTopH,
      frameRgb,
      alpha * 0.88,
      layout,
      bgRgb,
    );

    const rowU0 = u0 + bracketW * 1.1;
    const rowU1 = u1 - bracketW * 1.1;

    for (let row = 0; row < sCount; row += 1) {
      const str = legend[sCount - 1 - row];
      const strRgb = hexToRgb(str?.color ?? note.color);
      const hCenter = rackMetrics.hForRow(row);

      if (row === activeRow) {
        // Active bowed string: 100% full-saturation 3D prism facing the camera
        this._emitExtrudedPrism(
          rowU0,
          rowU1,
          zNear - 0.001,
          Math.min(1.06, zNear + 0.007),
          hCenter - rackMetrics.activeHalfH,
          hCenter + rackMetrics.activeHalfH,
          strRgb,
          alpha,
          layout,
          bgRgb,
        );
      } else {
        // Inactive untouched string: desaturated slot + crisp desaturated center wire so active string pops
        const mutedRgb = desaturateRgb(strRgb, 0.24, isDark);
        this._emitUprightQuad(
          rowU0,
          rowU1,
          zNear + 0.003,
          hCenter - rackMetrics.inactiveHalfH,
          hCenter + rackMetrics.inactiveHalfH,
          mutedRgb,
          alpha * 0.38,
          layout,
          bgRgb,
        );
        this._emitUprightQuad(
          rowU0,
          rowU1,
          zNear + 0.002,
          hCenter - 1.1,
          hCenter + 1.1,
          mutedRgb,
          alpha * 0.78,
          layout,
          bgRgb,
        );
      }
    }

    const topCenter = projectDeckPoint((u0 + u1) * 0.5, zNear, rackMetrics.frameTopH + 2, layout);
    hudLabels.push({
      kind: 'strings-stack',
      note,
      alpha,
      isWaitingTarget,
      center: topCenter,
    });
  }

  _renderHudOverlay(ctx, state) {
    const {
      width,
      height,
      headerH,
      layout,
      rackMetrics,
      highlightedStringIds,
      laneSpans,
      config,
      hudLabels,
      detectedPitch,
      gameSnapshot,
      palette,
      isDark,
    } = state;

    ctx.clearRect(0, 0, width, height);

    // Draw Strings / Sax / Piano compact labels above or onto projected 3D note blocks
    for (const item of hudLabels) {
      const { center, note, alpha } = item;
      const scale = Math.max(0.38, center.scale);
      ctx.save();
      ctx.globalAlpha = alpha;

      if (item.kind === 'strings-stack') {
        if (scale >= 0.44) {
          const badgeY = center.y - 9 * scale;
          const label = note.openNote
            ? `OPEN ${note.badgeText} · ${note.noteName}`
            : `${note.badgeText} · ${note.noteName}`;
          ctx.font = `800 ${Math.max(8, Math.round(10 * scale))}px system-ui, sans-serif`;
          const tw = ctx.measureText(label).width;
          const symR = Math.max(4, 5.2 * scale);
          const symX = center.x - tw / 2 - symR * 1.45;
          drawShapeSymbol(ctx, note.shape, symX, badgeY, symR, note.color, '#090d16');
          ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, center.x + symR * 0.7, badgeY);
        }
      } else if (item.kind === 'sax-open') {
        ctx.fillStyle = isDark ? '#f3e8ff' : '#3b0764';
        ctx.font = `800 ${Math.max(9, Math.round(12 * scale))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(note.badgeText, center.x, center.y);
      } else if (item.kind === 'saxophone') {
        const label = note.laneBadges?.[item.laneIdx] ?? item.span.label;
        ctx.fillStyle = '#090d16';
        ctx.font = `800 ${Math.max(8, Math.round(10 * scale))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, center.x, center.y);

        if (item.laneIdx === note.primaryLane && scale >= 0.55) {
          ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
          ctx.font = `800 ${Math.max(9, Math.round(11 * scale))}px system-ui, sans-serif`;
          ctx.fillText(note.badgeText, center.x, center.y - 16 * scale);
        }
      } else if (item.kind === 'piano' && scale >= 0.5) {
        ctx.fillStyle = '#090d16';
        ctx.font = `800 ${Math.max(8, Math.round(10 * scale))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = note.fingerHint ? `${note.noteName}·F${note.fingerHint}` : note.noteName;
        ctx.fillText(label, center.x, center.y);
      }

      ctx.restore();
    }

    // Receptor / Piano keybed / Bottom Strings labels
    if (config.id === 'piano') {
      for (const q of this.pianoHitQuads) {
        if (q.isBlack) continue;
        if (q.span.isC || q.pressed) {
          ctx.fillStyle = q.pressed ? '#090d16' : '#334155';
          ctx.font = '700 10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(q.span.sublabel, q.center.x, q.center.y + 8);
        }
      }
    } else if (config.id === 'strings') {
      const legend = config.legend ?? [];
      const sCount = Math.max(1, legend.length);
      const hasHighlight = highlightedStringIds.size > 0;
      for (let row = 0; row < sCount; row += 1) {
        const str = legend[sCount - 1 - row];
        if (!str) continue;
        const hStr = rackMetrics.hForRow(row);
        const leftPt = projectDeckPoint(0, 0, hStr, layout);
        const rightPt = projectDeckPoint(1, 0, hStr, layout);
        const isLit = highlightedStringIds.has(str.id);
        const badgeBg = isDark ? 'rgba(9, 13, 22, 0.9)' : 'rgba(255, 255, 255, 0.92)';

        ctx.save();
        ctx.globalAlpha = isLit || !hasHighlight ? 1 : 0.62;

        // Left shape + letter badge aligned cleanly with upright string rail height
        const leftBoxX = Math.max(4, leftPt.x - 10);
        roundRectPath(ctx, leftBoxX, leftPt.y - 7.5, 34, 15, 7.5);
        ctx.fillStyle = badgeBg;
        ctx.fill();
        ctx.strokeStyle = str.color;
        ctx.lineWidth = isLit ? 2 : 1;
        ctx.stroke();

        drawShapeSymbol(ctx, str.shape, leftBoxX + 9, leftPt.y, 4.4, str.color, '#090d16');
        ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
        ctx.font = '800 10px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(str.badge, leftBoxX + 17, leftPt.y + 0.5);

        // Right letter badge
        const rightBoxX = Math.min(width - 26, rightPt.x - 12);
        roundRectPath(ctx, rightBoxX, rightPt.y - 7, 20, 14, 7);
        ctx.fillStyle = badgeBg;
        ctx.fill();
        ctx.strokeStyle = str.color;
        ctx.lineWidth = isLit ? 2 : 1;
        ctx.stroke();

        ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
        ctx.font = '800 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(str.badge, rightBoxX + 10, rightPt.y + 0.5);
        ctx.restore();
      }

      // Finger lane labels cleanly tucked below hitY
      for (const s of laneSpans) {
        const pt = projectDeckPoint(s.uCenter, -0.014, 0, layout);
        const labelY = Math.min(height - 11, pt.y + 12);
        ctx.fillStyle = isDark ? '#e2e8f0' : '#0f172a';
        ctx.font = '700 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.label, pt.x, labelY);
      }
    } else {
      for (const s of laneSpans) {
        const pt = projectDeckPoint(s.uCenter, -0.032, 7, layout);
        ctx.fillStyle = isDark ? '#e2e8f0' : '#0f172a';
        ctx.font = '700 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.label, pt.x, pt.y);
      }

      // Intonation Gauge below the Saxophone 3D receptors
      const plotX = 16;
      const plotW = width - 32;
      const gaugeY = height - 42;
      let readout = 'Laid-Down Key Stack: Left Hand (OCT..L-PK) | Right Hand (R1..R-PK)';
      if (detectedPitch) {
        const writtenOffset = config.transposition?.writtenOffset ?? 9;
        const writtenName = midiToSaxNoteName(detectedPitch.nearestMidi + writtenOffset);
        const sign = detectedPitch.centsOff > 0 ? '+' : '';
        readout = `Mic: Written ${writtenName} (Concert ${detectedPitch.noteName} · ${sign}${detectedPitch.centsOff}¢)`;
      }
      drawIntonationGauge(ctx, plotX, plotW, gaugeY, detectedPitch, readout, isDark);
    }

    // Header bar: Strings removes top fingering/strings bar and hosts the Intonation Gauge cleanly at the top; Sax/Piano keeps lane header
    const plotX = 16;
    const plotW = width - 32;
    if (config.id === 'strings') {
      ctx.save();
      ctx.fillStyle = palette.headerBg;
      ctx.fillRect(0, 0, width, headerH);
      const gaugePlotW = Math.max(220, width - 140);
      const gaugePlotX = (width - gaugePlotW) / 2;
      let readout = 'Strings: Play the solid colored string when its block reaches that string';
      if (detectedPitch) {
        const sign = detectedPitch.centsOff > 0 ? '+' : '';
        readout = `Detected: ${detectedPitch.noteName} (${sign}${detectedPitch.centsOff}¢ · ${Math.round(detectedPitch.frequencyHz)} Hz)`;
      }
      drawIntonationGauge(ctx, gaugePlotX, gaugePlotW, 17, detectedPitch, readout, isDark);
      ctx.strokeStyle = palette.divider;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotX, headerH);
      ctx.lineTo(plotX + plotW, headerH);
      ctx.stroke();
      ctx.restore();
    } else {
      const headerGeoms = computeLaneGeometries(config, plotX, plotW);
      drawHeaderBar(ctx, width, config, headerGeoms, plotX, plotW, headerH, palette, isDark);
    }

    // Center Wait-Mode or Judgment prompt banner
    if (gameSnapshot?.isWaiting && gameSnapshot.waitNotes?.length > 0) {
      const target = gameSnapshot.waitNotes[0];
      const msg =
        config.id === 'saxophone'
          ? `HOLD: ${target.badgeText} (Concert ${target.concertName})`
          : `PLAY: ${target.noteName} (${target.secondaryBadge || target.badgeText})`;
      drawCenterPill(ctx, width / 2, headerH + 26, msg, target.color || '#f59e0b', '#090d16');
    } else if (gameSnapshot?.lastJudgment && gameSnapshot.songTime - gameSnapshot.lastJudgment.time < 0.75) {
      const j = gameSnapshot.lastJudgment;
      const bg = j.type === 'perfect' ? '#10b981' : j.type === 'good' ? '#38bdf8' : '#ef4444';
      const fg = j.type === 'miss' ? '#ffffff' : '#0f172a';
      drawCenterPill(ctx, width / 2, headerH + 26, `${j.label}${j.noteName ? ` · ${j.noteName}` : ''}`, bg, fg);
    }

    // Subtle 3D mode pill indicator in top-right below header
    ctx.save();
    roundRectPath(ctx, width - 74, headerH + 10, 58, 22, 11);
    ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(255, 255, 255, 0.8)';
    ctx.fill();
    ctx.strokeStyle = palette.divider;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = palette.muted;
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('3D GPU', width - 45, headerH + 21);
    ctx.restore();
  }
}
