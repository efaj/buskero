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
  '3d': new Highway3DRenderer({
    lookaheadSec: state.lookaheadSec,
    onFallbackNeeded: (reason) => {
      if (viewSwitcher.activeMode === '3d') {
        switchHighwayRenderer('2d', { persist: false });
        setInputStatus(`Switched to 2D Highway (${reason})`, 'idle');
    }
    syncViewModeUI();
  },
});

state.activeViewMode = viewSwitcher.activeMode;

function isMicInstrument(instrumentId) {
  return instrumentId === 'violin' || instrumentId === 'saxophone';
}

function formatSeconds(sec) {
  const safe = Math.max(0, Math.floor(sec));
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

function setInputStatus(text, statusType = 'idle') {
  els.inputStatusPill.textContent = text;
  els.inputStatusPill.dataset.state = statusType;
}

function updateRangeProgressFallback(input) {
  if (!CSS.supports('accent-color', 'red')) {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const val = Number(input.value || 0);
    const pct = ((val - min) / Math.max(1, max - min)) * 100;
    input.style.setProperty('--progress', `${pct}%`);
  }
}

function syncViewModeUI() {
  for (const radio of [...els.viewModeRadios, ...els.lobbyViewModeRadios]) {
    if (radio.value === '3d') {
  els.pianoOptions.hidden = state.instrumentId !== 'piano';

  // Strictly hide irrelevant input controls per instrument
  els.micToggleBtn.hidden = !isMic;
  els.micCalibrationFields.hidden = !isMic;
  els.midiConnectBtn.hidden = isMic;

  if (state.instrumentId === 'piano') {
    midiInput.enableKeyboardFallback();
    syncMidiDeviceUI(midiInput.getStatus());
  } else {
    midiInput.disableKeyboardFallback();
    midiInput.clearActiveKeys();
  }
}

function syncBestScoreHUD() {
  if (!state.currentSongId) {
    els.hudBest.textContent = '—';
    els.lobbyBest.textContent = '—';
    return;
  }
  const best = localStore.getBestScore({
    songId: state.currentSongId,
    leadTrackIndex: state.leadTrackIndex,
    instrumentId: state.instrumentId,
    playMode: state.playMode,
  });
  if (!best) {
    els.hudBest.textContent = '—';
    els.lobbyBest.textContent = '—';
    els.hudBest.title = 'No completed personal run yet for this track, instrument & mode';
    return;
  }
  const formatted = `${best.bestScore} (${best.bestAccuracy}%)`;
  els.hudBest.textContent = formatted;
  els.lobbyBest.textContent = formatted;
  els.hudBest.title = `Best: ${best.bestScore} pts · ${best.bestAccuracy}% · ${best.bestMaxCombo}x max combo (${best.completions} runs)`;
}

function syncFolderSelectOptions() {
  const opts = [];
  const rootOpt = document.createElement('option');
  rootOpt.value = '';
  rootOpt.textContent = 'Uploaded Songs (Root)';
  opts.push(rootOpt);

  const allPaths = new Set(state.customFolders);
  for (const song of state.customSongs) {
    if (song.folderPath) allPaths.add(song.folderPath);
  }
  for (const folderPath of Array.from(allPaths).toSorted((a, b) => a.localeCompare(b))) {
    const opt = document.createElement('option');
    opt.value = folderPath;
    opt.textContent = folderPath;
    opts.push(opt);
  }

  els.songFolderSelect.replaceChildren(...opts);
  els.songFolderSelect.value = state.currentSongFolder || '';
}

function setFolderCollapsedState(folderKey, isOpen) {
  const next = new Set(state.collapsedFolders);
  if (isOpen) {
    next.delete(folderKey);
  } else {
    next.add(folderKey);
  }
  state.collapsedFolders = Array.from(next);
  localStore.savePreferences({ collapsedFolders: state.collapsedFolders });
}

function createSongTreeRow(song) {
  const row = document.createElement('div');
  row.className = 'tree-song-row';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tree-song-btn';
  if (song.id === state.currentSongId) {
    btn.setAttribute('aria-current', 'true');
  }
  if (!state.parsedMidi) return;
  const optionNodes = [];
  const listNodes = [];

  state.parsedMidi.tracks.forEach((track, idx) => {
    const option = document.createElement('option');
    option.value = String(idx);
    option.textContent = `${track.name} (${track.noteCount} notes · ${midiToNoteName(track.minMidi)}–${midiToNoteName(track.maxMidi)})`;
    if (idx === state.leadTrackIndex) option.selected = true;
    optionNodes.push(option);

    const li = document.createElement('li');
    const titleSpan = document.createElement('span');
    titleSpan.textContent = `${idx === state.leadTrackIndex ? '★ ' : ''}${track.name}`;
    const infoSpan = document.createElement('span');
    infoSpan.textContent = `${track.noteCount} notes · ${track.instrumentName}`;
    li.append(titleSpan, infoSpan);
    listNodes.push(li);
  });

  els.leadTrackSelect.replaceChildren(...optionNodes);
  els.trackListPreview.replaceChildren(...listNodes);

  els.octaveShiftSelect.value = String(state.octaveShift);
  els.semitoneTransposeSelect.value = String(state.semitoneTranspose);
}

function rebuildChartFromCurrentSong() {
  if (!state.parsedMidi || state.parsedMidi.tracks.length === 0) return;

  const tracks = state.parsedMidi.tracks;
  const leadTrack = tracks[state.leadTrackIndex] ?? tracks[0];
  const mod = getInstrumentModule(state.instrumentId);

  const shiftedNotes = leadTrack.notes.map((n) => ({
    ...n,
    midi: Math.max(21, Math.min(108, n.midi + state.octaveShift * 12 + state.semitoneTranspose)),
  }));

  const config = mod.getHighwayConfig({
    notes: shiftedNotes,
    saxTransposition: state.saxTransposition,
  });

  let prevMidi = null;
  const mappedNotes = shiftedNotes.map((n) => {
    const mapped = mod.mapNoteToHighway(n.midi, {
      preferFourthFinger: state.violinPreferFourth,
      saxTransposition: state.saxTransposition,
      minKey: config.minKey,
      maxKey: config.maxKey,
      prevMidi,
    });
    prevMidi = n.midi;
    return {
      ...n,
      ...mapped,
    };
  });

  const backingNotes = [];
  for (let i = 0; i < tracks.length; i += 1) {
    if (i === state.leadTrackIndex) continue;
    for (const n of tracks[i].notes) {
      backingNotes.push({
        ...n,
        midi: Math.max(21, Math.min(108, n.midi + state.semitoneTranspose)),
      });
    }
  }
  backingNotes.sort((a, b) => a.startTime - b.startTime);

  state.highwayConfig = config;
  state.leadNotes = mappedNotes;
  state.backingNotes = backingNotes;

  game.setInstrument(state.instrumentId);
  game.loadChart(mappedNotes, state.parsedMidi.durationSec);
  synth.resetSchedule(game.songTime);

  const shiftParts = [];
  if (state.octaveShift !== 0) shiftParts.push(`${state.octaveShift > 0 ? '+' : ''}${state.octaveShift} oct`);
  if (state.semitoneTranspose !== 0) {
    shiftParts.push(`${state.semitoneTranspose > 0 ? '+' : ''}${state.semitoneTranspose} st`);
  }
  const shiftLabel = shiftParts.length > 0 ? ` (${shiftParts.join(', ')})` : '';
  const localTag = state.currentSongIsCustom ? ' · Saved Locally' : '';
  const metaLine = `${state.parsedMidi.bpm} BPM • ${leadTrack.name}${shiftLabel}${localTag}`;

  els.selectedSongTitle.textContent = state.currentSongTitle;
  els.songMeta.textContent = metaLine;
  els.pauseSongLabel.textContent = `${state.currentSongTitle} • ${metaLine}`;

  syncTracksPanel();
  syncTransportUI();
  syncBestScoreHUD();
}

function loadParsedSong(
  parsedMidi,
  title,
  { songId, isCustom = false, folderPath = '', restoreSavedSettings = true } = {},
) {
  state.parsedMidi = parsedMidi;
  state.currentSongId = songId;
  state.currentSongIsCustom = isCustom;
  state.currentSongFolder = normalizeFolderPath(folderPath);
  state.currentSongTitle = title;
  els.hudAccuracy.textContent = `${snap.accuracy}%`;

  const hasA = snap.loopStartSec !== null;
  const hasB = snap.loopEndSec !== null;
  els.loopClearBtn.hidden = !hasA && !hasB;
  if (hasA && hasB) {
    els.loopStatusPill.hidden = false;
    els.loopStatusPill.textContent = `Loop ${formatSeconds(snap.loopStartSec)}–${formatSeconds(snap.loopEndSec)} (×${snap.loopCount})`;
  } else if (hasA) {
    els.loopStatusPill.hidden = false;
    els.loopStatusPill.textContent = `Loop A: ${formatSeconds(snap.loopStartSec)} → set B`;
  } else {
    els.loopStatusPill.hidden = true;
  }

  const duration = Math.max(0.1, snap.durationSec);
  const clampedTime = Math.max(0, Math.min(duration, snap.songTime));
  els.songProgress.value = Math.round((clampedTime / duration) * 100);
  els.timeReadout.textContent = `${formatSeconds(clampedTime)} / ${formatSeconds(duration)}`;
}

function syncMidiDeviceUI(status) {
  if (state.instrumentId !== 'piano') return;
  if (!status.supported) {
    els.midiDeviceSummary.textContent =
      'Web MIDI unavailable in this browser. Use computer keys (A–K) or click on-screen piano keys.';
    setInputStatus('Piano Keys Ready: press A–K or click keys', 'idle');
    return;
  }
  if (status.lastError) {
    els.midiDeviceSummary.textContent = status.lastError;
    setInputStatus(`MIDI Error: ${status.lastError}`, 'error');
    return;
  }
  if (status.devices.length === 0) {
    els.midiDeviceSummary.textContent = status.connected
      ? 'Web MIDI ready — no hardware keyboard detected yet. Plug in USB MIDI or click piano keys.'
      : 'Click "Connect MIDI" for USB/Bluetooth keyboards, or play with keys A–K.';
    setInputStatus(
      status.connected ? 'Web MIDI Ready (A–K keys active)' : 'Piano Ready: Connect MIDI or use A–K keys',
      'idle',
    );
    return;
  }
  const names = status.devices.map((d) => d.name).join(', ');
  els.midiDeviceSummary.textContent = `Connected MIDI: ${names}`;
  setInputStatus(`MIDI Ready: ${names}`, 'active');
}

async function togglePlayPause() {
  await synth.ensureContext();
  await mic.resumeIfSuspended();
  if (game.isFinished) {
    game.resetPlayback();
    synth.resetSchedule(game.songTime);
    game.isPlaying = true;
  } else {
    game.isPlaying = !game.isPlaying;
    if (!game.isPlaying) {
      synth.stopAllVoices();
    } else {
      synth.resetSchedule(game.songTime);
    }
  }
  syncTransportUI();
}

function restartSong({ autoPlay = false } = {}) {
  game.resetPlayback();
  synth.resetSchedule(game.songTime);
  game.isPlaying = autoPlay;
  syncTransportUI();
}

function disableMicrophone() {
  mic.stop();
  state.micActive = false;
  state.micAutoManaged = false;
  state.latestPitch = null;
  state.latestRms = 0;
  els.micToggleBtn.textContent = 'Enable Microphone';
  if (isMicInstrument(state.instrumentId)) {
    setInputStatus('Microphone disabled', 'idle');
  }
  if (!state.leadGuideUserOverride) {
    els.leadVolSlider.value = '60';
    els.leadVolOutput.textContent = '60%';
    synth.setVolumes({ leadVolume: 0.6 });
    localStore.savePreferences({ leadVolumePct: 60 });
  }
}

async function enableMicrophone({ auto = false } = {}) {
  if (!isMicInstrument(state.instrumentId)) return false;
  try {
    await mic.start({
      roomFilterEnabled: state.roomFilterEnabled,
      rmsThreshold: state.rmsThreshold,
      tuningOffsetCents: state.tuningOffsetCents,
    });
    state.micActive = true;
    state.micAutoManaged = auto;
    els.micToggleBtn.textContent = 'Disable Microphone';
    const modeTag = mic.mode === 'worklet-worker' ? 'Worker DSP' : 'Audio DSP';
    setInputStatus(`Mic Live (${modeTag}): listening for pitch`, 'active');

    if (!state.leadGuideUserOverride) {
      els.leadVolSlider.value = '0';
      els.leadVolOutput.textContent = '0%';
      synth.setVolumes({ leadVolume: 0 });
    }
    return true;
  } catch (err) {
    state.micActive = false;
    state.micAutoManaged = false;
    els.micToggleBtn.textContent = 'Enable Microphone';
    const reason = err?.message || 'Permission denied';
    setInputStatus(
      auto ? `Mic auto-start paused (${reason}) — click Enable Microphone` : `Mic Error: ${reason}`,
      'error',
    );
    return false;
  }
}

async function toggleMicrophone() {
  if (state.micActive) {
    disableMicrophone();
    return;
  }
  await enableMicrophone({ auto: false });
}

function applyTempoPct(rawPct, { persist = true } = {}) {
  const pct = Math.max(25, Math.min(150, Math.round(Number(rawPct) || 100)));
  state.tempoPct = pct;
  els.tempoSlider.value = String(pct);
  els.tempoOutput.textContent = `${pct}%`;
  els.pauseTempoSlider.value = String(pct);
  els.pauseTempoOutput.textContent = `${pct}%`;
  updateRangeProgressFallback(els.tempoSlider);
  updateRangeProgressFallback(els.pauseTempoSlider);
  game.setTempoScale(pct / 100);
  if (persist) {
    localStore.savePreferences({ tempoPct: pct });
  }
}

function applyTuningOffsetCents(cents, { persist = true } = {}) {
  const clamped = Math.max(-100, Math.min(100, Math.round(Number(cents) || 0)));
  state.tuningOffsetCents = clamped;
  mic.setCalibration({ tuningOffsetCents: clamped });
  els.tuningOffsetSlider.value = String(clamped);
  els.tuningOffsetOutput.textContent = `${clamped > 0 ? '+' : ''}${clamped}¢`;
  updateRangeProgressFallback(els.tuningOffsetSlider);
  if (persist) {
    localStore.savePreferences({ tuningOffsetCents: clamped });
  }
}

async function calibrateSaxHorn() {
  if (state.saxCalibrating) return;
  if (!state.micActive) {
    const ok = await enableMicrophone({ auto: false });
    if (!ok) return;
  }
  await mic.resumeIfSuspended();
  if (game.isPlaying) {
    game.isPlaying = false;
    synth.stopAllVoices();
  }

  state.saxCalibrating = true;
  els.saxCalibrateBtn.disabled = true;
  els.saxCalibrateBtn.textContent = "Listening… Hold L1 'B'";
  els.saxCalibrateStatus.textContent = 'Hold a steady written B4 (Left Index L1 only) for ~1 second…';

  const samples = [];
  const startedAt = performance.now();
  const poll = () => {
    const { pitch } = mic.samplePitch();
    if (pitch && pitch.confidence >= 0.72) {
      samples.push(pitch.rawMidiFloat);
    }
    if (performance.now() - startedAt < 950) {
      setTimeout(poll, 45);
      return;
    }

    state.saxCalibrating = false;
    els.saxCalibrateBtn.disabled = false;
    els.saxCalibrateBtn.textContent = "Calibrate Horn (L1 'B')";

    if (samples.length < 4) {
      els.saxCalibrateStatus.textContent =
        'Too quiet or unsteady — hold L1 (written B4) clearly near the mic and try again.';
      return;
    }

    samples.sort((a, b) => a - b);
    const medianRawMidi = samples[Math.floor(samples.length / 2)];
    const result = classifySaxCalibrationNote(medianRawMidi);
    const clampedOffset = Math.max(-60, Math.min(60, result.tuningOffsetCents));
    const sign = clampedOffset > 0 ? '+' : '';

    if (result.saxTransposition) {
      state.saxTransposition = result.saxTransposition;
      els.saxTranspositionSelect.value = result.saxTransposition;
      localStore.savePreferences({ saxTransposition: result.saxTransposition });
      applyTuningOffsetCents(clampedOffset);
      if (state.parsedMidi) {
        const track = state.parsedMidi.tracks[state.leadTrackIndex];
        state.octaveShift = autoFitSaxOctave(track?.notes ?? [], state.saxTransposition);
        persistCurrentSongSettings();
      }
      rebuildChartFromCurrentSong();
      els.saxCalibrateStatus.textContent = `Calibrated: ${result.label} • Concert ${midiToNoteName(result.targetConcertMidi)} (${sign}${clampedOffset}¢ offset applied).`;
    } else {
      applyTuningOffsetCents(clampedOffset);
      els.saxCalibrateStatus.textContent = `Heard Concert ${midiToNoteName(result.nearestMidi)} (${sign}${clampedOffset}¢ offset applied). Tip: Finger L1 only (written B4) to auto-detect Alto vs. Tenor.`;
    }
  };

  setTimeout(poll, 45);
}

async function importMidiFiles(files, targetFolderPath = '') {
  if (!files || files.length === 0) return;
  const normFolder = normalizeFolderPath(targetFolderPath);
  if (state.screen !== 'stage' || els.pauseDialog.open) return;
  if (game.isPlaying) {
    game.isPlaying = false;
    synth.stopAllVoices();
    syncTransportUI();
  }
  els.pauseDialog.showModal();
}

async function resumeFromPauseMenu() {
  if (els.pauseDialog.open) {
    els.pauseDialog.close('resume');
  }
  await synth.ensureContext();
  await mic.resumeIfSuspended();
  if (game.isFinished) {
    game.resetPlayback();
  }
  synth.resetSchedule(game.songTime);
  game.isPlaying = true;
  syncTransportUI();
}

function returnToSongPicker() {
async function refreshLegalStorageSummary() {
  const libSummary = await songLibrary.getLibrarySummary();
  const localSummary = localStore.getStorageSummary();
  const totalKb = ((libSummary.totalBytes + localSummary.approxBytes) / 1024).toFixed(1);
  els.legalStorageSummary.textContent = `Browser Storage: ${libSummary.count} uploaded MIDI(s) · ${localSummary.scoreCount} personal track record(s) · ~${totalKb} KB total`;
  els.clearSongsBtn.disabled = libSummary.count === 0;
}

function setupDialogLightDismissFallback() {
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const isOutside = (e, dialog) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e) => {
        pressedOutside = isOutside(e, dialog);
      });
      dialog.addEventListener('pointerup', (e) => {
        if (pressedOutside && isOutside(e, dialog)) dialog.close();
      });
    }
  }

  for (const dialog of [els.pauseDialog, els.legalDialog]) {
    dialog.addEventListener('close', () => {
      dialog.returnValue = '';
    });
function applySavedPreferencesToUI() {
  syncInstrumentRadios();
  for (const radio of els.playModeRadios) {
    radio.checked = radio.value === state.playMode;
  }

  applyTempoPct(state.tempoPct, { persist: false });

  els.zoomSlider.value = String(Math.round(state.lookaheadSec * 10));
  els.zoomOutput.textContent = `${state.lookaheadSec.toFixed(1)}s`;

  els.violinFourthCheckbox.checked = state.violinPreferFourth;
  els.saxTranspositionSelect.value = state.saxTransposition;

  els.backingVolSlider.value = String(savedPrefs.backingVolumePct);
  els.backingVolOutput.textContent = `${savedPrefs.backingVolumePct}%`;
  els.leadVolSlider.value = String(savedPrefs.leadVolumePct);
  els.leadVolOutput.textContent = `${savedPrefs.leadVolumePct}%`;
  synth.setVolumes({
    backingVolume: savedPrefs.backingVolumePct / 100,
    leadVolume: savedPrefs.leadVolumePct / 100,
  });

  els.latencySlider.value = String(savedPrefs.latencyOffsetMs);
  els.latencyOutput.textContent = `${savedPrefs.latencyOffsetMs} ms`;

  els.gateSlider.value = String(Math.round(state.rmsThreshold * 1000));
  els.gateOutput.textContent = state.rmsThreshold.toFixed(3);
  mic.setCalibration({ rmsThreshold: state.rmsThreshold, tuningOffsetCents: state.tuningOffsetCents });

  applyTuningOffsetCents(state.tuningOffsetCents, { persist: false });
  els.roomFilterCheckbox.checked = state.roomFilterEnabled;
  els.lobbySetupDetails.open = !state.lobbySetupCollapsed;
  els.privacyBanner.hidden = state.privacyBannerDismissed;
}

  }
}

