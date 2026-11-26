'use client';

/**
 * Console helpers for checking playlists on the real panel (added to window.__ipixel):
 *
 *   await __ipixel.makeTestPlaylists()   // creates the "Test …" playlists from library pictures
 *   await __ipixel.plan('Test A')        // what each slot will show, how long, and what still needs sending
 *   await __ipixel.play('Test A')        // send and play (same as the Play button)
 *   await __ipixel.fresh()               // wipe the panel and this phone's record of it
 */

import { DEFAULT_STUDIO, pickPortable, type PortableStudio } from '../ipixel/studio';
import { PANEL_HEIGHT, PANEL_WIDTH } from '../ipixel/protocol';
import { buildFramesGif, estimateUploadSeconds } from '../ipixel/panelGif';
import type { ImageRecord } from '../types';
import { buildSegment, currentSlotMap, planSegments, playItems, startFresh, setSwitchMode, type SwitchMode } from './engine';
import { deleteSlotsBLE, sendWindowFramesBLE, setProgramListBLE } from '../webBluetooth';
import { PANEL_STORAGE_BUDGET, storedBytes } from './slots';
import { MAX_SLOT, MIN_SLOT } from '../ipixel/protocol';
import { DEFAULT_PX_PER_SECOND, textItem, type ImageRef, type Playlist, type PlaylistItem } from './model';
import { planSlots } from './slots';
import { playlistStore, savePlaylist, slotStore } from './store';

const TEST_PREFIX = 'Test ';

function marker(text: string, color: string): PlaylistItem {
    const t: PortableStudio = { ...pickPortable(DEFAULT_STUDIO), text, effect: 0, color, sizePx: 12, hAlign: 1, vAlign: 1 };
    return textItem(text, t);
}

const scroll = (p: ImageRef): PlaylistItem => ({ id: crypto.randomUUID(), kind: 'scroll', ...p, pxPerSecond: DEFAULT_PX_PER_SECOND });

async function libraryPictures(): Promise<(ImageRef & { rows: number })[]> {
    let images: ImageRecord[] = [];
    try {
        images = JSON.parse(window.localStorage.getItem('bb.library.v1') ?? '{}').images ?? [];
    } catch {
        /* none cached */
    }
    if (!images.length) throw new Error('No library pictures cached yet: open the app with signal first');
    const usable = images.filter((i) => !/\.gif$/i.test(i.url));
    const measured = await Promise.all(
        usable.map(async (i) => {
            const img = new Image();
            img.src = i.url;
            try {
                await img.decode();
            } catch {
                return null;
            }
            const rows = Math.max(PANEL_HEIGHT, Math.round((img.naturalHeight * PANEL_WIDTH) / img.naturalWidth));
            return { imageId: i.id, url: i.url, name: i.name || i.originalName.replace(/\.[^.]+$/, ''), rows };
        }),
    );
    return measured.filter((m): m is NonNullable<typeof m> => !!m);
}

