'use server';

import path from 'path';
import { checkAdminPassword } from '@/app/actions';
import { createTextLibraryStore, LibraryError, type SaveResult, type TextLibraryStore } from '@/lib/textLibraryStore';
import type { SavedTextConfig } from '@/lib/ipixel/library';

// Same storage root rules as app/actions.ts (STORAGE_PATH in Docker, ./data locally).
const DATA_DIR = process.env.STORAGE_PATH
    ? path.join(process.env.STORAGE_PATH, 'data')
    : path.join(process.cwd(), 'data');

// One store (and therefore one write queue) per server process, even across dev reloads.
const g = globalThis as typeof globalThis & { __textLibraryStore?: TextLibraryStore };
function store(): TextLibraryStore {
    g.__textLibraryStore ??= createTextLibraryStore(path.join(DATA_DIR, 'text-library.json'));
    return g.__textLibraryStore;
}

export type LibraryResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<LibraryResult<T>> {
    try {
        return { ok: true, value: await fn() };
    } catch (e) {
        if (e instanceof LibraryError) return { ok: false, error: e.message };
        console.error('[text library]', e);
        return { ok: false, error: 'Something went wrong saving to the shared library.' };
    }
}

export async function listTextConfigs(): Promise<LibraryResult<SavedTextConfig[]>> {
    return guard(() => store().list());
}

/** Saves (or updates) a text. If the library was full, `evicted` lists the least recently used texts that were deleted to make room. */
export async function saveTextConfig(input: { id?: string; name: string; config: unknown }): Promise<LibraryResult<SaveResult>> {
    return guard(() => store().save(input));
}

/** Call after a saved text is cast to the screen: moves it to the top of "recent" and keeps it from being culled. */
export async function touchTextConfig(id: string): Promise<LibraryResult<SavedTextConfig | null>> {
    return guard(() => store().touch(String(id)));
}

/**
 * Deleting is admin-only. Admin mode in this app is an unlock flow on the client, so the
 * server re-checks the admin password here instead of trusting a client flag.
 */
export async function deleteTextConfig(id: string, adminPassword: string): Promise<LibraryResult<boolean>> {
    if (typeof adminPassword !== 'string' || !(await checkAdminPassword(adminPassword))) {
        return { ok: false, error: 'Deleting saved texts needs admin mode.' };
    }
    return guard(() => store().remove(String(id)));
}
