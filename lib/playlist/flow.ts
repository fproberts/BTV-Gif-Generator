/**
 * Continuous scroll across several pictures, cut into panel slots.
 *
 * The pictures are stacked into one tall column and scrolled as a single movement. That
 * movement is cut into chunks, one per slot. Each chunk starts exactly where the previous one
 * ended, so the panel's slot-to-slot switch is invisible. Chunks are long enough that the
 * panel's minimum display time (~6 s) never cuts them short. Their boundaries follow picture
 * starts, so changing one picture only changes its own chunk and the one before it.
 *
 * - loop: the last chunk flows back into the first picture (a playlist of only pictures).
 * - otherwise the run stops on the bottom of the last picture (pictures between texts); a run
 *   too short for the minimum display time scrolls more slowly to fill it.
 *
 * Pure: works on picture heights, the browser turns the plan into GIFs.
 */

import { PANEL_HEIGHT } from '../ipixel/protocol.ts';

export interface FlowPicture {
    url: string;
    /** height of the picture's 96-px-wide strip */
    height: number;
    pxPerSecond: number;
}

/** Rows [from, to) of one picture's strip. */
export interface RowSpan {
    url: string;
    from: number;
    to: number;
}

/** `top` is the first row shown, counted from the start of the chunk's rows. */
export interface FlowFrame {
    top: number;
    delayMs: number;
}

export interface FlowChunk {
    /** the rows this chunk shows, top to bottom */
    rows: RowSpan[];
    frames: FlowFrame[];
    durationMs: number;
}

export interface FlowOptions {
    loop: boolean;
    /** pixels moved per frame */
    stepPx: number;
    /** shortest chunk; keep it above the panel's minimum display time */
    minMs: number;
    /** long pictures are cut every this many rows, to keep each GIF small */
    maxRows: number;
}

/** GIF delays are in 10 ms units. */
export function frameDelayMs(stepPx: number, pxPerSecond: number): number {
    return Math.max(20, Math.round((1000 * stepPx) / Math.max(1, pxPerSecond) / 10) * 10);
}

export function planFlow(input: FlowPicture[], opts: FlowOptions): FlowChunk[] {
    let pictures = input.filter((p) => p.height > 0);
    if (!pictures.length) return [];
    let step = Math.max(1, Math.round(opts.stepPx));

    // A loop shorter than the minimum would be cut off: repeat it inside one chunk instead.
    if (opts.loop) {
        const cycle = pictures.reduce((t, p) => t + (p.height / step) * frameDelayMs(step, p.pxPerSecond), 0);
        if (cycle < opts.minMs) {
            const times = Math.ceil(opts.minMs / cycle);
            pictures = Array.from({ length: times }, () => pictures).flat();
        }
    }

    const starts: number[] = [];
    let total = 0;
    for (const p of pictures) {
        starts.push(total);
        total += p.height;
    }

    const pictureAt = (row: number) => {
        const r = ((row % total) + total) % total;
        let i = starts.length - 1;
        while (starts[i] > r) i--;
        return i;
    };

    /** global rows [from, to) as spans of picture rows (wrapping round when looping) */
    const spans = (from: number, to: number): RowSpan[] => {
        const out: RowSpan[] = [];
        let row = from;
        while (row < to) {
            if (!opts.loop && row >= total) break;
            const i = pictureAt(row);
            const base = Math.floor(row / total) * total + starts[i];
            const end = Math.min(to, base + pictures[i].height);
            out.push({ url: pictures[i].url, from: row - base, to: end - base });
            row = end;
        }
        return out;
    };

    // Too short to scroll: one still frame, held for the minimum.
    if (!opts.loop && total <= PANEL_HEIGHT) {
        return [{ rows: spans(0, total), frames: [{ top: 0, delayMs: opts.minMs }], durationMs: opts.minMs }];
    }

    // The first rows a frame can show. A loop runs to the end and wraps; otherwise it stops on the last screenful.
    const end = opts.loop ? total : total - PANEL_HEIGHT;
    const cuts = new Set<number>([0]);
    pictures.forEach((p, i) => {
        for (let r = starts[i]; r < starts[i] + p.height; r += opts.maxRows) cuts.add(r);
    });
    const bounds = [...cuts].filter((c) => c < end).sort((a, b) => a - b);

    const framesFor = (from: number, to: number, last: boolean): FlowFrame[] => {
        const frames: FlowFrame[] = [];
        // delays alternate between 10 ms steps (e.g. 120/130) so the average speed is exact;
        // timed from the chunk start, so a chunk's frames don't depend on what came before it
        const at = (row: number, speed: number) => Math.round((row * 1000) / Math.max(1, speed) / 10) * 10;
        for (let top = from; top < to; top += step) {
            const speed = pictures[pictureAt(top + PANEL_HEIGHT / 2)].pxPerSecond;
            frames.push({ top: top - from, delayMs: Math.max(20, at(top - from + step, speed) - at(top - from, speed)) });
        }
        // a stopping run always ends exactly on the bottom of the last picture
        if (last && !opts.loop && frames[frames.length - 1]?.top !== to - from) frames.push({ top: to - from, delayMs: frameDelayMs(step, pictures[pictures.length - 1].pxPerSecond) });
        return frames;
    };
    const duration = (frames: FlowFrame[]) => frames.reduce((t, f) => t + f.delayMs, 0);

    // A stopping run shorter than the minimum scrolls more slowly so it fills the minimum.
    if (!opts.loop) {
        const whole = duration(framesFor(0, end, true));
        if (whole < opts.minMs) {
            const slower = whole / opts.minMs;
            pictures = pictures.map((p) => ({ ...p, pxPerSecond: p.pxPerSecond * slower }));
            // slow movement in big steps looks jerky; these runs are small, so move 1 px at a time
            step = 1;
        }
    }

    // Group the pieces between cuts into chunks of at least minMs; a short remainder joins the chunk before it.
    const groups: [number, number][] = [];
    let groupStart = bounds[0];
    for (let k = 0; k < bounds.length; k++) {
        const pieceEnd = k + 1 < bounds.length ? bounds[k + 1] : end;
        if (k + 1 < bounds.length && duration(framesFor(groupStart, pieceEnd, false)) >= opts.minMs) {
            groups.push([groupStart, pieceEnd]);
            groupStart = pieceEnd;
        }
    }
    if (groupStart < end || groups.length === 0) {
        const remainder = duration(framesFor(groupStart, end, true));
        if (groups.length && remainder < opts.minMs) groups[groups.length - 1][1] = end;
        else groups.push([groupStart, end]);
    }

    return groups.map(([from, to], g) => {
        const last = g === groups.length - 1;
        const frames = framesFor(from, to, last);
        // rounding can leave a stopping run a few ms short: hold the last frame for the rest
        if (last && !opts.loop) {
            const short = opts.minMs - duration(frames);
            if (short > 0) frames[frames.length - 1].delayMs += Math.ceil(short / 10) * 10;
        }
        const lastTop = from + frames[frames.length - 1].top;
        return { rows: spans(from, lastTop + PANEL_HEIGHT), frames, durationMs: duration(frames) };
    });
}
