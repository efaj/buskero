export const PREFS_STORAGE_KEY = 'buskero:prefs:v1';
export const SCORES_STORAGE_KEY = 'buskero:scores:v1';

const VALID_INSTRUMENTS = new Set(['strings', 'saxophone', 'piano']);
const VALID_VIEW_MODES = new Set(['auto', '2d', '3d']);
const VALID_PLAY_MODES = new Set(['realtime', 'wait']);
const VALID_STRINGS_PRESETS = new Set(['violin_4', 'violin_5', 'viola_4']);
const VALID_SAX_TRANSPOSITIONS = new Set(['alto_eb', 'tenor_bb', 'soprano_bb', 'concert_c']);
const RESERVED_FOLDER_NAMES = new Set(['built-in songs', 'built-in', 'uploaded songs', 'uploaded']);

function normalizeInstrumentId(raw) {
  if (raw === 'violin') return 'strings';
  return VALID_INSTRUMENTS.has(raw) ? raw : DEFAULT_PREFERENCES.instrumentId;
}

export function normalizeFolderPath(raw) {
  if (typeof raw !== 'string') return '';
  const segments = raw
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '.' && s !== '..')
    .slice(0, 4)
    .map((s) => s.slice(0, 48));
  if (segments.length === 0) return '';
  if (RESERVED_FOLDER_NAMES.has(segments[0].toLowerCase())) {
    return '';
  }
  return segments.join('/');
}

export const DEFAULT_MIC_SETTINGS = Object.freeze({
  rmsThreshold: 0.012,
  tuningOffsetCents: 0,
  roomFilterEnabled: false,
});

export const DEFAULT_PREFERENCES = Object.freeze({
  instrumentId: 'strings',
  viewMode: 'auto',
  playMode: 'realtime',
  tempoPct: 100,
  lookaheadSec: 2.5,
  stringsPreset: 'violin_4',
  stringsPreferFourth: false,
  saxTransposition: 'alto_eb',
  backingVolumePct: 70,
  leadVolumePct: 60,
  leadGuideUserOverride: false,
  latencyOffsetMs: 0,
  rmsThreshold: DEFAULT_MIC_SETTINGS.rmsThreshold,
  tuningOffsetCents: DEFAULT_MIC_SETTINGS.tuningOffsetCents,
  roomFilterEnabled: DEFAULT_MIC_SETTINGS.roomFilterEnabled,
  micSettings: Object.freeze({
    strings: DEFAULT_MIC_SETTINGS,
    saxophone: DEFAULT_MIC_SETTINGS,
  }),
  selectedSongId: 'ode-to-joy',
  songSettings: {},
  collapsedFolders: [],
  customFolders: [],
  lobbySetupCollapsed: false,
  privacyBannerDismissed: false,
});

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function sanitizeSongSettings(rawMap) {
  if (!rawMap || typeof rawMap !== 'object') return {};
  const entries = Object.entries(rawMap).slice(0, 100);
  const clean = {};
  for (const [songId, cfg] of entries) {
    if (!songId || typeof cfg !== 'object' || cfg === null) continue;
    clean[songId] = {
      leadTrackIndex: Math.max(0, Math.round(clampNumber(cfg.leadTrackIndex, 0, 128, 0))),
      octaveShift: Math.round(clampNumber(cfg.octaveShift, -2, 2, 0)),
      semitoneTranspose: Math.round(clampNumber(cfg.semitoneTranspose, -6, 6, 0)),
    };
  }
  return clean;
}

function sanitizeCollapsedFolders(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length > 0 && trimmed.length <= 220) {
      seen.add(trimmed);
      if (seen.size >= 200) break;
    }
  }
  return Array.from(seen);
}

function sanitizeCustomFolders(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  for (const item of raw) {
    const norm = normalizeFolderPath(item);
    if (norm.length > 0) {
      seen.add(norm);
      if (seen.size >= 100) break;
    }
  }
  return Array.from(seen).toSorted((a, b) => a.localeCompare(b));
}

function sanitizeMicProfile(raw, fallback = DEFAULT_MIC_SETTINGS) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    rmsThreshold: Number(clampNumber(src.rmsThreshold, 0.004, 0.04, fallback.rmsThreshold).toFixed(3)),
    tuningOffsetCents: Math.round(clampNumber(src.tuningOffsetCents, -100, 100, fallback.tuningOffsetCents)),
    roomFilterEnabled:
      src.roomFilterEnabled !== undefined ? Boolean(src.roomFilterEnabled) : Boolean(fallback.roomFilterEnabled),
  };
}

