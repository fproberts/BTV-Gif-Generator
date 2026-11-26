/**
 * Panel-safe GIF builders (pure; the browser side turns images/text into RGB strips first).
 *
 * Hardware rules (docs/rea-findings.md section 7): one global palette, full opaque frames,
 * 64 colours without dithering looks best, each playlist item plays its GIF once, and the
 * panel shows any item for at least ~6 s.
 */

import { encodeGif } from './gifEncoder.ts';
import { buildPalette, mapToPalette } from './quantize.ts';
import { PANEL_WIDTH, PANEL_HEIGHT } from './protocol.ts';

export const DEFAULT_COLOURS = 64;
/** Default scroll speed in pixels per second (2 px / 60 ms ≈ 33 px/s was too fast for photos). */
export const DEFAULT_SCROLL_PX_PER_SEC = 16;
/** Observed: the panel keeps any playlist item up for about this long, even if its GIF is shorter. */
export const PANEL_MIN_ITEM_MS = 6000;
/** Pixels per frame for playlist scrolling: 2 halves the upload compared with 1, at the same speed. */
export const FLOW_STEP_PX = 2;
/** Shortest scroll chunk per slot, with a margin over PANEL_MIN_ITEM_MS. */
export const FLOW_MIN_MS = 7000;
/** Long pictures are cut every this many rows (120 frames at 2 px), well under the 250 frames tested. */
export const FLOW_MAX_ROWS = 240;

/** An RGB image exactly PANEL_WIDTH wide, `height` rows tall. */
export interface RgbStrip {
    rgb: Uint8Array;
    height: number;
}

export interface ScrollOptions {
    colours?: number;
    pxPerSecond?: number;
    /** pixels moved per frame; 2 halves the frames (and file size) at the same speed */
    stepPx?: number;
    /**
     * true: the bottom flows straight back into the top (endless loop, no pause).
     * false: scroll from top to bottom, then hold the last frame for holdEndMs.
     */
    wrap?: boolean;
    holdEndMs?: number;
}

export interface BuiltGif {
    bytes: Uint8Array;
    frames: number;
    durationMs: number;
}

const FRAME = PANEL_WIDTH * PANEL_HEIGHT;

function indexedStrip(strip: RgbStrip, colours: number) {
    if (strip.rgb.length !== PANEL_WIDTH * strip.height * 3) throw new Error('Strip must be 96 px wide RGB');
    const palette = buildPalette(strip.rgb, Math.max(2, Math.min(256, colours)));
    return { palette, indices: mapToPalette(strip.rgb, palette) };
}

/** Rows [top, top+16) of the indexed strip, wrapping around the end when `wrap` is set. */
function cropRows(indices: Uint8Array, height: number, top: number, wrap: boolean): Uint8Array {
    const out = new Uint8Array(FRAME);
    for (let y = 0; y < PANEL_HEIGHT; y++) {
        let row = top + y;
        if (row >= height) row = wrap ? row % height : height - 1;
        out.set(indices.subarray(row * PANEL_WIDTH, (row + 1) * PANEL_WIDTH), y * PANEL_WIDTH);
    }
    return out;
}

/** A vertically scrolling GIF of a tall strip (single image, or several stacked). */
export function buildScrollGif(strip: RgbStrip, opts: ScrollOptions = {}): BuiltGif {
    const { palette, indices } = indexedStrip(strip, opts.colours ?? DEFAULT_COLOURS);
    const step = Math.max(1, Math.round(opts.stepPx ?? 1));
    const speed = Math.max(1, opts.pxPerSecond ?? DEFAULT_SCROLL_PX_PER_SEC);
    // GIF delays are in 10 ms units
    const delayMs = Math.max(20, Math.round((1000 * step) / speed / 10) * 10);
    const wrap = opts.wrap ?? false;

    if (strip.height <= PANEL_HEIGHT) {
        const hold = Math.max(PANEL_MIN_ITEM_MS, opts.holdEndMs ?? PANEL_MIN_ITEM_MS);
        const bytes = encodeGif({ width: PANEL_WIDTH, height: PANEL_HEIGHT, palette, frames: [{ indices: cropRows(indices, strip.height, 0, false), delayMs: hold }] });
        return { bytes, frames: 1, durationMs: hold };
    }

    const last = wrap ? strip.height - step : strip.height - PANEL_HEIGHT;
    const frames = [];
    for (let top = 0; top <= last; top += step) frames.push({ indices: cropRows(indices, strip.height, top, wrap), delayMs });
    if (!wrap && (opts.holdEndMs ?? 0) > 0) frames[frames.length - 1].delayMs += opts.holdEndMs!;
    const durationMs = frames.reduce((t, f) => t + f.delayMs, 0);
    return { bytes: encodeGif({ width: PANEL_WIDTH, height: PANEL_HEIGHT, palette, frames }), frames: frames.length, durationMs };
}

/** A GIF of chosen 16-row windows of a strip (one chunk of a continuous scroll, see lib/playlist/flow.ts). */
export function buildFramesGif(strip: RgbStrip, frames: { top: number; delayMs: number }[], colours = DEFAULT_COLOURS): BuiltGif {
    if (!frames.length) throw new Error('No frames');
    const { palette, indices } = indexedStrip(strip, colours);
    const gifFrames = frames.map((f) => ({ indices: cropRows(indices, strip.height, f.top, false), delayMs: f.delayMs }));
    const durationMs = frames.reduce((t, f) => t + f.delayMs, 0);
    return { bytes: encodeGif({ width: PANEL_WIDTH, height: PANEL_HEIGHT, palette, frames: gifFrames }), frames: frames.length, durationMs };
}

/** A still 96x16 picture shown for `seconds` (the panel's ~6 s minimum still applies). */
export function buildStillGif(frame: Uint8Array, seconds: number, colours = DEFAULT_COLOURS): BuiltGif {
    if (frame.length !== FRAME * 3) throw new Error('A still frame must be 96x16 RGB');
    const palette = buildPalette(frame, colours);
    const delayMs = Math.max(10, Math.round(seconds * 1000));
    const bytes = encodeGif({ width: PANEL_WIDTH, height: PANEL_HEIGHT, palette, frames: [{ indices: mapToPalette(frame, palette), delayMs }] });
    return { bytes, frames: 1, durationMs: delayMs };
}

/** Stack several 96-wide strips into one (for continuous scroll across images). */
export function stackStrips(strips: RgbStrip[]): RgbStrip {
    const height = strips.reduce((h, s) => h + s.height, 0);
    const rgb = new Uint8Array(PANEL_WIDTH * height * 3);
    let offset = 0;
    for (const s of strips) {
        rgb.set(s.rgb, offset);
        offset += s.rgb.length;
    }
    return { rgb, height };
}

/** Rough upload time at the measured ~12 KB/s. */
export function estimateUploadSeconds(bytes: number): number {
    return bytes / (12 * 1024);
}
