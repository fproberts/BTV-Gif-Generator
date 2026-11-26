'use client';

/**
 * Local-first storage for playlists and the panel slot record (localStorage), with React hooks.
 * Everything here works offline.
 */

import { useSyncExternalStore } from 'react';
import type { Playlist } from './model';
import { EMPTY_SLOT_MAP, type SlotMap } from './slots';

const PLAYLISTS_KEY = 'bb.playlists.v1';
const SLOTS_KEY = 'bb.slots.v1';

type Listener = () => void;

function createStore<T>(key: string, fallback: T) {
    let value: T | null = null;
    const listeners = new Set<Listener>();

    const read = (): T => {
        if (value !== null) return value;
        try {
            const raw = window.localStorage.getItem(key);
            value = raw ? (JSON.parse(raw) as T) : fallback;
        } catch {
            value = fallback;
        }
        return value;
    };

    return {
        get: read,
        set(next: T | ((prev: T) => T)) {
            value = typeof next === 'function' ? (next as (p: T) => T)(read()) : next;
            try {
                window.localStorage.setItem(key, JSON.stringify(value));
            } catch {
                /* storage full or blocked: keep the in-memory value */
            }
            listeners.forEach((l) => l());
        },
        subscribe(l: Listener) {
            listeners.add(l);
            const onStorage = (e: StorageEvent) => {
                if (e.key === key) {
                    value = null;
                    l();
                }
            };
            window.addEventListener('storage', onStorage);
            return () => {
                listeners.delete(l);
                window.removeEventListener('storage', onStorage);
            };
        },
        fallback,
    };
}

export const playlistStore = createStore<Playlist[]>(PLAYLISTS_KEY, []);
export const slotStore = createStore<SlotMap>(SLOTS_KEY, EMPTY_SLOT_MAP);

export function usePlaylists(): Playlist[] {
    return useSyncExternalStore(playlistStore.subscribe, playlistStore.get, () => playlistStore.fallback);
}

export function useSlotMap(): SlotMap {
    return useSyncExternalStore(slotStore.subscribe, slotStore.get, () => slotStore.fallback);
}

export function savePlaylist(p: Playlist) {
    const next = { ...p, updatedAt: Date.now() };
    playlistStore.set((all) => (all.some((x) => x.id === p.id) ? all.map((x) => (x.id === p.id ? next : x)) : [next, ...all]));
}

export function deletePlaylist(id: string) {
    playlistStore.set((all) => all.filter((x) => x.id !== id));
}

export function getPlaylist(id: string): Playlist | undefined {
    return playlistStore.get().find((p) => p.id === id);
}
