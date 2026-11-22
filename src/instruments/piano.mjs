import { midiToNoteName } from '../midi/midiParser.mjs';

const BLACK_KEY_PCS = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(midi) {
  return BLACK_KEY_PCS.has(((midi % 12) + 12) % 12);
}

/**
 * Determine a clean octave-padded [minKey..maxKey] keyboard span from song notes.
 */
export function computeKeyboardRange(notes = []) {
  if (!notes || notes.length === 0) {
    return { minKey: 48, maxKey: 84 }; // C3..C6 default
  }
  let lo = 127;
  let hi = 0;
  for (const n of notes) {
    const m = Math.round(n.midi);
    if (m < lo) lo = m;
    if (m > hi) hi = m;
  }

  lo = Math.max(21, lo);
  hi = Math.min(108, hi);

  // Pad to full octaves (C..B/C) with comfortable minimum span of 3 octaves (C3..C6)
  let minKey = Math.floor(lo / 12) * 12;
  let maxKey = Math.ceil((hi + 1) / 12) * 12;
  minKey = Math.min(minKey, 48);
  maxKey = Math.max(maxKey, 84);
  if (maxKey - minKey < 36) {
    maxKey = Math.min(108, minKey + 36);
  }
  minKey = Math.max(21, minKey);
  maxKey = Math.min(108, maxKey);

  return { minKey, maxKey };
}

export function getHighwayConfig(options = {}) {
  const { minKey, maxKey } = computeKeyboardRange(options.notes ?? []);
  const lanes = [];
  let whiteCount = 0;
  for (let m = minKey; m <= maxKey; m += 1) {
    if (!isBlackKey(m)) whiteCount += 1;
  }

  let whiteIndex = 0;
  for (let m = minKey; m <= maxKey; m += 1) {
    const black = isBlackKey(m);
    const name = midiToNoteName(m);
    const isC = ((m % 12) + 12) % 12 === 0;
    const xNorm = black ? (whiteIndex - 0.32) / whiteCount : whiteIndex / whiteCount;
    const widthNorm = black ? 0.64 / whiteCount : 1 / whiteCount;

    lanes.push({
      index: m - minKey,
      midi: m,
      id: `key-${m}`,
      label: isC || !black ? name : name.replace(/\d+$/, ''),
      sublabel: name,
      group: m < 60 ? 'lh' : 'rh',
      isAccidental: black,
      isC,
      xNorm,
      widthNorm,
      widthWeight: black ? 0.64 : 1,
      color: black ? '#a78bfa' : '#38bdf8',
    });

    if (!black) whiteIndex += 1;
  }

  return {
    id: 'piano',
    name: `Piano (${midiToNoteName(minKey)} – ${midiToNoteName(maxKey)})`,
    minKey,
    maxKey,
    whiteCount,
    lanes,
    groups: [
      {
        id: 'lh',
        label: 'Left Hand (< C4)',
        startLane: 0,
        endLane: Math.max(0, Math.min(lanes.length - 1, 60 - minKey - 1)),
      },
      { id: 'rh', label: 'Right Hand (C4+)', startLane: Math.max(0, 60 - minKey), endLane: lanes.length - 1 },
    ],
  };
}

/**
 * Heuristic melodic finger hint (1..5) based on hand split at Middle C (60) and step direction.
 */
export function estimatePianoFinger(midi, prevMidi = null) {
  const isRightHand = midi >= 60;
  if (prevMidi == null) {
    return isRightHand ? 1 : 5;
  }
  const diff = midi - prevMidi;
  if (diff === 0) return isRightHand ? 2 : 2;
  if (isRightHand) {
    if (diff >= 7) return 5;
    if (diff >= 4) return 4;
    if (diff >= 2) return 3;
    if (diff > 0) return 2;
    if (diff <= -5) return 1;
    return 2;
  }
  if (diff <= -7) return 5;
  if (diff <= -4) return 4;
  if (diff <= -2) return 3;
  if (diff < 0) return 2;
  return 1;
}

export function mapNoteToHighway(midiNote, context = {}) {
  const minKey = context.minKey ?? 48;
  const maxKey = context.maxKey ?? 84;
  const rounded = Math.round(midiNote);
  const clamped = Math.max(minKey, Math.min(maxKey, rounded));
  const laneIndex = clamped - minKey;
  const black = isBlackKey(clamped);
  const noteName = midiToNoteName(rounded);
  const fingerHint = context.fingerHint ?? estimatePianoFinger(rounded, context.prevMidi);

  return {
    laneIndices: [laneIndex],
    primaryLane: laneIndex,
    color: black ? '#c084fc' : '#38bdf8',
    shape: 'pill',
    badgeText: `${noteName}`,
    secondaryBadge: `F${fingerHint}`,
    fingerHint,
    targetMidi: rounded,
    writtenMidi: rounded,
    noteName,
    outOfRange: rounded < minKey || rounded > maxKey,
    openNote: false,
    laneBadges: { [laneIndex]: String(fingerHint) },
  };
}
