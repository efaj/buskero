# Contributing to Buskero

Thank you for helping improve **Buskero**!

## Core Engineering Principles

1. **Zero Runtime Dependencies:** Keep Buskero 100% dependency-free in the browser (pure `.mjs` modules, native Web Audio, WebGL, Web MIDI, `IndexedDB`, and `localStorage`).
2. **100% Local Privacy:** Never introduce analytics, external CDN scripts, or outbound network requests (`connect-src 'none'` is enforced in `server.mjs` and verified by `tools/presubmit.mjs`).
3. **Preserve DSP & Ergonomic Invariants:** See [AGENTS.md](AGENTS.md) and [.agents/rules/dsp-and-highways.md](.agents/rules/dsp-and-highways.md) before modifying YIN pitch detection, saxophone transposition math, or Strings/Sax/Piano lane mappings.

## Local Development & Presubmit Checks

```bash
make dev       # Run local dev server at http://127.0.0.1:3000
make preview   # Build ./dist and serve preview at http://127.0.0.1:4173
make check     # Run presubmit IP/privacy checks, Biome lint, unit tests, and static build
make test-cov  # Run Node built-in test suite with coverage/lcov.info
```

## Asset Provenance

If you add any static media or binary assets to the repository, log them in `docs/assets_ledger.json` using `governance/scripts/ledger.py` and verify with `make provenance`.
