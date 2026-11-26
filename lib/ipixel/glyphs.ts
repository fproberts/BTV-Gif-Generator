/**
 * Browser-side glyph rasteriser. Renders each character of the message to its
 * own 1-bit image the way the app does (black ink on white, dark pixels become
 * lit LEDs) and returns the elements the protocol module packs into records.
 */

import { GlyphElement, PANEL_HEIGHT } from './protocol';

export interface RasterOptions {
    text: string;
    fontFamily: string;
    /** CSS font-weight, e.g. '500' or '700' */
    weight: string;
    sizePx: number;
    /** element height in pixels (panel height) */
    height?: number;
    /** blank columns appended after every character */
    letterSpacing: number;
    /** luminance (0-255) below which a pixel counts as ink */
    inkThreshold: number;
    /** vertical nudge in pixels (positive = down) */
    yOffset: number;
}

/** Elements store their width in one byte, so cap it. */
const MAX_ELEMENT_WIDTH = 255;

export function fontShorthand(o: Pick<RasterOptions, 'weight' | 'sizePx' | 'fontFamily'>): string {
    return `${o.weight} ${o.sizePx}px ${o.fontFamily}`;
}

/** Wait for a webfont to be usable before measuring/drawing with it. */
export async function ensureFontLoaded(o: Pick<RasterOptions, 'weight' | 'sizePx' | 'fontFamily'>): Promise<void> {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    try {
        await document.fonts.load(fontShorthand(o), 'Hg');
    } catch {
        /* fall back to whatever the browser resolves */
    }
}

export function rasterizeText(o: RasterOptions): GlyphElement[] {
    const height = o.height ?? PANEL_HEIGHT;
    const probe = document.createElement('canvas');
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    if (!pctx) return [];
    pctx.font = fontShorthand(o);

    // Centre the cap-height block (looks right for LED lettering) in the panel height.
    const cap = pctx.measureText('H');
    const capHeight = cap.actualBoundingBoxAscent || o.sizePx * 0.72;
    const baseline = Math.round((height + capHeight) / 2) + o.yOffset;

    const glyphs: GlyphElement[] = [];
    for (const ch of Array.from(o.text)) {
        const advance = Math.max(1, Math.ceil(pctx.measureText(ch).width));
        const width = Math.min(MAX_ELEMENT_WIDTH, advance + Math.max(0, o.letterSpacing));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) continue;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#000000';
        ctx.font = fontShorthand(o);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillText(ch, 0, baseline);

        const data = ctx.getImageData(0, 0, width, height).data;
        const pixels = new Uint8Array(width * height);
        for (let i = 0; i < pixels.length; i++) {
            const lum = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
            pixels[i] = lum < o.inkThreshold ? 1 : 0;
        }
        glyphs.push({ width, height, pixels });
    }
    return glyphs;
}

/** Concatenate elements side by side into one bitmap (used by the preview). */
export function composeBitmap(glyphs: GlyphElement[], height = PANEL_HEIGHT): GlyphElement {
    const width = glyphs.reduce((n, g) => n + g.width, 0);
    const pixels = new Uint8Array(Math.max(1, width) * height);
    let x0 = 0;
    for (const g of glyphs) {
        for (let y = 0; y < Math.min(height, g.height); y++) {
            for (let x = 0; x < g.width; x++) {
                if (g.pixels[y * g.width + x]) pixels[y * width + x0 + x] = 1;
            }
        }
        x0 += g.width;
    }
    return { width: Math.max(1, width), height, pixels };
}
