// Computer keyboard layout (1.5 octaves starting at C4 = 60, shiftable by octave)
const KEY_TO_SEMITONE = {
  KeyA: 0, // C
  KeyW: 1, // C#
  KeyS: 2, // D
  KeyE: 3, // D#
  KeyD: 4, // E
  KeyF: 5, // F
  KeyT: 6, // F#
  KeyG: 7, // G
  KeyY: 8, // G#
  KeyH: 9, // A
  KeyU: 10, // A#
  KeyJ: 11, // B
  KeyK: 12, // C5
  KeyO: 13, // C#5
  KeyL: 14, // D5
  KeyP: 15, // D#5
  Semicolon: 16, // E5
};

export class MidiInputController {
  constructor() {
    this.midiAccess = null;
    this.supported = typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
    this.devices = [];
    this.activeKeys = new Set();
    this.keyboardOctaveBase = 60; // C4
    this.listeners = new Set();
    this.deviceListeners = new Set();
    this.lastError = null;
    this._boundKeyDown = this._onKeyDown.bind(this);
    this._boundKeyUp = this._onKeyUp.bind(this);
    this._keyboardBound = false;
  }

  onNoteEvent(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onDevicesChange(cb) {
    this.deviceListeners.add(cb);
    return () => this.deviceListeners.delete(cb);
  }

  _emitNote(type, midi, velocity = 100, source = 'midi') {
    for (const cb of this.listeners) {
      cb({ type, midi, velocity, source, activeKeys: new Set(this.activeKeys) });
    }
  }

  _emitDevices() {
    const snapshot = this.getStatus();
    for (const cb of this.deviceListeners) {
      cb(snapshot);
    }
  }

  getStatus() {
    return {
      supported: this.supported,
      connected: Boolean(this.midiAccess),
      devices: [...this.devices],
      activeKeys: new Set(this.activeKeys),
      lastError: this.lastError,
    };
  }

  async connect() {
    if (!this.supported) {
      this.lastError =
        'Web MIDI is not supported in this browser (use Chrome, Edge, or Firefox, or use Mic / On-Screen Keys).';
      this._emitDevices();
      return this.getStatus();
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this._refreshInputs();
      this.midiAccess.onstatechange = () => this._refreshInputs();
      this.lastError = null;
    } catch (err) {
      this.lastError = err?.message || 'Web MIDI access was denied.';
    }

    this._emitDevices();
    return this.getStatus();
  }

  _refreshInputs() {
    if (!this.midiAccess) return;
    const devices = [];
    for (const input of this.midiAccess.inputs.values()) {
      devices.push({ id: input.id, name: input.name || 'MIDI Keyboard', manufacturer: input.manufacturer || '' });
      input.onmidimessage = (event) => this._handleMidiMessage(event);
    }
    this.devices = devices;
    this._emitDevices();
  }

  _handleMidiMessage(event) {
    const data = event.data;
    if (!data || data.length < 2) return;
    const status = data[0] & 0xf0;
    const midi = data[1];
    const velocity = data.length > 2 ? data[2] : 0;

    if (status === 0x90 && velocity > 0) {
      this.pressVirtualKey(midi, velocity, 'midi');
    } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
      this.releaseVirtualKey(midi, 'midi');
    }
  }

  pressVirtualKey(midi, velocity = 100, source = 'virtual') {
    const rounded = Math.round(midi);
    if (!this.activeKeys.has(rounded)) {
      this.activeKeys.add(rounded);
      this._emitNote('noteOn', rounded, velocity, source);
    }
  }

  releaseVirtualKey(midi, source = 'virtual') {
    const rounded = Math.round(midi);
    if (this.activeKeys.has(rounded)) {
      this.activeKeys.delete(rounded);
      this._emitNote('noteOff', rounded, 0, source);
    }
  }

  clearActiveKeys() {
    for (const k of [...this.activeKeys]) {
      this.releaseVirtualKey(k, 'reset');
    }
  }

  enableKeyboardFallback() {
    if (this._keyboardBound || typeof window === 'undefined') return;
    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('keyup', this._boundKeyUp);
    this._keyboardBound = true;
  }

  disableKeyboardFallback() {
    if (!this._keyboardBound || typeof window === 'undefined') return;
    window.removeEventListener('keydown', this._boundKeyDown);
    window.removeEventListener('keyup', this._boundKeyUp);
    this._keyboardBound = false;
  }

  _onKeyDown(event) {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    if (event.code === 'KeyZ') {
      this.keyboardOctaveBase = Math.max(24, this.keyboardOctaveBase - 12);
      return;
    }
    if (event.code === 'KeyX') {
      this.keyboardOctaveBase = Math.min(84, this.keyboardOctaveBase + 12);
      return;
    }
    const semitone = KEY_TO_SEMITONE[event.code];
    if (semitone !== undefined) {
      this.pressVirtualKey(this.keyboardOctaveBase + semitone, 96, 'keyboard');
    }
  }

  _onKeyUp(event) {
    const semitone = KEY_TO_SEMITONE[event.code];
    if (semitone !== undefined) {
      this.releaseVirtualKey(this.keyboardOctaveBase + semitone, 'keyboard');
    }
  }
}
