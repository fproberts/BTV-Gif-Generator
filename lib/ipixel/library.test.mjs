// Run with: npm run test:library
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_STUDIO, PORTABLE_KEYS, pickPortable, portableEqual, sanitizePortable } from './studio.ts';
import { cleanName, recentConfigs, searchConfigs, sameName, MAX_NAME_LENGTH } from './library.ts';
import { createTextLibraryStore, LibraryError } from '../textLibraryStore.ts';

const tmpFile = async () => path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'textlib-')), 'text-library.json');
const item = (name, text, lastUsedAt, createdAt = lastUsedAt) => ({
    id: name, name, createdAt, updatedAt: createdAt, lastUsedAt, useCount: 1,
    config: sanitizePortable({ text }),
});

test('portable settings exclude transport tuning', () => {
    for (const k of ['mtu', 'writeMode', 'windowSize', 'ackTimeoutMs', 'requireAck', 'maxRetries', 'interChunkDelayMs']) {
        assert.ok(!PORTABLE_KEYS.includes(k), k);
    }
    for (const k of ['text', 'effect', 'speed', 'color', 'fontId', 'borderEnabled', 'hAlign']) assert.ok(PORTABLE_KEYS.includes(k), k);
    assert.deepEqual(Object.keys(pickPortable(DEFAULT_STUDIO)).sort(), [...PORTABLE_KEYS].sort());
});

test('sanitizePortable: defaults, clamping, type safety, unknown keys dropped', () => {
    assert.deepEqual(sanitizePortable(undefined), pickPortable(DEFAULT_STUDIO));
    const c = sanitizePortable({
        text: 'hi', speed: 9999, effect: -5, color: 'zzz', bgColor: 'ff00aa', sizePx: 12.6,
        glyphFormat: 'weird', vertical: 'yes', evil: '<script>', mtu: 5, weight: '700',
    });
    assert.equal(c.text, 'hi');
    assert.equal(c.speed, 255);
    assert.equal(c.effect, 0);
    assert.equal(c.color, DEFAULT_STUDIO.color);
    assert.equal(c.bgColor, 'FF00AA');
    assert.equal(c.sizePx, 13);
    assert.equal(c.glyphFormat, DEFAULT_STUDIO.glyphFormat);
    assert.equal(c.vertical, false);
    assert.equal(c.weight, '700');
    assert.ok(!('evil' in c) && !('mtu' in c));
    assert.equal(sanitizePortable({ text: 'x'.repeat(1000) }).text.length, 300);
});

test('cleanName / sameName', () => {
    assert.equal(cleanName('  My   big \n name '), 'My big name');
    assert.equal(cleanName(42), '');
    assert.equal(cleanName('x'.repeat(200)).length, MAX_NAME_LENGTH);
    assert.ok(sameName('Hello', ' hello '));
});

test('recentConfigs: most recently used first, capped at 5', () => {
    const items = [1, 2, 3, 4, 5, 6, 7].map((n) => item(`n${n}`, 't', n * 100));
    assert.deepEqual(recentConfigs(items).map((i) => i.name), ['n7', 'n6', 'n5', 'n4', 'n3']);
    assert.equal(recentConfigs(items, 2).length, 2);
    assert.deepEqual(recentConfigs([]), []);
});

test('searchConfigs: case-insensitive, multi-word, name before text, empty = A-Z', () => {
    const items = [
        item('Party night', 'LET US DANCE', 1),
        item('Coffee', 'party at the cafe', 5),
        item('Zebra', 'stripes', 3),
        item('Partly cloudy', 'weather', 9),
    ];
    // "Partly" does not contain "party"; Coffee matches only through its message text
    assert.deepEqual(searchConfigs(items, 'PARTY').map((i) => i.name), ['Party night', 'Coffee']);
    assert.deepEqual(searchConfigs(items, 'part').map((i) => i.name), ['Partly cloudy', 'Party night', 'Coffee']);
    assert.deepEqual(searchConfigs(items, 'cafe party').map((i) => i.name), ['Coffee']);
    assert.deepEqual(searchConfigs(items, 'nomatch'), []);
    assert.deepEqual(searchConfigs(items, '').map((i) => i.name), ['Coffee', 'Partly cloudy', 'Party night', 'Zebra']);
});

