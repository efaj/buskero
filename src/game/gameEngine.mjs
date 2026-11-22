export const DEFAULT_TIMING = {
  perfectWindowSec: 0.075,
  goodWindowSec: 0.16,
  waitHoldMs: 75,
  violinPerfectCents: 35,
  saxPerfectCents: 50,
  maxPitchCents: 50,
  chordClusterSec: 0.035,
};

export class GameEngine {
  constructor(options = {}) {
    this.timing = { ...DEFAULT_TIMING, ...(options.timing ?? {}) };
    this.instrumentId = options.instrumentId ?? 'violin';
    this.mode = options.mode ?? 'realtime'; // 'realtime' | 'wait'
    this.tempoScale = options.tempoScale ?? 1.0;
    this.latencyOffsetMs = options.latencyOffsetMs ?? 0;

    this.notes = [];
    this.durationSec = 0;
    this.songTime = -1.2; // 1.2s lead-in count before t=0
    this.isPlaying = false;
    this.isFinished = false;
    this.isWaiting = false;
    this.waitTargetIndices = [];
    this.waitSatisfiedIndices = new Set();
    this.waitHoldMs = 0;

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { perfect: 0, good: 0, miss: 0 };
    this.lastJudgment = null; // { type: 'perfect'|'good'|'miss'|'wait', label, time }
    this.hitEffects = []; // { laneIndices, color, createdAt, text }
    this.midiFreshPresses = new Set(); // newly triggered MIDI notes in current frame
    this.loopStartSec = null;
    this.loopEndSec = null;
    this.loopCount = 0;
    this.didLoopWrap = false;
    this.qualifiesForHighScore = true;
    this.justFinished = false;
  }

  loadChart(mappedNotes, durationSec = 0) {
    this.notes = mappedNotes.map((n, idx) => ({
      ...n,
      id: idx,
      status: 'pending', // 'pending' | 'perfect' | 'good' | 'miss'
      hitErrorMs: null,
      waitProgress: 0,
    }));
    this.durationSec = Math.max(
      durationSec,
      this.notes.length > 0 ? this.notes[this.notes.length - 1].endTime + 1.0 : 0,
    );
    this.resetPlayback();
  }

  resetPlayback(leadInSec = 1.2) {
    this.songTime = -Math.abs(leadInSec);
    this.isPlaying = false;
    this.isFinished = false;
    this.isWaiting = false;
    this.waitTargetIndices = [];
    this.waitSatisfiedIndices.clear();
    this.waitHoldMs = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { perfect: 0, good: 0, miss: 0 };
    this.lastJudgment = null;
    this.hitEffects = [];
    this.midiFreshPresses.clear();
    this.loopCount = 0;
    this.didLoopWrap = false;
    this.qualifiesForHighScore = this.loopStartSec === null && this.loopEndSec === null;
    this.justFinished = false;

    for (const n of this.notes) {
      n.status = 'pending';
      n.hitErrorMs = null;
      n.waitProgress = 0;
    }
  }

  setMode(mode) {
    this.mode = mode === 'wait' ? 'wait' : 'realtime';
    if (this.mode === 'realtime') {
      this.isWaiting = false;
      this.waitTargetIndices = [];
      this.waitSatisfiedIndices.clear();
      this.waitHoldMs = 0;
    }
  }

  setInstrument(instrumentId) {
    this.instrumentId = instrumentId;
  }

  setTempoScale(scale) {
    this.tempoScale = Math.max(0.25, Math.min(1.5, Number(scale) || 1));
  }

  setLatencyOffsetMs(ms) {
    this.latencyOffsetMs = Math.max(-200, Math.min(200, Number(ms) || 0));
  }

  setLoopRange(startSec, endSec) {
    this.loopStartSec = startSec == null ? null : Math.max(0, Math.min(this.durationSec, Number(startSec)));
    this.loopEndSec = endSec == null ? null : Math.max(0, Math.min(this.durationSec, Number(endSec)));
    if (this.loopStartSec !== null && this.loopEndSec !== null && this.loopEndSec - this.loopStartSec < 0.5) {
      this.loopEndSec = Math.min(this.durationSec, this.loopStartSec + 0.5);
    }
    if (this.loopStartSec !== null || this.loopEndSec !== null) {
      this.qualifiesForHighScore = false;
    }
  }

