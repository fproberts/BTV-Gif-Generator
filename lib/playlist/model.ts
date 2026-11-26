/**
 * Playlist data model. Items are self-contained (they carry image URLs and text settings),
 * so a playlist still plays when the library or server is unreachable.
 */

import type { PortableStudio } from '../ipixel/studio';

export interface ImageRef {
    imageId: string;
    url: string;
    name: string;
}

export type PlaylistItem =
    // `endless` is from older saved playlists and is ignored: pictures now flow into each other
    | ({ id: string; kind: 'scroll'; pxPerSecond: number; endless?: boolean } & ImageRef)
    | ({ id: string; kind: 'still'; seconds: number; fit: 'cover' | 'contain' } & ImageRef)
    // older saved playlists only: several pictures in one item, played like separate scroll items
    | { id: string; kind: 'strip'; images: ImageRef[]; pxPerSecond: number }
    | { id: string; kind: 'text'; name: string; text: PortableStudio };

export type ItemKind = PlaylistItem['kind'];

export interface Playlist {
    id: string;
    name: string;
    favourite: boolean;
    items: PlaylistItem[];
    createdAt: number;
    updatedAt: number;
}

export const DEFAULT_PX_PER_SECOND = 16;
export const DEFAULT_STILL_SECONDS = 8;
export const MIN_ITEM_SECONDS = 6;

export function newId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** What the item shows, without its id: two items with the same content share a panel slot. */
function contentOf(item: PlaylistItem): unknown {
    switch (item.kind) {
        case 'scroll':
            return ['scroll', item.url, item.pxPerSecond];
        case 'still':
            return ['still', item.url, item.seconds, item.fit];
        case 'strip':
            return ['strip', item.images.map((i) => i.url), item.pxPerSecond];
        case 'text':
            return ['text', Object.entries(item.text).sort(([a], [b]) => a.localeCompare(b))];
    }
}

/** What the item shows, as a short stable key (same content, same key). */
export function itemKey(item: PlaylistItem): string {
    return contentKey(item.kind, contentOf(item));
}

/** FNV-1a 64-bit-ish (two 32-bit lanes) over the JSON of `value`. */
export function contentKey(prefix: string, value: unknown): string {
    const s = JSON.stringify(value);
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193);
        h2 = Math.imul(h2 ^ c, 0x5bd1e995);
    }
    return `${prefix}-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export function itemTitle(item: PlaylistItem): string {
    switch (item.kind) {
        case 'strip':
            return item.images.map((i) => i.name).join(' + ') || 'Continuous scroll';
        case 'text':
            return item.text.text || item.name;
        default:
            return item.name;
    }
}

export function itemSummary(item: PlaylistItem): string {
    switch (item.kind) {
        case 'scroll':
            return 'Scroll';
        case 'still':
            return `Still, ${Math.max(MIN_ITEM_SECONDS, item.seconds)} s`;
        case 'strip':
            return `Scroll, ${item.images.length} pictures`;
        case 'text':
            return 'Text';
    }
}

export function createPlaylist(name: string): Playlist {
    const now = Date.now();
    return { id: newId(), name: name.trim() || 'Untitled playlist', favourite: false, items: [], createdAt: now, updatedAt: now };
}

export type PictureMode = 'scroll' | 'still';

export const PICTURE_MODES: { id: PictureMode; label: string; hint: string }[] = [
    { id: 'scroll', label: 'Scroll', hint: 'Scrolls down and flows straight into the next picture' },
    { id: 'still', label: 'Still', hint: 'Fills the screen, no movement' },
];

/** Playlist items for a set of chosen pictures, one per picture. */
export function itemsFromPictures(pictures: ImageRef[], mode: PictureMode): PlaylistItem[] {
    return pictures.map((p) =>
        mode === 'still'
            ? { id: newId(), kind: 'still', ...p, seconds: DEFAULT_STILL_SECONDS, fit: 'cover' as const }
            : { id: newId(), kind: 'scroll', ...p, pxPerSecond: DEFAULT_PX_PER_SECOND },
    );
}

/** True when every item is a scrolling picture: the whole playlist becomes one endless scroll. */
export function isPictureLoop(items: PlaylistItem[]): boolean {
    return items.length > 0 && items.every((i) => i.kind === 'scroll' || i.kind === 'strip');
}

export function textItem(name: string, text: PortableStudio): PlaylistItem {
    return { id: newId(), kind: 'text', name, text };
}