/**
 * Decoupled ~60Hz audio/DSP simulation step so pitch polling & game timing stay
 * responsive independently of 2D/3D visual rendering frame rate.
 */
function simulationTick() {
  const now = performance.now();
  const dt = state.lastSimTime ? (now - state.lastSimTime) / 1000 : 0.016;
  state.lastSimTime = now;

  if (state.micActive) {
    const sampled = mic.samplePitch();
    state.latestPitch = sampled.pitch;
    state.latestRms = sampled.rms;
  } else {
    state.latestPitch = null;
    state.latestRms = 0;
  }

  const snap = game.update(dt, {
    pitch: state.latestPitch,
    activeMidiKeys: midiInput.activeKeys,
  });

  if (snap.didLoopWrap) {
    synth.resetSchedule(snap.songTime);
  }

  synth.scheduleWindow({
    songTime: snap.songTime,
    tempoScale: snap.tempoScale,
    isPaused: !snap.isPlaying || snap.isWaiting,
    leadNotes: state.leadNotes,
    backingNotes: state.backingNotes,
    instrumentId: state.instrumentId,
  });

  if (snap.justFinished && snap.qualifiesForHighScore && state.currentSongId) {
    const { isNewBest } = localStore.recordCompletedRun({
      songId: state.currentSongId,
      leadTrackIndex: state.leadTrackIndex,
      instrumentId: state.instrumentId,
      playMode: state.playMode,
      score: snap.score,
      accuracy: snap.accuracy,
      maxCombo: snap.maxCombo,
      tempoPct: state.tempoPct,
    });
    if (isNewBest) {
      game.lastJudgment = {
        type: 'perfect',
        label: 'NEW PERSONAL BEST!',
        noteName: `${snap.score} pts`,
        time: snap.songTime,
      };
    }
    syncBestScoreHUD();
  }
}

async function tryAutoEnableMicOnBoot() {
  if (!isMicInstrument(state.instrumentId)) return;
  try {
    if (navigator.permissions?.query) {
      const perm = await navigator.permissions.query({ name: 'microphone' });
      if (perm.state === 'granted') {
        await enableMicrophone({ auto: true });
        return;
      }
      if (perm.state === 'prompt') {
        setInputStatus('Mic ready — starts automatically on Play or Enable Microphone', 'idle');
      }
    }
  } catch {
    // Some browsers throw on permissions.query({ name: 'microphone' }); ignore cleanly
  }
}

