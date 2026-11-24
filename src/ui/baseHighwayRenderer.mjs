/**
 * Abstract interface & shared drawing utilities for interchangeable
 * 2D and 3D Buskero highway renderers.
 */
export class BaseHighwayRenderer {
  constructor(options = {}) {
    this.lookaheadSec = Math.max(1.2, Math.min(4.5, Number(options.lookaheadSec) || 2.5));
    this.container = null;
    this.lastWidth = 0;
    this.lastHeight = 0;
  }

  get mode() {
    return 'base';
  }

  mount(containerEl) {
    this.container = containerEl ?? null;
    return this;
  }

  unmount() {
    this.container = null;
  }

  setLookaheadSec(sec) {
    this.lookaheadSec = Math.max(1.2, Math.min(4.5, Number(sec) || 2.5));
  }

  hitTestPianoKey(_clientX, _clientY) {
    return null;
  }

  render(_frameState) {
    throw new Error(`${this.constructor.name}.render() must be implemented by subclass.`);
  }

  dispose() {
    this.unmount();
  }
}

export function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function drawShapeSymbol(ctx, shape, cx, cy, radius, fillColor, strokeColor) {
  ctx.save();
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.beginPath();

  if (shape === 'diamond') {
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx + radius, cy);
    ctx.lineTo(cx, cy + radius);
    ctx.lineTo(cx - radius, cy);
    ctx.closePath();
  } else if (shape === 'triangle') {
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx + radius * 0.95, cy + radius * 0.8);
    ctx.lineTo(cx - radius * 0.95, cy + radius * 0.8);
    ctx.closePath();
  } else if (shape === 'square') {
    const side = radius * 1.6;
    ctx.rect(cx - side / 2, cy - side / 2, side, side);
  } else if (shape === 'hex') {
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const px = cx + Math.cos(angle) * radius;
      const py = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  }

  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function computeLaneGeometries(config, plotX, plotW) {
  if (config.id === 'piano') {
    return config.lanes.map((lane) => ({
      ...lane,
      x: plotX + lane.xNorm * plotW,
      w: lane.widthNorm * plotW,
    }));
  }

  const lanes = config.lanes;
  const gapBetweenHands = config.id === 'saxophone' ? 14 : 0;
  const usableW = plotW - gapBetweenHands;
  const totalWeight = lanes.reduce((sum, l) => sum + (l.widthWeight ?? 1), 0);

  let cursorX = plotX;
  return lanes.map((lane, idx) => {
    if (config.id === 'saxophone' && idx === 6) {
      cursorX += gapBetweenHands;
    }
    const w = ((lane.widthWeight ?? 1) / totalWeight) * usableW;
    const geom = { ...lane, x: cursorX, w };
    cursorX += w;
    return geom;
  });
}

export function getStagePalette(isDark) {
  return isDark
    ? {
        bg: '#0b101b',
        laneEven: '#0f172a',
        laneOdd: '#131d33',
        laneAccidental: '#161b2e',
        divider: 'rgba(148, 163, 184, 0.16)',
        beatLine: 'rgba(148, 163, 184, 0.14)',
        measureLine: 'rgba(148, 163, 184, 0.34)',
        headerBg: '#090d16',
        text: '#f1f5f9',
        muted: '#94a3b8',
        hitLine: '#38bdf8',
        waitGlow: '#f59e0b',
      }
    : {
        bg: '#f1f5f9',
        laneEven: '#ffffff',
        laneOdd: '#f8fafc',
        laneAccidental: '#eef2ff',
        divider: 'rgba(15, 23, 42, 0.12)',
        beatLine: 'rgba(15, 23, 42, 0.08)',
        measureLine: 'rgba(15, 23, 42, 0.24)',
        headerBg: '#e2e8f0',
        text: '#0f172a',
        muted: '#475569',
        hitLine: '#0284c7',
        waitGlow: '#d97706',
      };
}

export function drawCenterPill(ctx, cx, cy, text, bgColor, textColor) {
  ctx.save();
  ctx.font = '700 13px system-ui, -apple-system, sans-serif';
  const tw = ctx.measureText(text).width;
  const w = tw + 28;
  const h = 30;
  roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, 15);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 0.5);
  ctx.restore();
}

export function drawHeaderBar(ctx, width, config, laneGeoms, plotX, plotW, headerH, palette, isDark) {
  ctx.save();
  ctx.fillStyle = palette.headerBg;
  ctx.fillRect(0, 0, width, headerH);

  ctx.font = '700 11px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (config.groups) {
    for (const grp of config.groups) {
      const start = laneGeoms[grp.startLane];
      const end = laneGeoms[grp.endLane];
      if (!start || !end) continue;
      const gx = start.x;
      const gw = end.x + end.w - start.x;
      ctx.fillStyle = palette.muted;
      ctx.fillText(grp.label.toUpperCase(), gx + gw / 2, 11);
    }
  }

  for (const g of laneGeoms) {
    if (config.id === 'piano' && g.isAccidental) continue;
    const cx = g.x + g.w / 2;
    if (config.id === 'piano') {
      if (g.isC) {
        ctx.fillStyle = palette.text;
        ctx.font = '700 11px system-ui, sans-serif';
        ctx.fillText(g.label, cx, 36);
      }
      continue;
    }

    ctx.fillStyle = g.isAccidental ? (isDark ? '#cbd5e1' : '#334155') : palette.text;
    ctx.font = '700 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(g.label, cx, 31);
    if (g.sublabel) {
      ctx.fillStyle = palette.muted;
      ctx.font = '600 10px system-ui, -apple-system, sans-serif';
      ctx.fillText(g.sublabel, cx, 45);
    }
  }

  ctx.strokeStyle = palette.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plotX, headerH);
  ctx.lineTo(plotX + plotW, headerH);
  ctx.stroke();
  ctx.restore();
}

