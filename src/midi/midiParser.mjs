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

/**
 * Parse a Standard MIDI File (.mid / .midi) ArrayBuffer or Uint8Array.
 */
export function parseMidiBuffer(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 14) {
    throw new Error('File is too small to be a valid MIDI file.');
  }

  const headerTag = readAscii(bytes, 0, 4);
  if (headerTag !== 'MThd') {
    throw new Error('Invalid MIDI header: missing MThd chunk.');
  }

  const headerLength = readUint32(bytes, 4);
  if (headerLength < 6 || 8 + headerLength > bytes.byteLength) {
    throw new Error('Corrupt MIDI header length.');
  }

  const format = readUint16(bytes, 8);
  const numTracks = readUint16(bytes, 10);
  const rawDivision = readUint16(bytes, 12);

  let ticksPerBeat = 480;
  let smpteFps = 0;
  let smpteTicksPerFrame = 0;
  if ((rawDivision & 0x8000) !== 0) {
    const signedByte = (rawDivision >> 8) & 0xff;
    const negFps = signedByte >= 128 ? signedByte - 256 : signedByte;
    smpteFps = Math.abs(negFps) === 29 ? 29.97 : Math.abs(negFps) || 24;
    smpteTicksPerFrame = rawDivision & 0xff || 40;
    ticksPerBeat = Math.round((smpteFps * smpteTicksPerFrame) / 2);
  } else {
    ticksPerBeat = rawDivision || 480;
  }

  let offset = 8 + headerLength;
  const tempoEvents = [];
  const timeSignatures = [];
  const rawTracks = [];

  for (let trackIdx = 0; trackIdx < numTracks && offset + 8 <= bytes.byteLength; trackIdx += 1) {
    // Skip any unknown chunks safely until MTrk
    while (offset + 8 <= bytes.byteLength && readAscii(bytes, offset, 4) !== 'MTrk') {
      const skipLen = readUint32(bytes, offset + 4);
      offset += 8 + skipLen;
    }
    if (offset + 8 > bytes.byteLength) break;

    const chunkLen = readUint32(bytes, offset + 4);
    const trackStart = offset + 8;
    const trackEnd = Math.min(bytes.byteLength, trackStart + chunkLen);
    offset = trackStart + chunkLen;

    let cursor = trackStart;
    let tick = 0;
    let runningStatus = 0;
    let trackName = '';
    const channelPrograms = new Map();
    const activeNotes = new Map(); // key: `${channel}:${midi}` -> stack of { startTick, velocity, channel }
    const notes = [];

    while (cursor < trackEnd) {
      const delta = readVLQ(bytes, cursor, trackEnd);
      cursor = delta.nextOffset;
      tick += delta.value;
      if (cursor >= trackEnd) break;

      let statusByte = bytes[cursor];
      if (statusByte < 0x80) {
        if (!runningStatus) {
          throw new Error(`Invalid MIDI running status at byte ${cursor}.`);
        }
        statusByte = runningStatus;
      } else {
        cursor += 1;
        if (statusByte < 0xf0) {
          runningStatus = statusByte;
        } else {
          // Meta / SysEx resets running status in SMF
          runningStatus = 0;
        }
      }

      if (statusByte === 0xff) {
        if (cursor >= trackEnd) break;
        const metaType = bytes[cursor++];
        const lenRes = readVLQ(bytes, cursor, trackEnd);
        cursor = lenRes.nextOffset;
        const metaEnd = Math.min(trackEnd, cursor + lenRes.value);
        const payload = bytes.subarray(cursor, metaEnd);
        cursor = metaEnd;

        if ((metaType === 0x03 || metaType === 0x04) && !trackName) {
          trackName = decodeText(payload);
        } else if (metaType === 0x51 && payload.length >= 3) {
          const usPerBeat = (payload[0] << 16) | (payload[1] << 8) | payload[2];
          if (usPerBeat > 0) {
            tempoEvents.push({ tick, usPerBeat });
          }
        } else if (metaType === 0x58 && payload.length >= 2) {
          timeSignatures.push({
            tick,
            numerator: payload[0],
            denominator: 1 << payload[1],
          });
        } else if (metaType === 0x2f) {
          break;
        }
      } else if (statusByte === 0xf0 || statusByte === 0xf7) {
        const lenRes = readVLQ(bytes, cursor, trackEnd);
        cursor = Math.min(trackEnd, lenRes.nextOffset + lenRes.value);
      } else {
        const eventType = statusByte & 0xf0;
        const channel = statusByte & 0x0f;

        if (eventType === 0xc0 || eventType === 0xd0) {
          if (cursor >= trackEnd) break;
          const data1 = bytes[cursor++];
          if (eventType === 0xc0) {
            channelPrograms.set(channel, data1);
          }
        } else if (
          eventType === 0x80 ||
          eventType === 0x90 ||
          eventType === 0xa0 ||
          eventType === 0xb0 ||
          eventType === 0xe0
        ) {
          if (cursor + 1 >= trackEnd) break;
          const data1 = bytes[cursor++];
          const data2 = bytes[cursor++];

          if (eventType === 0x90 && data2 > 0) {
            const key = `${channel}:${data1}`;
            let stack = activeNotes.get(key);
            if (!stack) {
              stack = [];
              activeNotes.set(key, stack);
            }
            stack.push({ startTick: tick, velocity: data2, channel, midi: data1 });
          } else if (eventType === 0x80 || (eventType === 0x90 && data2 === 0)) {
            const key = `${channel}:${data1}`;
            const stack = activeNotes.get(key);
            if (stack && stack.length > 0) {
              const started = stack.shift();
              notes.push({
                midi: started.midi,
                channel: started.channel,
                velocity: started.velocity,
                startTick: started.startTick,
                endTick: Math.max(started.startTick + 1, tick),
              });
            }
          }
        } else {
          // Unknown system realtime/common; bail cleanly
          break;
        }
      }
    }

    // Close any dangling notes cleanly at last tick seen in track
    for (const stack of activeNotes.values()) {
      for (const started of stack) {
        notes.push({
          midi: started.midi,
          channel: started.channel,
          velocity: started.velocity,
          startTick: started.startTick,
          endTick: Math.max(started.startTick + Math.round(ticksPerBeat / 2), tick),
        });
      }
    }

    rawTracks.push({
      index: trackIdx,
      name: trackName,
      channelPrograms,
      notes,
    });
  }

  const tempoMap = buildTempoMap(tempoEvents, ticksPerBeat, smpteFps, smpteTicksPerFrame);
  const tracks = [];
  let maxTimeSec = 0;

  for (const raw of rawTracks) {
    if (raw.notes.length === 0) continue;
    const channels = new Set();
    let minMidi = 127;
    let maxMidi = 0;

    const timedNotes = raw.notes
      .map((n) => {
        const startTime = tickToSeconds(n.startTick, tempoMap, ticksPerBeat, smpteFps, smpteTicksPerFrame);
        const endTime = tickToSeconds(n.endTick, tempoMap, ticksPerBeat, smpteFps, smpteTicksPerFrame);
        const duration = Math.max(0.05, endTime - startTime);
        channels.add(n.channel);
        if (n.midi < minMidi) minMidi = n.midi;
        if (n.midi > maxMidi) maxMidi = n.midi;
        if (startTime + duration > maxTimeSec) maxTimeSec = startTime + duration;
        return {
          midi: n.midi,
          channel: n.channel,
          velocity: n.velocity,
          startTick: n.startTick,
          endTick: n.endTick,
          startTime,
          endTime: startTime + duration,
          duration,
        };
      })
      .sort((a, b) => a.startTime - b.startTime || a.midi - b.midi);

    const primaryChannel = [...channels][0] ?? 0;
    const program = raw.channelPrograms.get(primaryChannel) ?? 0;
    const isPercussion = channels.size === 1 && primaryChannel === 9;

    // Monophony ratio: fraction of notes not overlapping the previous note
    let nonOverlapping = 0;
    let prevEnd = -1;
    for (const note of timedNotes) {
      if (note.startTime >= prevEnd - 0.03) {
        nonOverlapping += 1;
      }
      if (note.endTime > prevEnd) prevEnd = note.endTime;
    }
    const monophonyRatio = timedNotes.length > 0 ? nonOverlapping / timedNotes.length : 1;

    tracks.push({
      index: tracks.length,
      sourceTrackIndex: raw.index,
      name: raw.name || (isPercussion ? 'Percussion' : `Track ${raw.index + 1} (${getProgramName(program)})`),
      program,
      instrumentName: isPercussion ? 'Percussion' : getProgramName(program),
      primaryChannel,
      isPercussion,
      noteCount: timedNotes.length,
      minMidi,
      maxMidi,
      monophonyRatio,
      notes: timedNotes,
    });
  }

  const initialUsPerBeat = tempoMap[0]?.usPerBeat ?? 500000;
  const bpm = Math.round((60_000_000 / initialUsPerBeat) * 10) / 10;

  return {
    format,
    ticksPerBeat,
    bpm,
    tempoMap,
    timeSignatures: timeSignatures.length > 0 ? timeSignatures : [{ tick: 0, numerator: 4, denominator: 4 }],
    durationSec: maxTimeSec,
    tracks,
  };
}

