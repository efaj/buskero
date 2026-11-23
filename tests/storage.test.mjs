import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildScoreKey,
  createLocalStore,
  DEFAULT_MIC_SETTINGS,
  DEFAULT_PREFERENCES,
  normalizeFolderPath,
  sanitizePreferences,
} from '../src/storage/localStore.mjs';
import { computeSongHashId, createSongLibraryStore, MAX_MIDI_BYTES } from '../src/storage/songLibraryStore.mjs';

function makeFakeLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('localStore clamps invalid preferences and persists per-song track settings', () => {
  const store = createLocalStore({ storage: makeFakeLocalStorage() });
  assert.deepEqual(store.loadPreferences(), DEFAULT_PREFERENCES);

  const saved = store.savePreferences({
    instrumentId: 'invalid-instrument',
    viewMode: '3d',
    tempoPct: 999,
    tuningOffsetCents: -250,
    rmsThreshold: 0.001,
  });

  assert.equal(saved.instrumentId, 'violin');
  assert.equal(saved.viewMode, '3d');
  assert.equal(saved.tempoPct, 150);
  assert.equal(saved.tuningOffsetCents, -100);
  assert.equal(saved.rmsThreshold, 0.004);

  store.saveSongSettings('custom:abc', { leadTrackIndex: 2, octaveShift: -1, semitoneTranspose: 3 });
  assert.deepEqual(store.getSongSettings('custom:abc'), {
    leadTrackIndex: 2,
    octaveShift: -1,
    semitoneTranspose: 3,
  });
});

test('localStore starts with zero fake hi-scores and isolates personal records by track/instrument/mode', () => {
  const store = createLocalStore({ storage: makeFakeLocalStorage() });
  assert.equal(
    store.getBestScore({ songId: 'ode-to-joy', leadTrackIndex: 0, instrumentId: 'violin', playMode: 'realtime' }),
    null,
  );
  assert.equal(store.getStorageSummary().scoreCount, 0);

  const run1 = store.recordCompletedRun({
    songId: 'ode-to-joy',
    leadTrackIndex: 0,
    instrumentId: 'violin',
    playMode: 'realtime',
    score: 2400,
    accuracy: 92,
    maxCombo: 18,
    tempoPct: 100,
  });
  assert.equal(run1.isNewBest, true);
  assert.equal(run1.record.bestScore, 2400);

  // Lower score does not overwrite personal best, but increments completions
  const run2 = store.recordCompletedRun({
    songId: 'ode-to-joy',
    leadTrackIndex: 0,
    instrumentId: 'violin',
    playMode: 'realtime',
    score: 1800,
    accuracy: 85,
    maxCombo: 10,
    tempoPct: 100,
  });
  assert.equal(run2.isNewBest, false);
  assert.equal(run2.record.bestScore, 2400);
  assert.equal(run2.record.completions, 2);

  // Wait mode is stored separately from Real-Time mode
  assert.equal(
    store.getBestScore({ songId: 'ode-to-joy', leadTrackIndex: 0, instrumentId: 'violin', playMode: 'wait' }),
    null,
  );
  assert.notEqual(
    buildScoreKey({ songId: 'ode-to-joy', leadTrackIndex: 0, instrumentId: 'violin', playMode: 'realtime' }),
    buildScoreKey({ songId: 'ode-to-joy', leadTrackIndex: 0, instrumentId: 'violin', playMode: 'wait' }),
  );

  store.clearAllLocalStore();
  assert.equal(store.getStorageSummary().scoreCount, 0);
  assert.equal(
    store.getBestScore({ songId: 'ode-to-joy', leadTrackIndex: 0, instrumentId: 'violin', playMode: 'realtime' }),
    null,
  );
});

test('sanitizePreferences falls back cleanly on corrupt input', () => {
  const clean = sanitizePreferences(null);
  assert.deepEqual(clean, DEFAULT_PREFERENCES);
});

