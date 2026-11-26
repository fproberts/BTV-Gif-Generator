'use client';

/**
 * Plays playlists on the panel: builds each item (GIF or native text), puts it in a slot,
 * reusing slots that already hold the same content, then sets the panel's program list.
 */

import { buildFramesGif, buildStillGif, estimateUploadSeconds, DEFAULT_COLOURS, FLOW_MAX_ROWS, FLOW_MIN_MS, FLOW_STEP_PX, type RgbStrip } from '../ipixel/panelGif';
import { loadScrollStrip, loadStillFrame } from '../ipixel/imageStrip';
import { rasterizeText, ensureFontLoaded } from '../ipixel/glyphs';
import { FONT_CHOICES } from '../ipixel/presets';
import { buildTextPayload, frameWindows, parseHexColor, DEFAULT_WINDOW_SIZE, PANEL_WIDTH, type TextSettings } from '../ipixel/protocol';
import type { PortableStudio } from '../ipixel/studio';
import {
    sendWindowFramesBLE, sendNativeWindowsBLE, setProgramListBLE, deleteAllSlotsBLE, deleteSlotsBLE, getBLEState, MEDIA_SEND_DEFAULTS,
    setClockBLE, setPowerBLE,
} from '../webBluetooth';
import { contentKey, isPictureLoop, itemKey, type PlaylistItem } from './model';
import { planFlow, type FlowChunk } from './flow';
import { planSlots, recordSlot, forgetSlot, touchSlots, slotsToClear, EMPTY_SLOT_MAP, type SlotMap } from './slots';
import { slotStore } from './store';

type StillItem = Extract<PlaylistItem, { kind: 'still' }>;

/** One panel slot's worth of a playlist. */
export type Segment =
    | { key: string; kind: 'flow'; chunk: FlowChunk; names: string[] }
    | { key: string; kind: 'still'; item: StillItem }
    | { key: string; kind: 'text'; text: PortableStudio };

export type Built = { kind: 'gif'; bytes: Uint8Array; durationMs: number } | { kind: 'text'; text: PortableStudio };

const stripCache = new Map<string, Promise<RgbStrip>>();
const buildCache = new Map<string, Built>();

function scrollStrip(url: string): Promise<RgbStrip> {
    let p = stripCache.get(url);
    if (!p) {
        p = loadScrollStrip(url);
        p.catch(() => stripCache.delete(url));
        stripCache.set(url, p);
    }
    return p;
}

/**
 * Turn playlist items into panel slots. Consecutive scrolling pictures become one continuous
 * scroll cut into chunks (lib/playlist/flow.ts). A playlist of only scrolling pictures loops
 * endlessly; otherwise each run of pictures stops on its last picture and the next item cuts in.
 */
export async function planSegments(items: PlaylistItem[]): Promise<Segment[]> {
    const loop = isPictureLoop(items);
    const out: Segment[] = [];
    let run: { url: string; name: string; pxPerSecond: number }[] = [];

    const flush = async () => {
        if (!run.length) return;
        const names = new Map(run.map((p) => [p.url, p.name]));
        const pictures = await Promise.all(run.map(async (p) => ({ url: p.url, pxPerSecond: p.pxPerSecond, height: (await scrollStrip(p.url)).height })));
        for (const chunk of planFlow(pictures, { loop, stepPx: FLOW_STEP_PX, minMs: FLOW_MIN_MS, maxRows: FLOW_MAX_ROWS })) {
            out.push({ key: contentKey('flow', [DEFAULT_COLOURS, chunk]), kind: 'flow', chunk, names: [...new Set(chunk.rows.map((r) => names.get(r.url) ?? ''))] });
        }
        run = [];
    };

    for (const item of items) {
        if (item.kind === 'scroll') run.push(item);
        else if (item.kind === 'strip') run.push(...item.images.map((i) => ({ ...i, pxPerSecond: item.pxPerSecond })));
        else {
            await flush();
            out.push(item.kind === 'still' ? { key: itemKey(item), kind: 'still', item } : { key: itemKey(item), kind: 'text', text: item.text });
        }
    }
    await flush();
    return out;
}

