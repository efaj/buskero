import { midiToNoteName } from '../midi/midiParser.mjs';

/**
 * Pure YIN monophonic pitch detector for Strings (Violin / 5-String / Viola), Saxophone, and single-note Piano mic input.
 * Includes a weak-fundamental / strong-2nd-harmonic guard for conical-bore reed instruments
 * and optional horn tuning offset calibration in cents.
 * @param {Float32Array} buffer
 * @param {number} sampleRate
 * @param {object} [options]
 */
export function detectPitchYIN(buffer, sampleRate, options = {}) {
  if (!buffer || buffer.length < 256 || !sampleRate) return null;

  const rmsThreshold = options.rmsThreshold ?? 0.012;
  const yinThreshold = options.yinThreshold ?? 0.15;
  const minFreq = options.minFreq ?? 65;
  const maxFreq = options.maxFreq ?? 2200;
  const tuningOffsetCents = Math.max(-100, Math.min(100, Number(options.tuningOffsetCents ?? 0) || 0));

  let sumSq = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const s = buffer[i];
    sumSq += s * s;
  }
  const rms = Math.sqrt(sumSq / buffer.length);
  if (rms < rmsThreshold) return null;

  const halfLen = Math.floor(buffer.length / 2);
  const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxTau = Math.min(halfLen - 2, Math.floor(sampleRate / minFreq));
  if (maxTau <= minTau) return null;

  const diff = new Float32Array(maxTau + 2);
  const cmnd = new Float32Array(maxTau + 2);
  cmnd[0] = 1;

  let runningSum = 0;
  for (let tau = 1; tau <= maxTau + 1; tau += 1) {
    let deltaSum = 0;
    for (let j = 0; j < halfLen; j += 1) {
      const d = buffer[j] - buffer[j + tau];
      deltaSum += d * d;
    }
    diff[tau] = deltaSum;
    runningSum += deltaSum;
    cmnd[tau] = runningSum > 0 ? (deltaSum * tau) / runningSum : 1;
  }

  let tauEstimate = -1;
  for (let tau = minTau; tau <= maxTau; tau += 1) {
    if (cmnd[tau] < yinThreshold) {
      while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) {
        tau += 1;
      }
      tauEstimate = tau;
      break;
    }
  }

  // Fallback to global minimum if slightly above threshold
  if (tauEstimate === -1) {
    let bestTau = minTau;
    let bestVal = cmnd[minTau];
    for (let tau = minTau + 1; tau <= maxTau; tau += 1) {
      if (cmnd[tau] < bestVal) {
        bestVal = cmnd[tau];
        bestTau = tau;
      }
    }
    if (bestVal > 0.32) return null;
    tauEstimate = bestTau;
  }

  // Weak-fundamental / strong-2nd-harmonic guard:
  // Only check 2*tau when the first dip is shallow (> 0.06), and require 2*tau
  // to be >2.2x deeper so normal notes (where 2*T0 also has low CMND) stay untouched.
  if (cmnd[tauEstimate] > 0.06) {
    const doubleCenter = Math.round(tauEstimate * 2);
    const searchLo = Math.max(minTau, doubleCenter - 2);
    const searchHi = Math.min(maxTau, doubleCenter + 2);
    if (searchLo <= searchHi) {
      let bestDoubleTau = searchLo;
      let bestDoubleVal = cmnd[searchLo];
      for (let tau = searchLo + 1; tau <= searchHi; tau += 1) {
        if (cmnd[tau] < bestDoubleVal) {
          bestDoubleVal = cmnd[tau];
          bestDoubleTau = tau;
        }
      }
      if (bestDoubleVal < cmnd[tauEstimate] * 0.45 && bestDoubleVal < 0.2) {
        tauEstimate = bestDoubleTau;
      }
    }
  }

  // Parabolic interpolation for sub-sample accuracy
  let betterTau = tauEstimate;
  if (tauEstimate > 1 && tauEstimate <= maxTau) {
    const s0 = cmnd[tauEstimate - 1];
    const s1 = cmnd[tauEstimate];
    const s2 = cmnd[tauEstimate + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denom) > 1e-9) {
      betterTau += (s2 - s0) / denom;
    }
  }

  if (betterTau <= 0) return null;
  const frequencyHz = sampleRate / betterTau;
  if (frequencyHz < minFreq || frequencyHz > maxFreq) return null;

  const rawMidiFloat = 69 + 12 * Math.log2(frequencyHz / 440);
  const rawNearest = Math.round(rawMidiFloat);
  const rawCentsOff = Math.round((rawMidiFloat - rawNearest) * 100);

  const midiFloat = rawMidiFloat - tuningOffsetCents / 100;
  const nearestMidi = Math.round(midiFloat);
  const centsOff = Math.round((midiFloat - nearestMidi) * 100);
  const confidence = Math.max(0, Math.min(1, 1 - cmnd[tauEstimate]));

  return {
    frequencyHz,
    rawMidiFloat,
    rawCentsOff,
    midiFloat,
    nearestMidi,
    noteName: midiToNoteName(nearestMidi),
    centsOff,
    confidence,
    rms,
  };
}

