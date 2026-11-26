// Run with: npm run test:playlist
import test from 'node:test';
import assert from 'node:assert/strict';
import { planSlots, recordSlot, forgetSlot, touchSlots, EMPTY_SLOT_MAP } from './slots.ts';
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
