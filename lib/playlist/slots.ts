/**
 * Which item is stored in which panel slot (1-100), as far as this phone knows.
 *
 * The panel can't be asked what it holds, so this record is only trustworthy while this
 * phone is the one that last changed the panel. When another phone may have connected,
 * the user starts fresh (wipe the panel + clear this record).
 */

import { MIN_SLOT, MAX_SLOT } from '../ipixel/protocol.ts';

export interface SlotEntry {
    slot: number;
    key: string;
    lastUsed: number;
    /** size of what was sent (missing in records from older versions) */
    bytes?: number;
}

/**
 * Panel storage. Measured: 64 GIFs of ~98 KB (6.11 MB) fit, the next was refused with status 2.
 * Keep a margin, and count each slot in whole 4 KB blocks in case the panel stores it that way.
 */
export const PANEL_STORAGE_BUDGET = 5.5 * 1024 * 1024;
const BLOCK = 4096;
const UNKNOWN_SIZE = 100 * 1024;

export function storedSize(bytes: number | undefined): number {
    return Math.ceil((bytes ?? UNKNOWN_SIZE) / BLOCK) * BLOCK;
}

/** Bytes this phone believes are stored on the panel. */
export function storedBytes(map: SlotMap): number {
    return map.entries.reduce((t, e) => t + storedSize(e.bytes), 0);
}

/**
 * Slots to delete before uploading, so the new items fit within `budget`: the slots being
 * overwritten (deleted first so the panel never has to hold old and new at once), plus the
 * least recently used slots this playlist doesn't need, until there is room.
 */
export function slotsToClear(map: SlotMap, plan: SlotPlan, newBytes: Map<string, number>, budget = PANEL_STORAGE_BUDGET): number[] {
    const target = new Set(plan.uploads.map((u) => u.slot));
    const playing = new Set(plan.slots);
    const clear = map.entries.filter((e) => target.has(e.slot)).map((e) => e.slot);
    let kept = map.entries.filter((e) => !target.has(e.slot));
    const incoming = plan.uploads.reduce((t, u) => t + storedSize(newBytes.get(u.key)), 0);
    const spare = kept.filter((e) => !playing.has(e.slot)).sort((a, b) => a.lastUsed - b.lastUsed || a.slot - b.slot);
    while (kept.reduce((t, e) => t + storedSize(e.bytes), 0) + incoming > budget && spare.length) {
        const victim = spare.shift()!;
        clear.push(victim.slot);
        kept = kept.filter((e) => e.slot !== victim.slot);
    }
    return clear;
}

export interface SlotMap {
    entries: SlotEntry[];
    /** when this phone last changed the panel */
    updatedAt: number;
    /** device name it was written for */
    panelName: string | null;
}

export const EMPTY_SLOT_MAP: SlotMap = { entries: [], updatedAt: 0, panelName: null };

export interface SlotPlan {
    /** slot for each requested key, in order (repeated keys share a slot) */
    slots: number[];
    /** keys that must be uploaded, with the slot to put them in */
    uploads: { key: string; slot: number }[];
}

/**
 * Choose slots for `keys`: reuse slots already holding the same content, otherwise take free
 * slots, otherwise evict the least recently used slots that this playlist doesn't need.
 */
export function planSlots(map: SlotMap, keys: string[]): SlotPlan {
    const unique = [...new Set(keys)];
    const capacity = MAX_SLOT - MIN_SLOT + 1;
    if (unique.length > capacity) throw new Error(`A playlist can hold at most ${capacity} different items`);

    const bySlot = new Map(map.entries.map((e) => [e.slot, e]));
    const byKey = new Map(map.entries.map((e) => [e.key, e.slot]));
    const needed = new Set(unique);
    const assigned = new Map<string, number>();
    for (const key of unique) {
        const slot = byKey.get(key);
        if (slot !== undefined) assigned.set(key, slot);
    }
    const used = new Set(assigned.values());

    const free: number[] = [];
    for (let s = MIN_SLOT; s <= MAX_SLOT; s++) if (!bySlot.has(s)) free.push(s);
    const evictable = map.entries
        .filter((e) => !needed.has(e.key))
        .sort((a, b) => a.lastUsed - b.lastUsed || a.slot - b.slot)
        .map((e) => e.slot);

    const uploads: { key: string; slot: number }[] = [];
    for (const key of unique) {
        if (assigned.has(key)) continue;
        const slot = free.shift() ?? evictable.shift();
        if (slot === undefined || used.has(slot)) throw new Error('No free slot on the panel');
        assigned.set(key, slot);
        used.add(slot);
        uploads.push({ key, slot });
    }
    return { slots: keys.map((k) => assigned.get(k)!), uploads };
}

/** Record that `slot` now holds `key` (call after a successful upload). */
export function recordSlot(map: SlotMap, slot: number, key: string, now = Date.now(), bytes?: number): SlotMap {
    const entries = map.entries.filter((e) => e.slot !== slot && e.key !== key);
    entries.push({ slot, key, lastUsed: now, bytes });
    return { ...map, entries, updatedAt: now };
}

/** Forget a slot (before overwriting it, so a failed upload doesn't leave a stale record). */
export function forgetSlot(map: SlotMap, slot: number): SlotMap {
    return { ...map, entries: map.entries.filter((e) => e.slot !== slot) };
}

/** Bump lastUsed for slots that just played, so they are the last to be evicted. */
export function touchSlots(map: SlotMap, slots: number[], now = Date.now()): SlotMap {
    const set = new Set(slots);
    return { ...map, updatedAt: now, entries: map.entries.map((e) => (set.has(e.slot) ? { ...e, lastUsed: now } : e)) };
}
