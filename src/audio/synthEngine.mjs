import { midiToFrequency } from '../midi/midiParser.mjs';

export class SynthEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.backingGain = null;
    this.leadGain = null;
    this.backingVolume = 0.7;
    this.leadVolume = 0.0;
    this.scheduledIds = new Set();
    this.lastScheduledSongTime = -1;
    this.activeVoices = new Set();
  }

  async ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;
      this.masterGain.connect(this.ctx.destination);

      this.backingGain = this.ctx.createGain();
      this.backingGain.gain.value = this.backingVolume;
      this.backingGain.connect(this.masterGain);

      this.leadGain = this.ctx.createGain();
      this.leadGain.gain.value = this.leadVolume;
      this.leadGain.connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  setVolumes({ backingVolume, leadVolume }) {
    if (backingVolume !== undefined) {
      this.backingVolume = Math.max(0, Math.min(1, backingVolume));
      if (this.backingGain && this.ctx) {
        this.backingGain.gain.setTargetAtTime(this.backingVolume, this.ctx.currentTime, 0.02);
      }
    }
    if (leadVolume !== undefined) {
      this.leadVolume = Math.max(0, Math.min(1, leadVolume));
      if (this.leadGain && this.ctx) {
        this.leadGain.gain.setTargetAtTime(this.leadVolume, this.ctx.currentTime, 0.02);
      }
    }
  }

  resetSchedule(songTime = 0) {
    this.scheduledIds.clear();
    this.lastScheduledSongTime = songTime - 0.001;
    this.stopAllVoices();
  }

  stopAllVoices() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of this.activeVoices) {
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(0.0001, now, 0.02);
        voice.osc.stop(now + 0.08);
      } catch {
        // already stopped
      }
    }
    this.activeVoices.clear();
  }

  /**
   * Play a short preview tone (e.g., when clicking a piano key or testing audio).
   */
  async playPreviewNote(midi, durationSec = 0.35, instrumentId = 'piano') {
    await this.ensureContext();
    const now = this.ctx.currentTime;
    this._triggerVoice({
      midi,
      when: now,
      duration: durationSec,
      velocity: 85,
      bus: this.masterGain,
      voiceType: instrumentId,
    });
  }

  /**
   * Lookahead scheduler called from the animation loop.
   */
  scheduleWindow({ songTime, tempoScale, isPaused, leadNotes, backingNotes, instrumentId }) {
    if (!this.ctx || isPaused) return;
    if (songTime < this.lastScheduledSongTime - 0.1) {
      this.resetSchedule(songTime);
    }

    const lookaheadSec = 0.16;
    const windowEndSongTime = songTime + lookaheadSec * tempoScale;
    const audioNow = this.ctx.currentTime;

    const scheduleList = (notes, prefix, bus, voiceType, volScale) => {
      if (
        !notes ||
        (bus === this.leadGain && this.leadVolume <= 0.005) ||
        (bus === this.backingGain && this.backingVolume <= 0.005)
      ) {
        return;
      }
      for (let i = 0; i < notes.length; i += 1) {
        const note = notes[i];
        if (note.startTime > windowEndSongTime) break;
        if (note.startTime < this.lastScheduledSongTime) continue;
        const uid = `${prefix}:${i}:${note.startTime.toFixed(4)}:${note.midi}`;
        if (this.scheduledIds.has(uid)) continue;
        this.scheduledIds.add(uid);

        const deltaSong = Math.max(0, note.startTime - songTime);
        const when = audioNow + deltaSong / Math.max(0.25, tempoScale);
        const dur = Math.max(0.06, Math.min(2.5, note.duration / Math.max(0.25, tempoScale)));
        this._triggerVoice({
          midi: note.targetMidi ?? note.midi,
          when,
          duration: dur,
          velocity: (note.velocity ?? 80) * volScale,
          bus,
          voiceType,
        });
      }
    };

    scheduleList(backingNotes, 'back', this.backingGain, 'piano', 0.85);
    scheduleList(leadNotes, 'lead', this.leadGain, instrumentId, 0.9);
    this.lastScheduledSongTime = windowEndSongTime;
  }

  _triggerVoice({ midi, when, duration, velocity, bus, voiceType }) {
    if (!this.ctx || !bus) return;
    const freq = midiToFrequency(midi);
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    if (voiceType === 'strings') {
      osc.type = 'sawtooth';
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(3400, freq * 3.8), when);
    } else if (voiceType === 'saxophone') {
      osc.type = 'sawtooth';
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(Math.min(2600, freq * 2.4), when);
      filter.Q.setValueAtTime(1.2, when);
    } else {
      osc.type = 'triangle';
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(4800, freq * 5), when);
    }

    osc.frequency.setValueAtTime(freq, when);

    const amp = Math.max(0.02, Math.min(0.28, (velocity / 127) * 0.22));
    const attack = voiceType === 'strings' ? 0.045 : 0.015;
    const release = 0.06;

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(amp, when + attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0005, amp * 0.55), when + Math.max(attack + 0.02, duration));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration + release);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(bus);

    const voiceRef = { osc, gain };
    this.activeVoices.add(voiceRef);
    osc.onended = () => {
      this.activeVoices.delete(voiceRef);
      try {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
    };

    osc.start(when);
    osc.stop(when + duration + release + 0.02);
  }
}
