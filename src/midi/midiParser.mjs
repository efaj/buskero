const GM_FAMILIES = [
  'Acoustic Grand Piano',
  'Bright Acoustic Piano',
  'Electric Grand Piano',
  'Honky-tonk Piano',
  'Electric Piano 1',
  'Electric Piano 2',
  'Harpsichord',
  'Clavinet',
  'Celesta',
  'Glockenspiel',
  'Music Box',
  'Vibraphone',
  'Marimba',
  'Xylophone',
  'Tubular Bells',
  'Dulcimer',
  'Drawbar Organ',
  'Percussive Organ',
  'Rock Organ',
  'Church Organ',
  'Reed Organ',
  'Accordion',
  'Harmonica',
  'Tango Accordion',
  'Acoustic Guitar (nylon)',
  'Acoustic Guitar (steel)',
  'Electric Guitar (jazz)',
  'Electric Guitar (clean)',
  'Electric Guitar (muted)',
  'Overdriven Guitar',
  'Distortion Guitar',
  'Guitar Harmonics',
  'Acoustic Bass',
  'Electric Bass (finger)',
  'Electric Bass (pick)',
  'Fretless Bass',
  'Slap Bass 1',
  'Slap Bass 2',
  'Synth Bass 1',
  'Synth Bass 2',
  'Violin',
  'Viola',
  'Cello',
  'Contrabass',
  'Tremolo Strings',
  'Pizzicato Strings',
  'Orchestral Harp',
  'Timpani',
  'String Ensemble 1',
  'String Ensemble 2',
  'Synth Strings 1',
  'Synth Strings 2',
  'Choir Aahs',
  'Voice Oohs',
  'Synth Choir',
  'Orchestra Hit',
  'Trumpet',
  'Trombone',
  'Tuba',
  'Muted Trumpet',
  'French Horn',
  'Brass Section',
  'Synth Brass 1',
  'Synth Brass 2',
  'Soprano Sax',
  'Alto Sax',
  'Tenor Sax',
  'Baritone Sax',
  'Oboe',
  'English Horn',
  'Bassoon',
  'Clarinet',
  'Piccolo',
  'Flute',
  'Recorder',
  'Pan Flute',
  'Blown Bottle',
  'Shakuhachi',
  'Whistle',
  'Ocarina',
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNoteName(midi) {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

export function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function getProgramName(program) {
  if (program == null || program < 0) return 'Unknown Instrument';
  if (program < GM_FAMILIES.length) return GM_FAMILIES[program];
  if (program < 88) return 'Synth Lead';
  if (program < 96) return 'Synth Pad';
  if (program < 104) return 'Synth Effects';
  if (program < 112) return 'Ethnic';
  if (program < 120) return 'Percussive';
  return 'Sound Effects';
}

function readUint16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function readAscii(bytes, offset, length) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(bytes[offset + i]);
  }
  return out;
}

function decodeText(bytes) {
  if (!bytes || bytes.length === 0) return '';
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\0+$/, '').trim();
  } catch {
    return readAscii(bytes, 0, bytes.length).trim();
  }
}

function readVLQ(bytes, cursor, end) {
  let value = 0;
  let pos = cursor;
  for (let i = 0; i < 4; i += 1) {
    if (pos >= end) {
      throw new Error('Unexpected end of MIDI track while reading variable-length quantity.');
    }
    const byte = bytes[pos++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      return { value, nextOffset: pos };
    }
  }
  throw new Error('Invalid MIDI variable-length quantity (> 4 bytes).');
}

function writeVLQ(value) {
  let v = Math.max(0, Math.floor(value));
  const bytes = [v & 0x7f];
  v >>>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  return bytes;
}

function encodeAscii(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i += 1) {
    bytes.push(str.charCodeAt(i) & 0x7f);
  }
  return bytes;
}

function pushUint16(arr, val) {
  arr.push((val >> 8) & 0xff, val & 0xff);
}

function pushUint32(arr, val) {
  arr.push((val >>> 24) & 0xff, (val >>> 16) & 0xff, (val >>> 8) & 0xff, val & 0xff);
}

function buildTempoMap(tempoEvents, ticksPerBeat, smpteFps, smpteTicksPerFrame) {
  const sorted = [...tempoEvents].sort((a, b) => a.tick - b.tick);
  const map = [{ tick: 0, usPerBeat: 500000, timeSec: 0 }];

  for (const ev of sorted) {
    const prev = map[map.length - 1];
    if (ev.tick === prev.tick) {
      prev.usPerBeat = ev.usPerBeat;
      continue;
    }
    const deltaTicks = ev.tick - prev.tick;
    const secPerTick = smpteFps ? 1 / (smpteFps * smpteTicksPerFrame) : prev.usPerBeat / 1_000_000 / ticksPerBeat;
    const timeSec = prev.timeSec + deltaTicks * secPerTick;
    map.push({ tick: ev.tick, usPerBeat: ev.usPerBeat, timeSec });
  }

  return map;
}

function tickToSeconds(tick, tempoMap, ticksPerBeat, smpteFps, smpteTicksPerFrame) {
  if (smpteFps) {
    return tick / (smpteFps * smpteTicksPerFrame);
  }
  let lo = 0;
  let hi = tempoMap.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tempoMap[mid].tick <= tick) lo = mid;
    else hi = mid - 1;
  }
  const seg = tempoMap[lo];
  const deltaTicks = tick - seg.tick;
  return seg.timeSec + deltaTicks * (seg.usPerBeat / 1_000_000 / ticksPerBeat);
}

const COMFORTABLE_CONCERT_RANGES = {
  violin: [55, 88],
  saxophone: [49, 81], // Alto Eb comfort concert range (~Db3..A5)
  piano: [48, 84],
};
