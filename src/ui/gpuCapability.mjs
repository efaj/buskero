const SOFTWARE_RENDERER_PATTERN = /SwiftShader|llvmpipe|Software Rasterizer|Microsoft Basic Render/i;

/**
 * Probe whether hardware-accelerated WebGL is available without storing or
 * exposing device fingerprint strings. Respects prefers-reduced-motion.
 */
export function detect3DCapability({ documentRef, windowRef } = {}) {
  const doc = documentRef ?? (typeof document !== 'undefined' ? document : null);
  const win = windowRef ?? (typeof window !== 'undefined' ? window : null);
  const prefersReducedMotion = Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

  if (!doc || typeof doc.createElement !== 'function') {
    return {
      supported: false,
      prefersReducedMotion,
      recommendedMode: '2d',
      reason: 'DOM canvas unavailable',
    };
  }

  const canvas = doc.createElement('canvas');
  const attrs = {
    alpha: false,
    antialias: true,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: true,
  };

  let gl = null;
  try {
    gl = canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs);
  } catch {
    gl = null;
  }

  if (!gl) {
    return {
      supported: false,
      prefersReducedMotion,
      recommendedMode: '2d',
      reason: 'Hardware-accelerated WebGL is unavailable on this device/browser.',
    };
  }

  let isSoftware = false;
  try {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const rendererName = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
      isSoftware = SOFTWARE_RENDERER_PATTERN.test(rendererName);
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // Ignore extension probing errors
  }

  if (isSoftware) {
    return {
      supported: false,
      prefersReducedMotion,
      recommendedMode: '2d',
      reason: 'Software WebGL rasterizer detected; using 2D highway for smooth playback.',
    };
  }

  return {
    supported: true,
    prefersReducedMotion,
    recommendedMode: prefersReducedMotion ? '2d' : '3d',
    reason: prefersReducedMotion
      ? 'Hardware WebGL available; defaulting to 2D to respect Reduced Motion preference.'
      : 'Hardware WebGL2/WebGL accelerated 3D stage available.',
  };
}

/**
 * Monitors visual frame delta times while the page is visible and signals if
 * sustained frame times stay too slow (> 34ms average across 45 frames) so
 * visual rendering can fall back to 2D while audio/YIN stays independent.
 */
export class FrameBudgetMonitor {
  constructor({ maxFrameMs = 34, windowSize = 45 } = {}) {
    this.maxFrameMs = maxFrameMs;
    this.windowSize = windowSize;
    this.samples = [];
    this.tripped = false;
  }

  reset() {
    this.samples.length = 0;
    this.tripped = false;
  }

  recordFrame(deltaMs, isVisible = true) {
    if (!isVisible || this.tripped) return false;
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > 250) {
      return false;
    }
    this.samples.push(deltaMs);
    if (this.samples.length > this.windowSize) {
      this.samples.shift();
    }
    if (this.samples.length === this.windowSize) {
      const avg = this.samples.reduce((sum, v) => sum + v, 0) / this.samples.length;
      if (avg > this.maxFrameMs) {
        this.tripped = true;
        return true;
      }
    }
    return false;
  }
}
