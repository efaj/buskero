# Buskero: Arcade loop trainer for sax, violin & MIDI keys
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fefaj%2Fbuskero.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2Fefaj%2Fbuskero?ref=badge_shield)


**Buskero** is a 100% local, zero-dependency, browser-based arcade practice trainer for real **Saxophone**, **Violin**, and **Piano / MIDI Keys**. Drop in any Standard MIDI (`.mid` / `.midi`) file (saved locally in `IndexedDB`), switch between **3D Stage** (hardware WebGL Guitar Hero-style perspective) and **2D Flat** views, loop tricky phrases with `Set A` / `Set B`, slow down tempo without changing pitch, and get instant **AudioWorklet + Web Worker YIN Pitch** or **Web MIDI** feedback on flipped, finger-first highways.

---

## Key Features

- **Zero Runtime Dependencies & 100% Local Privacy:** Pure ES modules (`.mjs`), native Web Audio (`AudioWorklet` + `Web Worker`), WebGL2/WebGL1, Web MIDI, `IndexedDB`, `localStorage`, and a tiny Node.js static server (`server.mjs`) enforcing `connect-src 'none'`. Nothing leaves your device.
- **Hardware-Gated 3D Highway + Interchangeable 2D Mode:** Both `Highway3DRenderer` and `Highway2DRenderer` implement the same `BaseHighwayRenderer` contract. When hardware WebGL is present (and `prefers-reduced-motion: reduce` is off), Buskero renders an extruded 3D Guitar Hero fretboard/keybed with automatic FPS fallback to 2D while keeping YIN pitch polling decoupled in a dedicated Worker thread.
- **Browser-Local Song Library & Personal Best Tracking:** Uploaded `.mid` / `.midi` songs persist in `IndexedDB` (`buskero-library`) with SHA-256 deduplication; instrument choice, mic/horn calibration, track transpose settings, and personal-only track best scores persist in `localStorage` (with one-click erasure inside **Privacy & Legal**).
- **Auto-Microphone on Mic Instruments:** Switching to **Violin (Mic)** or **Saxophone (Mic)** automatically attempts to activate the microphone and keeps it live when switching between them.
- **Flipped Finger-First Highways:**
  - **Saxophone:** Laid-down 11-lane Left Hand / Right Hand key stack (`OCT | PALM | L1 | L2 | L3 | L-PK` · `R1 | R2 | R3 | SIDE | R-PK`) with `Alto (E♭)`, `Tenor (B♭)`, `Soprano (B♭)`, and `Concert (C)` transposition, `Auto-Fit Octave`, and **`Calibrate Horn (Play L1 'B')`**.
  - **Violin:** Flipped 8-lane chromatic fingerboard (`Open | L1 | 1 | L2 | H2 | 3 | H3/L4 | 4`) with `G / D / A / E` strings encoded by distinct geometric shapes + letters, optional 4th-finger preference, and a live `-50¢ .. +50¢` intonation gauge.
  - **Piano / MIDI Keys:** Dynamic octave-framed proportional keyboard (clickable in both 2D and 3D!) with melodic finger hints (`1–5`), hardware **Web MIDI** support, plus computer keyboard (`A–K`, `Z`/`X` octave shift) fallback.

---

## Quick Start

### Prerequisites

- **Node.js 20+** (tested on Node `v26.6.0`)
- **Modern Browser:** Chrome, Edge, or Firefox on `http://127.0.0.1:3000` (Web MIDI requires Chromium or Firefox; Safari/iOS blocks Web MIDI, though Microphone and on-screen/computer keys work across modern browsers).

### Commands (`Makefile` & `npm`)

```bash
make dev       # Start local dev server at http://127.0.0.1:3000
make build     # Assemble clean static bundle in ./dist
make preview   # Build ./dist and serve preview at http://127.0.0.1:4173
make test      # Run Node built-in unit/integration tests
make test-cov  # Run unit tests and emit coverage/lcov.info
make check     # Run presubmit IP/privacy audit, Biome lint, unit tests, and build
make provenance # Verify docs/assets_ledger.json against repository assets
```

---

## Instrument Guides & Saxophone Calibration

### Saxophone (Laid-Down 11-Lane Key Stack)

Instead of rotating a vertical fingering chart 90° in your head, Buskero lays your horn horizontally across the highway:

- **Left Hand:** `OCT` (thumb octave key) · `PALM` (`D / Eb / F`) · `L1` (`B`) · `L2` (`A`) · `L3` (`G`) · `L-PK` (`G# / C# / B / Bb` table)
- **Right Hand:** `R1` (`F`) · `R2` (`E`) · `R3` (`D`) · `SIDE` (`Ta / Tc / Te / Tf#`) · `R-PK` (`Eb / C` rollers)
- **Open `C#5`:** Appears as a full-width purple hollow bar across `L1..R3` (`OPEN C#5`) so an all-keys-open fingering is unmistakable.

#### Why Saxophone Pitch Can Feel "Off" — and How to Calibrate It