/**
 * Build a valid Standard MIDI File (Format 1) Uint8Array from structured tracks & tempo changes.
 */
export function buildMidiBuffer({
  ticksPerBeat = 480,
  bpm = 120,
  tempoChanges = null,
  timeSignature = { numerator: 4, denominator: 4 },
  tracks = [],
}) {
  const effectiveTempos =
    tempoChanges && tempoChanges.length > 0 ? tempoChanges : [{ tick: 0, usPerBeat: Math.round(60_000_000 / bpm) }];

  const allTracks = [];

  // Conductor / Tempo track
  const conductorEvents = [];
  const denomPow = Math.max(0, Math.round(Math.log2(timeSignature.denominator || 4)));
  conductorEvents.push({
    tick: 0,
    bytes: [0xff, 0x58, 0x04, timeSignature.numerator || 4, denomPow, 24, 8],
  });
  for (const tc of effectiveTempos) {
    const us = Math.max(1000, Math.round(tc.usPerBeat ?? 60_000_000 / (tc.bpm || bpm)));
    conductorEvents.push({
      tick: tc.tick ?? 0,
      bytes: [0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff],
    });
  }
  allTracks.push(conductorEvents);

  for (const track of tracks) {
    const events = [];
    const channel = track.channel ?? 0;
    if (track.name) {
      const nameBytes = encodeAscii(track.name);
      events.push({ tick: 0, order: 0, bytes: [0xff, 0x03, ...writeVLQ(nameBytes.length), ...nameBytes] });
    }
    if (track.program != null) {
      events.push({ tick: 0, order: 1, bytes: [0xc0 | (channel & 0x0f), track.program & 0x7f] });
    }
    for (const note of track.notes ?? []) {
      const startTick = Math.max(0, Math.round(note.startTick));
      const endTick = Math.max(startTick + 1, Math.round(note.startTick + note.durationTicks));
      const vel = Math.max(1, Math.min(127, note.velocity ?? 92));
      const midi = Math.max(0, Math.min(127, note.midi));
      events.push({ tick: startTick, order: 3, bytes: [0x90 | (channel & 0x0f), midi, vel] });
      events.push({ tick: endTick, order: 2, bytes: [0x80 | (channel & 0x0f), midi, 0] });
    }
    allTracks.push(events);
  }

  const out = [];
  // Header chunk
  out.push(...encodeAscii('MThd'));
  pushUint32(out, 6);
  pushUint16(out, 1); // Format 1
  pushUint16(out, allTracks.length);
  pushUint16(out, ticksPerBeat);

  for (const trackEvents of allTracks) {
    const sorted = [...trackEvents].sort((a, b) => a.tick - b.tick || (a.order ?? 0) - (b.order ?? 0));
    const trkBytes = [];
    let prevTick = 0;
    for (const ev of sorted) {
      const delta = Math.max(0, ev.tick - prevTick);
      prevTick = ev.tick;
      trkBytes.push(...writeVLQ(delta), ...ev.bytes);
    }
    // End of track
    trkBytes.push(0x00, 0xff, 0x2f, 0x00);

    out.push(...encodeAscii('MTrk'));
    pushUint32(out, trkBytes.length);
    out.push(...trkBytes);
  }

  return new Uint8Array(out);
}

