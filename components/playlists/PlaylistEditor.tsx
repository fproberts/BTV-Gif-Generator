'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Ellipsis, Loader2, Play, Plus, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { LedItem } from '@/components/led/LedMatrix';
import { useScreen } from '@/components/app/useScreen';
import { AddItemsDrawer } from './AddItemsDrawer';
import { ItemDrawer } from './ItemDrawer';
import { createPlaylist, itemSummary, itemTitle, newId, type Playlist, type PlaylistItem } from '@/lib/playlist/model';
import { deletePlaylist, savePlaylist, useSlotMap } from '@/lib/playlist/store';
import { formatSendTime, useSendEstimate } from './useSendPlan';

export function PlaylistEditor({ playlist, onBack }: { playlist: Playlist; onBack: () => void }) {
    const [draft, setDraft] = useState(playlist);
    const [adding, setAdding] = useState(playlist.items.length === 0);
    const [editing, setEditing] = useState<string | null>(null);
    const { play, busy, ble } = useScreen();
    const slotMap = useSlotMap();

    // Save every change (local, instant).
    useEffect(() => {
        if (draft !== playlist) savePlaylist(draft);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft]);

    const update = (fn: (p: Playlist) => Playlist) => setDraft((d) => fn(d));
    const setItems = (fn: (items: PlaylistItem[]) => PlaylistItem[]) => update((p) => ({ ...p, items: fn(p.items) }));
    const move = (i: number, by: number) =>
        setItems((items) => {
            const next = [...items];
            const j = i + by;
            if (j < 0 || j >= next.length) return items;
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });

    const editingItem = draft.items.find((it) => it.id === editing) ?? null;
    const estimate = useSendEstimate(draft.items, slotMap);

    const playLabel = !ble.connected
        ? 'Connect and play'
        : draft.items.length === 0 || !estimate
          ? 'Play'
          : estimate.pending === 0
            ? 'Play now'
            : `Play (about ${formatSendTime(estimate.seconds)} to send)`;

    return (
        <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
            <div className="sticky top-14 z-20 border-b border-border/70 bg-background/95 backdrop-blur">
                <div className="mx-auto flex max-w-2xl items-center gap-1 px-2 py-2">
                    <Button variant="ghost" size="icon-lg" onClick={onBack} aria-label="Back to playlists">
                        <ArrowLeft />
                    </Button>
                    <Input
                        value={draft.name}
                        onChange={(e) => update((p) => ({ ...p, name: e.target.value }))}
                        onBlur={() => !draft.name.trim() && update((p) => ({ ...p, name: 'Untitled playlist' }))}
                        aria-label="Playlist name"
                        className="h-10 flex-1 border-transparent bg-transparent text-lg font-semibold dark:bg-transparent"
                    />
                    <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label={draft.favourite ? 'Remove from favourites' : 'Add to favourites'}
                        aria-pressed={draft.favourite}
                        onClick={() => update((p) => ({ ...p, favourite: !p.favourite }))}
                    >
                        <Star className={cn(draft.favourite && 'fill-primary text-primary')} />
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Playlist options" />}>
                            <Ellipsis />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                                onClick={() => {
                                    const copy = { ...createPlaylist(`${draft.name} copy`), items: draft.items.map((it) => ({ ...it, id: newId() })) };
                                    savePlaylist(copy);
                                    onBack();
                                }}
                            >
                                <Copy /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                variant="destructive"
                                onClick={() => {
                                    deletePlaylist(draft.id);
                                    onBack();
                                }}
                            >
                                <Trash2 /> Delete playlist
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <ol className="mx-auto w-full max-w-2xl flex-1 space-y-2 px-4 py-4">
                {draft.items.map((item, i) => (
                    <li key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 pr-1">
                        <button type="button" onClick={() => setEditing(item.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                            <LedItem item={item} animate={false} className="w-32 shrink-0 sm:w-40" />
                            <span className="min-w-0">
                                <span className="block truncate font-medium">{itemTitle(item)}</span>
                                <span className="block truncate text-sm text-muted-foreground">{itemSummary(item)}</span>
                            </span>
                        </button>
                        <div className="flex flex-col">
                            <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                                <ArrowUp />
                            </Button>
                            <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === draft.items.length - 1} onClick={() => move(i, 1)}>
                                <ArrowDown />
                            </Button>
                        </div>
                    </li>
                ))}
                <li>
                    <Button variant="outline" size="lg" className="h-12 w-full border-dashed" onClick={() => setAdding(true)}>
                        <Plus /> Add pictures or text
                    </Button>
                </li>
            </ol>

            <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 mx-auto w-full max-w-2xl px-4 pb-3">
                <Button
                    size="lg"
                    className="h-12 w-full text-base"
                    disabled={draft.items.length === 0 || busy}
                    onClick={() => play(draft.items, `“${draft.name}”`)}
                >
                    {busy ? <Loader2 className="animate-spin" /> : <Play />}
                    {busy ? 'Sending…' : playLabel}
                </Button>
            </div>

            <AddItemsDrawer open={adding} onOpenChange={setAdding} onAdd={(items) => setItems((all) => [...all, ...items])} />
            <ItemDrawer
                item={editingItem}
                onClose={() => setEditing(null)}
                onChange={(next) => setItems((all) => all.map((it) => (it.id === next.id ? next : it)))}
                onRemove={() => {
                    setItems((all) => all.filter((it) => it.id !== editing));
                    setEditing(null);
                }}
                onShowNow={() => {
                    if (editingItem) play([editingItem], `“${itemTitle(editingItem)}”`);
                    setEditing(null);
                }}
            />
        </div>
    );
}