  clearLoopRange() {
    this.loopStartSec = null;
    this.loopEndSec = null;
    this.loopCount = 0;
  }

  _wrapLoopIfNeeded() {
    if (this.loopStartSec === null || this.loopEndSec === null || this.loopEndSec - this.loopStartSec < 0.5) {
      return false;
    }
    if (this.songTime < this.loopEndSec) {
      return false;
    }
    this.songTime = this.loopStartSec;
    this.isWaiting = false;
    this.waitTargetIndices = [];
    this.waitSatisfiedIndices.clear();
    this.waitHoldMs = 0;
    this.loopCount += 1;

    for (const n of this.notes) {
      if (n.startTime >= this.loopStartSec - 0.05 && n.startTime <= this.loopEndSec + 0.05) {
        n.status = 'pending';
        n.hitErrorMs = null;
        n.waitProgress = 0;
      }
    }
    this.didLoopWrap = true;
    return true;
  }

  seek(timeSec) {
    const clamped = Math.max(-1.2, Math.min(this.durationSec, timeSec));
    this.songTime = clamped;
    this.isFinished = false;
    this.justFinished = false;
    this.isWaiting = false;
    this.waitTargetIndices = [];
    this.waitSatisfiedIndices.clear();
    this.waitHoldMs = 0;
    let skippedPending = false;
    for (const n of this.notes) {
      if (n.status === 'pending' && n.startTime < clamped - this.timing.goodWindowSec) {
        skippedPending = true;
      }
      n.status = n.startTime < clamped - this.timing.goodWindowSec ? 'miss' : 'pending';
      n.waitProgress = 0;
    }
    if (skippedPending) {
      this.qualifiesForHighScore = false;
    }
  }

  notifyMidiNoteOn(midi) {
    this.midiFreshPresses.add(Math.round(midi));
  }

  skipCurrentWaitNote() {
    if (this.mode !== 'wait' || this.waitTargetIndices.length === 0) return false;
    this.qualifiesForHighScore = false;
    for (const idx of this.waitTargetIndices) {
      const note = this.notes[idx];
      if (note && note.status === 'pending') {
        note.status = 'good';
        this.counts.good += 1;
      }
    }
    this.isWaiting = false;
    this.waitTargetIndices = [];
    this.waitSatisfiedIndices.clear();
    this.waitHoldMs = 0;
    this.lastJudgment = { type: 'good', label: 'SKIPPED', time: this.songTime };
    return true;
  }

  getAccuracyPercent() {
    const total = this.counts.perfect + this.counts.good + this.counts.miss;
    if (total === 0) return 100;
    const weighted = this.counts.perfect + this.counts.good * 0.65;
    return Math.round((weighted / total) * 100);
  }

  _registerHit(note, type, errorSec = 0) {
    note.status = type;
    note.hitErrorMs = Math.round(errorSec * 1000);
    if (type === 'perfect') {
      this.counts.perfect += 1;
      this.combo += 1;
      this.score += 100 + Math.min(200, this.combo * 5);
    } else if (type === 'good') {
      this.counts.good += 1;
      this.combo += 1;
      this.score += 60 + Math.min(120, this.combo * 3);
    }
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    this.lastJudgment = {
      type,
      label: type === 'perfect' ? 'PERFECT' : 'GOOD',
      noteName: note.noteName,
      time: this.songTime,
    };
    this.hitEffects.push({
      laneIndices: note.laneIndices,
      openNote: note.openNote,
      color: note.color,
      text: type === 'perfect' ? 'PERFECT' : 'GOOD',
      life: 1.0,
    });
  }

  _registerMiss(note) {
    note.status = 'miss';
    this.counts.miss += 1;
    this.combo = 0;
    this.lastJudgment = {
      type: 'miss',
      label: 'MISS',
      noteName: note.noteName,
      time: this.songTime,
    };
  }

