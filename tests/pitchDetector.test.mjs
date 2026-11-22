import assert from 'node:assert/strict';
import test from 'node:test';
import { detectPitchYIN } from '../src/audio/pitchDetector.mjs';

function makeHarmonicTone(freqHz, sampleRate = 44100, length = 2048, amplitude = 0.4) {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    buf[i] =
      amplitude *
      (0.65 * Math.sin(2 * Math.PI * freqHz * t) +
        0.25 * Math.sin(2 * Math.PI * freqHz * 2 * t) +
        0.1 * Math.sin(2 * Math.PI * freqHz * 3 * t));
  }
  return buf;
}

test('detectPitchYIN accurately identifies G3, Eb4, A4, and +20c sharp A4', () => {
  const sampleRate = 44100;

  const g3 = detectPitchYIN(makeHarmonicTone(196.0, sampleRate), sampleRate);
  assert.ok(g3);
  assert.equal(g3.nearestMidi, 55);
  assert.equal(g3.noteName, 'G3');
  assert.ok(Math.abs(g3.centsOff) <= 2, `Expected G3 within ±2c, got ${g3.centsOff}`);

  const eb4 = detectPitchYIN(makeHarmonicTone(311.127, sampleRate), sampleRate);
  assert.ok(eb4);
  assert.equal(eb4.nearestMidi, 63);
  assert.ok(Math.abs(eb4.centsOff) <= 2);

  const a4 = detectPitchYIN(makeHarmonicTone(440.0, sampleRate), sampleRate);
  assert.ok(a4);
  assert.equal(a4.nearestMidi, 69);
  assert.equal(a4.noteName, 'A4');
  assert.ok(Math.abs(a4.centsOff) <= 2);

  // A4 + 20 cents = 440 * 2^(20/1200) = 445.112 Hz
  const a4Sharp = detectPitchYIN(makeHarmonicTone(445.112, sampleRate), sampleRate);
  assert.ok(a4Sharp);
  assert.equal(a4Sharp.nearestMidi, 69);
  assert.ok(Math.abs(a4Sharp.centsOff - 20) <= 2, `Expected +20c ±2, got ${a4Sharp.centsOff}`);
});

test('detectPitchYIN rejects silence and sub-threshold noise', () => {
  const quiet = new Float32Array(2048).fill(0.001);
  assert.equal(detectPitchYIN(quiet, 44100), null);
});

test('detectPitchYIN weak-fundamental guard resolves low reed D3 (146.83 Hz) without breaking A4', () => {
  const sampleRate = 44100;
  const length = 4096;
  const freqD3 = 146.832; // MIDI 50
  const reedTone = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    // Weak fundamental (0.14) + dominant 2nd harmonic (0.75) + 3rd harmonic (0.25)
    reedTone[i] =
      0.45 *
      (0.14 * Math.sin(2 * Math.PI * freqD3 * t) +
        0.75 * Math.sin(2 * Math.PI * freqD3 * 2 * t) +
        0.25 * Math.sin(2 * Math.PI * freqD3 * 3 * t));
  }

  const detected = detectPitchYIN(reedTone, sampleRate);
  assert.ok(detected);
  assert.equal(detected.nearestMidi, 50, `Expected D3 (50), got ${detected.nearestMidi}`);

  // Normal A4 (440 Hz) must stay on A4 (69) and never drop to A3 (57)
  const normalA4 = detectPitchYIN(makeHarmonicTone(440.0, sampleRate, length), sampleRate);
  assert.ok(normalA4);
  assert.equal(normalA4.nearestMidi, 69);
});

test('detectPitchYIN applies tuningOffsetCents cleanly', () => {
  const sampleRate = 44100;
  // Horn playing A4 +24 cents sharp (446.14 Hz) with +24c tuning offset -> reads 0c
  const sharpA4 = makeHarmonicTone(446.141, sampleRate, 4096);
  const calibrated = detectPitchYIN(sharpA4, sampleRate, { tuningOffsetCents: 24 });
  assert.ok(calibrated);
  assert.equal(calibrated.nearestMidi, 69);
  assert.ok(Math.abs(calibrated.centsOff) <= 2, `Expected ~0c after offset, got ${calibrated.centsOff}`);
});
