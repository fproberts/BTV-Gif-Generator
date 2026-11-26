/**
 * Browser helpers: turn an image URL into a 96-px-wide RGB strip for panelGif.ts.
 */

import { PANEL_WIDTH, PANEL_HEIGHT } from './protocol';
import type { RgbStrip } from './panelGif';

async function loadImage(url: string): Promise<HTMLImageElement> {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
}

/**
 * Downscale in halving steps before the final resize, so detail survives better than a
 * single big drawImage (which aliases badly on large photos).
 */
function drawScaled(source: CanvasImageSource, sw: number, sh: number, tw: number, th: number): CanvasRenderingContext2D {
    let canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    let ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(source, 0, 0);
    let w = sw;
    let h = sh;
    while (w / 2 >= tw && h / 2 >= th) {
        const next = document.createElement('canvas');
        next.width = Math.round(w / 2);
        next.height = Math.round(h / 2);
        const nctx = next.getContext('2d', { willReadFrequently: true })!;
        nctx.imageSmoothingQuality = 'high';
        nctx.drawImage(canvas, 0, 0, w, h, 0, 0, next.width, next.height);
        canvas = next;
        ctx = nctx;
        w = next.width;
        h = next.height;
    }
    const out = document.createElement('canvas');
    out.width = tw;
    out.height = th;
    const octx = out.getContext('2d', { willReadFrequently: true })!;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(canvas, 0, 0, w, h, 0, 0, tw, th);
    return octx;
}

function toRgb(ctx: CanvasRenderingContext2D, w: number, h: number): Uint8Array {
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
        // composite any transparency onto black, like the panel background
        const a = rgba[i + 3] / 255;
        rgb[j] = rgba[i] * a;
        rgb[j + 1] = rgba[i + 1] * a;
        rgb[j + 2] = rgba[i + 2] * a;
    }
    return rgb;
}

/** The whole image scaled to 96 px wide (height keeps the aspect ratio, at least 16). */
export async function loadScrollStrip(url: string): Promise<RgbStrip> {
    const img = await loadImage(url);
    const height = Math.max(PANEL_HEIGHT, Math.round((img.naturalHeight * PANEL_WIDTH) / img.naturalWidth));
    const ctx = drawScaled(img, img.naturalWidth, img.naturalHeight, PANEL_WIDTH, height);
    return { rgb: toRgb(ctx, PANEL_WIDTH, height), height };
}

export type StillFit = 'cover' | 'contain';

/** A single 96x16 frame: 'cover' crops to fill (centred), 'contain' letterboxes on black. */
export async function loadStillFrame(url: string, fit: StillFit = 'cover', focusY = 0.5): Promise<Uint8Array> {
    const img = await loadImage(url);
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    const target = PANEL_WIDTH / PANEL_HEIGHT;
    if (fit === 'cover') {
        // crop the source to the panel's 6:1 shape, then scale
        let cw = sw;
        let ch = Math.round(sw / target);
        if (ch > sh) {
            ch = sh;
            cw = Math.round(sh * target);
        }
        const cx = Math.round((sw - cw) / 2);
        const cy = Math.round((sh - ch) * Math.min(1, Math.max(0, focusY)));
        const crop = document.createElement('canvas');
        crop.width = cw;
        crop.height = ch;
        crop.getContext('2d')!.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
        return toRgb(drawScaled(crop, cw, ch, PANEL_WIDTH, PANEL_HEIGHT), PANEL_WIDTH, PANEL_HEIGHT);
    }
    const scale = Math.min(PANEL_WIDTH / sw, PANEL_HEIGHT / sh);
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const inner = drawScaled(img, sw, sh, w, h);
    const out = document.createElement('canvas');
    out.width = PANEL_WIDTH;
    out.height = PANEL_HEIGHT;
    const octx = out.getContext('2d', { willReadFrequently: true })!;
    octx.fillStyle = '#000';
    octx.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
    octx.drawImage(inner.canvas, Math.round((PANEL_WIDTH - w) / 2), Math.round((PANEL_HEIGHT - h) / 2));
    return toRgb(octx, PANEL_WIDTH, PANEL_HEIGHT);
}
