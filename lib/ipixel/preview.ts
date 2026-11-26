/**
 * Panel preview engine: turns the message bitmap into 96x16 RGBA frames for a
 * given effect and time. Effect motion is an *approximation* of the panel's
 * firmware (we have not seen it run); the bitmap itself is exactly what is sent.
 */

import { GlyphElement, PANEL_HEIGHT, PANEL_WIDTH, RGB, TEXT_EFFECTS } from './protocol';

export interface PreviewSettings {
    effect: number;
    /** the raw speed byte that will be sent (after any inversion) */
    speed: number;
    hAlign: number;
    textColor: RGB;
    bgColor: RGB;
    border: { type: number; speed: number } | null;
}

/** Larger byte = faster in the preview. This direction is unverified on hardware. */
const pxPerSecond = (speed: number) => 10 + speed * 0.55;

function hash(n: number): number {
    let x = (n + 0x9e3779b9) | 0;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return ((x ^ (x >>> 16)) >>> 0) / 0xffffffff;
}

export function renderPreviewFrame(bm: GlyphElement, s: PreviewSettings, tMs: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(PANEL_WIDTH * PANEL_HEIGHT * 4);
    const key = TEXT_EFFECTS.find((e) => e.id === s.effect)?.key ?? 'fixed';
    const t = tMs / 1000;
    const v = pxPerSecond(s.speed);
    const W = bm.width;

    const alignedX = (): number => {
        if (W >= PANEL_WIDTH) return 0;
        if (s.hAlign === 0) return 0;
        if (s.hAlign === 2) return PANEL_WIDTH - W;
        return Math.floor((PANEL_WIDTH - W) / 2);
    };

    let ox = alignedX();
    let oy = 0;
    let gain = 1;
    let visible = true;
    let revealX = Infinity;
    let beamX = -1;

    switch (key) {
        case 'left':
            ox = Math.round(PANEL_WIDTH - ((t * v) % (W + PANEL_WIDTH)));
            break;
        case 'right':
            ox = Math.round(-W + ((t * v) % (W + PANEL_WIDTH)));
            break;
        case 'up':
            oy = Math.round(PANEL_HEIGHT - ((t * v * 0.5) % (PANEL_HEIGHT * 2)));
            break;
        case 'down':
            oy = Math.round(-PANEL_HEIGHT + ((t * v * 0.5) % (PANEL_HEIGHT * 2)));
            break;
        case 'blink': {
            const period = Math.max(0.2, 1.2 - s.speed / 255);
            visible = Math.floor(t / period) % 2 === 0;
            break;
        }
        case 'breathe': {
            const period = Math.max(0.8, 3 - s.speed / 100);
            gain = 0.12 + 0.88 * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / period));
            break;
        }
        case 'laser': {
            const span = PANEL_WIDTH + 12;
            const p = (t * v) % span;
            beamX = Math.round(p) - 6;
            revealX = beamX;
            break;
        }
        default:
            break;
    }

    const bg = s.bgColor;
    const fg = s.textColor;
    for (let y = 0; y < PANEL_HEIGHT; y++) {
        for (let x = 0; x < PANEL_WIDTH; x++) {
            const sx = x - ox;
            const sy = y - oy;
            let ink = 0;
            if (visible && sx >= 0 && sx < W && sy >= 0 && sy < PANEL_HEIGHT && x <= revealX) ink = bm.pixels[sy * W + sx];
            const i = (y * PANEL_WIDTH + x) * 4;
            out[i] = ink ? fg.r * gain : bg.r;
            out[i + 1] = ink ? fg.g * gain : bg.g;
            out[i + 2] = ink ? fg.b * gain : bg.b;
            out[i + 3] = 255;
        }
    }

    if (key === 'laser' && beamX >= 0 && beamX < PANEL_WIDTH) {
        for (let y = 0; y < PANEL_HEIGHT; y++) {
            const i = (y * PANEL_WIDTH + beamX) * 4;
            out[i] = 255;
            out[i + 1] = 60;
            out[i + 2] = 60;
        }
    }

    if (key === 'snowflake') {
        for (let k = 0; k < 18; k++) {
            const x = Math.floor(hash(k) * PANEL_WIDTH);
            const speedK = 3 + hash(k + 100) * 5 + s.speed / 80;
            const y = Math.floor((t * speedK + hash(k + 200) * PANEL_HEIGHT) % PANEL_HEIGHT);
            const i = (y * PANEL_WIDTH + x) * 4;
            out[i] = 255;
            out[i + 1] = 255;
            out[i + 2] = 255;
        }
    }

    if (s.border) {
        const per: Array<[number, number]> = [];
        for (let x = 0; x < PANEL_WIDTH; x++) per.push([x, 0]);
        for (let y = 1; y < PANEL_HEIGHT; y++) per.push([PANEL_WIDTH - 1, y]);
        for (let x = PANEL_WIDTH - 2; x >= 0; x--) per.push([x, PANEL_HEIGHT - 1]);
        for (let y = PANEL_HEIGHT - 2; y > 0; y--) per.push([0, y]);
        const shift = Math.floor(t * (6 + s.border.speed / 20));
        per.forEach(([x, y], idx) => {
            if ((idx + shift) % 6 < 3) {
                const i = (y * PANEL_WIDTH + x) * 4;
                out[i] = 255;
                out[i + 1] = 176;
                out[i + 2] = 0;
            }
        });
    }
    return out;
}
