export const PREFS_STORAGE_KEY = 'buskero:prefs:v1';
export const SCORES_STORAGE_KEY = 'buskero:scores:v1';

const VALID_INSTRUMENTS = new Set(['violin', 'saxophone', 'piano']);
const VALID_VIEW_MODES = new Set(['auto', '2d', '3d']);
const VALID_PLAY_MODES = new Set(['realtime', 'wait']);
const VALID_SAX_TRANSPOSITIONS = new Set(['alto_eb', 'tenor_bb', 'soprano_bb', 'concert_c']);
const RESERVED_FOLDER_NAMES = new Set(['built-in songs', 'built-in', 'uploaded songs', 'uploaded']);

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

export const DEFAULT_PREFERENCES = Object.freeze({
  instrumentId: 'violin',
  viewMode: 'auto',
  playMode: 'realtime',
  tempoPct: 100,
  lookaheadSec: 2.5,
  violinPreferFourth: false,
  saxTransposition: 'alto_eb',
  backingVolumePct: 70,
  leadVolumePct: 60,
  leadGuideUserOverride: false,
  latencyOffsetMs: 0,
  rmsThreshold: 0.012,
  tuningOffsetCents: 0,
  roomFilterEnabled: false,
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

export function sanitizePreferences(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    instrumentId: VALID_INSTRUMENTS.has(src.instrumentId) ? src.instrumentId : DEFAULT_PREFERENCES.instrumentId,
    viewMode: VALID_VIEW_MODES.has(src.viewMode) ? src.viewMode : DEFAULT_PREFERENCES.viewMode,
    playMode: VALID_PLAY_MODES.has(src.playMode) ? src.playMode : DEFAULT_PREFERENCES.playMode,
    tempoPct: Math.round(clampNumber(src.tempoPct, 25, 150, DEFAULT_PREFERENCES.tempoPct)),
    lookaheadSec: Number(clampNumber(src.lookaheadSec, 1.5, 4.0, DEFAULT_PREFERENCES.lookaheadSec).toFixed(1)),
    violinPreferFourth: Boolean(src.violinPreferFourth),
    saxTransposition: VALID_SAX_TRANSPOSITIONS.has(src.saxTransposition)
      ? src.saxTransposition
      : DEFAULT_PREFERENCES.saxTransposition,
    backingVolumePct: Math.round(clampNumber(src.backingVolumePct, 0, 100, DEFAULT_PREFERENCES.backingVolumePct)),
    leadVolumePct: Math.round(clampNumber(src.leadVolumePct, 0, 100, DEFAULT_PREFERENCES.leadVolumePct)),
    leadGuideUserOverride: Boolean(src.leadGuideUserOverride),
    latencyOffsetMs: Math.round(clampNumber(src.latencyOffsetMs, -150, 150, DEFAULT_PREFERENCES.latencyOffsetMs)),
    rmsThreshold: Number(clampNumber(src.rmsThreshold, 0.004, 0.04, DEFAULT_PREFERENCES.rmsThreshold).toFixed(3)),
    tuningOffsetCents: Math.round(clampNumber(src.tuningOffsetCents, -100, 100, DEFAULT_PREFERENCES.tuningOffsetCents)),
    roomFilterEnabled: Boolean(src.roomFilterEnabled),
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

export function buildScoreKey({ songId, leadTrackIndex = 0, instrumentId = 'violin', playMode = 'realtime' }) {
  const safeSong = String(songId || 'unknown');
  const safeTrack = Math.max(0, Math.round(Number(leadTrackIndex) || 0));
  const safeInst = VALID_INSTRUMENTS.has(instrumentId) ? instrumentId : 'violin';
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
