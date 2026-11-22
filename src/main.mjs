import { MidiInputController } from './audio/midiInput.mjs';
import { MicrophoneInputController } from './audio/pitchDetector.mjs';
import { SynthEngine } from './audio/synthEngine.mjs';
import { GameEngine } from './game/gameEngine.mjs';
import { getInstrumentModule } from './instruments/index.mjs';
import { autoFitSaxOctave, classifySaxCalibrationNote, midiToSaxNoteName } from './instruments/saxophone.mjs';
import { midiToNoteName, parseMidiBuffer, recommendLeadTrack } from './midi/midiParser.mjs';
import { SAMPLE_SONGS } from './midi/sampleSongs.mjs';
import { createLocalStore, normalizeFolderPath } from './storage/localStore.mjs';
import { createSongLibraryStore } from './storage/songLibraryStore.mjs';
import { createHighwayViewSwitcher } from './ui/baseHighwayRenderer.mjs';
import { detect3DCapability, FrameBudgetMonitor } from './ui/gpuCapability.mjs';
import { Highway3DRenderer } from './ui/highway3dRenderer.mjs';
import { Highway2DRenderer } from './ui/highwayRenderer.mjs';
import { buildSongTree } from './ui/songTreeModel.mjs';

const localStore = createLocalStore();
const songLibrary = createSongLibraryStore();
const savedPrefs = localStore.loadPreferences();
const gpuCapability = detect3DCapability();
const frameBudgetMonitor = new FrameBudgetMonitor({ maxFrameMs: 45, windowSize: 90 });

const state = {
  screen: 'lobby', // 'lobby' | 'stage'
  instrumentId: savedPrefs.instrumentId,
  viewMode: savedPrefs.viewMode,
  activeViewMode: '2d',
  saxTransposition: savedPrefs.saxTransposition,
  violinPreferFourth: savedPrefs.violinPreferFourth,
  playMode: savedPrefs.playMode,
  tempoPct: savedPrefs.tempoPct,
  lookaheadSec: savedPrefs.lookaheadSec,
  currentSongId: savedPrefs.selectedSongId,
  currentSongIsCustom: false,
  currentSongFolder: '',
  currentSongTitle: '',
  parsedMidi: null,
  leadTrackIndex: 0,
  octaveShift: 0,
  semitoneTranspose: 0,
  backingNotes: [],
  leadNotes: [],
  highwayConfig: null,
  customSongs: [],
  customFolders: [...savedPrefs.customFolders],
  collapsedFolders: [...savedPrefs.collapsedFolders],
  lobbySetupCollapsed: savedPrefs.lobbySetupCollapsed,
  privacyBannerDismissed: savedPrefs.privacyBannerDismissed,
  libraryFilter: '',
  micActive: false,
  micAutoManaged: false,
  rmsThreshold: savedPrefs.rmsThreshold,
  tuningOffsetCents: savedPrefs.tuningOffsetCents,
  roomFilterEnabled: savedPrefs.roomFilterEnabled,
  leadGuideUserOverride: savedPrefs.leadGuideUserOverride,
  lastFrameTime: 0,
  lastSimTime: 0,
  latestPitch: null,
  latestRms: 0,
  saxCalibrating: false,
};

