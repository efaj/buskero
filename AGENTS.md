# Buskero — Agent Guidelines

**Buskero: Arcade loop trainer for sax, strings & MIDI keys**

## Project Overview & Zero-Dependency Architecture

- **Zero external npm dependencies & no bundler:** Pure browser ES modules (`.mjs`), native `node:http` static server (`server.mjs` on `127.0.0.1:3000`), Web Audio API, Web MIDI API, and Node's built-in test runner (`node --test tests/*.test.mjs`).
- **Commands:**
  - `npm start` — Starts `node server.mjs` at `http://127.0.0.1:3000`.
  - `npm test` — Runs all unit/integration tests under `tests/*.test.mjs`.
- **Constraint:** Do not introduce external npm packages, build steps, or frameworks unless explicitly requested by the user.

## Hardware Verification Status (Hand-Off Context)

- **Strings (Mic):** Tested on a real acoustic violin — user confirmed *"mic was perfect, nothing to add."* Do **not** alter YIN sensitivity or Strings pitch matching behavior unless requested; preset layouts cover 4-string Violin (`G·D·A·E`), 5-string Violin (`C·G·D·A·E`), and Viola (`C·G·D·A`).
- **Saxophone (Mic):** Initial horn test felt *"off"*; upgraded with `4096`-sample FFT, gated weak-fundamental `2*tau` harmonic guard, `Calibrate Horn (Play L1 'B')`, `tuningOffsetCents` (`-100¢..+100¢`), sax-native flat enharmonics (`Eb`/`Bb`), Dual Written+Concert pitch readout, and the Saxophone Intonation Gauge. **Pending re-test on physical saxophone** — if still off, inspect the live calibration readout (`Concert` vs. `Written` pitch and `rawCentsOff`) first.
- **Piano (Web MIDI):** Verified with virtual/computer keys (`A–K`, `Z`/`X` octave shift); **pending test with physical USB/Bluetooth MIDI keyboard**. Web MIDI requires Chrome, Edge, or Firefox on `localhost` or `https://` (Safari/iOS WebKit blocks `navigator.requestMIDIAccess`).

## UI, CSS & Accessibility Standards

- **CSS Layers & Resets (`styles/main.css`):** Maintain `@layer base, theme, layout, components, utilities;` upfront. Never use universal `*` resets (scope resets to `:where(...)` element lists). Keep `:not(:disabled)` on `:hover` rules.
- **Light/Dark Mode & Forms:** Keep `<meta name="color-scheme" content="light dark">` in `index.html`, `color-scheme: light dark;` on `:root` with `prefers-color-scheme` and `light-dark()` tokens, and preserve the `@supports not (accent-color: ...)` fallbacks for range and progress controls.
- **Native Dialogs:** Open `<dialog closedby="any">` via `.showModal()`. Never add `role="dialog"`, `aria-modal`, or unconditional `display` on `dialog` (scope layout rules to `dialog[open]`), keep `overscroll-behavior: contain` on `dialog:modal` and `dialog::backdrop`, and clear `dialog.returnValue = ''` on `close`.
- **Accessible Color:** Never convey string identity or hit/miss state by color alone (always pair color + geometric shape `■/●/◆/▲/⬡` + letter `C/G/D/A/E`). When mixing tints in CSS, use `in oklab` (never `in oklch` with neutrals).

## Detailed DSP & Highway Invariants

- @[dsp-and-highways](.agents/rules/dsp-and-highways.md)

<!-- Crenet Governance Rules -->
## Studio Governance Standards
This project inherits global Crenet Games standards from the `governance` submodule:
- @[agent-execution-speed](.agents/rules/governance/agent-execution-speed.md)
- @[code-standards](.agents/rules/governance/code-standards.md)
<!-- /Crenet Governance Rules -->
