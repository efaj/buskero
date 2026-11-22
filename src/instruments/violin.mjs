import { midiToNoteName } from '../midi/midiParser.mjs';

export const VIOLIN_STRINGS = [
  { id: 'G', name: 'G String', openMidi: 55, color: '#38bdf8', shape: 'circle', badge: 'G' },
  { id: 'D', name: 'D String', openMidi: 62, color: '#fb923c', shape: 'diamond', badge: 'D' },
  { id: 'A', name: 'A String', openMidi: 69, color: '#f43f5e', shape: 'triangle', badge: 'A' },
  { id: 'E', name: 'E String', openMidi: 76, color: '#34d399', shape: 'hex', badge: 'E' },
];

export const VIOLIN_LANES = [
  {
    index: 0,
    id: 'open',
    label: 'Open',
    sublabel: '0',
    group: 'nut',
    isAccidental: false,
    widthWeight: 1,
    color: '#94a3b8',
  },
  {
    index: 1,
    id: 'low1',
    label: 'L1',
    sublabel: '+1',
    group: 'finger1',
    isAccidental: true,
    widthWeight: 1,
    color: '#94a3b8',
  },
  {
    index: 2,
    id: 'first',
    label: '1',
    sublabel: '+2',
    group: 'finger1',
    isAccidental: false,
    widthWeight: 1,
    color: '#94a3b8',
  },
  {
    index: 3,
    id: 'low2',
    label: 'L2',
    sublabel: '+3',
    group: 'finger2',
    isAccidental: false,
    widthWeight: 1,
    color: '#94a3b8',
  },
  {
    index: 4,
    id: 'high2',
    label: 'H2',
    sublabel: '+4',
    group: 'finger2',
    isAccidental: false,
    widthWeight: 1,
    color: '#94a3b8',
  },
  {
    index: 5,
    id: 'third',
    label: '3',
    sublabel: '+5',
    group: 'finger3',
    isAccidental: false,
    widthWeight: 1,
    color: '#94a3b8',
  },
  {
    index: 6,
    id: 'high3',
    label: 'H3/L4',
    sublabel: '+6',
    group: 'finger3',
    isAccidental: true,
    widthWeight: 1,
    color: '#94a3b8',
  },
  {
    index: 7,
    id: 'fourth',
    label: '4',
    sublabel: '+7',
    group: 'finger4',
    isAccidental: false,
    widthWeight: 1,
    color: '#94a3b8',
  },
];

export function getHighwayConfig() {
  return {
    id: 'violin',
    name: 'Violin (Flipped 8-Lane Fingerboard)',
    lanes: VIOLIN_LANES.map((lane) => ({ ...lane })),
    groups: [
      { id: 'nut', label: 'Open', startLane: 0, endLane: 0 },
      { id: 'finger1', label: 'Index (1)', startLane: 1, endLane: 2 },
      { id: 'finger2', label: 'Middle (2)', startLane: 3, endLane: 4 },
      { id: 'finger3', label: 'Ring (3)', startLane: 5, endLane: 6 },
      { id: 'finger4', label: 'Pinky (4)', startLane: 7, endLane: 7 },
    ],
    legend: VIOLIN_STRINGS,
  };
}

/**
 * Map a concert MIDI note to the flipped 8-lane Violin highway.
 * Lanes 0..7 represent chromatic finger stops (Open, L1, 1, L2, H2, 3, H3/L4, 4).
 * String identity (G/D/A/E) is encoded with both color AND geometric shape + letter badge.
 */
export function mapNoteToHighway(midiNote, context = {}) {
  const preferFourthFinger = Boolean(context.preferFourthFinger);
  const rounded = Math.round(midiNote);
  const noteName = midiToNoteName(rounded);

  // Below G3 (55)
  if (rounded < 55) {
    const str = VIOLIN_STRINGS[0];
    return {
      laneIndices: [0],
      primaryLane: 0,
      color: str.color,
      shape: str.shape,
      badgeText: str.badge,
      secondaryBadge: `↓low ${noteName}`,
      targetMidi: rounded,
      writtenMidi: rounded,
      noteName,
      stringId: str.id,
      fingerLabel: 'Open',
      outOfRange: true,
      openNote: false,
      laneBadges: { 0: str.badge },
    };
  }

  // Above B5 (83, 4th finger on E string): clamp to E string lane 7 with shift indicator
  if (rounded > 83) {
    const str = VIOLIN_STRINGS[3];
    const shift = rounded - 83;
    return {
      laneIndices: [7],
      primaryLane: 7,
      color: str.color,
      shape: str.shape,
      badgeText: str.badge,
      secondaryBadge: `↑+${shift}`,
      targetMidi: rounded,
      writtenMidi: rounded,
      noteName,
      stringId: str.id,
      fingerLabel: `4↑+${shift}`,
      outOfRange: rounded > 96,
      openNote: false,
      laneBadges: { 7: str.badge },
    };
  }

  // Standard 1st-position violin range: G3 (55) .. B5 (83)
  let chosenString = VIOLIN_STRINGS[0];
  let offset = 0;

  for (let i = VIOLIN_STRINGS.length - 1; i >= 0; i -= 1) {
    const candidate = VIOLIN_STRINGS[i];
    if (rounded >= candidate.openMidi) {
      chosenString = candidate;
      offset = rounded - candidate.openMidi;
      // Optional 4th finger preference on D4(62), A4(69), E5(76)
      if (preferFourthFinger && offset === 0 && i > 0) {
        chosenString = VIOLIN_STRINGS[i - 1];
        offset = 7;
      }
      break;
    }
  }

  const laneIdx = Math.max(0, Math.min(7, offset));
  const lane = VIOLIN_LANES[laneIdx];

  return {
    laneIndices: [laneIdx],
    primaryLane: laneIdx,
    color: chosenString.color,
    shape: chosenString.shape,
    badgeText: chosenString.badge,
    secondaryBadge: `${lane.label} · ${noteName}`,
    targetMidi: rounded,
    writtenMidi: rounded,
    noteName,
    stringId: chosenString.id,
    fingerLabel: lane.label,
    outOfRange: false,
    openNote: false,
    laneBadges: { [laneIdx]: chosenString.badge },
  };
}
