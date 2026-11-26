/**
 * Shared library of named text configurations: types plus the pure helpers
 * (naming rules, search, "recent") used by both the UI and the server store.
 */

import type { PortableStudio } from './studio';

export interface SavedTextConfig {
    id: string;
    /** user-chosen name, unique case-insensitively */
    name: string;
    createdAt: number;
    updatedAt: number;
    /**
     * Last time it was saved or cast to the screen. Drives "recent" AND the cull:
     * when the library is full, the item with the oldest lastUsedAt is deleted.
     */
    lastUsedAt: number;
    useCount: number;
    config: PortableStudio;
}

export const MAX_NAME_LENGTH = 60;
/** Saving beyond this deletes the least recently used item(s) to make room. */
export const MAX_LIBRARY_ITEMS = 500;
export const RECENT_COUNT = 5;

/** Trim, collapse inner whitespace and cap the length. */
export function cleanName(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

export function sameName(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Most recently saved/cast first (ties broken by newest creation). */
export function recentConfigs(items: SavedTextConfig[], n: number = RECENT_COUNT): SavedTextConfig[] {
    return [...items].sort((a, b) => b.lastUsedAt - a.lastUsedAt || b.createdAt - a.createdAt).slice(0, n);
}

/**
 * Case-insensitive search over the name and the message text. Every word in the
 * query must match somewhere; names starting with the query rank first, then
 * name matches, then text-only matches (each group most recent first).
 */
export function searchConfigs(items: SavedTextConfig[], query: string): SavedTextConfig[] {
    const q = query.trim().toLowerCase();
    if (!q) return [...items].sort((a, b) => a.name.localeCompare(b.name));
    const words = q.split(/\s+/);
    const scored: Array<{ item: SavedTextConfig; rank: number }> = [];
    for (const item of items) {
        const name = item.name.toLowerCase();
        const text = item.config.text.toLowerCase();
        const hay = `${name}\n${text}`;
        if (!words.every((w) => hay.includes(w))) continue;
        const rank = name.startsWith(q) ? 0 : words.every((w) => name.includes(w)) ? 1 : 2;
        scored.push({ item, rank });
    }
    scored.sort((a, b) => a.rank - b.rank || b.item.lastUsedAt - a.item.lastUsedAt);
    return scored.map((s) => s.item);
}
