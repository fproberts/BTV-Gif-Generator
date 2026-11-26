'use client';

import { ListPlus, Plus, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { createPlaylist, type PlaylistItem } from '@/lib/playlist/model';
import { savePlaylist, usePlaylists } from '@/lib/playlist/store';

/** Pick a playlist (or make a new one) and append `items` to it. */
export function AddToPlaylist({ items, open, onOpenChange, onDone }: {
    items: () => PlaylistItem[];
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onDone?: () => void;
}) {
    const playlists = usePlaylists();
    const sorted = [...playlists].sort((a, b) => Number(b.favourite) - Number(a.favourite) || b.updatedAt - a.updatedAt);

    const addTo = (id: string | null) => {
        const add = items();
        if (id === null) {
            const p = { ...createPlaylist(`Playlist ${playlists.length + 1}`), items: add };
            savePlaylist(p);
            toast.success(`Added to “${p.name}”`);
        } else {
            const p = playlists.find((x) => x.id === id);
            if (!p) return;
            savePlaylist({ ...p, items: [...p.items, ...add] });
            toast.success(`Added to “${p.name}”`);
        }
        onOpenChange(false);
        onDone?.();
    };

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className="mx-auto max-w-2xl">
                <DrawerHeader>
                    <DrawerTitle>Add to playlist</DrawerTitle>
                </DrawerHeader>
                <div className="max-h-[60dvh] space-y-1 overflow-y-auto px-4 pb-6">
                    {sorted.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => addTo(p.id)}
                            className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-accent"
                        >
                            {p.favourite ? <Star className="size-4 fill-primary text-primary" /> : <ListPlus className="size-4 text-muted-foreground" />}
                            <span className="flex-1 truncate">{p.name}</span>
                            <span className="text-sm text-muted-foreground tabular-nums">{p.items.length}</span>
                        </button>
                    ))}
                    <Button variant="outline" size="lg" className="mt-2 h-11 w-full" onClick={() => addTo(null)}>
                        <Plus /> New playlist
                    </Button>
                </div>
            </DrawerContent>
        </Drawer>
    );
}
