import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSongTree } from '../src/ui/songTreeModel.mjs';

const BUILTIN = [
  { id: 'ode-to-joy', title: 'Ode to Joy (Beethoven)', subtitle: 'D Major', parsed: { bpm: 108 } },
  { id: 'twinkle-star', title: 'Twinkle Star', subtitle: 'A Major', parsed: { bpm: 96 } },
];

const CUSTOM = [
  {
    id: 'custom:1',
    title: 'Autumn Leaves',
    fileName: 'autumn.mid',
    bpm: 120,
    trackCount: 2,
    folderPath: 'Jazz/Standards',
  },
  { id: 'custom:2', title: 'Blue Bossa', fileName: 'bossa.mid', bpm: 140, trackCount: 3, folderPath: 'Jazz' },
  { id: 'custom:3', title: 'Loose Sketch', fileName: 'sketch.mid', bpm: 100, trackCount: 1, folderPath: '' },
];

test('buildSongTree groups built-in songs under Built-in Songs and builds nested user folders', () => {
  const tree = buildSongTree({
    builtinSongs: BUILTIN,
    customSongs: CUSTOM,
    customFolders: ['Classical', 'Jazz/Standards'],
    collapsedFolders: ['builtin'],
    filterQuery: '',
  });

  const keys = tree.roots.map((r) => r.key);
  assert.ok(keys.includes('uploaded'));
  assert.ok(keys.includes('folder:Classical'));
  assert.ok(keys.includes('folder:Jazz'));
  assert.ok(keys.includes('builtin'));

  const builtin = tree.roots.find((r) => r.key === 'builtin');
  assert.equal(builtin.label, 'Built-in Songs');
  assert.equal(builtin.totalSongCount, 2);
  assert.equal(builtin.isOpen, false);

  const jazz = tree.roots.find((r) => r.key === 'folder:Jazz');
  assert.equal(jazz.isOpen, true);
  assert.equal(jazz.totalSongCount, 2);
  assert.equal(jazz.children.length, 1);
  assert.equal(jazz.children[0].key, 'folder:Jazz/Standards');
  assert.equal(jazz.children[0].songs[0].title, 'Autumn Leaves');

  const classical = tree.roots.find((r) => r.key === 'folder:Classical');
  assert.equal(classical.totalSongCount, 0);
});

test('buildSongTree filters songs/folders non-destructively and auto-expands matching branches', () => {
  const tree = buildSongTree({
    builtinSongs: BUILTIN,
    customSongs: CUSTOM,
    customFolders: ['Classical'],
    collapsedFolders: ['builtin', 'folder:Jazz', 'folder:Jazz/Standards'],
    filterQuery: 'autumn',
  });

  assert.equal(tree.isFiltering, true);
  assert.equal(tree.totalMatches, 1);
  assert.equal(tree.roots.length, 1);
  assert.equal(tree.roots[0].key, 'folder:Jazz');
  assert.equal(tree.roots[0].isOpen, true);
  assert.equal(tree.roots[0].children[0].isOpen, true);
});
