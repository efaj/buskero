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
