'use client';

/**
 * Plays playlists on the panel: builds each item (GIF or native text), puts it in a slot,
 * reusing slots that already hold the same content, then sets the panel's program list.
 */

import { buildScrollGif, buildStillGif, stackStrips } from '../ipixel/panelGif';
import { loadScrollStrip, loadStillFrame } from '../ipixel/imageStrip';
import { rasterizeText, ensureFontLoaded } from '../ipixel/glyphs';
import { FONT_CHOICES } from '../ipixel/presets';
import { buildTextPayload, frameWindows, parseHexColor, DEFAULT_WINDOW_SIZE, type TextSettings } from '../ipixel/protocol';
import type { PortableStudio } from '../ipixel/studio';
import {
    sendWindowFramesBLE, sendNativeWindowsBLE, setProgramListBLE, deleteAllSlotsBLE, getBLEState, MEDIA_SEND_DEFAULTS,
} from '../webBluetooth';
import { itemKey, type PlaylistItem } from './model';
import { planSlots, recordSlot, forgetSlot, touchSlots, EMPTY_SLOT_MAP } from './slots';
import { slotStore } from './store';

export type Built = { kind: 'gif'; bytes: Uint8Array; durationMs: number } | { kind: 'text'; text: PortableStudio };

const buildCache = new Map<string, Built>();

/** Build (or fetch from this session's cache) the panel data for an item. */
export async function buildItem(item: PlaylistItem): Promise<Built> {
    const key = itemKey(item);
    const cached = buildCache.get(key);
    if (cached) return cached;
    let built: Built;
    switch (item.kind) {
        case 'scroll': {
            const g = buildScrollGif(await loadScrollStrip(item.url), { pxPerSecond: item.pxPerSecond, wrap: item.endless });
            built = { kind: 'gif', bytes: g.bytes, durationMs: g.durationMs };
            break;
        }
        case 'still': {
            const g = buildStillGif(await loadStillFrame(item.url, item.fit), item.seconds);
            built = { kind: 'gif', bytes: g.bytes, durationMs: g.durationMs };
            break;
        }
        case 'strip': {
            const strip = stackStrips(await Promise.all(item.images.map((i) => loadScrollStrip(i.url))));
            const g = buildScrollGif(strip, { pxPerSecond: item.pxPerSecond, wrap: true });
            built = { kind: 'gif', bytes: g.bytes, durationMs: g.durationMs };
            break;
        }
        case 'text':
            built = { kind: 'text', text: item.text };
            break;
    }
    buildCache.set(key, built);
    return built;
}

export function fontFamilyFor(t: PortableStudio): string {
    const font = FONT_CHOICES.find((f) => f.id === t.fontId) ?? FONT_CHOICES[0];
    return t.fontId === 'custom' ? t.customFont || 'sans-serif' : font.family;
}

export function textSettings(t: PortableStudio): TextSettings {
    return {
        effect: t.effect,
        speed: t.invertSpeed ? 255 - t.speed : t.speed,
        hAlign: t.hAlign,
        vAlign: t.vAlign,
        textColorType: t.textColorType,
        textColor: parseHexColor(t.color),
        bgColorType: t.bgEnabled ? 1 : 0,
        bgColor: parseHexColor(t.bgColor),
        vertical: t.vertical,
        board: t.borderEnabled ? { type: t.borderType, speed: t.borderSpeed, effect: t.borderEffect } : null,
    };
}

export async function rasterizeStudioText(t: PortableStudio) {
    const opts = {
        text: t.text,
        fontFamily: fontFamilyFor(t),
        weight: t.weight,
        sizePx: t.sizePx,
        letterSpacing: t.letterSpacing,
        inkThreshold: t.inkThreshold,
        yOffset: t.yOffset,
    };
    await ensureFontLoaded(opts);
    return rasterizeText(opts);
}

/** Send native text into a slot (0 = the panel's "show now" slot used by the old studio). */
export async function sendTextToSlot(t: PortableStudio, slot: number) {
    const glyphs = await rasterizeStudioText(t);
    if (!glyphs.length) throw new Error('The text is empty');
    const payload = buildTextPayload(textSettings(t), glyphs, { format: t.glyphFormat, colorOrder: t.colorOrder });
    const windowSize = getBLEState().panel?.windowSize ?? DEFAULT_WINDOW_SIZE;
    const windows = frameWindows(payload, { windowSize, listId: slot, legacyLengthField: t.legacyLength });
    await sendNativeWindowsBLE(windows, { ...MEDIA_SEND_DEFAULTS, busyText: 'Sending text…' });
}

async function uploadToSlot(built: Built, slot: number) {
    if (built.kind === 'gif') await sendWindowFramesBLE(built.bytes, true, slot, { quiet: true });
    else await sendTextToSlot(built.text, slot);
}

export interface PlayProgress {
    phase: 'building' | 'uploading' | 'starting' | 'done';
    /** 1-based item being uploaded, and how many need uploading */
    current: number;
    total: number;
    label: string;
}

export interface PlayResult {
    uploaded: number;
    reused: number;
    slots: number[];
}

let running = false;

/**
 * Put `items` on the panel and play them in order. Items already in a slot are not re-sent.
 */
export async function playItems(items: PlaylistItem[], onProgress?: (p: PlayProgress) => void): Promise<PlayResult> {
    if (!items.length) throw new Error('Add something to the playlist first');
    if (running) throw new Error('Already sending to the screen');
    running = true;
    try {
        const keys = items.map(itemKey);
        let map = slotStore.get();
        const panelName = getBLEState().deviceName;
        if (map.panelName && panelName && map.panelName !== panelName) map = { ...EMPTY_SLOT_MAP };
        const plan = planSlots(map, keys);
        const byKey = new Map(items.map((it) => [itemKey(it), it]));

        for (let i = 0; i < plan.uploads.length; i++) {
            const { key, slot } = plan.uploads[i];
            const item = byKey.get(key)!;
            const total = plan.uploads.length;
            onProgress?.({ phase: 'building', current: i + 1, total, label: `Preparing ${i + 1} of ${total}` });
            const built = await buildItem(item);
            map = forgetSlot(map, slot);
            slotStore.set({ ...map, panelName });
            onProgress?.({ phase: 'uploading', current: i + 1, total, label: `Sending ${i + 1} of ${total}` });
            await uploadToSlot(built, slot);
            map = recordSlot(map, slot, key);
            slotStore.set({ ...map, panelName });
        }

        onProgress?.({ phase: 'starting', current: plan.uploads.length, total: plan.uploads.length, label: 'Starting' });
        await setProgramListBLE(plan.slots);
        map = touchSlots(map, plan.slots);
        slotStore.set({ ...map, panelName });
        onProgress?.({ phase: 'done', current: plan.uploads.length, total: plan.uploads.length, label: 'Playing' });
        return { uploaded: plan.uploads.length, reused: new Set(keys).size - plan.uploads.length, slots: plan.slots };
    } finally {
        running = false;
    }
}

/** How many of these items would need uploading right now (0 = instant). */
export function pendingUploads(items: PlaylistItem[]): number {
    try {
        return planSlots(slotStore.get(), items.map(itemKey)).uploads.length;
    } catch {
        return items.length;
    }
}

/** Wipe everything stored on the panel and forget the slot record. */
export async function startFresh() {
    await deleteAllSlotsBLE();
    slotStore.set({ ...EMPTY_SLOT_MAP, panelName: getBLEState().deviceName, updatedAt: Date.now() });
}

/** Forget the slot record without touching the panel (e.g. another phone changed it). */
export function forgetPanelContents() {
    slotStore.set({ ...EMPTY_SLOT_MAP });
}
