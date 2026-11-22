import { buildMidiBuffer, parseMidiBuffer } from './midiParser.mjs';

const Q = 480; // Quarter note ticks
const H = Q * 2;
const W = Q * 4;
const E = Q / 2;
const DQ = Q * 1.5;

function seq(items, startTick = 0) {
  let cursor = startTick;
  const notes = [];
  for (const item of items) {
    const [midi, dur = Q, velocity = 92] = item;
    if (midi !== null) {
      if (Array.isArray(midi)) {
        for (const pitch of midi) {
          notes.push({ midi: pitch, startTick: cursor, durationTicks: Math.max(60, dur - 24), velocity });
        }
      } else {
        notes.push({ midi, startTick: cursor, durationTicks: Math.max(60, dur - 24), velocity });
      }
    }
    cursor += dur;
  }
  return notes;
}

const RAW_SAMPLE_SPECS = [
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy (Beethoven)',
    subtitle: 'D Major • Violin D/A, Alto Sax & Piano friendly',
    bpm: 108,
    tracks: [
      {
        name: 'Lead Melody',
        channel: 0,
        program: 40, // Violin
        notes: seq([
          [66, Q],
          [66, Q],
          [67, Q],
          [69, Q],
          [69, Q],
          [67, Q],
          [66, Q],
          [64, Q],
          [62, Q],
          [62, Q],
          [64, Q],
          [66, Q],
          [66, DQ],
          [64, E],
          [64, H],

          [66, Q],
          [66, Q],
          [67, Q],
          [69, Q],
          [69, Q],
          [67, Q],
          [66, Q],
          [64, Q],
          [62, Q],
          [62, Q],
          [64, Q],
          [66, Q],
          [64, DQ],
          [62, E],
          [62, H],

          [64, Q],
          [64, Q],
          [66, Q],
          [62, Q],
          [64, Q],
          [66, E],
          [67, E],
          [66, Q],
          [62, Q],
          [64, Q],
          [66, E],
          [67, E],
          [66, Q],
          [64, Q],
          [62, Q],
          [64, Q],
          [57, H],

          [66, Q],
          [66, Q],
          [67, Q],
          [69, Q],
          [69, Q],
          [67, Q],
          [66, Q],
          [64, Q],
          [62, Q],
          [62, Q],
          [64, Q],
          [66, Q],
          [64, DQ],
          [62, E],
          [62, H],
        ]),
      },
      {
        name: 'Warm Piano Accompaniment',
        channel: 1,
        program: 0,
        notes: seq([
          [[50, 57, 62], W, 62],
          [[45, 52, 57], W, 62],
          [[50, 57, 62], W, 62],
          [[45, 52, 57], W, 62],
          [[50, 57, 62], W, 62],
          [[45, 52, 57], W, 62],
          [[50, 57, 62], H, 62],
          [[45, 52, 57], H, 62],
          [[50, 57, 62], W, 62],

          [[45, 52, 57], W, 62],
          [[50, 57, 62], W, 62],
          [[45, 52, 57], W, 62],
          [[50, 54, 57], H, 62],
          [[45, 52, 57], H, 62],

          [[50, 57, 62], W, 62],
          [[45, 52, 57], W, 62],
          [[50, 57, 62], H, 62],
          [[45, 52, 57], H, 62],
          [[50, 57, 62], W, 62],
        ]),
      },
    ],
  },
];

export const SAMPLE_SONGS = RAW_SAMPLE_SPECS.map((spec) => {
  const bytes = buildMidiBuffer(spec);
  const parsed = parseMidiBuffer(bytes);
  return {
    id: spec.id,
    title: spec.title,
    subtitle: spec.subtitle,
    bytes,
    parsed,
  };
});
