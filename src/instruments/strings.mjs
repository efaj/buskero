import { midiToNoteName } from '../midi/midiParser.mjs';

export const ALL_STRINGS = Object.freeze({
  C: Object.freeze({
    id: 'C',
    name: 'C String',
    openMidi: 48,
    openNoteName: 'C3',
    color: '#c084fc',
    shape: 'square',
    symbol: '■',
    badge: 'C',
  }),
  G: Object.freeze({
    id: 'G',
    name: 'G String',
    openMidi: 55,
    openNoteName: 'G3',
    color: '#38bdf8',
    shape: 'circle',
    symbol: '●',
    badge: 'G',
  }),
  D: Object.freeze({
    id: 'D',
    name: 'D String',
    openMidi: 62,
    openNoteName: 'D4',
    color: '#fb923c',
    shape: 'diamond',
    symbol: '◆',
    badge: 'D',
  }),
  A: Object.freeze({
    id: 'A',
    name: 'A String',
    openMidi: 69,
    openNoteName: 'A4',
    color: '#f43f5e',
    shape: 'triangle',
    symbol: '▲',
    badge: 'A',
  }),
  E: Object.freeze({
    id: 'E',
    name: 'E String',
    openMidi: 76,
    openNoteName: 'E5',
    color: '#34d399',
    shape: 'hex',
    symbol: '⬡',
    badge: 'E',
  }),
});

export const STRINGS_PRESETS = Object.freeze({
  violin_4: Object.freeze({
    id: 'violin_4',
    shortLabel: 'Violin (G·D·A·E)',
    label: 'Violin — 4 Strings (G · D · A · E)',
    strings: Object.freeze([ALL_STRINGS.G, ALL_STRINGS.D, ALL_STRINGS.A, ALL_STRINGS.E]),
  }),
  violin_5: Object.freeze({
    id: 'violin_5',
    shortLabel: '5-String Violin (C·G·D·A·E)',
    label: '5-String Violin (C · G · D · A · E)',
    strings: Object.freeze([ALL_STRINGS.C, ALL_STRINGS.G, ALL_STRINGS.D, ALL_STRINGS.A, ALL_STRINGS.E]),
  }),
  viola_4: Object.freeze({
    id: 'viola_4',
    shortLabel: 'Viola (C·G·D·A)',
    label: 'Viola — 4 Strings (C · G · D · A)',
    strings: Object.freeze([ALL_STRINGS.C, ALL_STRINGS.G, ALL_STRINGS.D, ALL_STRINGS.A]),
  }),
});

export const DEFAULT_STRINGS = STRINGS_PRESETS.violin_4.strings;

export const STRINGS_LANES = [
  {
    index: 0,
    id: 'low1',
    label: 'L1',
    sublabel: '+1',
    group: 'finger1',
    isAccidental: true,
    widthWeight: 1,
    color: '#94a3b8',
  },
  {
    index: 1,
    id: 'first',
    label: '1',
    sublabel: '+2',
    group: 'finger1',
    isAccidental: false,
    widthWeight: 1,
    color: '#94a3b8',
  },
  {
    index: 2,
    id: 'low2',
    label: 'L2',
    sublabel: '+3',
    group: 'finger2',
    isAccidental: false,
    widthWeight: 1,
    color: '#94a3b8',
  },
  {
    index: 3,
    id: 'high2',
    label: 'H2',
    sublabel: '+4',
    group: 'finger2',
    isAccidental: false,
    widthWeight: 1,
    color: '#94a3b8',
  },
  {
    index: 4,
    id: 'third',
    label: '3',
    sublabel: '+5',
    group: 'finger3',
    isAccidental: false,
    widthWeight: 1,
    color: '#94a3b8',
  },
  {
    index: 5,
    id: 'high3',
    label: 'H3/L4',
    sublabel: '+6',
    group: 'finger3',
    isAccidental: true,
    widthWeight: 1,
    color: '#94a3b8',
  },
  {
    index: 6,
    id: 'fourth',
    label: '4',
    sublabel: '+7',
    group: 'finger4',
    isAccidental: false,
    widthWeight: 1,
    color: '#94a3b8',
  },
];

