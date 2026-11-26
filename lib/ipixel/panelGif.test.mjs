// Run with: npm run test:gif
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeGif } from './gifEncoder.ts';
import { buildPalette, mapToPalette } from './quantize.ts';
import { buildScrollGif, buildStillGif, stackStrips, PANEL_MIN_ITEM_MS } from './panelGif.ts';

/** Walk a GIF's blocks and report what the panel cares about. */
function inspect(bytes) {
    const u16 = (p) => bytes[p] | (bytes[p + 1] << 8);
    assert.equal(String.fromCharCode(...bytes.subarray(0, 6)), 'GIF89a');
    const w = u16(6), h = u16(8), flags = bytes[10];
    let p = 13 + ((flags & 0x80) ? 3 * (1 << ((flags & 7) + 1)) : 0);
    const frames = [];
    let gce = null;
    while (p < bytes.length && bytes[p] !== 0x3b) {
        if (bytes[p] === 0x21) {
            if (bytes[p + 1] === 0xf9) gce = { disposal: (bytes[p + 3] >> 2) & 7, transparent: !!(bytes[p + 3] & 1), delayMs: u16(p + 4) * 10 };
            p += 2;
            while (bytes[p]) p += bytes[p] + 1;
            p++;
        } else if (bytes[p] === 0x2c) {
            const fw = u16(p + 5), fh = u16(p + 7), local = !!(bytes[p + 9] & 0x80);
            p += 10 + 1; // descriptor + LZW min code size
            while (bytes[p]) p += bytes[p] + 1;
            p++;
            frames.push({ full: fw === w && fh === h, local, ...gce });
            gce = null;
        } else throw new Error(`unexpected block 0x${bytes[p].toString(16)} at ${p}`);
    }
    return { w, h, globalTable: !!(flags & 0x80), frames };
}

const panelSafe = (info) => info.globalTable && info.frames.every((f) => f.full && !f.local && !f.transparent);

function gradientStrip(height) {
    const rgb = new Uint8Array(96 * height * 3);
    for (let y = 0; y < height; y++) for (let x = 0; x < 96; x++) {
        const i = (y * 96 + x) * 3;
        rgb[i] = (x * 255) / 95; rgb[i + 1] = (y * 255) / Math.max(1, height - 1); rgb[i + 2] = 128;
    }
    return { rgb, height };
}

test('quantize: palette size is capped and mapping picks exact colours when available', () => {
    const rgb = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 0, 0]);
    const pal = buildPalette(rgb, 64);
    assert.equal(pal.length / 3, 3);
    const idx = mapToPalette(rgb, pal);
    assert.deepEqual([...pal.subarray(idx[0] * 3, idx[0] * 3 + 3)], [255, 0, 0]);
    assert.equal(idx[0], idx[3]);
    const many = gradientStrip(64).rgb;
    assert.ok(buildPalette(many, 64).length / 3 <= 64);
});

test('encoder output is panel-safe', () => {
    const palette = new Uint8Array([0, 0, 0, 255, 255, 255]);
    const frames = [0, 1].map((v) => ({ indices: new Uint8Array(96 * 16).fill(v), delayMs: 100 }));
    const info = inspect(encodeGif({ width: 96, height: 16, palette, frames }));
    assert.ok(panelSafe(info));
    assert.equal(info.frames.length, 2);
    assert.deepEqual(info.frames.map((f) => f.disposal), [1, 1]);
});

test('scroll GIF: one frame per step, top to bottom, speed sets the delay', () => {
    const g = buildScrollGif(gradientStrip(48), { pxPerSecond: 10 });
    const info = inspect(g.bytes);
    assert.ok(panelSafe(info));
    assert.equal(g.frames, 48 - 16 + 1);
    assert.equal(info.frames[0].delayMs, 100);
    const fast = buildScrollGif(gradientStrip(48), { pxPerSecond: 20, stepPx: 2 });
    assert.equal(fast.frames, 17);
    assert.equal(inspect(fast.bytes).frames[0].delayMs, 100);
});

test('scroll GIF: wrap gives one frame per row and no hold', () => {
    const g = buildScrollGif(gradientStrip(48), { wrap: true, pxPerSecond: 10 });
    assert.equal(g.frames, 48);
    assert.equal(g.durationMs, 4800);
});

test('short images become a still held for the panel minimum', () => {
    const g = buildScrollGif(gradientStrip(16));
    assert.equal(g.frames, 1);
    assert.equal(g.durationMs, PANEL_MIN_ITEM_MS);
});

test('still GIF and strip stacking', () => {
    const still = buildStillGif(gradientStrip(16).rgb, 8);
    const info = inspect(still.bytes);
    assert.ok(panelSafe(info));
    assert.equal(info.frames[0].delayMs, 8000);
    const s = stackStrips([gradientStrip(20), gradientStrip(30)]);
    assert.equal(s.height, 50);
    assert.equal(s.rgb.length, 96 * 50 * 3);
});
