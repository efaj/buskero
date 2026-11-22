import { midiToNoteName } from '../midi/midiParser.mjs';

/**
 * Pure YIN monophonic pitch detector for Violin, Saxophone, and single-note Piano mic input.
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
