const FRAME_SIZE = 4096;
const DEFAULT_HOP_SIZE = 512;

/**
 * Real-time AudioWorkletProcessor that buffers mono microphone audio into a
 * 4096-sample ring buffer and transfers chronological frames every `hopSize`
 * samples over a dedicated MessageChannel directly to the YIN Web Worker.
 */
class BuskeroPitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(FRAME_SIZE);
    this.writeIndex = 0;
    this.filledCount = 0;
    this.samplesSinceEmit = 0;
    this.hopSize = DEFAULT_HOP_SIZE;
    this.workerPort = null;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'attachWorkerPort' && data.port) {
        this.workerPort = data.port;
      } else if (data.type === 'setHopSize') {
        const nextHop = Number(data.hopSize);
        if (Number.isFinite(nextHop) && nextHop >= 128 && nextHop <= FRAME_SIZE) {
          this.hopSize = Math.round(nextHop);
        }
      }
    };
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel || channel.length === 0) {
      return true;
    }

    for (let i = 0; i < channel.length; i += 1) {
      this.ring[this.writeIndex] = channel[i];
      this.writeIndex = (this.writeIndex + 1) % FRAME_SIZE;
      if (this.filledCount < FRAME_SIZE) {
        this.filledCount += 1;
      }
    }

    this.samplesSinceEmit += channel.length;
    if (this.filledCount >= FRAME_SIZE && this.samplesSinceEmit >= this.hopSize) {
      this.samplesSinceEmit %= this.hopSize;
      const frame = new Float32Array(FRAME_SIZE);
      const tailLen = FRAME_SIZE - this.writeIndex;
      frame.set(this.ring.subarray(this.writeIndex), 0);
      if (this.writeIndex > 0) {
        frame.set(this.ring.subarray(0, this.writeIndex), tailLen);
      }

      const targetPort = this.workerPort ?? this.port;
      targetPort.postMessage(
        {
          type: 'audioFrame',
          frame,
          sampleRate,
          audioTime: currentTime,
        },
        [frame.buffer],
      );
    }

    return true;
  }
}

registerProcessor('buskero-pitch-processor', BuskeroPitchProcessor);