test('store: save, list, update by name, rename, name clash, touch, delete', async () => {
    let t = 1000;
    const store = createTextLibraryStore(await tmpFile(), () => ++t);
    assert.deepEqual(await store.list(), []);

    const { item: a } = await store.save({ name: '  Welcome  ', config: { text: 'HELLO', speed: 5000, nope: 1 } });
    assert.equal(a.name, 'Welcome');
    assert.equal(a.config.speed, 255);
    assert.ok(!('nope' in a.config));

    // same name (any case) updates in place rather than duplicating
    const { item: a2 } = await store.save({ name: 'welcome', config: { text: 'CHANGED' } });
    assert.equal(a2.id, a.id);
    assert.equal(a2.config.text, 'CHANGED');
    assert.equal((await store.list()).length, 1);

    const { item: b } = await store.save({ name: 'Other', config: { text: 'two' } });
    // rename by id
    const { item: renamed } = await store.save({ id: a.id, name: 'Welcome v2', config: { text: 'CHANGED' } });
    assert.equal(renamed.name, 'Welcome v2');
    // renaming onto an existing name is refused
    await assert.rejects(store.save({ id: a.id, name: 'other', config: {} }), (e) => e instanceof LibraryError && e.code === 'name-taken');
    await assert.rejects(store.save({ name: '   ', config: {} }), (e) => e instanceof LibraryError && e.code === 'name-required');
    await assert.rejects(store.save({ id: 'missing', name: 'x', config: {} }), (e) => e instanceof LibraryError && e.code === 'not-found');

    const before = (await store.list()).find((i) => i.id === b.id).lastUsedAt;
    const touched = await store.touch(b.id);
    assert.ok(touched.lastUsedAt > before);
    assert.equal(await store.touch('missing'), null);

    assert.equal(await store.remove(a.id), true);
    assert.equal(await store.remove(a.id), false);
    assert.deepEqual((await store.list()).map((i) => i.name), ['Other']);
});

test('store: concurrent saves are all kept (no lost updates)', async () => {
    const store = createTextLibraryStore(await tmpFile());
    await Promise.all(Array.from({ length: 25 }, (_, i) => store.save({ name: `item ${i}`, config: { text: String(i) } })));
    assert.equal((await store.list()).length, 25);
});

test('store: persists across instances; corrupt file is set aside, not overwritten', async () => {
    const file = await tmpFile();
    await createTextLibraryStore(file).save({ name: 'Keep', config: {} });
    assert.equal((await createTextLibraryStore(file).list())[0].name, 'Keep');

    await fs.writeFile(file, '{ this is not json');
    const fresh = createTextLibraryStore(file, () => 42);
    assert.deepEqual(await fresh.list(), []);
    const leftovers = (await fs.readdir(path.dirname(file))).filter((f) => f.includes('.corrupt-'));
    assert.equal(leftovers.length, 1);
    assert.equal(await fs.readFile(path.join(path.dirname(file), leftovers[0]), 'utf-8'), '{ this is not json');
});

test('store: hand-edited bad values are sanitised on read', async () => {
    const file = await tmpFile();
    await fs.writeFile(file, JSON.stringify({ version: 1, items: [
        { id: 'a', name: 'Bad', createdAt: 1, updatedAt: 1, lastUsedAt: 1, useCount: 1, config: { text: 'ok', speed: 'fast', effect: 99999 } },
        { nonsense: true },
    ] }));
    const items = await createTextLibraryStore(file).list();
    assert.equal(items.length, 1);
    assert.equal(items[0].config.speed, DEFAULT_STUDIO.speed);
    assert.equal(items[0].config.effect, 127);
});