test('songLibraryStore deduplicates uploaded MIDI bytes by SHA-256 and supports delete/clear', async () => {
  const lib = createSongLibraryStore({ indexedDBRef: null });
  const midiA = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0, 1, 0, 1, 1, 0xe0]);
  const expectedId = await computeSongHashId(midiA);

  const saved1 = await lib.saveCustomSong({
    fileName: 'autumn-leaves.mid',
    title: 'Autumn Leaves',
    midiBytes: midiA,
    bpm: 112,
    durationSec: 42,
    trackCount: 2,
  });
  assert.equal(saved1.id, expectedId);

  // Re-uploading identical bytes deduplicates to the same ID
  const saved2 = await lib.saveCustomSong({
    fileName: 'autumn-leaves-copy.mid',
    title: 'Autumn Leaves Copy',
    midiBytes: midiA,
    bpm: 112,
    durationSec: 42,
    trackCount: 2,
  });
  assert.equal(saved2.id, expectedId);

  const list = await lib.listCustomSongs();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Autumn Leaves Copy');

  const loaded = await lib.getCustomSong(expectedId);
  assert.deepEqual(loaded.midiBytes, midiA);

  await lib.deleteCustomSong(expectedId);
  assert.equal((await lib.listCustomSongs()).length, 0);

  await assert.rejects(() => lib.saveCustomSong({ midiBytes: new Uint8Array(0) }), /empty/i);
  await assert.rejects(() => lib.saveCustomSong({ midiBytes: new Uint8Array(MAX_MIDI_BYTES + 1) }), /10 MB/);
});

test('normalizeFolderPath, collapsedFolders, privacyBannerDismissed, and song folder updates persist cleanly', async () => {
  assert.equal(normalizeFolderPath('  /Jazz//Standards/ '), 'Jazz/Standards');
  assert.equal(normalizeFolderPath('../Built-in Songs'), '');
  assert.equal(normalizeFolderPath('Uploaded Songs/Sub'), '');

  const store = createLocalStore({ storage: makeFakeLocalStorage() });
  const prefs = store.savePreferences({
    customFolders: ['Jazz/Standards', 'Classical', 'Jazz/Standards'],
    collapsedFolders: ['builtin', 'builtin', 'folder:Jazz'],
    lobbySetupCollapsed: true,
    privacyBannerDismissed: true,
  });

  assert.deepEqual(prefs.customFolders, ['Classical', 'Jazz/Standards']);
  assert.deepEqual(prefs.collapsedFolders, ['builtin', 'folder:Jazz']);
  assert.equal(prefs.lobbySetupCollapsed, true);
  assert.equal(prefs.privacyBannerDismissed, true);

  const lib = createSongLibraryStore({ indexedDBRef: null });
  const midi = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 1, 1, 0xe0]);
  const saved = await lib.saveCustomSong({ title: 'Modal Jam', midiBytes: midi, folderPath: 'Jazz/Standards' });
  assert.equal(saved.folderPath, 'Jazz/Standards');

  const moved = await lib.updateCustomSongFolder(saved.id, 'Classical');
  assert.equal(moved.folderPath, 'Classical');

  await lib.clearFolderPrefixFromSongs('Classical');
  const list = await lib.listCustomSongs();
  assert.equal(list[0].folderPath, '');
});

test('localStore isolates micSettings per instrument and migrates legacy flat calibration cleanly', () => {
  const store = createLocalStore({ storage: makeFakeLocalStorage() });
  assert.deepEqual(store.getMicSettings('violin'), DEFAULT_MIC_SETTINGS);
  assert.deepEqual(store.getMicSettings('saxophone'), DEFAULT_MIC_SETTINGS);

  store.saveMicSettings('saxophone', {
    tuningOffsetCents: -34,
    rmsThreshold: 0.018,
    roomFilterEnabled: true,
  });

  assert.deepEqual(store.getMicSettings('saxophone'), {
    tuningOffsetCents: -34,
    rmsThreshold: 0.018,
    roomFilterEnabled: true,
  });
  assert.deepEqual(store.getMicSettings('violin'), DEFAULT_MIC_SETTINGS);

  // Legacy flat preferences migrate onto the previously active instrument profile
  const migrated = sanitizePreferences({
    instrumentId: 'saxophone',
    tuningOffsetCents: -28,
    rmsThreshold: 0.016,
  });
  assert.equal(migrated.micSettings.saxophone.tuningOffsetCents, -28);
  assert.equal(migrated.micSettings.saxophone.rmsThreshold, 0.016);
  assert.deepEqual(migrated.micSettings.violin, DEFAULT_MIC_SETTINGS);
  assert.equal(migrated.tuningOffsetCents, -28);
});
