/**
 * Pure, zero-DOM 3D perspective deck math for the Guitar Hero-style highway.
 *
 * Coordinate system:
 *  - uNorm: [0..1] across the highway width (left-to-right finger ergonomics)
 *  - zNorm: [0..1] depth along the deck (0 = strike bar near player, 1 = far horizon)
 *  - heightPx: vertical extrusion height above the deck surface in near-plane pixels
 */

export function createDeckLayout({ width, height, headerH = 54, footerH = 104, fovDepth = 2.15 } = {}) {
  const safeW = Math.max(320, Number(width) || 800);
  const safeH = Math.max(320, Number(height) || 560);
  const hitY = safeH - footerH;
  const trackH = Math.max(140, hitY - headerH);
  const horizonY = headerH + Math.max(18, trackH * 0.14);
  const nearW = Math.max(240, safeW - 36);
  const farScale = 1 / (1 + fovDepth);

  return {
    width: safeW,
    height: safeH,
    centerX: safeW / 2,
    headerH,
    footerH,
    hitY,
    horizonY,
    nearW,
    fovDepth,
    farScale,
    depthSpan: hitY - horizonY,
  };
}

/**
 * Project a point `(uNorm, zNorm, heightPx)` on or above the 3D tilted deck into
 * 2D screen coordinates `{ x, y, scale, fog }`.
 */
export function projectDeckPoint(uNorm, zNorm, heightPx = 0, layout) {
  const clampedZ = Math.max(-0.32, Math.min(1.45, zNorm));
  const scale = 1 / (1 + clampedZ * layout.fovDepth);
  const depthProgress = (1 - scale) / (1 - layout.farScale);

  const x = layout.centerX + (uNorm - 0.5) * layout.nearW * scale;
  const y = layout.hitY - depthProgress * layout.depthSpan - heightPx * scale;
  const fog = Math.max(0, Math.min(1, 1 - Math.max(0, clampedZ) ** 1.75 * 0.68));

  return { x, y, scale, fog };
}

/**
 * Analytical inverse of `projectDeckPoint` for a horizontal plane at `surfaceHeightPx`
 * above the deck. Used to hit-test clicks on tilted 3D Piano keys accurately.
 */
export function unprojectScreenToDeck(screenX, screenY, layout, surfaceHeightPx = 0) {
  const denom = layout.depthSpan / (1 - layout.farScale) - surfaceHeightPx;
  if (Math.abs(denom) < 1e-6) return null;

  const num = layout.hitY - screenY - layout.depthSpan / (1 - layout.farScale);
  const scale = -num / denom;
  if (!Number.isFinite(scale) || scale <= 0.12) return null;

  const zNorm = (1 / scale - 1) / layout.fovDepth;
  const uNorm = 0.5 + (screenX - layout.centerX) / (layout.nearW * scale);
  return { uNorm, zNorm };
}

/**
 * Compute normalized [u0, u1] lane spans in [0..1] for any instrument config,
 * preserving Piano's proportional white/black key layout and Saxophone's LH/RH gap.
 */
export function computeNormalizedLaneSpans(config) {
  if (!config || !Array.isArray(config.lanes) || config.lanes.length === 0) {
    return [];
  }

  if (config.id === 'piano') {
    return config.lanes.map((lane) => ({
      ...lane,
      u0: lane.xNorm,
      u1: lane.xNorm + lane.widthNorm,
      uCenter: lane.xNorm + lane.widthNorm / 2,
      uWidth: lane.widthNorm,
    }));
  }

  const lanes = config.lanes;
  const gapNorm = config.id === 'saxophone' ? 0.022 : 0;
  const usable = 1 - gapNorm;
  const totalWeight = lanes.reduce((sum, l) => sum + (l.widthWeight ?? 1), 0);

  let cursor = 0;
  return lanes.map((lane, idx) => {
    if (config.id === 'saxophone' && idx === 6) {
      cursor += gapNorm;
    }
    const uWidth = ((lane.widthWeight ?? 1) / totalWeight) * usable;
    const span = {
      ...lane,
      u0: cursor,
      u1: cursor + uWidth,
      uCenter: cursor + uWidth / 2,
      uWidth,
    };
    cursor += uWidth;
    return span;
  });
}

/**
 * Point-in-polygon check (winding/ray-cast) for projected 3D key faces.
 */
export function pointInQuad(px, py, quad) {
  if (!quad || quad.length < 3) return false;
  let inside = false;
  for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
    const xi = quad[i].x;
    const yi = quad[i].y;
    const xj = quad[j].x;
    const yj = quad[j].y;
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
