import assert from 'node:assert/strict';
import test from 'node:test';
import * as piano from '../src/instruments/piano.mjs';
import * as saxophone from '../src/instruments/saxophone.mjs';
import * as violin from '../src/instruments/violin.mjs';

test('Violin flipped highway maps 8 chromatic finger positions and 4 string shapes', () => {
  const cfg = violin.getHighwayConfig();
  assert.equal(cfg.lanes.length, 8);
  assert.deepEqual(
    cfg.lanes.map((l) => l.label),
    ['Open', 'L1', '1', 'L2', 'H2', '3', 'H3/L4', '4'],
  );

  // G string open (G3 = 55) through 4th finger (D4 = 62)
  assert.equal(violin.mapNoteToHighway(55).primaryLane, 0);
  assert.equal(violin.mapNoteToHighway(55).badgeText, 'G');
  assert.equal(violin.mapNoteToHighway(56).primaryLane, 1); // G#3 = L1
  assert.equal(violin.mapNoteToHighway(57).primaryLane, 2); // A3 = 1
  assert.equal(violin.mapNoteToHighway(58).primaryLane, 3); // Bb3 = L2
  assert.equal(violin.mapNoteToHighway(59).primaryLane, 4); // B3 = H2
  assert.equal(violin.mapNoteToHighway(60).primaryLane, 5); // C4 = 3
  assert.equal(violin.mapNoteToHighway(61).primaryLane, 6); // C#4 = H3/L4

  // D4 (62): Open D string by default, or 4th finger on G string when preferFourthFinger = true
  const dOpen = violin.mapNoteToHighway(62, { preferFourthFinger: false });
  assert.equal(dOpen.primaryLane, 0);
  assert.equal(dOpen.badgeText, 'D');
  assert.equal(dOpen.shape, 'diamond');

  const dFourth = violin.mapNoteToHighway(62, { preferFourthFinger: true });
  assert.equal(dFourth.primaryLane, 7);
  assert.equal(dFourth.badgeText, 'G');

  // High E-string shift above B5 (83): C6 (84) clamps to lane 7 with shift badge
  const c6 = violin.mapNoteToHighway(84);
  assert.equal(c6.primaryLane, 7);
  assert.equal(c6.badgeText, 'E');
  assert.equal(c6.secondaryBadge, '↑+1');
});

test('Saxophone transposition keeps concert targetMidi for mic while mapping written fingerings', () => {
  const cfg = saxophone.getHighwayConfig({ saxTransposition: 'alto_eb' });
  assert.equal(cfg.lanes.length, 11);

  // Concert C4 (60) on Alto Eb (+9) -> Written A4 (69) = L1 + L2 (lanes [2, 3])
  const altoC4 = saxophone.mapNoteToHighway(60, { saxTransposition: 'alto_eb' });
  assert.equal(altoC4.targetMidi, 60);
  assert.equal(altoC4.writtenMidi, 69);
  assert.equal(altoC4.noteName, 'A4');
  assert.deepEqual(altoC4.laneIndices, [2, 3]);

  // Concert E4 (64) on Alto Eb (+9) -> Written C#5 (73) = OPEN note (no keys pressed!)
  const altoOpen = saxophone.mapNoteToHighway(64, { saxTransposition: 'alto_eb' });
  assert.equal(altoOpen.targetMidi, 64);
  assert.equal(altoOpen.writtenMidi, 73);
  assert.equal(altoOpen.openNote, true);
  assert.deepEqual(altoOpen.laneIndices, []);

  // Concert E5 (76) on Alto Eb (+9) -> Written C#6 (85) = Octave key alone [0]
  const altoOctaveCSharp = saxophone.mapNoteToHighway(76, { saxTransposition: 'alto_eb' });
  assert.equal(altoOctaveCSharp.writtenMidi, 85);
  assert.equal(altoOctaveCSharp.openNote, false);
  assert.deepEqual(altoOctaveCSharp.laneIndices, [0]);

  // Tenor Bb (+14): Concert Bb3 (58) -> Written C5 (72) = L2 ([3])
  const tenorBb3 = saxophone.mapNoteToHighway(58, { saxTransposition: 'tenor_bb' });
  assert.equal(tenorBb3.targetMidi, 58);
  assert.equal(tenorBb3.writtenMidi, 72);
  assert.deepEqual(tenorBb3.laneIndices, [3]);

  // Soprano Bb (+2): Concert Bb4 (70) -> Written C5 (72) = [3]
  const sopranoBb4 = saxophone.mapNoteToHighway(70, { saxTransposition: 'soprano_bb' });
  assert.equal(sopranoBb4.writtenMidi, 72);
  assert.deepEqual(sopranoBb4.laneIndices, [3]);

  // Concert C (0): Concert D4 (62) -> Written D4 (62) = [2,3,4,6,7,8]
  const concertD4 = saxophone.mapNoteToHighway(62, { saxTransposition: 'concert_c' });
  assert.deepEqual(concertD4.laneIndices, [2, 3, 4, 6, 7, 8]);

  // Saxophone-native flat enharmonics (Eb5, Bb4) match pinky/side key labels
  assert.equal(saxophone.midiToSaxNoteName(75), 'Eb5');
  assert.equal(saxophone.midiToSaxNoteName(70), 'Bb4');

  // Calibration note classification when fingering Written B4 (L1)
  const calAlto = saxophone.classifySaxCalibrationNote(61.82); // -18c flat D4
  assert.equal(calAlto.saxTransposition, 'alto_eb');
  assert.equal(calAlto.tuningOffsetCents, -18);
  assert.equal(saxophone.classifySaxCalibrationNote(57.1).saxTransposition, 'tenor_bb');
  assert.equal(saxophone.classifySaxCalibrationNote(69.0).saxTransposition, 'soprano_bb');
  assert.equal(saxophone.classifySaxCalibrationNote(71.0).saxTransposition, 'concert_c');
});

test('Piano frames octave bounds cleanly and computes black/white geometry', () => {
  const cfg = piano.getHighwayConfig({ notes: [{ midi: 60 }, { midi: 72 }] });
  assert.equal(cfg.minKey, 48);
  assert.equal(cfg.maxKey, 84);
  assert.equal(cfg.lanes.length, 37);

  const c4 = piano.mapNoteToHighway(60, { minKey: cfg.minKey, maxKey: cfg.maxKey });
  assert.equal(c4.primaryLane, 12);
  assert.equal(c4.noteName, 'C4');
  assert.equal(cfg.lanes[c4.primaryLane].isAccidental, false);

  const fSharp4 = piano.mapNoteToHighway(66, { minKey: cfg.minKey, maxKey: cfg.maxKey });
  assert.equal(cfg.lanes[fSharp4.primaryLane].isAccidental, true);
});
