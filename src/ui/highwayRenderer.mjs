import { midiToSaxNoteName } from '../instruments/saxophone.mjs';
import {
  BaseHighwayRenderer,
  computeLaneGeometries,
  drawCenterPill,
  drawHeaderBar,
  drawIntonationGauge,
  drawShapeSymbol,
  getStagePalette,
  roundRectPath,
} from './baseHighwayRenderer.mjs';

export class Highway2DRenderer extends BaseHighwayRenderer {
  constructor(canvasOrOptions = null) {
    const isCanvasArg = canvasOrOptions && typeof canvasOrOptions.getContext === 'function';
    super(isCanvasArg ? {} : (canvasOrOptions ?? {}));
    this.canvas = isCanvasArg ? canvasOrOptions : (canvasOrOptions?.canvas ?? null);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.ownsCanvas = false;
    this.pianoHitZones = [];
  }

  get mode() {
    return '2d';
  }

  mount(containerEl) {
    super.mount(containerEl);
    if (!containerEl) return this;

    if (!this.canvas) {
      const existing = containerEl.querySelector?.('#highway-canvas');
      if (existing) {
        this.canvas = existing;
      } else if (typeof document !== 'undefined') {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'highway-canvas';
        this.canvas.setAttribute('aria-label', 'Scrolling instrument fingering highway');
        containerEl.appendChild(this.canvas);
        this.ownsCanvas = true;
      }
    } else if (!this.canvas.parentElement && containerEl.appendChild) {
      containerEl.appendChild(this.canvas);
    }

    if (this.canvas) {
      this.canvas.hidden = false;
      this.ctx = this.canvas.getContext('2d');
    }
    return this;
  }

  unmount() {
    this.pianoHitZones = [];
    if (this.canvas) {
      if (this.ownsCanvas && this.canvas.parentElement) {
        this.canvas.parentElement.removeChild(this.canvas);
      } else {
        this.canvas.hidden = true;
      }
    }
    super.unmount();
  }

  dispose() {
    this.unmount();
    if (this.ownsCanvas) {
      this.canvas = null;
      this.ctx = null;
    }
  }

