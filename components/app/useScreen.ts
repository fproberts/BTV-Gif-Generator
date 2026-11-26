'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { connectBLE, getBLEState, setBrightnessBLE, setClockBLE, useBLEState } from '@/lib/webBluetooth';
import { playItems, type PlayProgress } from '@/lib/playlist/engine';
import type { PlaylistItem } from '@/lib/playlist/model';

function message(e: unknown): string {
    const m = e instanceof Error ? e.message : String(e);
    if (/User cancelled|cancelled the requestDevice/i.test(m)) return 'Connection cancelled';
    if (/GATT|disconnected|not connected/i.test(m)) return 'Lost the connection to the screen. Reconnect and try again.';
    return m;
}

/** Connect if needed. Returns false if the user cancelled. */
export async function ensureConnected(): Promise<boolean> {
    if (getBLEState().connected) return true;
    try {
        await connectBLE();
        return true;
    } catch (e) {
        toast.error(message(e));
        return false;
    }
}

export function useScreen() {
    const ble = useBLEState();
    const [progress, setProgress] = useState<PlayProgress | null>(null);

    const play = useCallback(async (items: PlaylistItem[], what: string) => {
        if (!(await ensureConnected())) return false;
        const id = toast.loading(`Preparing ${what}…`);
        try {
            const res = await playItems(items, (p) => {
                setProgress(p);
                if (p.phase !== 'done') toast.loading(p.total > 0 && p.phase !== 'starting' ? `${p.label}…` : 'Starting…', { id });
            });
            toast.success(res.uploaded === 0 ? `Playing ${what}` : `Playing ${what}`, {
                id,
                description: res.uploaded === 0 ? 'Already on the screen, switched instantly.' : `Sent ${res.uploaded} new item${res.uploaded === 1 ? '' : 's'}.`,
            });
            return true;
        } catch (e) {
            toast.error(message(e), { id });
            return false;
        } finally {
            setProgress(null);
        }
    }, []);

    const brightness = useCallback(async (level: number) => {
        if (!getBLEState().connected) return;
        try {
            await setBrightnessBLE(level);
        } catch (e) {
            toast.error(message(e));
        }
    }, []);

    const clock = useCallback(async () => {
        if (!(await ensureConnected())) return;
        try {
            await setClockBLE();
            toast.success('Showing the clock');
        } catch (e) {
            toast.error(message(e));
        }
    }, []);

    return { ble, progress, busy: progress !== null || ble.isBusy, play, brightness, clock };
}
