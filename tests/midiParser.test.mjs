import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMidiBuffer, parseMidiBuffer, recommendLeadTrack } from '../src/midi/midiParser.mjs';
import { SAMPLE_SONGS } from '../src/midi/sampleSongs.mjs';

test('buildMidiBuffer and parseMidiBuffer handle round-trip notes, VLQ > 127, and mid-song tempo changes', () => {
  const bytes = buildMidiBuffer({
    ticksPerBeat: 480,
    tempoChanges: [
      { tick: 0, bpm: 120 }, // 0.5s per beat
      { tick: 960, bpm: 60 }, // 1.0s per beat starting at t = 1.0s
    ],
    tracks: [
      {
        name: 'Lead Violin',
        channel: 0,
        program: 40,
        notes: [
          { midi: 69, startTick: 0, durationTicks: 480, velocity: 100 }, // t=0.0 -> 0.5
          { midi: 71, startTick: 960, durationTicks: 480, velocity: 90 }, // t=1.0 -> 2.0 (at 60 BPM!)
          { midi: 73, startTick: 1920, durationTicks: 480, velocity: 85 }, // 2 beats after 960 @ 60 BPM -> t=3.0 -> 4.0
        ],
      },
      {
        name: 'Bass Backing',
        channel: 1,
        program: 32,
        notes: [{ midi: 45, startTick: 0, durationTicks: 1920, velocity: 70 }],
      },
    ],
  });

  const parsed = parseMidiBuffer(bytes);
  assert.equal(parsed.format, 1);
  assert.equal(parsed.ticksPerBeat, 480);
  assert.equal(parsed.bpm, 120);
  assert.equal(parsed.tracks.length, 2);

  const lead = parsed.tracks[0];
  assert.equal(lead.name, 'Lead Violin');
  assert.equal(lead.notes.length, 3);
  assert.ok(Math.abs(lead.notes[0].startTime - 0.0) < 0.001);
  assert.ok(Math.abs(lead.notes[0].duration - 0.5) < 0.001);
  assert.ok(Math.abs(lead.notes[1].startTime - 1.0) < 0.001);
  assert.ok(Math.abs(lead.notes[1].duration - 1.0) < 0.001);
  assert.ok(Math.abs(lead.notes[2].startTime - 3.0) < 0.001);
  assert.ok(Math.abs(lead.notes[2].duration - 1.0) < 0.001);

  const rec = recommendLeadTrack(parsed, 'violin');
  assert.equal(rec.leadTrackIndex, 0);
  assert.deepEqual(rec.backingTrackIndices, [1]);
});

test('parseMidiBuffer decodes MIDI running status bytes cleanly', () => {
  // Hand-crafted Format 0 single-track MIDI using running status for second Note On and Note Off
  const bytes = new Uint8Array([
    // MThd
    0x4d,
    0x54,
    0x68,
    0x64,
    0x00,
    0x00,
    0x00,
    0x06,
    0x00,
    0x00,
    0x00,
    0x01,
    0x01,
    0xe0, // Format 0, 1 track, 480 tpq
    // MTrk
    0x4d,
    0x54,
    0x72,
    0x6b,
    0x00,
    0x00,
    0x00,
    0x16,
    0x00,
    0x90,
    60,
    100, // delta 0: Note On C4 vel 100
    0x83,
    0x60,
    60,
    0, // delta 480 (VLQ 0x83 0x60): running status 0x90 -> Note Off C4
    0x00,
    64,
    96, // delta 0: running status 0x90 -> Note On E4 vel 96
    0x83,
    0x60,
    64,
    0, // delta 480: running status 0x90 -> Note Off E4
    0x00,
    0xff,
    0x2f,
    0x00, // End of track
  ]);

  const parsed = parseMidiBuffer(bytes);
  assert.equal(parsed.tracks.length, 1);
  assert.equal(parsed.tracks[0].notes.length, 2);
  assert.equal(parsed.tracks[0].notes[0].midi, 60);
  assert.equal(parsed.tracks[0].notes[1].midi, 64);
  assert.ok(Math.abs(parsed.tracks[0].notes[1].startTime - 0.5) < 0.005);
});

test('all 5 built-in SAMPLE_SONGS parse cleanly with playable lead notes', () => {
  assert.equal(SAMPLE_SONGS.length, 5);
  for (const song of SAMPLE_SONGS) {
    assert.ok(song.bytes instanceof Uint8Array);
    assert.ok(song.parsed.tracks.length >= 2, `${song.id} should have >= 2 tracks`);
    assert.ok(song.parsed.tracks[0].notes.length >= 16, `${song.id} should have playable notes`);
  }
});
