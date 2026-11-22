import { detectPitchYIN } from './pitchDetector.mjs';

let rmsThreshold = 0.012;
let tuningOffsetCents = 0;
let workletPort = null;

function computeRms(buffer) {
  let sumSq = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    sumSq += buffer[i] * buffer[i];
  }
  return Math.sqrt(sumSq / Math.max(1, buffer.length));
}

function handleFrame(payload) {
  const { frame, sampleRate, audioTime } = payload ?? {};
  if (!frame || !sampleRate) return;

  const rms = computeRms(frame);
  const pitch = detectPitchYIN(frame, sampleRate, {
    rmsThreshold,
    tuningOffsetCents,
  });

  self.postMessage({
    type: 'pitchResult',
    pitch,
    rms,
    audioTime,
  });
}

self.onmessage = (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'config') {
    if (data.rmsThreshold !== undefined) {
      rmsThreshold = Number(data.rmsThreshold) || 0.012;
    }
    if (data.tuningOffsetCents !== undefined) {
      tuningOffsetCents = Math.max(-100, Math.min(100, Number(data.tuningOffsetCents) || 0));
    }
    return;
  }

  if (data.type === 'attachWorkletPort' && data.port) {
    if (workletPort) {
      workletPort.onmessage = null;
      workletPort.close?.();
    }
    workletPort = data.port;
    workletPort.onmessage = (portEvent) => {
      if (portEvent.data?.type === 'audioFrame') {
        handleFrame(portEvent.data);
      }
    };
    return;
  }

  if (data.type === 'audioFrame') {
    handleFrame(data);
  }
};
