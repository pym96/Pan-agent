/**
 * WorkOrder #60 scrollbar geometry (Criteria-Version 1.1 preserves the 1.0 formulas).
 * Every value derives from rendered transcript rows and the body viewport,
 * never from raw entry or tool-event counts. Pure and TUI-local.
 */

export interface ScrollbarGeometry {
 /** Thumb height in track rows: clamp(ceil(V*V/N), 1, T). */
 readonly thumbSize: number;
 /** 0-based track coordinate of the first thumb row: round((T-thumbSize)*top/maxTop) clamped to 0..T-thumbSize. */
 readonly thumbStart: number;
 /** max(0, N - V): maximum viewport top in rendered rows. */
 readonly maxTop: number;
 /** Track height in rows; equals the body height V. */
 readonly track: number;
}

/** Returns undefined when the transcript fits the viewport: the track stays blank and no thumb exists. */
export function scrollbarGeometry(rows: number, bodyHeight: number, top: number): ScrollbarGeometry | undefined {
 const maxTop = Math.max(0, rows - bodyHeight);
 if (bodyHeight <= 0 || maxTop === 0) return undefined;
 const track = bodyHeight;
 const thumbSize = Math.max(1, Math.min(track, Math.ceil(bodyHeight * bodyHeight / rows)));
 const thumbStart = Math.max(0, Math.min(track - thumbSize, Math.round((track - thumbSize) * top / maxTop)));
 return { thumbSize, thumbStart, maxTop, track };
}

/**
 * Frozen #60 primary press/drag/release mapping. `y` is the 1-based terminal row of a
 * participating report; the track occupies y = 2..bodyHeight+1, so p = y - 2.
 * Returns the new viewport top, or undefined when there is no overflow (blank track is inert).
 */
export function scrollbarDragTop(rows: number, bodyHeight: number, y: number): number | undefined {
 const geometry = scrollbarGeometry(rows, bodyHeight, 0);
 if (!geometry) return undefined;
 const { thumbSize, track, maxTop } = geometry;
 const thumbStart = Math.max(0, Math.min(track - thumbSize, y - 2 - Math.floor(thumbSize / 2)));
 return track === thumbSize ? 0 : Math.round(thumbStart * maxTop / (track - thumbSize));
}

/** Criteria-Version 1.1 captured-drag mapping. Pointer y may overshoot the track;
 * x deliberately has no role after the initial in-track press established capture. */
export function scrollbarCapturedDragTop(rows: number, bodyHeight: number, y: number, grabOffset: number): number | undefined {
 const geometry = scrollbarGeometry(rows, bodyHeight, 0);
 if (!geometry) return undefined;
 const { thumbSize, track, maxTop } = geometry;
 const p = Math.max(0, Math.min(track - 1, y - 2));
 const thumbStart = Math.max(0, Math.min(track - thumbSize, p - grabOffset));
 return track === thumbSize ? 0 : Math.round(thumbStart * maxTop / (track - thumbSize));
}