const els = {
  lobbyScreen: document.getElementById('lobby-screen'),
  stageScreen: document.getElementById('stage-screen'),
  instrumentRadios: document.querySelectorAll('input[name="instrument"]'),
  pauseInstrumentRadios: document.querySelectorAll('input[name="pause-instrument"]'),
  lobbyViewModeRadios: document.querySelectorAll('input[name="lobby-view-mode"]'),
  viewModeRadios: document.querySelectorAll('input[name="view-mode"]'),
  playModeRadios: document.querySelectorAll('input[name="play-mode"]'),
  toggleNewFolderBtn: document.getElementById('toggle-new-folder-btn'),
  newFolderForm: document.getElementById('new-folder-form'),
  newFolderInput: document.getElementById('new-folder-input'),
  cancelNewFolderBtn: document.getElementById('cancel-new-folder-btn'),
  libraryFilterInput: document.getElementById('library-filter-input'),
  songTree: document.getElementById('song-tree'),
  midiDropzone: document.getElementById('midi-dropzone'),
  midiFileInput: document.getElementById('midi-file-input'),
  selectedSongTitle: document.getElementById('selected-song-title'),
  songMeta: document.getElementById('song-meta'),
  lobbyBest: document.getElementById('lobby-best'),
  customSongActions: document.getElementById('custom-song-actions'),
  songFolderSelect: document.getElementById('song-folder-select'),
  deleteCustomSongBtn: document.getElementById('delete-custom-song-btn'),
  tracksDetails: document.getElementById('tracks-details'),
  leadTrackSelect: document.getElementById('lead-track-select'),
  octaveShiftSelect: document.getElementById('octave-shift-select'),
  semitoneTransposeSelect: document.getElementById('semitone-transpose-select'),
  trackListPreview: document.getElementById('track-list-preview'),
  tempoSlider: document.getElementById('tempo-slider'),
  tempoOutput: document.getElementById('tempo-output'),
  pauseTempoSlider: document.getElementById('pause-tempo-slider'),
  pauseTempoOutput: document.getElementById('pause-tempo-output'),
  zoomSlider: document.getElementById('zoom-slider'),
  zoomOutput: document.getElementById('zoom-output'),
  startSessionBtn: document.getElementById('start-session-btn'),
  lobbySetupDetails: document.getElementById('lobby-setup-details'),
  lobbySetupSlot: document.getElementById('lobby-setup-slot'),
  pauseSetupSlot: document.getElementById('pause-setup-slot'),
  liveSetupPanel: document.getElementById('live-setup-panel'),
  violinOptions: document.getElementById('violin-options'),
  violinFourthCheckbox: document.getElementById('violin-fourth-finger'),
  saxOptions: document.getElementById('sax-options'),
  saxTranspositionSelect: document.getElementById('sax-transposition'),
  saxAutofitBtn: document.getElementById('sax-autofit-btn'),
  saxCalibrateBtn: document.getElementById('sax-calibrate-btn'),
  saxCalibrateStatus: document.getElementById('sax-calibrate-status'),
  pianoOptions: document.getElementById('piano-options'),
  midiDeviceSummary: document.getElementById('midi-device-summary'),
  micToggleBtn: document.getElementById('mic-toggle-btn'),
  midiConnectBtn: document.getElementById('midi-connect-btn'),
  inputStatusPill: document.getElementById('input-status-pill'),
  backingVolSlider: document.getElementById('backing-vol-slider'),
  backingVolOutput: document.getElementById('backing-vol-output'),
  leadVolSlider: document.getElementById('lead-vol-slider'),
  leadVolOutput: document.getElementById('lead-vol-output'),
  calibrationDetails: document.getElementById('calibration-details'),
  latencySlider: document.getElementById('latency-slider'),
  latencyOutput: document.getElementById('latency-output'),
  micCalibrationFields: document.getElementById('mic-calibration-fields'),
  gateSlider: document.getElementById('gate-slider'),
  gateOutput: document.getElementById('gate-output'),
  tuningOffsetSlider: document.getElementById('tuning-offset-slider'),
  tuningOffsetOutput: document.getElementById('tuning-offset-output'),
  tuningOffsetResetBtn: document.getElementById('tuning-offset-reset-btn'),
  roomFilterCheckbox: document.getElementById('room-filter-checkbox'),
  calibrationPitchReadout: document.getElementById('calibration-pitch-readout'),
  micLevelMeter: document.getElementById('mic-level-meter'),
  privacyBanner: document.getElementById('privacy-banner'),
  dismissPrivacyBannerBtn: document.getElementById('dismiss-privacy-banner-btn'),
  openPauseMenuBtn: document.getElementById('open-pause-menu-btn'),
  playPauseBtn: document.getElementById('play-pause-btn'),
  restartBtn: document.getElementById('restart-btn'),
  skipWaitBtn: document.getElementById('skip-wait-btn'),
  loopABtn: document.getElementById('loop-a-btn'),
  loopBBtn: document.getElementById('loop-b-btn'),
  loopClearBtn: document.getElementById('loop-clear-btn'),
  loopStatusPill: document.getElementById('loop-status-pill'),
  songProgress: document.getElementById('song-progress'),
  timeReadout: document.getElementById('time-readout'),
  hudScore: document.getElementById('hud-score'),
  hudCombo: document.getElementById('hud-combo'),
  hudAccuracy: document.getElementById('hud-accuracy'),
  hudBest: document.getElementById('hud-best'),
  canvasShell: document.getElementById('canvas-shell'),
  canvas: document.getElementById('highway-canvas'),
  pauseDialog: document.getElementById('pause-dialog'),
  pauseSongLabel: document.getElementById('pause-song-label'),
  resumePlayBtn: document.getElementById('resume-play-btn'),
  pauseRestartBtn: document.getElementById('pause-restart-btn'),
  backToLibraryBtn: document.getElementById('back-to-library-btn'),
  pauseLegalBtn: document.getElementById('pause-legal-btn'),
  openLegalBtn: document.getElementById('open-legal-btn'),
  legalDialog: document.getElementById('legal-dialog'),
  legalStorageSummary: document.getElementById('legal-storage-summary'),
  clearSongsBtn: document.getElementById('clear-songs-btn'),
  clearAllDataBtn: document.getElementById('clear-all-data-btn'),
};

const mic = new MicrophoneInputController();
const midiInput = new MidiInputController();
const synth = new SynthEngine();
const game = new GameEngine({
  instrumentId: state.instrumentId,
  mode: state.playMode,
  tempoScale: state.tempoPct / 100,
  latencyOffsetMs: savedPrefs.latencyOffsetMs,
});

const renderers = {
  '2d': new Highway2DRenderer({ canvas: els.canvas, lookaheadSec: state.lookaheadSec }),
    }
    syncViewModeUI();
  },
});

state.activeViewMode = viewSwitcher.activeMode;

function isMicInstrument(instrumentId) {
  return instrumentId === 'violin' || instrumentId === 'saxophone';
}

}

function setInputStatus(text, statusType = 'idle') {
  els.inputStatusPill.textContent = text;
  els.inputStatusPill.dataset.state = statusType;
}

function updateRangeProgressFallback(input) {
  if (!CSS.supports('accent-color', 'red')) {
    const min = Number(input.min || 0);
async function refreshLegalStorageSummary() {
  const libSummary = await songLibrary.getLibrarySummary();
  const localSummary = localStore.getStorageSummary();
  const totalKb = ((libSummary.totalBytes + localSummary.approxBytes) / 1024).toFixed(1);
  els.legalStorageSummary.textContent = `Browser Storage: ${libSummary.count} uploaded MIDI(s) · ${localSummary.scoreCount} personal track record(s) · ~${totalKb} KB total`;
  els.clearSongsBtn.disabled = libSummary.count === 0;
}