export function drawIntonationGauge(ctx, plotX, plotW, gaugeY, detectedPitch, readoutText, isDark) {
  const gaugeW = Math.min(380, plotW - 40);
  const gaugeX = plotX + (plotW - gaugeW) / 2;

  roundRectPath(ctx, gaugeX, gaugeY - 8, gaugeW, 16, 8);
  ctx.fillStyle = isDark ? '#1e293b' : '#cbd5e1';
  ctx.fill();

  const sweetW = gaugeW * 0.4;
  roundRectPath(ctx, gaugeX + (gaugeW - sweetW) / 2, gaugeY - 8, sweetW, 16, 4);
  ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
  ctx.fill();

  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(gaugeX + gaugeW / 2, gaugeY - 11);
  ctx.lineTo(gaugeX + gaugeW / 2, gaugeY + 11);
  ctx.stroke();

  ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('-50¢ Flat', gaugeX - 8, gaugeY + 1);
  ctx.textAlign = 'left';
  ctx.fillText('+50¢ Sharp', gaugeX + gaugeW + 8, gaugeY + 1);

  if (detectedPitch) {
    const clampedCents = Math.max(-50, Math.min(50, detectedPitch.centsOff));
    const needleX = gaugeX + ((clampedCents + 50) / 100) * gaugeW;
    const inTune = Math.abs(clampedCents) <= 20;
    ctx.fillStyle = inTune ? '#10b981' : '#f59e0b';
    ctx.beginPath();
    ctx.arc(needleX, gaugeY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.fillStyle = detectedPitch ? (isDark ? '#f8fafc' : '#0f172a') : isDark ? '#94a3b8' : '#475569';
  ctx.font = detectedPitch ? '700 12px system-ui, sans-serif' : '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(readoutText, plotX + plotW / 2, gaugeY + 22);
}

/**
 * Coordinates replaceable 2D/3D renderers so activeMode, mounted DOM/canvas
 * state, GPU capability fallback, and synchronous fallback re-entrancy stay
 * synchronized from initial boot through Stage transitions.
 */
export function createHighwayViewSwitcher({
  renderers,
  gpuCapability,
  initialMode = 'auto',
  getLookaheadSec = () => 2.5,
  onModeChanged = () => {},
} = {}) {
  const resolveMode = (requested) => {
    if (requested === '3d') {
      return gpuCapability?.supported ? '3d' : '2d';
    }
    if (requested === '2d') {
      return '2d';
    }
    return gpuCapability?.recommendedMode === '3d' && gpuCapability?.supported ? '3d' : '2d';
  };

  let activeMode = resolveMode(initialMode);
  let activeRenderer = renderers?.[activeMode] ?? renderers?.['2d'] ?? null;
  let mountedContainer = null;

  const syncMount = (containerEl) => {
    mountedContainer = containerEl ?? null;
    if (!mountedContainer || !activeRenderer) return activeRenderer;

    for (const renderer of Object.values(renderers ?? {})) {
      if (renderer && renderer !== activeRenderer && renderer.container) {
        renderer.unmount();
      }
    }

    activeRenderer.setLookaheadSec(getLookaheadSec());
    if (activeRenderer.container !== mountedContainer) {
      activeRenderer.mount(mountedContainer);
    }
    return activeRenderer;
  };

  const switchMode = (requestedMode, { persist = true } = {}) => {
    const nextMode = resolveMode(requestedMode);
    const prevRenderer = activeRenderer;
    const targetRenderer = renderers?.[nextMode] ?? renderers?.['2d'] ?? null;
    if (!targetRenderer) return activeMode;

    if (
      activeMode === nextMode &&
      prevRenderer === targetRenderer &&
      (!mountedContainer || targetRenderer.container === mountedContainer)
    ) {
      onModeChanged({ mode: activeMode, persist });
      return activeMode;
    }

    activeMode = nextMode;
    activeRenderer = targetRenderer;
    activeRenderer.setLookaheadSec(getLookaheadSec());

    if (mountedContainer) {
      if (prevRenderer && prevRenderer !== activeRenderer && prevRenderer.container) {
        prevRenderer.unmount();
      }
      if (activeRenderer.container !== mountedContainer) {
        activeRenderer.mount(mountedContainer);
      }
    }

    // If mount() triggered onFallbackNeeded -> switchMode('2d') synchronously,
    // preserve the fallback state instead of overwriting it.
    if (activeMode !== nextMode) {
      return activeMode;
    }

    onModeChanged({ mode: activeMode, persist });
    return activeMode;
  };

  const unmountAll = () => {
    for (const renderer of Object.values(renderers ?? {})) {
      if (renderer?.container) {
        renderer.unmount();
      }
    }
    mountedContainer = null;
  };

  return {
    get activeMode() {
      return activeMode;
    },
    get activeRenderer() {
      return activeRenderer;
    },
    resolveMode,
    syncMount,
    switchMode,
    unmountAll,
  };
}