export function sanitizePreferences(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const instrumentId = normalizeInstrumentId(src.instrumentId);
  const activeMicKey = instrumentId === 'saxophone' ? 'saxophone' : 'strings';
  const legacyProfile = sanitizeMicProfile(src, DEFAULT_MIC_SETTINGS);

  const micSettings =
    src.micSettings && typeof src.micSettings === 'object'
      ? {
          strings: sanitizeMicProfile(src.micSettings.strings ?? src.micSettings.violin, DEFAULT_MIC_SETTINGS),
          saxophone: sanitizeMicProfile(src.micSettings.saxophone, DEFAULT_MIC_SETTINGS),
        }
      : {
          strings: activeMicKey === 'strings' ? legacyProfile : { ...DEFAULT_MIC_SETTINGS },
          saxophone: activeMicKey === 'saxophone' ? legacyProfile : { ...DEFAULT_MIC_SETTINGS },
        };

  const activeProfile = micSettings[activeMicKey];

  return {
    instrumentId,
    viewMode: VALID_VIEW_MODES.has(src.viewMode) ? src.viewMode : DEFAULT_PREFERENCES.viewMode,
    playMode: VALID_PLAY_MODES.has(src.playMode) ? src.playMode : DEFAULT_PREFERENCES.playMode,
    tempoPct: Math.round(clampNumber(src.tempoPct, 25, 150, DEFAULT_PREFERENCES.tempoPct)),
    lookaheadSec: Number(clampNumber(src.lookaheadSec, 1.5, 4.0, DEFAULT_PREFERENCES.lookaheadSec).toFixed(1)),
    stringsPreset: VALID_STRINGS_PRESETS.has(src.stringsPreset) ? src.stringsPreset : DEFAULT_PREFERENCES.stringsPreset,
    stringsPreferFourth: Boolean(src.stringsPreferFourth ?? src.violinPreferFourth),
    saxTransposition: VALID_SAX_TRANSPOSITIONS.has(src.saxTransposition)
      ? src.saxTransposition
      : DEFAULT_PREFERENCES.saxTransposition,
    backingVolumePct: Math.round(clampNumber(src.backingVolumePct, 0, 100, DEFAULT_PREFERENCES.backingVolumePct)),
    leadVolumePct: Math.round(clampNumber(src.leadVolumePct, 0, 100, DEFAULT_PREFERENCES.leadVolumePct)),
    leadGuideUserOverride: Boolean(src.leadGuideUserOverride),
    latencyOffsetMs: Math.round(clampNumber(src.latencyOffsetMs, -150, 150, DEFAULT_PREFERENCES.latencyOffsetMs)),
    rmsThreshold: activeProfile.rmsThreshold,
    tuningOffsetCents: activeProfile.tuningOffsetCents,
    roomFilterEnabled: activeProfile.roomFilterEnabled,
    micSettings,
    selectedSongId:
      typeof src.selectedSongId === 'string' && src.selectedSongId.length > 0
        ? src.selectedSongId
        : DEFAULT_PREFERENCES.selectedSongId,
    songSettings: sanitizeSongSettings(src.songSettings),
    collapsedFolders: sanitizeCollapsedFolders(src.collapsedFolders),
    customFolders: sanitizeCustomFolders(src.customFolders),
    lobbySetupCollapsed: Boolean(src.lobbySetupCollapsed),
    privacyBannerDismissed: Boolean(src.privacyBannerDismissed),
  };
}

export function buildScoreKey({ songId, leadTrackIndex = 0, instrumentId = 'strings', playMode = 'realtime' }) {
  const safeSong = String(songId || 'unknown');
  const safeTrack = Math.max(0, Math.round(Number(leadTrackIndex) || 0));
  const safeInst = normalizeInstrumentId(instrumentId);
  const safeMode = VALID_PLAY_MODES.has(playMode) ? playMode : 'realtime';
  return `${safeSong}::t${safeTrack}::${safeInst}::${safeMode}`;
}

function createMemoryStorageAdapter() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function resolveStorageBackend(providedStorage) {
  if (providedStorage) return providedStorage;
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      const testKey = '__buskero_probe__';
      globalThis.localStorage.setItem(testKey, '1');
      globalThis.localStorage.removeItem(testKey);
      return globalThis.localStorage;
    }
  } catch {
    // Private browsing or blocked storage: fall back to volatile in-memory Map
  }
  return createMemoryStorageAdapter();
}

