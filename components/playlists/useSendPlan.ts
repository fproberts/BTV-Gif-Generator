'use client';

import { useEffect, useState } from 'react';
import { countPending, prepareItems, type SendEstimate } from '@/lib/playlist/engine';
import type { Playlist, PlaylistItem } from '@/lib/playlist/model';
import type { SlotMap } from '@/lib/playlist/slots';

/**
 * Builds what these items still need to send, in the background (so play starts uploading
 * straight away), and estimates the send time. Null while working it out.
 */
export function useSendEstimate(items: PlaylistItem[], slotMap: SlotMap): SendEstimate | null {
    const [estimate, setEstimate] = useState<SendEstimate | null>(null);
    useEffect(() => {
        let cancelled = false;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEstimate(null);
        // wait for edits (e.g. dragging a speed slider) to settle before building
        const timer = setTimeout(() => {
            prepareItems(items, () => cancelled)
                .then((e) => !cancelled && e && setEstimate(e))
                .catch(() => {});
        }, 400);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [items, slotMap]);
    return estimate;
}

/** Ids of playlists whose content is all on the panel already. */
export function useReadyPlaylists(playlists: Playlist[], slotMap: SlotMap): Set<string> {
    const [ready, setReady] = useState<Set<string>>(() => new Set());
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const next = new Set<string>();
            for (const p of playlists) {
                if (!p.items.length) continue;
                try {
                    if ((await countPending(p.items)) === 0) next.add(p.id);
                } catch {
                    /* a picture can't load (offline and not saved): not ready */
                }
            }
            if (!cancelled) setReady(next);
        })();
        return () => {
            cancelled = true;
        };
    }, [playlists, slotMap]);
    return ready;
}

export function formatSendTime(seconds: number): string {
    if (seconds < 60) return `${Math.max(5, Math.round(seconds / 5) * 5)} s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round((seconds % 60) / 10) * 10;
    return s ? `${m} min ${s} s` : `${m} min`;
}