/** Create (or replace) the test playlists. Returns what each one is for. */
async function makeTestPlaylists() {
    const pics = await libraryPictures();
    if (pics.length < 8) throw new Error(`Need at least 8 pictures in the library, found ${pics.length}`);
    const byRows = [...pics].sort((a, b) => a.rows - b.rows);
    const normal = pics.filter((p) => p.rows >= 70 && p.rows <= 160);
    const pool = normal.length >= 6 ? normal : pics;
    const shortest = byRows[0];
    const tallest = byRows[byRows.length - 1];
    const mid = byRows.find((p) => p.rows >= 80 && p.rows <= 110) ?? byRows[Math.floor(byRows.length / 2)];
    const six = pool.filter((p) => p !== shortest && p !== tallest).slice(0, 6);

    const lists: [string, PlaylistItem[]][] = [
        ['A loop of 6', six.map(scroll)],
        ['B one picture', [scroll(mid)]],
        ['C mixed', [marker('C START', 'FF0000'), ...six.slice(0, 3).map(scroll), marker('C END', '00FF00')]],
        ['D short picture', [marker('D START', 'FF0000'), scroll(shortest), marker('D END', '00FF00')]],
        ['E big loop', [...pool.filter((p) => p !== shortest).slice(0, 11), tallest].filter((p, i, a) => a.indexOf(p) === i).map(scroll)],
    ];

    const now = Date.now();
    const keep = playlistStore.get().filter((p) => !p.name.startsWith(TEST_PREFIX));
    playlistStore.set(keep);
    lists.forEach(([name, items], i) => {
        const p: Playlist = { id: `test-${i}`, name: `${TEST_PREFIX}${name}`, favourite: false, items, createdAt: now - i, updatedAt: now - i };
        savePlaylist(p);
    });
    console.table(
        lists.map(([name, items]) => ({
            playlist: TEST_PREFIX + name,
            items: items.map((it) => (it.kind === 'text' ? `"${it.text.text}"` : it.kind === 'scroll' ? `${it.name} (${pics.find((p) => p.url === it.url)?.rows} rows)` : '')).join(', '),
        })),
    );
    return lists.map(([name]) => TEST_PREFIX + name);
}

function findPlaylist(name: string): Playlist {
    const all = playlistStore.get();
    const p = all.find((x) => x.name === name) ?? all.find((x) => x.name.toLowerCase().startsWith(name.toLowerCase()));
    if (!p) throw new Error(`No playlist called "${name}". Have: ${all.map((x) => x.name).join(', ')}`);
    return p;
}

/** Print what each panel slot will show, for how long, and what still needs sending. */
async function plan(name: string) {
    const p = findPlaylist(name);
    const segments = await planSegments(p.items);
    const slotPlan = planSlots(currentSlotMap(), segments.map((s) => s.key));
    const sending = new Set(slotPlan.uploads.map((u) => u.key));
    const rows = [];
    let sendSeconds = 0;
    let loopSeconds = 0;
    for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        const built = await buildSegment(s);
        const kb = built.kind === 'gif' ? built.bytes.length / 1024 : 0;
        const seconds = s.kind === 'flow' ? s.chunk.durationMs / 1000 : s.kind === 'still' ? Math.max(6, s.item.seconds) : NaN;
        if (sending.has(s.key)) sendSeconds += built.kind === 'gif' ? estimateUploadSeconds(built.bytes.length) : 2;
        if (!Number.isNaN(seconds)) loopSeconds += seconds;
        rows.push({
            slot: slotPlan.slots[i],
            status: sending.has(s.key) ? 'will send' : 'on panel',
            shows: s.kind === 'flow' ? s.names.join(' → ') : s.kind === 'still' ? `still: ${s.item.name}` : `text: ${s.text.text}`,
            seconds: Number.isNaN(seconds) ? 'panel decides' : seconds.toFixed(1),
            frames: s.kind === 'flow' ? s.chunk.frames.length : '',
            KB: kb ? kb.toFixed(0) : '',
        });
    }
    console.log(`${p.name}: ${segments.length} slot(s), pictures play for ${loopSeconds.toFixed(1)} s per loop, ${slotPlan.uploads.length} to send (about ${Math.round(sendSeconds)} s)`);
    console.table(rows);
}

