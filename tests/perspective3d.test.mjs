import assert from 'node:assert/strict';
import test from 'node:test';
import { getHighwayConfig as getPianoConfig } from '../src/instruments/piano.mjs';
import { getHighwayConfig as getSaxConfig } from '../src/instruments/saxophone.mjs';
import { getHighwayConfig as getViolinConfig } from '../src/instruments/violin.mjs';
import {
  computeNormalizedLaneSpans,
  createDeckLayout,
  pointInQuad,
  projectDeckPoint,
  unprojectScreenToDeck,
} from '../src/ui/perspective3d.mjs';

test('projectDeckPoint narrows X span and raises Y smoothly toward horizon', () => {
  const layout = createDeckLayout({ width: 1000, height: 640, headerH: 54, footerH: 104 });
  const nearL = projectDeckPoint(0, 0, 0, layout);
  const nearR = projectDeckPoint(1, 0, 0, layout);
  const farL = projectDeckPoint(0, 1, 0, layout);
  const farR = projectDeckPoint(1, 1, 0, layout);

  assert.ok(nearR.x - nearL.x > farR.x - farL.x, 'far edge must be narrower than near strike line');
  assert.ok(farL.y < nearL.y, 'horizon must sit above near strike bar');
  assert.ok(nearL.scale > farL.scale);

  // Height extrusion moves upward (smaller screen Y)
  const ground = projectDeckPoint(0.5, 0.25, 0, layout);
  const raised = projectDeckPoint(0.5, 0.25, 20, layout);
  assert.ok(raised.y < ground.y);
});

test('projectDeckPoint and unprojectScreenToDeck invert cleanly for 3D piano keys', () => {
  const layout = createDeckLayout({ width: 960, height: 600, headerH: 54, footerH: 124 });
  const uIn = 0.37;
  const zIn = -0.11;
  const h = 7;

  const projected = projectDeckPoint(uIn, zIn, h, layout);
  const recovered = unprojectScreenToDeck(projected.x, projected.y, layout, h);

  assert.ok(recovered);
  assert.ok(Math.abs(recovered.uNorm - uIn) < 1e-6);
  assert.ok(Math.abs(recovered.zNorm - zIn) < 1e-6);
});

test('computeNormalizedLaneSpans preserves left-to-right monotonic ordering across all instruments', () => {
  for (const cfg of [getViolinConfig(), getSaxConfig(), getPianoConfig()]) {
    const spans = computeNormalizedLaneSpans(cfg);
    assert.equal(spans.length, cfg.lanes.length);
    for (const s of spans) {
      assert.ok(s.u0 >= -0.001 && s.u1 <= 1.001);
      assert.ok(s.u1 > s.u0);
    }
    if (cfg.id !== 'piano') {
      for (let i = 1; i < spans.length; i += 1) {
        assert.ok(spans[i].u0 >= spans[i - 1].u1 - 1e-9);
      }
    }
  }
});

test('pointInQuad detects interior vs exterior points', () => {
  const quad = [
    { x: 100, y: 200 },
    { x: 180, y: 200 },
    { x: 165, y: 150 },
    { x: 115, y: 150 },
  ];
  assert.equal(pointInQuad(140, 175, quad), true);
  assert.equal(pointInQuad(90, 175, quad), false);
});