  _matchesPitch(note, pitch) {
    if (!pitch) return false;
    if (pitch.nearestMidi !== note.targetMidi) return false;
    return Math.abs(pitch.centsOff) <= this.timing.maxPitchCents;
  }

  /**
   * Advance simulation by `dtSec`.
   * @param {number} dtSec - wall-clock delta in seconds
   * @param {object} inputState - { pitch: YINResult|null, activeMidiKeys: Set<number> }
   */
  update(dtSec, inputState = {}) {
    const dt = Math.max(0, Math.min(0.1, dtSec));
    const pitch = inputState.pitch ?? null;
    const activeMidiKeys = inputState.activeMidiKeys ?? new Set();
    this.justFinished = false;

    // Decay visual hit bursts
    for (let i = this.hitEffects.length - 1; i >= 0; i -= 1) {
      this.hitEffects[i].life -= dt * 2.6;
      if (this.hitEffects[i].life <= 0) {
        this.hitEffects.splice(i, 1);
      }
    }

    if (!this.isPlaying || this.isFinished) {
      this.midiFreshPresses.clear();
      this.didLoopWrap = false;
      return this.getSnapshot();
    }

    this.didLoopWrap = false;
    if (this.mode === 'wait') {
      this._updateWaitMode(dt, pitch, activeMidiKeys);
    } else {
      this._updateRealtimeMode(dt, pitch, activeMidiKeys);
    }

    this._wrapLoopIfNeeded();

    if (this.songTime >= this.durationSec && !this.isWaiting) {
      const hasPending = this.notes.some((n) => n.status === 'pending');
      if (!hasPending) {
        this.isFinished = true;
        this.isPlaying = false;
        this.justFinished = true;
        if (this.counts.perfect + this.counts.good === 0) {
          this.qualifiesForHighScore = false;
        }
      }
    }

    this.midiFreshPresses.clear();
    return this.getSnapshot();
  }

  _updateRealtimeMode(dt, pitch, activeMidiKeys) {
    this.isWaiting = false;
    this.songTime += dt * this.tempoScale;
    const judgedTime = this.songTime - this.latencyOffsetMs / 1000;

    for (let i = 0; i < this.notes.length; i += 1) {
      const note = this.notes[i];
      if (note.status !== 'pending') continue;

      const delta = judgedTime - note.startTime;
      if (delta < -this.timing.goodWindowSec) {
        break; // Notes are sorted by startTime
      }

      if (delta > this.timing.goodWindowSec) {
        this._registerMiss(note);
        continue;
      }

      // Within active hit window [-goodWindowSec .. +goodWindowSec]
      const midiPressed = activeMidiKeys.has(note.targetMidi) || this.midiFreshPresses.has(note.targetMidi);
      const pitchMatched = this.instrumentId !== 'piano' && this._matchesPitch(note, pitch);

      if (midiPressed) {
        const type = Math.abs(delta) <= this.timing.perfectWindowSec ? 'perfect' : 'good';
        this._registerHit(note, type, delta);
      } else if (pitchMatched) {
        const perfectCents =
          this.instrumentId === 'violin' ? this.timing.violinPerfectCents : this.timing.saxPerfectCents;
        const isTightTime = Math.abs(delta) <= this.timing.perfectWindowSec;
        const isTightPitch = Math.abs(pitch.centsOff) <= perfectCents;
        const type = isTightTime && isTightPitch ? 'perfect' : 'good';
        this._registerHit(note, type, delta);
      }
    }
  }

  _findNextPendingGroup() {
    let firstIdx = -1;
    for (let i = 0; i < this.notes.length; i += 1) {
      if (this.notes[i].status === 'pending') {
        firstIdx = i;
        break;
      }
    }
    if (firstIdx === -1) return [];

    const firstTime = this.notes[firstIdx].startTime;
    const group = [firstIdx];
    for (let j = firstIdx + 1; j < this.notes.length; j += 1) {
      if (this.notes[j].status !== 'pending') continue;
      if (this.notes[j].startTime - firstTime <= this.timing.chordClusterSec) {
        group.push(j);
      } else {
        break;
      }
    }
    return group;
  }

