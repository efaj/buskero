---
name: DSP, Acoustics & Highway Invariants
description: Protects YIN pitch detection, saxophone transposition math, microphone defaults, and flipped highway ergonomics.
---

# DSP, Acoustics & Highway Invariants

## 1. YIN Sub-Harmonic Trap (`src/audio/pitchDetector.mjs`)
- For any periodic note of period `T0`, `2 * T0` is **also** periodic (`cmnd[2 * T0] ≈ cmnd[T0]`).
- **NEVER** unconditionally prefer `2 * tauEstimate` whenever `cmnd[2 * tau]` is low, or clean Violin notes will drop an octave (`A4 → A3`).
- Only switch to `2 * tauEstimate` when **both** conditions hold:
  1. The initial dip is shallow (`cmnd[tauEstimate] > 0.06`, indicating an imperfect half-period from a weak fundamental / dominant 2nd harmonic on low conical-bore sax notes), **and**
  2. A local minimum around `doubleCenter = Math.round(tauEstimate * 2)` (`±2` samples, `<= maxTau`) is **more than 2.2× deeper** (`cmnd[bestDoubleTau] < cmnd[tauEstimate] * 0.45 && cmnd[bestDoubleTau] < 0.20`).

## 2. Saxophone Concert vs. Written Pitch Invariant (`src/instruments/saxophone.mjs`)
- `targetMidi` (used by `GameEngine` microphone matching and `SynthEngine` audio playback) **MUST** remain in **Concert pitch**, because an `E♭` Alto or `B♭` Tenor sax acoustically emits Concert frequency into the microphone.
- `writtenMidi = targetMidi + writtenOffset` (`+9` Alto `E♭`, `+14` Tenor `B♭`, `+2` Soprano `B♭`, `0` Concert `C`) is used **exclusively** for key-stack fingering lookup (`58..90`) and written labels (`midiToSaxNoteName`, preferring `Eb`/`Bb` flats to match pinky/side key labels).
- Never add `writtenOffset` to `targetMidi`.

## 3. Raw Instrument Microphone Defaults (`src/audio/pitchDetector.mjs` & `src/main.mjs`)
- Keep `echoCancellation: false`, `noiseSuppression: false`, and `autoGainControl: false` by default (`roomFilterEnabled = false`) so browser speech DSP does not gate sustained bowed strings or long sax tones.
- Auto-mute `leadVolume` (`0%`) when microphone input is enabled (unless manually overridden by the user) so speaker output does not bleed into the microphone and self-grade notes.

## 4. Flipped Spatial Highway Geometry (`src/instruments/` & `src/ui/highwayRenderer.mjs`)
- Keep horizontal lanes mapped to **left-to-right physical finger ergonomics**:
  - **Strings:** 7 chromatic 1st-position finger lanes (`L1, 1, L2, H2, 3, H3/L4, 4`) + full-width Open-string bars (`G/D/A/E`, `C/G/D/A/E`, or `C/G/D/A`) distinguished by shape (`■/●/◆/▲/★`) + color + letter badge, with bottom 3D string rails aligned with each incoming block row and top Intonation Gauge.
  - **Saxophone:** 11-lane laid-down LH/RH key stack (`OCT..L-PK | R1..R-PK`) with full-width hollow `OPEN C#5` bar.
  - **Piano:** Octave-padded proportional white/black keyboard (`minKey..maxKey`) with melodic finger hints (`1–5`).
