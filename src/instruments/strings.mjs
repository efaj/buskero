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