const COMFORTABLE_CONCERT_RANGES = {
  violin: [55, 88],
  saxophone: [49, 81], // Alto Eb comfort concert range (~Db3..A5)
  piano: [48, 84],
};

/**
 * Recommend the best lead track, backing tracks, and octave shift for an instrument.
 */
export function recommendLeadTrack(parsedMidi, instrumentId = 'violin') {
  const tracks = parsedMidi?.tracks ?? [];
  if (tracks.length === 0) {
    return { leadTrackIndex: 0, backingTrackIndices: [], suggestedOctaveShift: 0 };
  }

  const [prefMin, prefMax] = COMFORTABLE_CONCERT_RANGES[instrumentId] ?? [55, 84];
  let bestIdx = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < tracks.length; i += 1) {
    const t = tracks[i];
    if (t.isPercussion) continue;
    const avgMidi = t.notes.reduce((sum, n) => sum + n.midi, 0) / Math.max(1, t.notes.length);
    const center = (prefMin + prefMax) / 2;
    const rangePenalty = Math.abs(avgMidi - center) * 0.6;

    let score = Math.min(t.noteCount, 300) * 0.25 - rangePenalty;
    if (instrumentId === 'violin' || instrumentId === 'saxophone') {
      score += t.monophonyRatio * 120;
      if (t.program >= 40 && t.program <= 79) score += 25; // Strings / Winds
    } else {
      // Piano prefers richer polyphonic or main keyboard tracks
      score += Math.min(t.noteCount, 500) * 0.2;
      if (t.program >= 0 && t.program <= 7) score += 30;
    }

    const lowerName = t.name.toLowerCase();
    if (
      lowerName.includes('melody') ||
      lowerName.includes('lead') ||
      lowerName.includes('solo') ||
      lowerName.includes('violin') ||
      lowerName.includes('sax')
    ) {
      score += 40;
    }
    if (lowerName.includes('bass') || lowerName.includes('drum')) {
      score -= 45;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const leadTrack = tracks[bestIdx];
  let bestShift = 0;
  let bestInRange = -1;
  for (const shift of [0, 1, -1, 2, -2]) {
    let inRange = 0;
    for (const n of leadTrack.notes) {
      const shifted = n.midi + shift * 12;
      if (shifted >= prefMin && shifted <= prefMax) inRange += 1;
    }
    if (inRange > bestInRange || (inRange === bestInRange && Math.abs(shift) < Math.abs(bestShift))) {
      bestInRange = inRange;
      bestShift = shift;
    }
  }

  const backingTrackIndices = tracks.map((_t, idx) => idx).filter((idx) => idx !== bestIdx);

  return {
    leadTrackIndex: bestIdx,
    backingTrackIndices,
    suggestedOctaveShift: bestShift,
  };
}