  _syncCanvasSize() {
    if (!this.canvas || !this.ctx) {
      return { width: 800, height: 560 };
    }
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(220, Math.floor(rect.height));

    if (this.canvas.width !== Math.floor(width * dpr) || this.canvas.height !== Math.floor(height * dpr)) {
      this.canvas.width = Math.floor(width * dpr);
      this.canvas.height = Math.floor(height * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.lastWidth = width;
    this.lastHeight = height;
    return { width, height };
  }

  /**
   * Hit-test pointer coordinates against the Piano keyboard along the hit-bar.
   * Checks black keys first (on top), then white keys.
   */
  hitTestPianoKey(clientX, clientY) {
    if (!this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    for (let i = this.pianoHitZones.length - 1; i >= 0; i -= 1) {
      const zone = this.pianoHitZones[i];
      if (!zone.isBlack) continue;
      if (x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h) {
        return zone.midi;
      }
    }
    for (let i = 0; i < this.pianoHitZones.length; i += 1) {
      const zone = this.pianoHitZones[i];
      if (zone.isBlack) continue;
      if (x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h) {
        return zone.midi;
      }
    }
    return null;
  }

  render({ config, notes, songTime, bpm, activeMidiKeys, detectedPitch, gameSnapshot, hitEffects }) {
    if (!this.canvas || !this.ctx) return;
    const { width, height } = this._syncCanvasSize();
    const ctx = this.ctx;
    const isDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
    const palette = getStagePalette(isDark);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);

    const padX = 16;
    const headerH = 54;
    const footerH = config.id === 'piano' ? 114 : config.id === 'saxophone' ? 112 : 92;
    const plotX = padX;
    const plotW = width - padX * 2;
    const hitY = height - footerH;
    const trackH = hitY - headerH;
    const pxPerSec = trackH / this.lookaheadSec;

    const laneGeoms = computeLaneGeometries(config, plotX, plotW);

    // 1. Draw lane backgrounds
    for (let i = 0; i < laneGeoms.length; i += 1) {
      const g = laneGeoms[i];
      if (config.id === 'piano' && g.isAccidental) continue;
      ctx.fillStyle = g.isAccidental ? palette.laneAccidental : i % 2 === 0 ? palette.laneEven : palette.laneOdd;
      ctx.fillRect(g.x, headerH, g.w, trackH);

      ctx.strokeStyle = palette.divider;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(g.x, headerH);
      ctx.lineTo(g.x, hitY);
      ctx.stroke();
    }

    // Piano black-key lane guide stripes
    if (config.id === 'piano') {
      for (const g of laneGeoms) {
        if (!g.isAccidental) continue;
        ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.55)' : 'rgba(15, 23, 42, 0.06)';
        ctx.fillRect(g.x, headerH, g.w, trackH);
      }
    }

    // Saxophone LH / RH divider
    if (config.id === 'saxophone' && laneGeoms.length >= 7) {
      const splitX = (laneGeoms[5].x + laneGeoms[5].w + laneGeoms[6].x) / 2;
      ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.08)';
      ctx.fillRect(splitX - 6, headerH, 12, trackH);
      ctx.strokeStyle = palette.hitLine;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(splitX, headerH);
      ctx.lineTo(splitX, hitY);
      ctx.stroke();
    }

    // 2. Beat & Measure grid lines
    const secPerBeat = 60 / Math.max(30, bpm || 120);
    const minBeat = Math.floor((songTime - 0.5) / secPerBeat);
    const maxBeat = Math.ceil((songTime + this.lookaheadSec + 0.5) / secPerBeat);

    for (let b = minBeat; b <= maxBeat; b += 1) {
      const beatTime = b * secPerBeat;
      const y = hitY - (beatTime - songTime) * pxPerSec;
      if (y < headerH || y > hitY) continue;
      const isMeasure = b % 4 === 0;
      ctx.strokeStyle = isMeasure ? palette.measureLine : palette.beatLine;
      ctx.lineWidth = isMeasure ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(plotX, y);
      ctx.lineTo(plotX + plotW, y);
      ctx.stroke();
    }

    // 3. Draw falling notes clipped to highway area
    ctx.save();
    ctx.beginPath();
    ctx.rect(plotX, headerH, plotW, trackH + 14);
    ctx.clip();

    const waitSet = new Set((gameSnapshot?.waitNotes ?? []).map((n) => n.id));
    const maxVisibleTime = songTime + this.lookaheadSec + 0.3;
    const minVisibleTime = songTime - 0.6;

    for (let i = 0; i < notes.length; i += 1) {
      const note = notes[i];
      if (note.endTime < minVisibleTime) continue;
      if (note.startTime > maxVisibleTime) break;

      const yBottom = hitY - (note.startTime - songTime) * pxPerSec;
      const sustainPx = Math.max(24, note.duration * pxPerSec);
      const yTop = yBottom - sustainPx;
      const isWaitingTarget = waitSet.has(note.id);
      const alpha = note.status === 'miss' ? 0.3 : note.status === 'perfect' || note.status === 'good' ? 0.48 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;

      if (config.id === 'strings') {
        this._drawStringsNote(ctx, note, laneGeoms, yTop, yBottom, isWaitingTarget, isDark);
      } else if (config.id === 'saxophone') {
        this._drawSaxNote(ctx, note, laneGeoms, yTop, yBottom, isWaitingTarget, isDark);
      } else {
        this._drawPianoNote(ctx, note, laneGeoms, yTop, yBottom, isWaitingTarget);
      }

      ctx.restore();
    }

    ctx.restore();

    // 4. Hit-line & active key/finger illumination
    ctx.strokeStyle = gameSnapshot?.isWaiting ? palette.waitGlow : palette.hitLine;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(plotX, hitY);
    ctx.lineTo(plotX + plotW, hitY);
    ctx.stroke();

    const liveMidiSet = new Set(activeMidiKeys ?? []);
    if (detectedPitch && detectedPitch.confidence >= 0.6) {
      liveMidiSet.add(detectedPitch.nearestMidi);
    }

    // 5. Render instrument-specific Hit Bar / Footer
    if (config.id === 'piano') {
      this._drawPianoFooter(ctx, laneGeoms, hitY, footerH, liveMidiSet, isDark);
    } else if (config.id === 'strings') {
      this.pianoHitZones = [];
      this._drawStringsFooter(ctx, laneGeoms, plotX, plotW, hitY, footerH, detectedPitch, gameSnapshot, isDark);
    } else {
      this.pianoHitZones = [];
      this._drawSaxFooter(ctx, config, laneGeoms, plotX, plotW, hitY, footerH, detectedPitch, gameSnapshot, isDark);
    }

    // 6. Header lane labels (on top so scrolling notes pass cleanly behind)
    drawHeaderBar(ctx, this.lastWidth, config, laneGeoms, plotX, plotW, headerH, palette, isDark);

    // 7. Hit burst animations
    for (const eff of hitEffects ?? []) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, eff.life);
      ctx.fillStyle = eff.color;
      ctx.strokeStyle = eff.openNote && config.id === 'strings' ? eff.color : '#ffffff';
      ctx.lineWidth = 2.5;
      if (eff.openNote && config.id === 'strings') {
        const expand = (1 - eff.life) * 8;
        roundRectPath(
          ctx,
          plotX + 4 - expand * 0.4,
          hitY - 12 - expand * 0.5,
          plotW - 8 + expand * 0.8,
          24 + expand,
          10,
        );
        ctx.stroke();
        ctx.restore();
        continue;
      }
      const targets = eff.openNote ? [5] : (eff.laneIndices ?? []);
      for (const laneIdx of targets) {
        const g = laneGeoms[laneIdx];
        if (!g) continue;
        const cx = g.x + g.w / 2;
        const r = 16 + (1 - eff.life) * 20;
        ctx.beginPath();
        ctx.arc(cx, hitY, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 8. Center Wait-Mode or Judgment prompt banner
    if (gameSnapshot?.isWaiting && gameSnapshot.waitNotes?.length > 0) {
      const target = gameSnapshot.waitNotes[0];
      const msg =
        config.id === 'saxophone'
          ? `HOLD: ${target.badgeText} (Concert ${target.concertName})`
          : `PLAY: ${target.noteName} (${target.secondaryBadge || target.badgeText})`;
      drawCenterPill(ctx, width / 2, headerH + 26, msg, target.color || '#f59e0b', '#090d16');
    } else if (gameSnapshot?.lastJudgment && gameSnapshot.songTime - gameSnapshot.lastJudgment.time < 0.75) {
      const j = gameSnapshot.lastJudgment;
      const bg = j.type === 'perfect' ? '#10b981' : j.type === 'good' ? '#38bdf8' : '#ef4444';
      const fg = j.type === 'miss' ? '#ffffff' : '#0f172a';
      drawCenterPill(ctx, width / 2, headerH + 26, `${j.label}${j.noteName ? ` · ${j.noteName}` : ''}`, bg, fg);
    }
  }

  _drawStringsNote(ctx, note, laneGeoms, yTop, yBottom, isWaitingTarget, isDark) {
    if (note.openNote) {
      const firstLane = laneGeoms[0];
      const lastLane = laneGeoms[laneGeoms.length - 1];
      if (!firstLane || !lastLane) return;
      const barX = firstLane.x + 4;
      const barW = lastLane.x + lastLane.w - firstLane.x - 8;
      const headH = 24;
      const headY = yBottom - headH;

      if (yBottom - yTop > headH + 8) {
        ctx.save();
        ctx.globalAlpha *= 0.22;
        ctx.fillStyle = note.color;
        roundRectPath(ctx, barX + 10, yTop, Math.max(20, barW - 20), yBottom - yTop - headH / 2, 6);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha *= isWaitingTarget ? 0.36 : 0.24;
      ctx.fillStyle = note.color;
      roundRectPath(ctx, barX, headY, barW, headH, 10);
      ctx.fill();
      ctx.restore();

      roundRectPath(ctx, barX, headY, barW, headH, 10);
      ctx.strokeStyle = note.color;
      ctx.lineWidth = isWaitingTarget ? 3 : 2.2;
      ctx.stroke();

      const labelText = `OPEN ${note.badgeText} · ${note.noteName}`;
      ctx.font = '800 12px system-ui, -apple-system, sans-serif';
      const tw = ctx.measureText(labelText).width;
      const iconX = barX + barW / 2 - tw / 2 - 14;
      drawShapeSymbol(ctx, note.shape, iconX, headY + headH / 2, 7.5, note.color, '#090d16');

      ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, barX + barW / 2 + 8, headY + headH / 2);
      return;
    }

    const lane = laneGeoms[note.primaryLane];
    if (!lane) return;
    const cx = lane.x + lane.w / 2;
    const tailW = Math.min(20, lane.w * 0.34);

    if (yBottom - yTop > 28) {
      roundRectPath(ctx, cx - tailW / 2, yTop, tailW, yBottom - yTop - 10, 6);
      ctx.fillStyle = note.color;
      ctx.globalAlpha *= 0.45;
      ctx.fill();
      ctx.globalAlpha /= 0.45;
    }

    const radius = Math.min(20, lane.w * 0.34);
    const stroke = isWaitingTarget ? '#f8fafc' : '#0f172a';
    drawShapeSymbol(ctx, note.shape, cx, yBottom - 14, radius, note.color, stroke);

    if (isWaitingTarget) {
      ctx.strokeStyle = note.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, yBottom - 14, radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#090d16';
    ctx.font = '800 12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(note.badgeText, cx, yBottom - 13);

    ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
    ctx.font = '700 10px system-ui, -apple-system, sans-serif';
    ctx.fillText(note.noteName, cx, yBottom - radius - 22);
  }

  _drawSaxNote(ctx, note, laneGeoms, yTop, yBottom, isWaitingTarget, isDark) {
    const headH = 24;
    const headY = yBottom - headH;

    if (note.openNote) {
      const l1 = laneGeoms[2];
      const r3 = laneGeoms[8];
      const barX = l1.x + 4;
      const barW = r3.x + r3.w - l1.x - 8;
      roundRectPath(ctx, barX, headY, barW, headH, 10);
      ctx.fillStyle = isDark ? 'rgba(168, 85, 247, 0.24)' : 'rgba(168, 85, 247, 0.16)';
      ctx.fill();
      ctx.strokeStyle = isWaitingTarget ? '#fbbf24' : '#a855f7';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = isDark ? '#f3e8ff' : '#581c87';
      ctx.font = '800 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(note.badgeText, barX + barW / 2, headY + headH / 2);
      return;
    }

    const activeLanes = note.laneIndices ?? [];
    if (activeLanes.length === 0) return;

    const firstG = laneGeoms[activeLanes[0]];
    const lastG = laneGeoms[activeLanes[activeLanes.length - 1]];
    if (firstG && lastG && activeLanes.length > 1) {
      const tieX1 = firstG.x + firstG.w / 2;
      const tieX2 = lastG.x + lastG.w / 2;
      ctx.strokeStyle = isWaitingTarget ? '#fbbf24' : note.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(tieX1, headY + headH / 2);
      ctx.lineTo(tieX2, headY + headH / 2);
      ctx.stroke();
    }

    for (const laneIdx of activeLanes) {
      const g = laneGeoms[laneIdx];
      if (!g) continue;
      const pillW = Math.min(g.w - 8, 42);
      const pillX = g.x + (g.w - pillW) / 2;

      if (yBottom - yTop > headH + 6) {
        roundRectPath(ctx, g.x + g.w / 2 - 5, yTop, 10, yBottom - yTop - headH / 2, 4);
        ctx.fillStyle = note.color;
        ctx.globalAlpha *= 0.35;
        ctx.fill();
        ctx.globalAlpha /= 0.35;
      }

      roundRectPath(ctx, pillX, headY, pillW, headH, 8);
      ctx.fillStyle = g.isAccidental ? '#f59e0b' : note.color;
      ctx.fill();
      ctx.strokeStyle = isWaitingTarget ? '#fef08a' : '#0f172a';
      ctx.lineWidth = isWaitingTarget ? 2.5 : 1.5;
      ctx.stroke();

      const label = note.laneBadges?.[laneIdx] ?? g.label;
      ctx.fillStyle = '#090d16';
      ctx.font = '800 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, pillX + pillW / 2, headY + headH / 2);
    }

    const centerX = (firstG.x + firstG.w / 2 + lastG.x + lastG.w / 2) / 2;
    ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
    ctx.font = '800 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(note.badgeText, centerX, headY - 9);
  }

  _drawPianoNote(ctx, note, laneGeoms, yTop, yBottom, isWaitingTarget) {
    const lane = laneGeoms[note.primaryLane];
    if (!lane) return;
    const pad = lane.isAccidental ? 1 : 2;
    const bx = lane.x + pad;
    const bw = Math.max(8, lane.w - pad * 2);
    const bh = Math.max(22, yBottom - yTop);

    roundRectPath(ctx, bx, yBottom - bh, bw, bh, 6);
    ctx.fillStyle = note.color;
    ctx.fill();
    ctx.strokeStyle = isWaitingTarget ? '#fbbf24' : '#0f172a';
    ctx.lineWidth = isWaitingTarget ? 2.5 : 1.2;
    ctx.stroke();

    if (bw >= 18) {
      ctx.fillStyle = '#090d16';
      ctx.font = '800 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(note.noteName, bx + bw / 2, yBottom - 11);
      if (bh >= 36 && note.fingerHint) {
        ctx.fillText(`F${note.fingerHint}`, bx + bw / 2, yBottom - 24);
      }
    }
  }

  _drawStringsFooter(ctx, laneGeoms, plotX, plotW, hitY, _footerH, detectedPitch, gameSnapshot, isDark) {
    const targetNotes = gameSnapshot?.waitNotes ?? [];
    const targetLaneColors = new Map();
    let openTargetColor = null;
    for (const n of targetNotes) {
      if (n.openNote) {
        openTargetColor = n.color;
      } else if (n.primaryLane >= 0) {
        targetLaneColors.set(n.primaryLane, n.color);
      }
    }

    if (openTargetColor) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = openTargetColor;
      roundRectPath(ctx, plotX + 4, hitY + 4, plotW - 8, 34, 10);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = openTargetColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    for (const g of laneGeoms) {
      const cx = g.x + g.w / 2;
      const targetColor = targetLaneColors.get(g.index) ?? null;
      if (targetColor) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = targetColor;
        roundRectPath(ctx, g.x + 4, hitY + 6, g.w - 8, 30, 8);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = isDark ? 'rgba(30, 41, 59, 0.9)' : '#e2e8f0';
        roundRectPath(ctx, g.x + 4, hitY + 6, g.w - 8, 30, 8);
        ctx.fill();
      }
      ctx.strokeStyle = targetColor ?? (isDark ? '#334155' : '#94a3b8');
      ctx.lineWidth = targetColor ? 2 : 1.5;
      ctx.stroke();

      ctx.fillStyle = isDark ? '#e2e8f0' : '#0f172a';
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(g.label, cx, hitY + 21);
    }

    const gaugeY = hitY + 58;
    const readoutText = detectedPitch
      ? `Detected: ${detectedPitch.noteName} (${detectedPitch.centsOff > 0 ? '+' : ''}${detectedPitch.centsOff}¢ · ${Math.round(detectedPitch.frequencyHz)} Hz)`
      : 'Intonation Gauge: play a note into your microphone';
    drawIntonationGauge(ctx, plotX, plotW, gaugeY, detectedPitch, readoutText, isDark);
  }

  _drawSaxFooter(ctx, config, laneGeoms, plotX, plotW, hitY, _footerH, detectedPitch, gameSnapshot, isDark) {
    const targetNotes = gameSnapshot?.waitNotes ?? [];
    const targetLaneSet = new Set();
    for (const n of targetNotes) {
      for (const idx of n.laneIndices ?? []) targetLaneSet.add(idx);
    }

    for (const g of laneGeoms) {
      const cx = g.x + g.w / 2;
      const cy = hitY + 26;
      const isLit = targetLaneSet.has(g.index);
      const r = Math.min(18, g.w * 0.38);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = isLit ? '#f59e0b' : isDark ? '#1e293b' : '#cbd5e1';
      ctx.fill();
      ctx.strokeStyle = isLit ? '#fef08a' : g.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = isLit ? '#090d16' : isDark ? '#e2e8f0' : '#0f172a';
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(g.label, cx, cy);
    }

    const writtenOffset = config.transposition?.writtenOffset ?? 9;
    let readout = 'Laid-Down Key Stack: Left Hand (OCT..L-PK) | Right Hand (R1..R-PK)';
    if (detectedPitch) {
      const writtenName = midiToSaxNoteName(detectedPitch.nearestMidi + writtenOffset);
      const sign = detectedPitch.centsOff > 0 ? '+' : '';
      readout = `Mic: Written ${writtenName} (Concert ${detectedPitch.noteName} · ${sign}${detectedPitch.centsOff}¢)`;
    }
    drawIntonationGauge(ctx, plotX, plotW, hitY + 68, detectedPitch, readout, isDark);
  }

  _drawPianoFooter(ctx, laneGeoms, hitY, footerH, liveMidiSet, isDark) {
    const keyTop = hitY + 2;
    const whiteH = footerH - 10;
    const blackH = whiteH * 0.62;
    const zones = [];

    for (const g of laneGeoms) {
      if (g.isAccidental) continue;
      const pressed = liveMidiSet.has(g.midi);
      roundRectPath(ctx, g.x + 0.5, keyTop, g.w - 1, whiteH, 4);
      ctx.fillStyle = pressed ? '#38bdf8' : '#f8fafc';
      ctx.fill();
      ctx.strokeStyle = isDark ? '#334155' : '#64748b';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (g.isC || pressed) {
        ctx.fillStyle = pressed ? '#090d16' : '#334155';
        ctx.font = '700 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(g.sublabel, g.x + g.w / 2, keyTop + whiteH - 12);
      }

      zones.push({ midi: g.midi, x: g.x, y: keyTop, w: g.w, h: whiteH, isBlack: false });
    }

    for (const g of laneGeoms) {
      if (!g.isAccidental) continue;
      const pressed = liveMidiSet.has(g.midi);
      roundRectPath(ctx, g.x, keyTop, g.w, blackH, 3);
      ctx.fillStyle = pressed ? '#c084fc' : '#0f172a';
      ctx.fill();
      ctx.strokeStyle = pressed ? '#fef08a' : '#334155';
      ctx.lineWidth = 1;
      ctx.stroke();

      zones.push({ midi: g.midi, x: g.x, y: keyTop, w: g.w, h: blackH, isBlack: true });
    }

    this.pianoHitZones = zones;
  }
}

export { Highway2DRenderer as HighwayRenderer };