test('portableEqual: same message+look is equal; any difference is not; ignores transport and key order', () => {
    const base = pickPortable(DEFAULT_STUDIO);
    assert.ok(portableEqual(base, { ...base }));
    assert.ok(portableEqual(base, { ...DEFAULT_STUDIO, mtu: 20, windowSize: 1, color: base.color.toLowerCase() }));
    assert.ok(!portableEqual(base, { ...base, text: base.text + '!' }));
    assert.ok(!portableEqual(base, { ...base, speed: base.speed + 1 }));
    assert.ok(!portableEqual(base, { ...base, effect: base.effect + 1 }));
});

test('store: when full, saving deletes the least recently used; casting protects popular texts', async () => {
    let t = 1000;
    const store = createTextLibraryStore(await tmpFile(), () => ++t, 3);
    const save = (name) => store.save({ name, config: { text: name.toLowerCase() } });
    const A = (await save('A')).item;
    await save('B');
    await save('C');
    await store.touch(A.id); // A is cast: now the most recent, B is the oldest

    const r = await save('D');
    assert.deepEqual(r.evicted.map((i) => i.name), ['B']);
    assert.deepEqual((await store.list()).map((i) => i.name).sort(), ['A', 'C', 'D']);

    // editing an existing text while full never evicts anything
    const r2 = await store.save({ name: 'C', config: { text: 'changed' } });
    assert.deepEqual(r2.evicted, []);
    assert.equal((await store.list()).length, 3);

    // A was popular once, but nothing has cast it since: it is now the oldest and goes first
    const r3 = await save('E');
    assert.deepEqual(r3.evicted.map((i) => i.name), ['A']);
    assert.deepEqual((await store.list()).map((i) => i.name).sort(), ['C', 'D', 'E']);
});

test('store: an item that keeps being cast outlives 500 newer ones (cap 5 here)', async () => {
    let t = 0;
    const store = createTextLibraryStore(await tmpFile(), () => ++t, 5);
    const star = (await store.save({ name: 'Star', config: {} })).item;
    for (let i = 0; i < 40; i++) {
        await store.save({ name: `filler ${i}`, config: {} });
        if (i % 3 === 0) await store.touch(star.id); // cast regularly
    }
    const names = (await store.list()).map((i) => i.name);
    assert.equal(names.length, 5);
    assert.ok(names.includes('Star'));
    assert.ok(names.includes('filler 39'));
    assert.ok(!names.includes('filler 0'));
});

test('store: over-full file (cap lowered) is culled down to the cap on the next new save', async () => {
    const file = await tmpFile();
    let t = 0;
    const big = createTextLibraryStore(file, () => ++t, 10);
    for (let i = 0; i < 5; i++) await big.save({ name: `n${i}`, config: {} });
    const small = createTextLibraryStore(file, () => ++t, 3);
    const r = await small.save({ name: 'new', config: {} });
    assert.deepEqual(r.evicted.map((i) => i.name), ['n0', 'n1', 'n2']);
    assert.deepEqual((await small.list()).map((i) => i.name), ['n3', 'n4', 'new']);
});

test('store: recency stays strictly ordered even when the clock does not advance', async () => {
    const store = createTextLibraryStore(await tmpFile(), () => 5);
    const a = (await store.save({ name: 'A', config: {} })).item;
    await store.save({ name: 'B', config: {} });
    await store.save({ name: 'C', config: {} });
    await store.touch(a.id);
    assert.deepEqual(recentConfigs(await store.list()).map((i) => i.name), ['A', 'C', 'B']);
});

test('store: the default cap is 500 — the 501st save deletes the least recently used', async () => {
    let t = 0;
    const store = createTextLibraryStore(await tmpFile(), () => ++t);
    const first = (await store.save({ name: 'n0', config: {} })).item;
    for (let i = 1; i < 500; i++) await store.save({ name: `n${i}`, config: {} });
    assert.equal((await store.list()).length, 500);

    await store.touch(first.id); // n0 is cast, so n1 is now the oldest
    const r = await store.save({ name: 'n500', config: {} });
    assert.deepEqual(r.evicted.map((i) => i.name), ['n1']);
    const names = (await store.list()).map((i) => i.name);
    assert.equal(names.length, 500);
    assert.ok(names.includes('n0') && names.includes('n500') && !names.includes('n1'));
});