  _updateWaitMode(dt, pitch, activeMidiKeys) {
    const group = this._findNextPendingGroup();
    if (group.length === 0) {
      this.isWaiting = false;
      this.songTime += dt * this.tempoScale;
      return;
    }

    const targetTime = this.notes[group[0]].startTime;
    const nextTime = this.songTime + dt * this.tempoScale;

    if (nextTime < targetTime) {
      this.songTime = nextTime;
      this.isWaiting = false;
      this.waitTargetIndices = [];
      this.waitSatisfiedIndices.clear();
      this.waitHoldMs = 0;
      return;
    }

    // Clamp cleanly right at the next unhit note/chord timestamp
    this.songTime = targetTime;
    this.isWaiting = true;

    const groupKey = group.join(',');
    const prevKey = this.waitTargetIndices.join(',');
    if (groupKey !== prevKey) {
      this.waitTargetIndices = group;
      this.waitSatisfiedIndices.clear();
      this.waitHoldMs = 0;
    }

    // Check polyphonic MIDI / virtual keyboard satisfaction first
    let anyMidiMatch = false;
    for (const idx of group) {
      const note = this.notes[idx];
      if (activeMidiKeys.has(note.targetMidi) || this.midiFreshPresses.has(note.targetMidi)) {
        this.waitSatisfiedIndices.add(idx);
        note.waitProgress = 1;
        anyMidiMatch = true;
      }
    }

    if (anyMidiMatch && this.waitSatisfiedIndices.size === group.length) {
      for (const idx of group) {
        this._registerHit(this.notes[idx], 'perfect', 0);
      }
      this.isWaiting = false;
      this.waitTargetIndices = [];
      this.waitSatisfiedIndices.clear();
      this.waitHoldMs = 0;
      return;
    }

    // Check monophonic Microphone pitch hold (>= waitHoldMs) for mic instruments only
    const primaryNote = this.notes[group[0]];
    if (this.instrumentId !== 'piano' && this._matchesPitch(primaryNote, pitch)) {
      this.waitHoldMs += dt * 1000;
      const progress = Math.min(1, this.waitHoldMs / this.timing.waitHoldMs);
      for (const idx of group) {
        this.notes[idx].waitProgress = progress;
      }
      if (this.waitHoldMs >= this.timing.waitHoldMs) {
        // In monophonic mic mode, holding the primary melody pitch completes the step
        for (const idx of group) {
          this._registerHit(this.notes[idx], 'perfect', 0);
        }
        this.isWaiting = false;
        this.waitTargetIndices = [];
        this.waitSatisfiedIndices.clear();
        this.waitHoldMs = 0;
      }
    } else {
      // Decay hold gently so brief vibrato dips don't completely zero progress
      this.waitHoldMs = Math.max(0, this.waitHoldMs - dt * 250);
      const progress = Math.min(1, this.waitHoldMs / this.timing.waitHoldMs);
      for (const idx of group) {
        if (!this.waitSatisfiedIndices.has(idx)) {
          this.notes[idx].waitProgress = progress;
        }
      }
    }
  }

  getSnapshot() {
    return {
      instrumentId: this.instrumentId,
      mode: this.mode,
      tempoScale: this.tempoScale,
      songTime: this.songTime,
      durationSec: this.durationSec,
      isPlaying: this.isPlaying,
      isFinished: this.isFinished,
      isWaiting: this.isWaiting,
      waitNotes: this.waitTargetIndices.map((idx) => this.notes[idx]).filter(Boolean),
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      accuracy: this.getAccuracyPercent(),
      counts: { ...this.counts },
      lastJudgment: this.lastJudgment,
      loopStartSec: this.loopStartSec,
      loopEndSec: this.loopEndSec,
      loopCount: this.loopCount,
      didLoopWrap: this.didLoopWrap,
      qualifiesForHighScore: this.qualifiesForHighScore,
      justFinished: this.justFinished,
    };
  }
}