export class MicrophoneInputController {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.workletNode = null;
    this.silentGain = null;
    this.worker = null;
    this.stream = null;
    this.source = null;
    this.buffer = null;
    this.active = false;
    this.mode = 'idle'; // 'worklet-worker' | 'worklet-main' | 'analyser' | 'idle'
    this.roomFilterEnabled = false;
    this.rmsThreshold = 0.012;
    this.tuningOffsetCents = 0;
    this.lastError = null;
    this.latestSample = { pitch: null, rms: 0, updatedAt: 0 };
    this.pitchListeners = new Set();
  }

  onPitchSample(cb) {
    this.pitchListeners.add(cb);
    return () => this.pitchListeners.delete(cb);
  }

  setCalibration({ rmsThreshold, tuningOffsetCents } = {}) {
    if (rmsThreshold !== undefined) {
      this.rmsThreshold = Number(rmsThreshold) || 0.012;
    }
    if (tuningOffsetCents !== undefined) {
      this.tuningOffsetCents = Math.max(-100, Math.min(100, Number(tuningOffsetCents) || 0));
    }
    if (this.worker) {
      this.worker.postMessage({
        type: 'config',
        rmsThreshold: this.rmsThreshold,
        tuningOffsetCents: this.tuningOffsetCents,
      });
    }
  }

  async resumeIfSuspended() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {
        // Browser may still require a user activation gesture
      }
    }
  }

  _publishPitchSample(pitch, rms) {
    const sample = {
      pitch: pitch ?? null,
      rms: Number(rms) || 0,
      updatedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    };
    this.latestSample = sample;
    for (const cb of this.pitchListeners) {
      cb(sample);
    }
  }

  async start({ roomFilterEnabled = false, rmsThreshold = 0.012, tuningOffsetCents = 0 } = {}) {
    this.stop();
    this.roomFilterEnabled = Boolean(roomFilterEnabled);
    this.rmsThreshold = rmsThreshold;
    this.tuningOffsetCents = Math.max(-100, Math.min(100, Number(tuningOffsetCents) || 0));
    this.lastError = null;

    if (!navigator.mediaDevices?.getUserMedia) {
      this.lastError = 'Microphone API (getUserMedia) is unavailable in this browser.';
      throw new Error(this.lastError);
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: this.roomFilterEnabled,
          noiseSuppression: this.roomFilterEnabled,
          autoGainControl: false,
        },
      });

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        await Promise.race([
          this.audioContext.resume().catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 120)),
        ]);
      }

      this.source = this.audioContext.createMediaStreamSource(this.stream);

      const startedThreaded = await this._tryStartWorkletPipeline();
      if (!startedThreaded) {
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 4096;
        this.analyser.smoothingTimeConstant = 0;
        this.source.connect(this.analyser);
        this.buffer = new Float32Array(this.analyser.fftSize);
        this.mode = 'analyser';
      }

      this.active = true;
    } catch (err) {
      this.stop();
      this.lastError = err?.message || 'Microphone permission denied or device unavailable.';
      throw err;
    }
  }

  async _tryStartWorkletPipeline() {
    if (!this.audioContext?.audioWorklet || typeof AudioWorkletNode !== 'function') {
      return false;
    }

    try {
      await this.audioContext.audioWorklet.addModule(new URL('./pitchWorkletProcessor.mjs', import.meta.url));
      if (!this.audioContext || !this.source) return false;

      this.workletNode = new AudioWorkletNode(this.audioContext, 'buskero-pitch-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      // Connect through a 0-gain sink to destination so Chromium keeps AudioWorklet process() running
      this.silentGain = this.audioContext.createGain();
      this.silentGain.gain.value = 0;
      this.source.connect(this.workletNode);
      this.workletNode.connect(this.silentGain);
      this.silentGain.connect(this.audioContext.destination);

      if (typeof Worker === 'function' && typeof MessageChannel === 'function') {
        this.worker = new Worker(new URL('./pitchWorker.mjs', import.meta.url), { type: 'module' });
        this.worker.postMessage({
          type: 'config',
          rmsThreshold: this.rmsThreshold,
          tuningOffsetCents: this.tuningOffsetCents,
        });
        this.worker.onmessage = (event) => {
          if (event.data?.type === 'pitchResult') {
            this._publishPitchSample(event.data.pitch, event.data.rms);
          }
        };
        const channel = new MessageChannel();
        this.workletNode.port.postMessage({ type: 'attachWorkerPort', port: channel.port1 }, [channel.port1]);
        this.worker.postMessage({ type: 'attachWorkletPort', port: channel.port2 }, [channel.port2]);
        this.mode = 'worklet-worker';
        return true;
      }

      this.workletNode.port.onmessage = (event) => {
        if (event.data?.type !== 'audioFrame') return;
        const { frame, sampleRate } = event.data;
        let sumSq = 0;
        for (let i = 0; i < frame.length; i += 1) {
          sumSq += frame[i] * frame[i];
        }
        const rms = Math.sqrt(sumSq / Math.max(1, frame.length));
        const pitch = detectPitchYIN(frame, sampleRate, {
          rmsThreshold: this.rmsThreshold,
          tuningOffsetCents: this.tuningOffsetCents,
        });
        this._publishPitchSample(pitch, rms);
      };
      this.mode = 'worklet-main';
      return true;
    } catch {
      this._cleanupWorkletAndWorker();
      return false;
    }
  }

  _cleanupWorkletAndWorker() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch {
        // ignore
      }
      this.workletNode = null;
    }
    if (this.silentGain) {
      try {
        this.silentGain.disconnect();
      } catch {
        // ignore
      }
      this.silentGain = null;
    }
  }

  stop() {
    this.active = false;
    this.mode = 'idle';
    this.latestSample = { pitch: null, rms: 0, updatedAt: 0 };
    this._cleanupWorkletAndWorker();
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        // ignore
      }
      this.source = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyser = null;
    this.buffer = null;
  }

  samplePitch() {
    if (!this.active) {
      return { pitch: null, rms: 0 };
    }
    if (this.mode === 'worklet-worker' || this.mode === 'worklet-main') {
      return {
        pitch: this.latestSample.pitch,
        rms: this.latestSample.rms,
      };
    }
    if (!this.analyser || !this.buffer || !this.audioContext) {
      return { pitch: null, rms: 0 };
    }
    this.analyser.getFloatTimeDomainData(this.buffer);

    let sumSq = 0;
    for (let i = 0; i < this.buffer.length; i += 1) {
      sumSq += this.buffer[i] * this.buffer[i];
    }
    const rms = Math.sqrt(sumSq / this.buffer.length);

    const pitch = detectPitchYIN(this.buffer, this.audioContext.sampleRate, {
      rmsThreshold: this.rmsThreshold,
      tuningOffsetCents: this.tuningOffsetCents,
    });

    this.latestSample = {
      pitch,
      rms,
      updatedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    };
    return { pitch, rms };
  }
}
