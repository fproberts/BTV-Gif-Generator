// Run with: npm run test:playlist
import test from 'node:test';
import assert from 'node:assert/strict';
import { planFlow, frameDelayMs } from './flow.ts';

const OPTS = { stepPx: 2, minMs: 7000, maxRows: 240 };
const pic = (url, height, pxPerSecond = 16) => ({ url, height, pxPerSecond });
const rowsOf = (chunk) => chunk.rows.reduce((t, r) => t + r.to - r.from, 0);
const key = (c) => JSON.stringify(c);

test('every chunk lasts at least the minimum, and frames never run past their rows', () => {
    for (const loop of [true, false]) {
        const chunks = planFlow([pic('a', 96), pic('b', 50), pic('c', 300), pic('d', 40), pic('e', 120)], { ...OPTS, loop });
        assert.ok(chunks.length > 1);
        for (const c of chunks) {
            assert.ok(c.durationMs >= 7000, `${c.durationMs} ms`);
            assert.ok(c.frames.length <= 250);
            const lastTop = c.frames[c.frames.length - 1].top;
            assert.equal(rowsOf(c), lastTop + 16);
        }
    }
});

test('loop: chunks cover every row exactly once and the last wraps into the first picture', () => {
    const pics = [pic('a', 96), pic('b', 80), pic('c', 130)];
    const chunks = planFlow(pics, { ...OPTS, loop: true });
    // each chunk scrolls up to where the next one starts (even heights, 2 px steps)
    const scrolled = chunks.map((c) => c.frames.at(-1).top + 2);
    assert.equal(scrolled.reduce((a, b) => a + b, 0), 96 + 80 + 130);
    const tail = chunks.at(-1).rows.at(-1);
    assert.equal(tail.url, 'a');
    assert.equal(tail.from, 0);
});

test('stop: ends exactly on the bottom of the last picture', () => {
    const chunks = planFlow([pic('a', 96), pic('b', 97)], { ...OPTS, loop: false });
    const last = chunks.at(-1);
    const end = last.rows.at(-1);
    assert.deepEqual([end.url, end.to], ['b', 97]);
});

test('a short single picture loops by repeating inside one chunk', () => {
    const chunks = planFlow([pic('a', 64)], { ...OPTS, loop: true });
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].durationMs >= 7000);
    assert.ok(chunks[0].rows.filter((r) => r.url === 'a').length >= 2);
});

test('a short stopping run scrolls more slowly to fill the minimum, without a long hold', () => {
    for (const h of [40, 96, 120]) {
        const [c] = planFlow([pic('a', h)], { ...OPTS, loop: false });
        assert.ok(c.durationMs >= 7000 && c.durationMs < 7300, `${h}: ${c.durationMs} ms`);
        assert.ok(c.frames.at(-1).delayMs < 2 * frameDelayMs(2, 16) * 7, `${h}: last frame ${c.frames.at(-1).delayMs} ms`);
        assert.ok(Math.max(...c.frames.map((f) => f.delayMs)) < 1000);
    }
    // long enough already: normal speed
    const [long] = planFlow([pic('a', 200)], { ...OPTS, loop: false });
    assert.ok(Math.abs(long.durationMs - ((200 - 16) / 16) * 1000) <= 200, `${long.durationMs} ms`);
});

test('changing one picture only changes its own chunk and the one before', () => {
    const base = [pic('a', 120), pic('b', 130), pic('c', 125), pic('d', 140), pic('e', 118)];
    const before = planFlow(base, { ...OPTS, loop: true }).map(key);
    const edited = base.map((p) => (p.url === 'c' ? pic('x', 125) : p));
    const after = planFlow(edited, { ...OPTS, loop: true }).map(key);
    const changed = after.filter((k) => !before.includes(k)).length;
    assert.ok(changed <= 2, `${changed} chunks changed`);
});

test('long pictures are split', () => {
    const chunks = planFlow([pic('tall', 1200)], { ...OPTS, loop: true });
    assert.ok(chunks.length >= 4);
    for (const c of chunks) assert.ok(c.frames.length <= 250);
});
