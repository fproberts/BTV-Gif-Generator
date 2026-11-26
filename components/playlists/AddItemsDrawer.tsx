'use client';

import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { displayName, useLibrary } from '@/components/app/LibraryContext';
import { LedText } from '@/components/led/LedMatrix';
import { PICTURE_MODES, itemsFromPictures, textItem, type PictureMode, type PlaylistItem } from '@/lib/playlist/model';

export function AddItemsDrawer({ open, onOpenChange, onAdd }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onAdd: (items: PlaylistItem[]) => void;
}) {
    const { images, data, texts } = useLibrary();
    const [tab, setTab] = useState<'pictures' | 'text'>('pictures');
    const [picked, setPicked] = useState<string[]>([]);
    const [mode, setMode] = useState<PictureMode>('scroll');
    const [folder, setFolder] = useState<string | null>(null);
    const [query, setQuery] = useState('');

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return images.filter((img) => (folder ? img.folderId === folder : true) && (!q || displayName(img).toLowerCase().includes(q)));
    }, [images, folder, query]);

    const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

    const close = () => {
        setPicked([]);
        setQuery('');
        onOpenChange(false);
    };

    const addPictures = () => {
        const refs = picked
            .map((id) => images.find((i) => i.id === id))
            .filter((i): i is NonNullable<typeof i> => !!i)
            .map((i) => ({ imageId: i.id, url: i.url, name: displayName(i) }));
        onAdd(itemsFromPictures(refs, mode));
        close();
    };

    const effectiveMode = picked.length < 2 && mode === 'strip' ? 'scroll' : mode;
    const addLabel =
        picked.length === 0
            ? 'Choose pictures'
            : effectiveMode === 'strip'
              ? `Add as one scroll`
              : `Add ${picked.length} picture${picked.length === 1 ? '' : 's'}`;

    return (
        <Drawer open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
            <DrawerContent className="mx-auto max-w-2xl">
                <DrawerHeader className="pb-2">
                    <DrawerTitle>Add to playlist</DrawerTitle>
                </DrawerHeader>
                <Tabs value={tab} onValueChange={(v) => setTab(v as 'pictures' | 'text')} className="min-h-0 flex-1 px-4">
                    <TabsList className="w-full">
                        <TabsTrigger value="pictures">Pictures</TabsTrigger>
                        <TabsTrigger value="text">Text</TabsTrigger>
                    </TabsList>

                    <TabsContent value="pictures" className="flex min-h-0 flex-col gap-3 pt-3">
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pictures" className="h-10 pl-9" />
                        </div>
                        {data.folders.length > 0 && (
                            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                                <FolderChip active={folder === null} onClick={() => setFolder(null)}>All</FolderChip>
                                {data.folders.map((f) => (
                                    <FolderChip key={f.id} active={folder === f.id} onClick={() => setFolder(f.id)}>{f.name}</FolderChip>
                                ))}
                            </div>
                        )}
                        <div className="grid max-h-[42dvh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                            {shown.map((img) => {
                                const order = picked.indexOf(img.id);
                                return (
                                    <button
                                        key={img.id}
                                        type="button"
                                        onClick={() => toggle(img.id)}
                                        className={cn(
                                            'group relative aspect-square overflow-hidden rounded-lg border-2 border-transparent bg-muted focus-visible:outline-2 focus-visible:outline-ring',
                                            order >= 0 && 'border-primary',
                                        )}
                                        aria-pressed={order >= 0}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={img.url} alt="" loading="lazy" className="size-full object-cover" />
                                        <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1.5 py-1 text-left text-xs">{displayName(img)}</span>
                                        {order >= 0 && (
                                            <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                                                {order + 1}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                            {shown.length === 0 && <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No pictures match.</p>}
                        </div>
                        <div className="space-y-2">
                            <ToggleGroup
                                value={[mode]}
                                onValueChange={(v: unknown[]) => v[0] && setMode(v[0] as PictureMode)}
                                className="w-full"
                                variant="outline"
                            >
                                {PICTURE_MODES.map((m) => (
                                    <ToggleGroupItem key={m.id} value={m.id} className="flex-1" disabled={m.id === 'strip' && picked.length < 2}>
                                        {m.label}
                                    </ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                            <p className="text-sm text-muted-foreground">{PICTURE_MODES.find((m) => m.id === effectiveMode)?.hint}</p>
                        </div>
                    </TabsContent>

                    <TabsContent value="text" className="pt-3">
                        <div className="max-h-[55dvh] space-y-2 overflow-y-auto">
                            {texts.length === 0 && (
                                <p className="py-8 text-center text-sm text-muted-foreground">Save a text on the Text tab to add it here.</p>
                            )}
                            {texts.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => {
                                        onAdd([textItem(t.name, t.config)]);
                                        close();
                                    }}
                                    className="flex w-full items-center gap-3 rounded-lg border border-border p-2 text-left hover:bg-accent"
                                >
                                    <LedText text={t.config} animate={false} className="w-28 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                                </button>
                            ))}
                        </div>
                    </TabsContent>
                </Tabs>
                {tab === 'pictures' && (
                    <DrawerFooter>
                        <Button size="lg" className="h-11" disabled={picked.length === 0} onClick={addPictures}>
                            <Check /> {addLabel}
                        </Button>
                    </DrawerFooter>
                )}
            </DrawerContent>
        </Drawer>
    );
}

function FolderChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'h-8 shrink-0 rounded-full border px-3 text-sm transition-colors',
                active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
            )}
        >
            {children}
        </button>
    );
}
