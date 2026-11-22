import assert from 'node:assert/strict';
import test from 'node:test';
import { GameEngine } from '../src/game/gameEngine.mjs';

function makeChart(items) {
  return items.map(([targetMidi, startTime, duration = 0.4]) => ({
    targetMidi,
    midi: targetMidi,
    startTime,
    endTime: startTime + duration,
    duration,
    laneIndices: [0],
    primaryLane: 0,
    color: '#38bdf8',
    shape: 'circle',
    badgeText: 'A',
    noteName: `M${targetMidi}`,
  }));
}

test('Real-Time mode handles tempo scaling and Perfect/Good/Miss judgments', () => {
  const engine = new GameEngine({ instrumentId: 'violin', mode: 'realtime' });
  engine.loadChart(
    makeChart([
      [69, 1.0],
      [71, 2.0],
      [73, 3.0],
    ]),
    4.0,
  );
  engine.setTempoScale(0.5); // Half speed
  engine.songTime = 0.96;
  engine.isPlaying = true;

  // Advance 0.08s wall time -> 0.04s song time -> songTime = 1.00 (right on note 0!)
  engine.update(0.08, {
    pitch: { nearestMidi: 69, centsOff: 5, confidence: 0.95 },
  });
  assert.equal(engine.notes[0].status, 'perfect');
  assert.equal(engine.counts.perfect, 1);
  assert.equal(engine.combo, 1);

  // Skip ahead near note 1 (at 2.10s, +100ms late with 40c intonation -> Good)
  engine.songTime = 2.08;
  engine.update(0.04, {
    pitch: { nearestMidi: 71, centsOff: 40, confidence: 0.9 },
  });
  assert.equal(engine.notes[1].status, 'good');
  assert.equal(engine.counts.good, 1);

  // Let note 2 pass beyond goodWindowSec -> Miss
  engine.songTime = 3.2;
  engine.update(0.05, {});
  assert.equal(engine.notes[2].status, 'miss');
  assert.equal(engine.counts.miss, 1);
  assert.equal(engine.combo, 0);
});

test('Wait mode pauses at note, ignores wrong pitch & <75ms transient blip, advances on sustained pitch', () => {
  const engine = new GameEngine({ instrumentId: 'saxophone', mode: 'wait' });
  engine.loadChart(
    makeChart([
      [60, 0.5],
      [62, 1.5],
    ]),
    2.5,
  );
  engine.songTime = 0.45;
  engine.isPlaying = true;

  // Step past 0.5 -> clamps at 0.5 and enters waiting state
  engine.update(0.1, {});
  assert.equal(engine.isWaiting, true);
  assert.equal(engine.songTime, 0.5);

  // Wrong pitch does not advance
  engine.update(0.1, { pitch: { nearestMidi: 61, centsOff: 0, confidence: 0.9 } });
  assert.equal(engine.isWaiting, true);
  assert.equal(engine.notes[0].status, 'pending');

  // Short 40ms transient blip does not advance yet
  engine.update(0.04, { pitch: { nearestMidi: 60, centsOff: 5, confidence: 0.9 } });
  assert.equal(engine.isWaiting, true);
  assert.equal(engine.notes[0].status, 'pending');

  // Hold another 40ms (total 80ms >= 75ms) -> hits note 0 and resumes!
  engine.update(0.04, { pitch: { nearestMidi: 60, centsOff: 5, confidence: 0.9 } });
  assert.equal(engine.notes[0].status, 'perfect');
  assert.equal(engine.isWaiting, false);
});

test('Wait mode supports polyphonic MIDI chords on Piano', () => {
  const engine = new GameEngine({ instrumentId: 'piano', mode: 'wait' });
  engine.loadChart(
    makeChart([
      [60, 1.0],
      [64, 1.0],
      [67, 1.0],
    ]),
    2.0,
  );
  engine.songTime = 0.98;
  engine.isPlaying = true;

  // Clamp at chord timestamp 1.0
  engine.update(0.05, { activeMidiKeys: new Set([60, 64]) });
  assert.equal(engine.isWaiting, true);
  assert.equal(engine.notes[0].status, 'pending');

  // Completing the third chord note (67) clears all 3 notes together
  engine.update(0.02, { activeMidiKeys: new Set([60, 64, 67]) });
  assert.equal(engine.isWaiting, false);
  assert.equal(engine.notes[0].status, 'perfect');
  assert.equal(engine.notes[1].status, 'perfect');
  assert.equal(engine.notes[2].status, 'perfect');
});