/** Build (or fetch from this session's cache) the panel data for a segment. */
export async function buildSegment(seg: Segment): Promise<Built> {
    const cached = buildCache.get(seg.key);
    if (cached) return cached;
    let built: Built;
    switch (seg.kind) {
        case 'flow': {
            const { rows } = seg.chunk;
            const height = rows.reduce((t, r) => t + r.to - r.from, 0);
            const rgb = new Uint8Array(PANEL_WIDTH * height * 3);
            let offset = 0;
            for (const r of rows) {
                const strip = await scrollStrip(r.url);
                const part = strip.rgb.subarray(r.from * PANEL_WIDTH * 3, r.to * PANEL_WIDTH * 3);
                rgb.set(part, offset);
                offset += part.length;
            }
            const g = buildFramesGif({ rgb, height }, seg.chunk.frames);
            built = { kind: 'gif', bytes: g.bytes, durationMs: g.durationMs };
            break;
        }
        case 'still': {
            const g = buildStillGif(await loadStillFrame(seg.item.url, seg.item.fit), seg.item.seconds);
            built = { kind: 'gif', bytes: g.bytes, durationMs: g.durationMs };
            break;
        }
        case 'text':
            built = { kind: 'text', text: seg.text };
            break;
    }
    buildCache.set(seg.key, built);
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

/** What this phone believes the connected panel holds (nothing, if it was written for another panel). */
export function currentSlotMap(): SlotMap {
    const map = slotStore.get();
    const panelName = getBLEState().deviceName;
    return map.panelName && panelName && map.panelName !== panelName ? { ...EMPTY_SLOT_MAP } : map;
}

/**
 * How to start the new program list. The panel lets the item on screen finish before it
 * switches; these are experiments to make the switch immediate (see __ipixel.setSwitchMode).
 */
export const SWITCH_MODES = ['list', 'twice', 'power', 'clock'] as const;
export type SwitchMode = (typeof SWITCH_MODES)[number];
const SWITCH_KEY = 'bb.switchMode';

export function getSwitchMode(): SwitchMode {
    try {
        const v = window.localStorage.getItem(SWITCH_KEY);
        return (SWITCH_MODES as readonly string[]).includes(v ?? '') ? (v as SwitchMode) : 'list';
    } catch {
        return 'list';
    }
}

export function setSwitchMode(mode: SwitchMode | null) {
    if (mode === null) window.localStorage.removeItem(SWITCH_KEY);
    else if (!(SWITCH_MODES as readonly string[]).includes(mode)) throw new Error(`Use one of: ${SWITCH_MODES.join(', ')}`);
    else window.localStorage.setItem(SWITCH_KEY, mode);
    return getSwitchMode();
}

async function startProgram(slots: number[]) {
    switch (getSwitchMode()) {
        case 'list':
            await setProgramListBLE(slots);
            break;
        case 'twice':
            await setProgramListBLE(slots);
            await setProgramListBLE(slots);
            break;
        case 'power':
            await setPowerBLE(false);
            await setProgramListBLE(slots);
            await setPowerBLE(true);
            break;
        case 'clock':
            await setClockBLE();
            await setProgramListBLE(slots);
            break;
    }
}

/**
 * Safety net if the panel still refuses (status 2 = full, e.g. content from another phone):
 * delete the least recently used slots this playlist doesn't need (half of them, at least 5).
 * Returns the updated map, or null if there was nothing to delete.
 */
async function freeSpace(map: SlotMap, neededKeys: Set<string>): Promise<SlotMap | null> {
    const spare = map.entries.filter((e) => !neededKeys.has(e.key)).sort((a, b) => a.lastUsed - b.lastUsed);
    if (!spare.length) return null;
    const victims = spare.slice(0, Math.max(5, Math.ceil(spare.length / 2))).map((e) => e.slot);
    await deleteSlotsBLE(victims);
    let next = map;
    for (const slot of victims) next = forgetSlot(next, slot);
    return next;
}

/** Text payloads are small; count them as one block. */
const sizeOf = (b: Built) => (b.kind === 'gif' ? b.bytes.length : 4096);

/** Status 2 at the start of a transfer is how the panel says it is full (measured at ~6.1 MB). */
function fullError(e: unknown): unknown {
    return e instanceof Error && /status 2/.test(e.message)
        ? new Error('The screen’s memory is full. Use “Clear the screen” in the ⋯ menu, then play again.')
        : e;
}

export interface PlayProgress {
    phase: 'building' | 'uploading' | 'starting' | 'done';
    /** 1-based slot being uploaded, and how many need uploading */
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
 * Put `items` on the panel and play them in order. Slots that already hold the same content are not re-sent.
 */
export async function playItems(items: PlaylistItem[], onProgress?: (p: PlayProgress) => void): Promise<PlayResult> {
    if (!items.length) throw new Error('Add something to the playlist first');
    if (running) throw new Error('Already sending to the screen');
    running = true;
    try {
        onProgress?.({ phase: 'building', current: 0, total: 0, label: 'Preparing' });
        const segments = await planSegments(items);
        const keys = segments.map((s) => s.key);
        const panelName = getBLEState().deviceName;
        let map = currentSlotMap();
        const plan = planSlots(map, keys);
        const byKey = new Map(segments.map((s) => [s.key, s]));
        const total = plan.uploads.length;

        // Build everything first, so we know how much room it needs.
        const builtByKey = new Map<string, Built>();
        for (let i = 0; i < total; i++) {
            onProgress?.({ phase: 'building', current: i + 1, total, label: `Preparing ${i + 1} of ${total}` });
            builtByKey.set(plan.uploads[i].key, await buildSegment(byKey.get(plan.uploads[i].key)!));
        }

        // Make room: delete the slots being replaced, and old slots if the panel would get too full.
        const clear = slotsToClear(map, plan, new Map([...builtByKey].map(([k, b]) => [k, sizeOf(b)])));
        if (clear.length) {
            await deleteSlotsBLE(clear);
            for (const slot of clear) map = forgetSlot(map, slot);
            slotStore.set({ ...map, panelName });
        }

        for (let i = 0; i < total; i++) {
            const { key, slot } = plan.uploads[i];
            const built = builtByKey.get(key)!;
            onProgress?.({ phase: 'uploading', current: i + 1, total, label: `Sending ${i + 1} of ${total}` });
            try {
                await uploadToSlot(built, slot);
            } catch (e) {
                // The panel may be out of storage (its reply for "full" is unknown): free some and try once more.
                if (!getBLEState().connected) throw e;
                const freed = await freeSpace(map, new Set(keys));
                if (!freed) throw fullError(e);
                console.warn('Upload failed; deleted unused slots and retrying', e);
                map = freed;
                slotStore.set({ ...map, panelName });
                try {
                    await uploadToSlot(built, slot);
                } catch (e2) {
                    throw fullError(e2);
                }
            }
            map = recordSlot(map, slot, key, Date.now(), sizeOf(built));
            slotStore.set({ ...map, panelName });
        }

        onProgress?.({ phase: 'starting', current: total, total, label: 'Starting' });
        await startProgram(plan.slots);
        map = touchSlots(map, plan.slots);
        slotStore.set({ ...map, panelName });
        onProgress?.({ phase: 'done', current: total, total, label: 'Playing' });
        return { uploaded: total, reused: new Set(keys).size - total, slots: plan.slots };
    } finally {
        running = false;
    }
}

export interface SendEstimate {
    /** slots that need sending (0 = switches instantly) */
    pending: number;
    /** rough upload time */
    seconds: number;
}

const TEXT_SEND_SECONDS = 2;

/** Slots these items still need to send, without building anything. */
export async function countPending(items: PlaylistItem[]): Promise<number> {
    if (!items.length) return 0;
    return planSlots(currentSlotMap(), (await planSegments(items)).map((s) => s.key)).uploads.length;
}

/**
 * Build everything these items still need to send (so pressing play starts uploading
 * straight away) and estimate how long sending takes. Yields between builds.
 */
export async function prepareItems(items: PlaylistItem[], isCancelled: () => boolean = () => false): Promise<SendEstimate | null> {
    if (!items.length) return { pending: 0, seconds: 0 };
    const segments = await planSegments(items);
    const plan = planSlots(currentSlotMap(), segments.map((s) => s.key));
    const byKey = new Map(segments.map((s) => [s.key, s]));
    let seconds = 0;
    for (const { key } of plan.uploads) {
        if (isCancelled()) return null;
        await new Promise((r) => setTimeout(r, 0));
        const built = await buildSegment(byKey.get(key)!);
        seconds += built.kind === 'gif' ? estimateUploadSeconds(built.bytes.length) : TEXT_SEND_SECONDS;
    }
    return { pending: plan.uploads.length, seconds };
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
