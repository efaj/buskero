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

/**
 * Compute an integer octave shift (-2..+2) that maximizes the number of notes
 * inside the standard written saxophone range [58..90] (Bb3..F#6).
 */
export function autoFitSaxOctave(notes, saxTransposition = 'alto_eb') {
  if (!notes || notes.length === 0) return 0;
  const transposition = SAX_TRANSPOSITIONS[saxTransposition] ?? SAX_TRANSPOSITIONS.alto_eb;
  let bestShift = 0;
  let bestScore = -1;

  for (const shift of [0, 1, -1, 2, -2]) {
    let inRange = 0;
    let comfortBonus = 0;
    for (const note of notes) {
      const written = note.midi + shift * 12 + transposition.writtenOffset;
      if (written >= 58 && written <= 90) {
        inRange += 1;
        // Prefer middle register (62..83) over extreme altissimo/low notes
        if (written >= 62 && written <= 83) comfortBonus += 0.2;
      }
    }
    const score = inRange + comfortBonus;
    if (score > bestScore || (score === bestScore && Math.abs(shift) < Math.abs(bestShift))) {
      bestScore = score;
      bestShift = shift;
    }
  }
  return bestShift;
}

/**
 * Classify which saxophone transposition and tuning offset the player has
 * when fingering Written B4 (Left Index L1 only).
 * @param {number} detectedMidiFloat - raw uncalibrated concert MIDI float from mic
 */
export function classifySaxCalibrationNote(detectedMidiFloat, options = {}) {
  const nearest = Math.round(detectedMidiFloat);
  const pc = ((nearest % 12) + 12) % 12;
  const tuningOffsetCents = Math.round((detectedMidiFloat - nearest) * 100);

  if (pc === 2) {
    return {
      saxTransposition: 'alto_eb',
      label: SAX_TRANSPOSITIONS.alto_eb.label,
      targetConcertMidi: nearest,
      tuningOffsetCents,
    };
  }
  if (pc === 9 && nearest <= 63) {
    return {
      saxTransposition: 'tenor_bb',
      label: SAX_TRANSPOSITIONS.tenor_bb.label,
      targetConcertMidi: nearest,
      tuningOffsetCents,
    };
  }
  if (pc === 9 && nearest >= 64) {
    return {
      saxTransposition: 'soprano_bb',
      label: SAX_TRANSPOSITIONS.soprano_bb.label,
      targetConcertMidi: nearest,
      tuningOffsetCents,
    };
  }
  if (pc === 11) {
    return {
      saxTransposition: 'concert_c',
      label: SAX_TRANSPOSITIONS.concert_c.label,
      targetConcertMidi: nearest,
      tuningOffsetCents,
    };
  }

  // Fallback for horns sharp/flat by more than ±50¢ relative to the currently selected transposition
  const prefKey = options?.preferredTransposition;
  const prefTrans = prefKey ? SAX_TRANSPOSITIONS[prefKey] : null;
  if (prefTrans) {
    const baseConcertB4 = 71 - prefTrans.writtenOffset;
    const expectedConcertMidi = baseConcertB4 + 12 * Math.round((detectedMidiFloat - baseConcertB4) / 12);
    if (Math.abs(detectedMidiFloat - expectedConcertMidi) <= 1.0) {
      return {
        saxTransposition: prefKey,
        label: prefTrans.label,
        targetConcertMidi: expectedConcertMidi,
        tuningOffsetCents: Math.round((detectedMidiFloat - expectedConcertMidi) * 100),
      };
    }
  }

  return {
    saxTransposition: null,
    label: null,
    nearestMidi: nearest,
    targetConcertMidi: nearest,
    tuningOffsetCents,
  };
}

/**
 * Map a concert MIDI note to the laid-down 11-lane Saxophone key stack.
 * IMPORTANT: targetMidi stays in CONCERT pitch for microphone & synth matching,
 * while fingering lookup uses writtenMidi = targetMidi + writtenOffset.
 */
export function mapNoteToHighway(concertMidi, context = {}) {
  const transpositionKey = context.saxTransposition ?? 'alto_eb';
  const transposition = SAX_TRANSPOSITIONS[transpositionKey] ?? SAX_TRANSPOSITIONS.alto_eb;
  const targetMidi = Math.round(concertMidi);
  const rawWrittenMidi = targetMidi + transposition.writtenOffset;
  const concertName = midiToNoteName(targetMidi);

  let clampedWritten = rawWrittenMidi;
  let outOfRange = false;
  let rangeBadge = '';

  if (rawWrittenMidi < 58) {
    outOfRange = true;
    while (clampedWritten < 58) clampedWritten += 12;
    rangeBadge = '↓8va ';
  } else if (rawWrittenMidi > 90) {
    outOfRange = true;
    while (clampedWritten > 90) clampedWritten -= 12;
    rangeBadge = '↑8va ';
  }

  const writtenName = midiToSaxNoteName(rawWrittenMidi);
  const fingering = getStandardFingering(clampedWritten) ?? { lanes: [], badges: {}, openNote: true };
  const laneIndices = [...fingering.lanes];
  const openNote = Boolean(fingering.openNote);
  const primaryLane = laneIndices.length > 0 ? laneIndices[0] : 5;

  const hasOctave = laneIndices.includes(0);
  const color = openNote ? '#a855f7' : hasOctave ? '#34d399' : '#38bdf8';

  const laneBadges = {};
  for (const idx of laneIndices) {
    laneBadges[idx] = fingering.badges?.[idx] ?? SAX_LANES[idx].label;
  }

  return {
    laneIndices,
    primaryLane,
    color,
    shape: 'pill',
    badgeText: openNote ? `OPEN ${writtenName}` : `${rangeBadge}${writtenName}`,
    secondaryBadge: `Concert ${concertName}`,
    targetMidi,
    writtenMidi: rawWrittenMidi,
    noteName: writtenName,
    concertName,
    outOfRange,
    openNote,
    laneBadges,
  };
}
