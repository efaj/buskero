# Security & Privacy Policy

## Local-Only Execution Model

Buskero is designed as a 100% client-side, local-first web application:

- All audio pitch detection (`AudioWorklet` + `Web Worker`), MIDI parsing, synthesis, and 2D/3D rendering run exclusively in the user's browser.
- The local static server (`server.mjs`) enforces `Content-Security-Policy: ... connect-src 'none'`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`.
- Automated presubmits (`tools/presubmit.mjs`) fail if any outbound network API (`fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`) or third-party `<script>`/`<link>` is introduced.

## Reporting a Vulnerability

Please report security or privacy concerns privately via GitHub Security Advisories or by contacting the maintainers before public disclosure.
