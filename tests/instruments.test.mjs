import assert from 'node:assert/strict';
import test from 'node:test';
import * as piano from '../src/instruments/piano.mjs';
import * as saxophone from '../src/instruments/saxophone.mjs';
import * as strings from '../src/instruments/strings.mjs';

test('Strings highway maps 7 finger lanes, full-width open bars, 5-string CGDAE, and Viola CGDA', () => {
  const cfg4 = strings.getHighwayConfig({ stringsPreset: 'violin_4' });
  assert.equal(cfg4.id, 'strings');
  assert.equal(cfg4.lanes.length, 7);
  assert.deepEqual(
    cfg4.lanes.map((l) => l.label),
    ['L1', '1', 'L2', 'H2', '3', 'H3/L4', '4'],
  );
  assert.deepEqual(
    cfg4.legend.map((s) => s.id),
    ['G', 'D', 'A', 'E'],
  );

  // Open G string (G3 = 55) renders as open full-width bar (primaryLane: -1)
  const gOpen = strings.mapNoteToHighway(55, { stringsPreset: 'violin_4' });
  assert.equal(gOpen.openNote, true);
  assert.equal(gOpen.primaryLane, -1);
  assert.deepEqual(gOpen.laneIndices, []);
  assert.equal(gOpen.badgeText, 'G');
  assert.equal(gOpen.shape, 'circle');

  // Chromatic finger stops G#3 (56) .. C#4 (61) -> lanes 0 .. 5
  assert.equal(strings.mapNoteToHighway(56).primaryLane, 0); // L1
  assert.equal(strings.mapNoteToHighway(57).primaryLane, 1); // 1
  assert.equal(strings.mapNoteToHighway(58).primaryLane, 2); // L2
  assert.equal(strings.mapNoteToHighway(59).primaryLane, 3); // H2
  assert.equal(strings.mapNoteToHighway(60).primaryLane, 4); // 3
  assert.equal(strings.mapNoteToHighway(61).primaryLane, 5); // H3/L4

  // D4 (62): Open D bar by default, or 4th finger (lane 6) on G string when preferFourthFinger = true
  const dOpen = strings.mapNoteToHighway(62, { preferFourthFinger: false });
  assert.equal(dOpen.openNote, true);
  assert.equal(dOpen.primaryLane, -1);
  assert.equal(dOpen.badgeText, 'D');
  assert.equal(dOpen.shape, 'diamond');

  const dFourth = strings.mapNoteToHighway(62, { preferFourthFinger: true });
  assert.equal(dFourth.openNote, false);
  assert.equal(dFourth.primaryLane, 6);
  assert.equal(dFourth.badgeText, 'G');

  // High E-string shift above B5 (83): C6 (84) clamps to lane 6 with shift badge
  const c6 = strings.mapNoteToHighway(84);
  assert.equal(c6.primaryLane, 6);
  assert.equal(c6.badgeText, 'E');
  assert.equal(c6.secondaryBadge, '↑+1');

  // 5-String Violin (C-G-D-A-E)
  const cfg5 = strings.getHighwayConfig({ stringsPreset: 'violin_5' });
  assert.deepEqual(
    cfg5.legend.map((s) => s.id),
    ['C', 'G', 'D', 'A', 'E'],
  );
  const cOpen = strings.mapNoteToHighway(48, { stringsPreset: 'violin_5' });
  assert.equal(cOpen.openNote, true);
  assert.equal(cOpen.badgeText, 'C');
  assert.equal(cOpen.shape, 'square');
  assert.equal(cOpen.stringIndex, 0);
  const cSharp = strings.mapNoteToHighway(49, { stringsPreset: 'violin_5' });
  assert.equal(cSharp.primaryLane, 0);
  assert.equal(cSharp.badgeText, 'C');

  // Viola (C-G-D-A, no E string)
  const cfgViola = strings.getHighwayConfig({ stringsPreset: 'viola_4' });
  assert.deepEqual(
    cfgViola.legend.map((s) => s.id),
    ['C', 'G', 'D', 'A'],
  );
  const violaHigh = strings.mapNoteToHighway(81, { stringsPreset: 'viola_4' }); // A5 clamps onto A string lane 6 (+5)
  assert.equal(violaHigh.primaryLane, 6);
  assert.equal(violaHigh.badgeText, 'A');
  assert.equal(violaHigh.secondaryBadge, '↑+5');
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

  // Wide offset (>50c flat/sharp) respects preferredTransposition instead of wrapping across semitones
  const calWideFlat = saxophone.classifySaxCalibrationNote(61.35, { preferredTransposition: 'alto_eb' });
  assert.equal(calWideFlat.saxTransposition, 'alto_eb');
  assert.equal(calWideFlat.targetConcertMidi, 62);
  assert.equal(calWideFlat.tuningOffsetCents, -65);
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
