# Changelog

## [0.1.0] (2026-11-23)

### Features

* **dsp:** move YIN pitch analysis to a dedicated `AudioWorklet` + `Web Worker` pipeline decoupled from visual FPS (`AnalyserNode` fallback preserved).
* **highway-3d:** add hardware-gated WebGL2/WebGL1 Guitar Hero-style 3D tilted highway (`Highway3DRenderer`) sharing the interchangeable `BaseHighwayRenderer` contract with `Highway2DRenderer` (`HighwayRenderer`), including automatic FPS watchdog fallback and `prefers-reduced-motion` support.
* **storage:** persist uploaded `.mid` / `.midi` files locally in `IndexedDB` (`buskero-library`) and preferences, mic/horn calibration, and personal-best track scores in `localStorage`.
* **mic:** automatically attempt microphone activation when switching to `Violin (Mic)` or `Saxophone (Mic)` (keeping mic active across mic instruments and stopping auto-managed mic on `Piano`).
* **privacy:** add local-only data processing disclosures in the footer and native `#legal-dialog` modal with live storage inspection and one-click local data erasure.
* **oss:** add `Makefile`, `tools/presubmit.mjs`, `tools/build_static.mjs`, `biome.json`, `.crenet-governance.json`, `docs/assets_ledger.json`, `LICENSE`, and GitHub Actions CI workflows.