async function play(name: string) {
    const p = findPlaylist(name);
    const t0 = performance.now();
    const res = await playItems(p.items, (pr) => pr.phase === 'uploading' && console.log(pr.label));
    console.log(`Playing ${p.name}: sent ${res.uploaded}, reused ${res.reused}, slots [${res.slots.join(', ')}] in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

let stopFill = false;

/** A GIF of random noise (compresses badly, so each one really takes ~`kb` of storage). */
function noiseGif(frames: number) {
    const height = PANEL_HEIGHT + (frames - 1) * 2;
    const rgb = new Uint8Array(PANEL_WIDTH * height * 3);
    // getRandomValues fills at most 64 KB per call
    for (let i = 0; i < rgb.length; i += 65536) crypto.getRandomValues(rgb.subarray(i, Math.min(rgb.length, i + 65536)));
    return buildFramesGif({ rgb, height }, Array.from({ length: frames }, (_, i) => ({ top: i * 2, delayMs: 100 })));
}

/**
 * Find the panel's storage limit: wipe it, then put a different ~90 KB noise GIF in every slot
 * until a send fails (or all 100 slots are full). Takes up to ~15 min; __ipixel.stopFill() stops it.
 * Afterwards run __ipixel.fresh().
 */
async function fillTest(framesPerGif = 60) {
    stopFill = false;
    await startFresh();
    let totalKb = 0;
    const filled: number[] = [];
    const t0 = performance.now();
    for (let slot = MIN_SLOT; slot <= MAX_SLOT && !stopFill; slot++) {
        const gif = noiseGif(framesPerGif);
        try {
            await sendWindowFramesBLE(gif.bytes, true, slot, { quiet: true });
        } catch (e) {
            console.warn(`❌ FILL: slot ${slot} failed after ${filled.length} slots / ${(totalKb / 1024).toFixed(2)} MB stored:`, e);
            break;
        }
        filled.push(slot);
        totalKb += gif.bytes.length / 1024;
        console.log(`FILL: slot ${slot} ok, ${(gif.bytes.length / 1024).toFixed(0)} KB, total ${(totalKb / 1024).toFixed(2)} MB, ${((performance.now() - t0) / 60000).toFixed(1)} min`);
    }
    if (filled.length) {
        // play the first and last stored slots: if the last one shows noise, storage really held it
        await setProgramListBLE([filled[0], filled[filled.length - 1]]).catch(() => {});
    }
    console.log(`FILL done: ${filled.length} slots, ${(totalKb / 1024).toFixed(2)} MB. Now playing slots ${filled[0]} and ${filled.at(-1)}. Run __ipixel.fresh() when finished.`);
    return { slots: filled.length, mb: Number((totalKb / 1024).toFixed(2)) };
}

/**
 * Run straight after fillTest, while the panel is full:
 * 1. overwrite slot 1 without deleting it first (does the panel free the old copy?)
 * 2. delete slots 2 and 3, then send into a new slot (does deleting free space?)
 */
async function fullChecks() {
    const attempt = async (label: string, slot: number) => {
        try {
            await sendWindowFramesBLE(noiseGif(60).bytes, true, slot, { quiet: true });
            console.log(`✅ ${label}: accepted`);
            return 'accepted';
        } catch (e) {
            console.log(`❌ ${label}: ${e instanceof Error ? e.message : e}`);
            return 'refused';
        }
    };
    const overwrite = await attempt('1. overwrite slot 1 while full', 1);
    const del = await deleteSlotsBLE([2, 3]);
    const afterDelete = await attempt(`2. after deleting slots 2-3 (reply ${del}), send into slot 99`, 99);
    console.log('Run __ipixel.fresh() when finished.');
    return { overwrite, deleteReply: del, afterDelete };
}

if (typeof window !== 'undefined') {
    const w = window as unknown as { __ipixel?: Record<string, unknown> };
    w.__ipixel = {
        ...(w.__ipixel ?? {}),
        makeTestPlaylists,
        plan,
        play,
        fresh: startFresh,
        fillTest,
        fullChecks,
        stopFill: () => {
            stopFill = true;
        },
        /** how the new list starts: 'list' (default), 'twice', 'power', 'clock'; null resets */
        setSwitchMode: (m: SwitchMode | null) => setSwitchMode(m),
        /** what this phone believes is stored on the panel (the panel can't be asked) */
        storage: () => {
            const map = slotStore.get();
            const mb = (b: number) => (b / 1024 / 1024).toFixed(2);
            console.log(`${map.entries.length} slots, ${mb(storedBytes(map))} MB of the ${mb(PANEL_STORAGE_BUDGET)} MB the app allows itself (panel limit ~6.1 MB)`);
        },
    };
}