export function createLocalStore({ storage } = {}) {
  const backend = resolveStorageBackend(storage);

  function readJson(key, fallback) {
    try {
      const raw = backend.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      backend.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function loadPreferences() {
    const raw = readJson(PREFS_STORAGE_KEY, {});
    return sanitizePreferences(raw);
  }

  function savePreferences(patch = {}) {
    const current = loadPreferences();
    const nextInstrument =
      patch.instrumentId !== undefined ? normalizeInstrumentId(patch.instrumentId) : current.instrumentId;
    const targetMicKey = nextInstrument === 'saxophone' ? 'saxophone' : 'strings';

    let nextMicSettings = current.micSettings;
    if (patch.micSettings && typeof patch.micSettings === 'object') {
      nextMicSettings = {
        strings: { ...current.micSettings.strings, ...(patch.micSettings.strings ?? patch.micSettings.violin) },
        saxophone: { ...current.micSettings.saxophone, ...patch.micSettings.saxophone },
      };
    } else if (
      patch.rmsThreshold !== undefined ||
      patch.tuningOffsetCents !== undefined ||
      patch.roomFilterEnabled !== undefined
    ) {
      nextMicSettings = {
        ...current.micSettings,
        [targetMicKey]: {
          ...current.micSettings[targetMicKey],
          ...(patch.rmsThreshold !== undefined ? { rmsThreshold: patch.rmsThreshold } : {}),
          ...(patch.tuningOffsetCents !== undefined ? { tuningOffsetCents: patch.tuningOffsetCents } : {}),
          ...(patch.roomFilterEnabled !== undefined ? { roomFilterEnabled: patch.roomFilterEnabled } : {}),
        },
      };
    }

    const merged = sanitizePreferences({
      ...current,
      ...patch,
      micSettings: nextMicSettings,
      songSettings: patch.songSettings ? { ...current.songSettings, ...patch.songSettings } : current.songSettings,
    });
    writeJson(PREFS_STORAGE_KEY, merged);
    return merged;
  }

  function getMicSettings(instrumentId = 'strings') {
    const prefs = loadPreferences();
    const key = instrumentId === 'saxophone' ? 'saxophone' : 'strings';
    return { ...prefs.micSettings[key] };
  }

  function saveMicSettings(instrumentId, micPatch = {}) {
    const current = loadPreferences();
    const key = instrumentId === 'saxophone' ? 'saxophone' : 'strings';
    return savePreferences({
      micSettings: {
        ...current.micSettings,
        [key]: {
          ...current.micSettings[key],
          ...micPatch,
        },
      },
    });
  }

  function saveSongSettings(songId, settings) {
    if (!songId) return loadPreferences();
    const current = loadPreferences();
    const nextMap = {
      ...current.songSettings,
      [songId]: {
        leadTrackIndex: settings.leadTrackIndex,
        octaveShift: settings.octaveShift,
        semitoneTranspose: settings.semitoneTranspose,
      },
    };
    return savePreferences({ songSettings: nextMap });
  }

  function getSongSettings(songId) {
    if (!songId) return null;
    const prefs = loadPreferences();
    return prefs.songSettings[songId] ?? null;
  }

  function loadScoresMap() {
    const raw = readJson(SCORES_STORAGE_KEY, {});
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  }

  function getBestScore(params) {
    const key = buildScoreKey(params);
    const scores = loadScoresMap();
    const entry = scores[key];
    return entry && typeof entry === 'object' ? { ...entry } : null;
  }

  function recordCompletedRun({
    songId,
    leadTrackIndex = 0,
    instrumentId = 'strings',
    playMode = 'realtime',
    score = 0,
    accuracy = 0,
    maxCombo = 0,
    tempoPct = 100,
  }) {
    const key = buildScoreKey({ songId, leadTrackIndex, instrumentId, playMode });
    const scores = loadScoresMap();
    const prev = scores[key] ?? null;
    const cleanScore = Math.max(0, Math.round(Number(score) || 0));
    const cleanAccuracy = Math.max(0, Math.min(100, Math.round(Number(accuracy) || 0)));
    const cleanCombo = Math.max(0, Math.round(Number(maxCombo) || 0));
    const cleanTempo = Math.round(clampNumber(tempoPct, 25, 150, 100));

    const isNewBest =
      !prev ||
      cleanScore > prev.bestScore ||
      (cleanScore === prev.bestScore && cleanAccuracy > prev.bestAccuracy) ||
      (cleanScore === prev.bestScore && cleanAccuracy === prev.bestAccuracy && cleanCombo > prev.bestMaxCombo);

    const nextRecord = {
      bestScore: isNewBest ? cleanScore : prev.bestScore,
      bestAccuracy: isNewBest ? cleanAccuracy : prev.bestAccuracy,
      bestMaxCombo: isNewBest ? cleanCombo : prev.bestMaxCombo,
      bestTempoPct: isNewBest ? cleanTempo : prev.bestTempoPct,
      completions: (prev?.completions ?? 0) + 1,
      updatedAt: Date.now(),
    };

    scores[key] = nextRecord;
    writeJson(SCORES_STORAGE_KEY, scores);
    return { isNewBest, record: nextRecord };
  }

  function clearAllLocalStore() {
    try {
      backend.removeItem(PREFS_STORAGE_KEY);
      backend.removeItem(SCORES_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  function getStorageSummary() {
    const prefsRaw = backend.getItem(PREFS_STORAGE_KEY) || '';
    const scoresRaw = backend.getItem(SCORES_STORAGE_KEY) || '';
    const prefs = loadPreferences();
    const scores = loadScoresMap();
    return {
      hasPreferences: prefsRaw.length > 0,
      scoreCount: Object.keys(scores).length,
      songSettingsCount: Object.keys(prefs.songSettings).length,
      approxBytes: prefsRaw.length + scoresRaw.length,
    };
  }

  return {
    loadPreferences,
    savePreferences,
    getMicSettings,
    saveMicSettings,
    saveSongSettings,
    getSongSettings,
    getBestScore,
    recordCompletedRun,
    clearAllLocalStore,
    getStorageSummary,
  };
}
