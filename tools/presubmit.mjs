#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const ALLOWED_LICENSES = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'Unlicense']);

const NETWORK_EXFIL_PATTERNS = [
  { name: 'fetch()', regex: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', regex: /\bXMLHttpRequest\b/ },
  { name: 'navigator.sendBeacon', regex: /\bsendBeacon\b/ },
  { name: 'WebSocket', regex: /\bnew\s+WebSocket\b/ },
  { name: 'EventSource', regex: /\bnew\s+EventSource\b/ },
];

function listFilesRecursive(dirRel, extFilter = null) {
  const startDir = path.join(ROOT, dirRel);
  if (!fs.existsSync(startDir)) return [];
  const results = [];
  const walk = (absDir) => {
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const full = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (!extFilter || extFilter.some((ext) => entry.name.endsWith(ext))) {
        results.push(full);
      }
    }
  };
  walk(startDir);
  return results;
}

export function runPresubmitAudit() {
  const errors = [];

  // 1. License & zero-runtime-dependency check
  const licensePath = path.join(ROOT, 'LICENSE');
  if (!fs.existsSync(licensePath)) {
    errors.push('Missing root LICENSE file.');
  } else {
    const licenseText = fs.readFileSync(licensePath, 'utf8');
    if (!licenseText.includes('MIT License')) {
      errors.push('Root LICENSE must declare MIT License.');
    }
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  if (!ALLOWED_LICENSES.has(pkg.license)) {
    errors.push(`package.json license "${pkg.license}" is not in allowed permissive OSI licenses.`);
  }
  const runtimeDeps = Object.keys(pkg.dependencies ?? {});
  if (runtimeDeps.length > 0) {
    errors.push(`Zero-dependency invariant violated: dependencies found (${runtimeDeps.join(', ')})`);
  }

  // 2. Syntax check & local ESM import / worker URL verification
  const mjsFiles = [
    path.join(ROOT, 'server.mjs'),
    ...listFilesRecursive('src', ['.mjs']),
    ...listFilesRecursive('tests', ['.mjs']),
    ...listFilesRecursive('tools', ['.mjs']),
  ].filter((f) => fs.existsSync(f));

  const importRegex = /(?:import|export)\s+(?:[^'"]*from\s+)?['"](\.[^'"]+)['"]/g;
  const workerUrlRegex = /new\s+URL\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;

  for (const absFile of mjsFiles) {
    const rel = path.relative(ROOT, absFile);
    try {
      execFileSync(process.execPath, ['--check', absFile], { stdio: 'pipe' });
    } catch (err) {
      errors.push(`Syntax check failed for ${rel}: ${err.stderr?.toString() || err.message}`);
    }

    const src = fs.readFileSync(absFile, 'utf8');
    for (const regex of [importRegex, workerUrlRegex]) {
      regex.lastIndex = 0;
      for (const match of src.matchAll(regex)) {
        const targetAbs = path.resolve(path.dirname(absFile), match[1]);
        if (!fs.existsSync(targetAbs)) {
          errors.push(`Broken relative module/URL reference in ${rel}: "${match[1]}"`);
        }
      }
    }
  }

  // 3. Zero-exfiltration privacy audit across browser runtime & HTML
  for (const absFile of listFilesRecursive('src', ['.mjs'])) {
    const rel = path.relative(ROOT, absFile);
    const content = fs.readFileSync(absFile, 'utf8');
    for (const pat of NETWORK_EXFIL_PATTERNS) {
      if (pat.regex.test(content)) {
        errors.push(`Forbidden outbound network primitive (${pat.name}) detected in ${rel}`);
      }
    }
  }

  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (/<(?:script|link)[^>]+(?:src|href)\s*=\s*['"]https?:\/\//i.test(indexHtml)) {
    errors.push('index.html must not load external http(s) scripts or stylesheets.');
  }

  // 4. AGENTS.md UI, CSS & Accessibility invariants
  const css = fs.readFileSync(path.join(ROOT, 'styles/main.css'), 'utf8');
  if (!css.trimStart().startsWith('@layer base, theme, layout, components, utilities;')) {
    errors.push('styles/main.css must declare @layer base, theme, layout, components, utilities; upfront.');
  }
  if (/^\s*\*\s*\{/m.test(css)) {
    errors.push('styles/main.css must not use universal * selector resets; use :where(...).');
  }
  if (/\bin\s+oklch\b/.test(css)) {
    errors.push('styles/main.css must use `in oklab` instead of `in oklch` for color mixing.');
  }
  if (/^\s*dialog\s*\{[^}]*\bdisplay\s*:/ms.test(css)) {
    errors.push('styles/main.css must not set unconditional display on dialog; scope to dialog[open].');
  }
  if (/\brole\s*=\s*['"]dialog['"]|\baria-modal\b/i.test(indexHtml)) {
    errors.push('index.html must not add role="dialog" or aria-modal on native <dialog> elements.');
  }

  // 5. Asset provenance ledger schema & verification
  const ledgerPath = path.join(ROOT, 'docs/assets_ledger.json');
  if (!fs.existsSync(ledgerPath)) {
    errors.push('Missing docs/assets_ledger.json.');
  } else {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    if (ledger.version !== 2 || typeof ledger.assets !== 'object' || ledger.assets === null) {
      errors.push('docs/assets_ledger.json must have version: 2 and an assets object.');
    }
  }

  const ledgerScript = path.join(ROOT, 'governance/scripts/ledger.py');
  if (fs.existsSync(ledgerScript)) {
    try {
      execFileSync('python3', [ledgerScript, '--repo', ROOT, 'verify'], { stdio: 'pipe' });
    } catch (err) {
      errors.push(
        `Asset provenance ledger verify failed: ${err.stdout?.toString() || err.stderr?.toString() || err.message}`,
      );
    }
  }

  return {
    passed: errors.length === 0,
    checkedFiles: mjsFiles.length,
    errors,
  };
}

if (process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`) {
  const res = runPresubmitAudit();
  if (!res.passed) {
    console.error('[presubmit] FAILED:');
    for (const err of res.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log(
    `[presubmit] PASSED (${res.checkedFiles} ES modules, zero-dep, zero-exfiltration, UI invariants, and asset ledger verified).`,
  );
}