test('A-B Loop wraps songTime at loopEndSec, resets looped notes, and preserves combo', () => {
  const engine = new GameEngine({ instrumentId: 'saxophone', mode: 'realtime' });
  engine.loadChart(
    makeChart([
      [60, 1.0],
      [62, 1.5],
      [64, 3.0],
    ]),
    4.0,
  );
  engine.setLoopRange(0.8, 2.0);
  engine.songTime = 0.96;
  engine.isPlaying = true;

  // Hit note 0 at t=1.0
  engine.update(0.05, { pitch: { nearestMidi: 60, centsOff: 0, confidence: 0.95 } });
  assert.equal(engine.notes[0].status, 'perfect');
  assert.equal(engine.combo, 1);

  // Hit note 1 at t=1.5
  engine.songTime = 1.48;
  engine.update(0.03, { pitch: { nearestMidi: 62, centsOff: 0, confidence: 0.95 } });
  assert.equal(engine.notes[1].status, 'perfect');
  assert.equal(engine.combo, 2);

  // Advance past loopEndSec (2.0) -> wraps back to 0.8 and resets note 0 & 1 while keeping combo
  engine.songTime = 1.96;
  const snap = engine.update(0.08, {});
  assert.equal(snap.didLoopWrap, true);
  assert.equal(snap.loopCount, 1);
  assert.ok(Math.abs(snap.songTime - 0.8) < 0.001);
  assert.equal(engine.notes[0].status, 'pending');
  assert.equal(engine.notes[1].status, 'pending');
  assert.equal(engine.combo, 2);
});

test('GameEngine qualifies clean full-song completions for personal hi-score and disqualifies loops/skips/seeks', () => {
  const clean = new GameEngine({ instrumentId: 'violin', mode: 'realtime' });
  clean.loadChart(makeChart([[69, 0.5]]), 1.0);
  clean.songTime = 0.48;
  clean.isPlaying = true;
  clean.update(0.04, { pitch: { nearestMidi: 69, centsOff: 0, confidence: 0.95 } });
  clean.songTime = 1.88;
  const endSnap = clean.update(0.05, {});
  assert.equal(endSnap.isFinished, true);
  assert.equal(endSnap.justFinished, true);
  assert.equal(endSnap.qualifiesForHighScore, true);

  // Looping disqualifies hi-score
  const looped = new GameEngine({ instrumentId: 'violin', mode: 'realtime' });
  looped.loadChart(makeChart([[69, 0.5]]), 2.0);
  looped.setLoopRange(0.2, 1.5);
  assert.equal(looped.getSnapshot().qualifiesForHighScore, false);

  // Skipping wait note disqualifies hi-score
  const skipped = new GameEngine({ instrumentId: 'violin', mode: 'wait' });
  skipped.loadChart(makeChart([[69, 0.5]]), 1.0);
  skipped.songTime = 0.48;
  skipped.isPlaying = true;
  skipped.update(0.05, {});
  assert.equal(skipped.skipCurrentWaitNote(), true);
  assert.equal(skipped.getSnapshot().qualifiesForHighScore, false);

  // Seeking forward past pending notes disqualifies hi-score
  const sought = new GameEngine({ instrumentId: 'violin', mode: 'realtime' });
  sought.loadChart(
    makeChart([
      [69, 0.5],
      [71, 1.5],
    ]),
    2.0,
  );
  sought.seek(1.2);
  assert.equal(sought.getSnapshot().qualifiesForHighScore, false);
});

test('Piano mode ignores microphone pitch and requires MIDI/key presses', () => {
  const piano = new GameEngine({ instrumentId: 'piano', mode: 'realtime' });
  piano.loadChart(makeChart([[60, 0.5]]), 1.5);
  piano.songTime = 0.48;
  piano.isPlaying = true;

  // Pitch input must NOT hit Piano notes
  piano.update(0.04, { pitch: { nearestMidi: 60, centsOff: 0, confidence: 0.99 } });
  assert.equal(piano.notes[0].status, 'pending');

  // MIDI key press DOES hit Piano notes
  piano.update(0.01, { activeMidiKeys: new Set([60]) });
  assert.equal(piano.notes[0].status, 'perfect');
});
