/**
 * File-backed store for the shared text library (server only).
 *
 *  - one JSON file, written atomically (temp file + rename)
 *  - every operation runs through a single queue, so concurrent requests
 *    cannot interleave a read-modify-write
 *  - all input is sanitised here; the client is never trusted
 *  - recency (lastUsedAt) is bumped by saving and by casting; when the library is
 *    full, saving evicts the least recently used items, so popular texts survive
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MAX_LIBRARY_ITEMS, cleanName, sameName } from './ipixel/library.ts';
import type { SavedTextConfig } from './ipixel/library.ts';
import { sanitizePortable } from './ipixel/studio.ts';

interface FileShape {
    version: 1;
    items: SavedTextConfig[];
}

export interface SaveInput {
    /** when given, that item is updated (and may be renamed) */
    id?: string;
    name: string;
    config: unknown;
}

export type LibraryErrorCode = 'name-required' | 'name-taken' | 'not-found';

export class LibraryError extends Error {
    code: LibraryErrorCode;
    constructor(message: string, code: LibraryErrorCode) {
        super(message);
        this.code = code;
    }
}

function isItem(x: unknown): x is SavedTextConfig {
    if (!x || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    return typeof o.id === 'string' && typeof o.name === 'string' && typeof o.lastUsedAt === 'number' && typeof o.config === 'object' && o.config !== null;
}

export interface SaveResult {
    item: SavedTextConfig;
    /** items deleted to make room (least recently used first); empty almost always */
    evicted: SavedTextConfig[];
}

/** Least recently used first; ties go to the one created earlier. */
function byLeastRecentlyUsed(a: SavedTextConfig, b: SavedTextConfig): number {
    return a.lastUsedAt - b.lastUsedAt || a.createdAt - b.createdAt;
}

export function createTextLibraryStore(filePath: string, now: () => number = Date.now, maxItems: number = MAX_LIBRARY_ITEMS) {
    let queue: Promise<unknown> = Promise.resolve();
    const run = <T>(fn: () => Promise<T>): Promise<T> => {
        const p = queue.then(fn, fn);
        queue = p.catch(() => undefined);
        return p;
    };

    /** A timestamp strictly newer than every existing lastUsedAt, so ordering never ties or goes backwards. */
    const stamp = (items: SavedTextConfig[]): number => Math.max(now(), ...items.map((i) => i.lastUsedAt + 1));

    async function read(): Promise<FileShape> {
        let raw: string;
        try {
            raw = await fs.readFile(filePath, 'utf-8');
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, items: [] };
            throw e;
        }
        try {
            const parsed = JSON.parse(raw) as Partial<FileShape>;
            const items = Array.isArray(parsed.items) ? parsed.items.filter(isItem) : [];
            // Re-sanitise on read so a hand-edited file cannot feed bad values to the UI.
            return { version: 1, items: items.map((i) => ({ ...i, config: sanitizePortable(i.config) })) };
        } catch {
            // Keep the unreadable file for inspection instead of overwriting it.
            await fs.rename(filePath, `${filePath}.corrupt-${now()}`).catch(() => undefined);
            return { version: 1, items: [] };
        }
    }

    async function write(data: FileShape): Promise<void> {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(data, null, 2));
        await fs.rename(tmp, filePath);
    }

    return {
        list: (): Promise<SavedTextConfig[]> => run(async () => (await read()).items),

        save: (input: SaveInput): Promise<SaveResult> =>
            run(async () => {
                const name = cleanName(input.name);
                if (!name) throw new LibraryError('Give this text a name first.', 'name-required');
                const data = await read();
                const config = sanitizePortable(input.config);

                let target = input.id ? data.items.find((i) => i.id === input.id) : undefined;
                if (input.id && !target) throw new LibraryError('That saved text no longer exists.', 'not-found');
                if (!input.id) target = data.items.find((i) => sameName(i.name, name));

                const clash = data.items.find((i) => sameName(i.name, name) && i.id !== target?.id);
                if (clash) throw new LibraryError(`“${clash.name}” already exists.`, 'name-taken');

                const t = stamp(data.items);
                if (target) {
                    target.name = name;
                    target.config = config;
                    target.updatedAt = t;
                    target.lastUsedAt = t;
                    target.useCount += 1;
                    await write(data);
                    return { item: target, evicted: [] };
                }

                // Full? Delete the least recently used items to make room for this one.
                const evicted: SavedTextConfig[] = [];
                if (data.items.length >= maxItems) {
                    const doomed = [...data.items].sort(byLeastRecentlyUsed).slice(0, data.items.length - maxItems + 1);
                    const gone = new Set(doomed.map((d) => d.id));
                    data.items = data.items.filter((i) => !gone.has(i.id));
                    evicted.push(...doomed);
                }
                const created: SavedTextConfig = { id: randomUUID(), name, createdAt: t, updatedAt: t, lastUsedAt: t, useCount: 1, config };
                data.items.push(created);
                await write(data);
                return { item: created, evicted };
            }),

        /** Record a cast to the screen: moves it to the top of "recent" and protects it from the cull. Null if it was deleted meanwhile. */
        touch: (id: string): Promise<SavedTextConfig | null> =>
            run(async () => {
                const data = await read();
                const item = data.items.find((i) => i.id === id);
                if (!item) return null;
                item.lastUsedAt = stamp(data.items);
                item.useCount += 1;
                await write(data);
                return item;
            }),

        remove: (id: string): Promise<boolean> =>
            run(async () => {
                const data = await read();
                const next = data.items.filter((i) => i.id !== id);
                if (next.length === data.items.length) return false;
                await write({ version: 1, items: next });
                return true;
            }),
    };
}

export type TextLibraryStore = ReturnType<typeof createTextLibraryStore>;
