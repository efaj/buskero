#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');

async function copyTree(srcRel) {
  const src = path.join(ROOT, srcRel);
  const dest = path.join(DIST, srcRel);
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      await copyTree(path.join(srcRel, entry.name));
    }
    return;
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function buildStatic() {
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  for (const target of ['index.html', 'LICENSE', 'styles', 'src']) {
    await copyTree(target);
  }
  console.log('[build] Static bundle ready in ./dist');
}

buildStatic();