1. **Transposition Mismatch (`Alto E♭` vs `Tenor B♭` vs `Concert C`):**
   - Your sax fingers **Written** notes (`Eb5`, `Bb4`, `C#5`), while your microphone physically hears **Concert** pitch.
   - Click **`Calibrate Horn (Play L1 'B')`** in **Instrument Setup**, then hold a steady written **B4** (Left Index `L1` only). Buskero listens for ~1 second and auto-detects `Alto (E♭)`, `Tenor (B♭)`, `Soprano (B♭)`, or `Concert (C)`.
2. **Mouthpiece Cork / Cold Horn Tuning Offset (`-100¢` to `+100¢`):**
   - `Calibrate Horn` automatically applies your measured cents offset (up to `±60¢`), and you can fine-tune it anytime in **Audio / MIDI Setup → Tuning Offset** while watching the live `-50¢ Flat .. 0 .. +50¢ Sharp` gauge below the highway.
3. **Weak Low-Register Fundamental:**
   - Buskero uses a `4096`-sample YIN window plus a weak-fundamental octave guard inside the off-main-thread Web Worker so low reed notes lock onto the true fundamental without lagging the UI.
4. **Speaker Bleed:**
   - Use **headphones** when Microphone mode is active, or leave **Lead Guide Volume** at `0%` (Buskero mutes the lead guide automatically when you enable the mic).

### Violin (Flipped 8-Lane Chromatic Fingerboard)

- **Horizontal Lanes = Finger Position (Nut → Bridge):** `Open (0)` · `L1 (+1)` · `1 (+2)` · `L2 (+3)` · `H2 (+4)` · `3 (+5)` · `H3/L4 (+6)` · `4 (+7)`.
- **String Identity (Shape + Color + Letter):** `●` **G** (Sky Blue) · `◆` **D** (Amber) · `▲` **A** (Rose) · `⬡` **E** (Emerald).

### Piano / MIDI Keys

- Connect a USB or Bluetooth MIDI keyboard and click **Connect MIDI**.
- Click/tap the bottom piano keys (2D or 3D tilted keybed) or use your computer keyboard (`A W S E D F T G Y H U J K`, `Z`/`X` to shift octaves).

### Non-Goals (Out of Roadmap)

- **Guitar is explicitly out of any roadmaps:** Guitar is a polyphonic instrument whose chords and multi-string acoustics cannot be reliably tracked by Buskero's monophonic YIN microphone pitch detector. Only the Keyboard / Piano gets polyphonic support because it uses discrete **Web MIDI** input rather than microphone pitch detection.

---

## Architecture

```text
buskero/
├── index.html                        # Semantic app shell & native <dialog> modals
├── Makefile                          # Dev, preview, build, test, lint, and presubmit targets
├── biome.json                        # Biome formatter & linter rules
├── package.json                      # Zero-dependency scripts
├── server.mjs                        # Local Node.js static server with strict CSP & privacy headers
├── styles/main.css                   # @layer CSS architecture with light/dark tokens
├── tools/
│   ├── build_static.mjs              # Static ./dist packager
│   └── presubmit.mjs                 # Syntax, zero-dep, zero-exfiltration, UI & ledger checks
├── src/
│   ├── main.mjs                      # App state, auto-mic, decoupled 60Hz sim + RAF render loops
│   ├── audio/
│   │   ├── midiInput.mjs             # Web MIDI + keyboard + pointer key controller
│   │   ├── pitchDetector.mjs         # YIN DSP + threaded AudioWorklet/Worker controller
│   │   ├── pitchWorkletProcessor.mjs # 4096-sample ring buffer AudioWorkletProcessor
│   │   ├── pitchWorker.mjs           # Off-main-thread YIN Web Worker
│   │   └── synthEngine.mjs           # Lookahead Web Audio accompaniment & guide synth
│   ├── game/
│   │   └── gameEngine.mjs            # Real-Time, Wait Mode, A-B Loop & score qualification
│   ├── instruments/                  # Violin, Saxophone & Piano mappings
│   ├── midi/                         # Binary SMF parser/writer & 5 built-in practice songs
│   ├── storage/
│   │   ├── localStore.mjs            # Versioned localStorage preferences & personal-only hi-scores
│   │   └── songLibraryStore.mjs      # IndexedDB custom MIDI store with SHA-256 deduplication
│   └── ui/
│       ├── baseHighwayRenderer.mjs   # Shared BaseHighwayRenderer interface & HUD helpers
│       ├── gpuCapability.mjs         # Hardware WebGL probe & FPS watchdog
│       ├── perspective3d.mjs         # Tilted 3D deck projection & analytical unprojection
│       ├── highwayRenderer.mjs       # Interchangeable 2D Canvas renderer
│       └── highway3dRenderer.mjs     # Interchangeable WebGL 3D Guitar Hero renderer
└── tests/                            # Node built-in unit & integration test suites
```

---

## License

Buskero is open-source software licensed under the [MIT License](LICENSE) and is provided **"AS IS"**, without warranty of any kind, express or implied.


[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fefaj%2Fbuskero.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2Fefaj%2Fbuskero?ref=badge_large)