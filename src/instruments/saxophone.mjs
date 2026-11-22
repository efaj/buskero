import { midiToNoteName } from '../midi/midiParser.mjs';

const SAX_NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

export function midiToSaxNoteName(midi) {
  const rounded = Math.round(midi);
  const name = SAX_NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

export const SAX_TRANSPOSITIONS = {
  alto_eb: { id: 'alto_eb', label: 'Alto Sax (E♭)', writtenOffset: 9 },
  tenor_bb: { id: 'tenor_bb', label: 'Tenor Sax (B♭)', writtenOffset: 14 },
  soprano_bb: { id: 'soprano_bb', label: 'Soprano Sax (B♭)', writtenOffset: 2 },
  concert_c: { id: 'concert_c', label: 'Concert Pitch (C)', writtenOffset: 0 },
};

export const SAX_LANES = [
  {
    index: 0,
    id: 'oct',
    label: 'OCT',
    sublabel: 'Thumb',
    group: 'lh',
    isAccidental: false,
    widthWeight: 0.9,
    color: '#a855f7',
  },
  {
    index: 1,
    id: 'palm',
    label: 'PALM',
    sublabel: 'D/Eb/F',
    group: 'lh',
    isAccidental: true,
    widthWeight: 1,
    color: '#c084fc',
  },
  {
    index: 2,
    id: 'l1',
    label: 'L1',
    sublabel: 'B',
    group: 'lh',
    isAccidental: false,
    widthWeight: 1,
    color: '#38bdf8',
  },
  {
    index: 3,
    id: 'l2',
    label: 'L2',
    sublabel: 'A',
    group: 'lh',
    isAccidental: false,
    widthWeight: 1,
    color: '#38bdf8',
  },
  {
    index: 4,
    id: 'l3',
    label: 'L3',
    sublabel: 'G',
    group: 'lh',
    isAccidental: false,
    widthWeight: 1,
    color: '#38bdf8',
  },
  {
    index: 5,
    id: 'lpk',
    label: 'L-PK',
    sublabel: 'G#/C#/B/Bb',
    group: 'lh',
    isAccidental: true,
    widthWeight: 1.05,
    color: '#60a5fa',
  },
  {
    index: 6,
    id: 'r1',
    label: 'R1',
    sublabel: 'F',
    group: 'rh',
    isAccidental: false,
    widthWeight: 1,
    color: '#fb923c',
  },
  {
    index: 7,
    id: 'r2',
    label: 'R2',
    sublabel: 'E',
    group: 'rh',
    isAccidental: false,
    widthWeight: 1,
    color: '#fb923c',
  },
  {
    index: 8,
    id: 'r3',
    label: 'R3',
    sublabel: 'D',
    group: 'rh',
    isAccidental: false,
    widthWeight: 1,
    color: '#fb923c',
  },
  {
    index: 9,
    id: 'side',
    label: 'SIDE',
    sublabel: 'Ta/Tc/Te',
    group: 'rh',
    isAccidental: true,
    widthWeight: 1.05,
    color: '#f59e0b',
  },
  {
    index: 10,
    id: 'rpk',
    label: 'R-PK',
    sublabel: 'Eb / C',
    group: 'rh',
    isAccidental: true,
    widthWeight: 1.05,
    color: '#fbbf24',
  },
];

// Complete standard saxophone fingering table across written Bb3 (58) .. F#6 (90).
// Keys in `badges` map laneIndex -> key label shown on that key pearl/lever.
const LOWER_REGISTER_FINGERINGS = {
  58: { lanes: [2, 3, 4, 5, 6, 7, 8, 10], badges: { 5: 'Bb', 10: 'C' } }, // Bb3
  59: { lanes: [2, 3, 4, 5, 6, 7, 8, 10], badges: { 5: 'B', 10: 'C' } }, // B3
  60: { lanes: [2, 3, 4, 6, 7, 8, 10], badges: { 10: 'C' } }, // C4
  61: { lanes: [2, 3, 4, 5, 6, 7, 8, 10], badges: { 5: 'C#', 10: 'C' } }, // C#4
  62: { lanes: [2, 3, 4, 6, 7, 8], badges: {} }, // D4
  63: { lanes: [2, 3, 4, 6, 7, 8, 10], badges: { 10: 'Eb' } }, // Eb4
  64: { lanes: [2, 3, 4, 6, 7], badges: {} }, // E4
  65: { lanes: [2, 3, 4, 6], badges: {} }, // F4
  66: { lanes: [2, 3, 4, 7], badges: {} }, // F#4
  67: { lanes: [2, 3, 4], badges: {} }, // G4
  68: { lanes: [2, 3, 4, 5], badges: { 5: 'G#' } }, // G#4
  69: { lanes: [2, 3], badges: {} }, // A4
  70: { lanes: [2, 3, 9], badges: { 9: 'Ta' } }, // Bb4 (Side Bb)
  71: { lanes: [2], badges: {} }, // B4
  72: { lanes: [3], badges: {} }, // C5
  73: { lanes: [], badges: {}, openNote: true }, // C#5 (Open)
};

function getStandardFingering(writtenMidi) {
  if (writtenMidi >= 58 && writtenMidi <= 73) {
    return LOWER_REGISTER_FINGERINGS[writtenMidi];
  }
  if (writtenMidi >= 74 && writtenMidi <= 85) {
    // D5 (74) .. C#6 (85): same as D4 (62) .. C#5 (73) + Octave Key (0)
    const base = LOWER_REGISTER_FINGERINGS[writtenMidi - 12];
    return {
      lanes: [0, ...base.lanes],
      badges: { 0: 'OCT', ...base.badges },
      openNote: false,
    };
  }
  if (writtenMidi === 86) {
    return { lanes: [0, 1], badges: { 0: 'OCT', 1: 'D' } };
  }
  if (writtenMidi === 87) {
    return { lanes: [0, 1], badges: { 0: 'OCT', 1: 'D+Eb' } };
  }
  if (writtenMidi === 88) {
    return { lanes: [0, 1, 9], badges: { 0: 'OCT', 1: 'D+Eb', 9: 'Te' } };
  }
  if (writtenMidi === 89) {
    return { lanes: [0, 1, 9], badges: { 0: 'OCT', 1: 'D+Eb+F', 9: 'Te' } };
  }
  if (writtenMidi === 90) {
    return { lanes: [0, 1, 9], badges: { 0: 'OCT', 1: 'D+Eb+F', 9: 'Te+Tf#' } };
  }
  return null;
}

export function getHighwayConfig(options = {}) {
  const transpositionKey = options.saxTransposition ?? 'alto_eb';
  const transposition = SAX_TRANSPOSITIONS[transpositionKey] ?? SAX_TRANSPOSITIONS.alto_eb;
  return {
    id: 'saxophone',
    name: `Saxophone — ${transposition.label}`,
    transposition,
    lanes: SAX_LANES.map((lane) => ({ ...lane })),
    groups: [
      { id: 'lh', label: 'Left Hand', startLane: 0, endLane: 5 },
      { id: 'rh', label: 'Right Hand', startLane: 6, endLane: 10 },
    ],
  };
}
