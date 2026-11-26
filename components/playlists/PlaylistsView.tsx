'use client';

import { useMemo } from 'react';
import { Loader2, Play, Plus, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LedBlank, LedItem } from '@/components/led/LedMatrix';
import { useScreen } from '@/components/app/useScreen';
import { createPlaylist, type Playlist } from '@/lib/playlist/model';
import { savePlaylist, usePlaylists, useSlotMap } from '@/lib/playlist/store';
import { useReadyPlaylists } from './useSendPlan';

export function PlaylistsView({ onOpen }: { onOpen: (id: string) => void }) {
    const playlists = usePlaylists();
    const slotMap = useSlotMap();
    const { play, busy } = useScreen();

    const sorted = useMemo(
        () => [...playlists].sort((a, b) => Number(b.favourite) - Number(a.favourite) || b.updatedAt - a.updatedAt),
        [playlists],
    );
    const onScreen = useReadyPlaylists(playlists, slotMap);

    const create = () => {
        const p = createPlaylist(`Playlist ${playlists.length + 1}`);
        savePlaylist(p);
        onOpen(p.id);
    };

    return (
        <section className="mx-auto max-w-2xl px-4 py-5">
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Playlists</h1>
                <Button variant="secondary" size="lg" onClick={create}>
                    <Plus /> New
                </Button>
            </div>

            {sorted.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
                    <LedBlank className="mx-auto mb-6 max-w-72" />
                    <h2 className="text-lg font-medium">Make your first playlist</h2>
                    <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                        Mix pictures and text, then play it. The screen keeps looping it after you disconnect.
                    </p>
                    <Button size="lg" className="mt-5 h-11" onClick={create}>
                        <Plus /> New playlist
                    </Button>
                </div>
            ) : (
                <ul className="space-y-2">
                    {sorted.map((p) => (
                        <PlaylistRow
                            key={p.id}
                            playlist={p}
                            ready={onScreen.has(p.id)}
                            busy={busy}
                            onOpen={() => onOpen(p.id)}
                            onPlay={() => play(p.items, `“${p.name}”`)}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}

function PlaylistRow({ playlist, ready, busy, onOpen, onPlay }: {
    playlist: Playlist;
    ready: boolean;
    busy: boolean;
    onOpen: () => void;
    onPlay: () => void;
}) {
    const first = playlist.items[0];
    const count = playlist.items.length;
    return (
        <li className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 pr-2">
            <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                {first ? <LedItem item={first} animate={false} className="w-28 shrink-0 sm:w-36" /> : <LedBlank className="w-28 shrink-0 sm:w-36" />}
                <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-medium">
                        {playlist.favourite && <Star className="size-3.5 shrink-0 fill-primary text-primary" aria-label="Favourite" />}
                        <span className="truncate">{playlist.name}</span>
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                        {count === 0 ? 'Empty' : `${count} item${count === 1 ? '' : 's'}`}
                        {ready && <span className="text-primary">, on the screen</span>}
                    </span>
                </span>
            </button>
            <Button size="icon-lg" className="size-11 rounded-full" aria-label={`Play ${playlist.name}`} disabled={count === 0 || busy} onClick={onPlay}>
                {busy ? <Loader2 className="animate-spin" /> : <Play className="fill-current" />}
            </Button>
        </li>
    );
}