export function getHighwayConfig(options = {}) {
  const preset = STRINGS_PRESETS[options.stringsPreset] ?? STRINGS_PRESETS.violin_4;
  return {
    id: 'strings',
    name: `Strings — ${preset.shortLabel}`,
    stringsPreset: preset.id,
    lanes: STRINGS_LANES.map((lane) => ({ ...lane })),
    groups: [
      { id: 'finger1', label: 'Index (1)', startLane: 0, endLane: 1 },
      { id: 'finger2', label: 'Middle (2)', startLane: 2, endLane: 3 },
      { id: 'finger3', label: 'Ring (3)', startLane: 4, endLane: 5 },
      { id: 'finger4', label: 'Pinky (4)', startLane: 6, endLane: 6 },
    ],
    legend: preset.strings,
  };
}

/**
 * Map a concert MIDI note to the flipped 7-lane Strings highway (`L1..4`) plus
 * full-width horizontal Open-string bars across Violin (GDAE), 5-String Violin (CGDAE),
 * and Viola (CGDA). String identity is encoded by color + geometric shape + badge.
 */
export function mapNoteToHighway(midiNote, context = {}) {
  const preferFourthFinger = Boolean(context.preferFourthFinger);
  const preset = STRINGS_PRESETS[context.stringsPreset] ?? STRINGS_PRESETS.violin_4;
  const strings = preset.strings;
  const lowestString = strings[0];
  const highestString = strings[strings.length - 1];
  const maxFirstPosMidi = highestString.openMidi + 7;

  const rounded = Math.round(midiNote);
  const noteName = midiToNoteName(rounded);

  // Below lowest open string (G3=55 on 4-string violin, C3=48 on 5-string violin / viola)
  if (rounded < lowestString.openMidi) {
    return {
      laneIndices: [],
      primaryLane: -1,
      stringIndex: 0,
      stringCount: strings.length,
      color: lowestString.color,
      shape: lowestString.shape,
      badgeText: lowestString.badge,
      secondaryBadge: `↓low ${noteName}`,
      targetMidi: rounded,
      writtenMidi: rounded,
      noteName,
      stringId: lowestString.id,
      fingerLabel: 'Open',
      outOfRange: true,
      openNote: true,
      laneBadges: {},
    };
  }

  // Above 4th finger on highest string: clamp to lane 6 ('4') with shift indicator
  if (rounded > maxFirstPosMidi) {
    const shift = rounded - maxFirstPosMidi;
    return {
      laneIndices: [6],
      primaryLane: 6,
      stringIndex: strings.length - 1,
      stringCount: strings.length,
      color: highestString.color,
      shape: highestString.shape,
      badgeText: highestString.badge,
      secondaryBadge: `↑+${shift}`,
      targetMidi: rounded,
      writtenMidi: rounded,
      noteName,
      stringId: highestString.id,
      fingerLabel: `4↑+${shift}`,
      outOfRange: rounded > maxFirstPosMidi + 13,
      openNote: false,
      laneBadges: { 6: highestString.badge },
    };
  }

  // Standard 1st-position range across active strings
  let chosenIndex = 0;
  let chosenString = lowestString;
  let offset = 0;

  for (let i = strings.length - 1; i >= 0; i -= 1) {
    const candidate = strings[i];
    if (rounded >= candidate.openMidi) {
      chosenIndex = i;
      chosenString = candidate;
      offset = rounded - candidate.openMidi;
      // Optional 4th finger preference on upper open strings
      if (preferFourthFinger && offset === 0 && i > 0) {
        chosenIndex = i - 1;
        chosenString = strings[i - 1];
        offset = 7;
      }
      break;
    }
  }

  // Open string -> full-width horizontal bar across all lanes
  if (offset === 0) {
    return {
      laneIndices: [],
      primaryLane: -1,
      stringIndex: chosenIndex,
      stringCount: strings.length,
      color: chosenString.color,
      shape: chosenString.shape,
      badgeText: chosenString.badge,
      secondaryBadge: `Open ${chosenString.id}`,
      targetMidi: rounded,
      writtenMidi: rounded,
      noteName,
      stringId: chosenString.id,
      fingerLabel: 'Open',
      outOfRange: false,
      openNote: true,
      laneBadges: {},
    };
  }

  const laneIdx = Math.max(0, Math.min(6, offset - 1));
  const lane = STRINGS_LANES[laneIdx];

  return {
    laneIndices: [laneIdx],
    primaryLane: laneIdx,
    stringIndex: chosenIndex,
    stringCount: strings.length,
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
