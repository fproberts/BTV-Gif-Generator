// Run with: npm run test:playlist
import test from 'node:test';
import assert from 'node:assert/strict';
import { planSlots, recordSlot, forgetSlot, touchSlots, slotsToClear, storedBytes, EMPTY_SLOT_MAP } from './slots.ts';
import { itemKey } from './model.ts';

const mapWith = (pairs) => pairs.reduce((m, [slot, key, t]) => recordSlot(m, slot, key, t), EMPTY_SLOT_MAP);

test('empty panel: keys get slots 1..n, all uploaded', () => {
    const plan = planSlots(EMPTY_SLOT_MAP, ['a', 'b', 'c']);
    assert.deepEqual(plan.slots, [1, 2, 3]);
    assert.deepEqual(plan.uploads.map((u) => u.slot), [1, 2, 3]);
});

test('content already on the panel is reused without uploading', () => {
    const map = mapWith([[1, 'a', 1], [2, 'b', 2]]);
    const plan = planSlots(map, ['b', 'x', 'a']);
    assert.deepEqual(plan.slots, [2, 3, 1]);
    assert.deepEqual(plan.uploads, [{ key: 'x', slot: 3 }]);
});

test('repeated items share one slot', () => {
    const plan = planSlots(EMPTY_SLOT_MAP, ['a', 'b', 'a']);
    assert.deepEqual(plan.slots, [1, 2, 1]);
    assert.equal(plan.uploads.length, 2);
});

test('full panel evicts the least recently used slot not in this playlist', () => {
    let map = EMPTY_SLOT_MAP;
    for (let s = 1; s <= 100; s++) map = recordSlot(map, s, `k${s}`, 1000 + s);
    map = touchSlots(map, [5], 5000); // slot 5 recently played
    const plan = planSlots(map, ['k1', 'new1', 'new2']);
    assert.equal(plan.slots[0], 1); // k1 kept even though it is oldest
    assert.deepEqual(plan.uploads.map((u) => u.slot), [2, 3]);
});

test('too many distinct items is an error', () => {
    const keys = Array.from({ length: 101 }, (_, i) => `k${i}`);
    assert.throws(() => planSlots(EMPTY_SLOT_MAP, keys));
});

test('record and forget keep one entry per slot and per key', () => {
    let map = mapWith([[1, 'a', 1]]);
    map = recordSlot(map, 2, 'a', 2); // same content moved
    assert.deepEqual(map.entries.map((e) => [e.slot, e.key]), [[2, 'a']]);
    map = forgetSlot(map, 2);
    assert.equal(map.entries.length, 0);
});

test('itemKey ignores item id and changes with settings', () => {
    const base = { kind: 'scroll', url: '/uploads/a.png', name: 'A', imageId: '1', pxPerSecond: 16, endless: true };
    assert.equal(itemKey({ ...base, id: 'x' }), itemKey({ ...base, id: 'y', name: 'renamed' }));
    assert.notEqual(itemKey({ ...base, id: 'x' }), itemKey({ ...base, id: 'x', pxPerSecond: 20 }));
});

const KB = 1024;
const sized = (pairs) => pairs.reduce((m, [slot, key, t, bytes]) => recordSlot(m, slot, key, t, bytes), EMPTY_SLOT_MAP);

test('slotsToClear: slots being replaced are deleted first', () => {
    const map = sized([[1, 'a', 1, 90 * KB], [2, 'b', 2, 90 * KB]]);
    const plan = { slots: [1, 2], uploads: [{ key: 'x', slot: 1 }] };
    assert.deepEqual(slotsToClear(map, plan, new Map([['x', 90 * KB]])), [1]);
});

test('slotsToClear: nothing extra while there is room', () => {
    const map = sized([[1, 'a', 1, 90 * KB], [2, 'b', 2, 90 * KB]]);
    const plan = { slots: [3], uploads: [{ key: 'x', slot: 3 }] };
    assert.deepEqual(slotsToClear(map, plan, new Map([['x', 90 * KB]])), []);
});

test('slotsToClear: frees least recently used slots not in this playlist until it fits', () => {
    // 60 slots of 90 KB = 5.3 MB stored; adding 5 x 90 KB goes over the 5.5 MB budget
    const map = sized(Array.from({ length: 60 }, (_, i) => [i + 1, `k${i + 1}`, i + 1, 90 * KB]));
    const keys = ['k2', 'n1', 'n2', 'n3', 'n4', 'n5'];
    const plan = planSlots(map, keys);
    const newBytes = new Map(plan.uploads.map((u) => [u.key, 90 * KB]));
    const clear = slotsToClear(map, plan, newBytes);
    assert.ok(!clear.includes(2), 'keeps a slot this playlist plays');
    let after = map;
    for (const s of clear) after = forgetSlot(after, s);
    for (const u of plan.uploads) after = recordSlot(after, u.slot, u.key, 99, 90 * KB);
    assert.ok(storedBytes(after) <= 5.5 * 1024 * 1024, `${storedBytes(after)} bytes`);
    // the oldest go first
    assert.ok(clear.includes(1));
});

test('storedBytes counts unknown old records as 100 KB', () => {
    const map = recordSlot(EMPTY_SLOT_MAP, 1, 'a', 1);
    assert.equal(storedBytes(map), 100 * KB);
});
