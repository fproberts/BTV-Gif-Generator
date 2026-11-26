'use client';

import { useMemo, useRef, useState } from 'react';
import { FolderPlus, ImagePlus, ListPlus, Loader2, Play, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { createFolder, deleteFolder, deleteImage, renameImage, updateImageFolder } from '@/app/actions';
import { displayName, useLibrary } from '@/components/app/LibraryContext';
import { useScreen } from '@/components/app/useScreen';
import { AddToPlaylist } from '@/components/app/AddToPlaylist';
import { LedImage } from '@/components/led/LedMatrix';
import { PICTURE_MODES, itemsFromPictures, type PictureMode } from '@/lib/playlist/model';
import type { ImageRecord } from '@/lib/types';
import { UploadSheet } from './UploadSheet';
import { MAX_NAME_LENGTH, sameName } from '@/lib/photoNames';


export function LibraryView() {
    const { data, setData, adminPassword } = useLibrary();
    const [folder, setFolder] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selected = data.images.find((i) => i.id === selectedId) ?? null;
    const [picked, setPicked] = useState<File[] | null>(null);
    const [folderDialog, setFolderDialog] = useState(false);
    const [folderName, setFolderName] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return [...data.images]
            .filter((img) => (folder ? img.folderId === folder : true) && (!q || displayName(img).toLowerCase().includes(q)))
            .sort((a, b) => b.createdAt - a.createdAt);
    }, [data.images, folder, query]);

    const choose = (files: FileList | null) => {
        // copy first: clearing the input empties the live FileList (and lets the same photo be picked again)
        const list = files ? Array.from(files) : [];
        if (fileRef.current) fileRef.current.value = '';
        if (list.length) setPicked(list);
    };

    const addFolder = async () => {
        const name = folderName.trim();
        if (!name) return;
        try {
            const f = await createFolder(name);
            setData((d) => ({ ...d, folders: [...d.folders, f] }));
            setFolder(f.id);
            setFolderDialog(false);
            setFolderName('');
        } catch {
            toast.error('Couldn’t create the folder');
        }
    };

    const removeFolder = async (id: string) => {
        if (!adminPassword) return;
        try {
            await deleteFolder(id, adminPassword);
            setData((d) => ({
                ...d,
                folders: d.folders.filter((f) => f.id !== id),
                images: d.images.map((i) => (i.folderId === id ? { ...i, folderId: null } : i)),
            }));
            setFolder(null);
        } catch {
            toast.error('Couldn’t delete the folder');
        }
    };

    return (
        <section className="mx-auto max-w-2xl px-4 py-5">
            <div className="mb-4 flex items-center justify-between gap-2">
                <h1 className="text-2xl font-semibold">Library</h1>
                <div className="flex gap-1">
                    <Button variant="ghost" size="icon-lg" aria-label="New folder" onClick={() => setFolderDialog(true)}>
                        <FolderPlus />
                    </Button>
                    <Button size="lg" onClick={() => fileRef.current?.click()} disabled={!!picked}>
                        <ImagePlus /> Upload
                    </Button>
                    <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => choose(e.target.files)} />
                </div>
            </div>

            <div className="relative mb-3">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pictures" className="h-10 pl-9" />
            </div>

            {data.folders.length > 0 && (
                <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
                    <Chip active={folder === null} onClick={() => setFolder(null)}>All</Chip>
                    {data.folders.map((f) => (
                        <Chip key={f.id} active={folder === f.id} onClick={() => setFolder(f.id)}>{f.name}</Chip>
                    ))}
                </div>
            )}

            {shown.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                    <p className="text-muted-foreground">{query ? 'No pictures match.' : 'No pictures here yet.'}</p>
                    {!query && (
                        <Button className="mt-4" size="lg" onClick={() => fileRef.current?.click()}>
                            <ImagePlus /> Upload pictures
                        </Button>
                    )}
                </div>
            ) : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {shown.map((img) => (
                        <li key={img.id}>
                            <button
                                type="button"
                                onClick={() => setSelectedId(img.id)}
                                className="group relative block aspect-square w-full overflow-hidden rounded-lg bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={img.url} alt="" loading="lazy" className="size-full object-cover" />
                                <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1.5 py-1 text-left text-xs">{displayName(img)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {folder && adminPassword && (
                <Button variant="ghost" className="mt-6 text-destructive" onClick={() => removeFolder(folder)}>
                    <Trash2 /> Delete this folder
                </Button>
            )}

            <PictureDrawer image={selected} onClose={() => setSelectedId(null)} />
            <UploadSheet files={picked} folderId={folder} onClose={() => setPicked(null)} />

            <Dialog open={folderDialog} onOpenChange={setFolderDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New folder</DialogTitle>
                    </DialogHeader>
                    <Input
                        autoFocus
                        value={folderName}
                        onChange={(e) => setFolderName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addFolder()}
                        placeholder="Folder name"
                        className="h-10"
                    />
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setFolderDialog(false)}>Cancel</Button>
                        <Button onClick={addFolder} disabled={!folderName.trim()}>Create folder</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

/** Rename a picture: saved when the field loses focus or on Enter. */
function NameField({ image }: { image: ImageRecord }) {
    const { data, setData, online } = useLibrary();
    const [value, setValue] = useState(displayName(image));
    const [saving, setSaving] = useState(false);
    const current = displayName(image);
    const clash = value.trim() && !sameName(value, current) && data.images.some((i) => i.id !== image.id && sameName(displayName(i), value));

    const save = async () => {
        const name = value.replace(/\s+/g, ' ').trim();
        if (!name) {
            setValue(current);
            return;
        }
        if (name === current) return;
        setSaving(true);
        try {
            const res = await renameImage(image.id, name);
            if (!res.ok) {
                toast.error('Couldn’t rename the picture', { description: res.error });
                setValue(current);
                return;
            }
            setData((d) => ({ ...d, images: d.images.map((i) => (i.id === image.id ? { ...i, name: res.name } : i)) }));
            toast.success('Renamed');
        } catch {
            toast.error('Couldn’t rename the picture', { description: online ? 'Try again in a moment.' : 'Renaming needs signal.' });
            setValue(current);
        } finally {
            setSaving(false);
        }
    };

    return (
        <label className="block text-sm">
            <span className="mb-1.5 flex items-center justify-between">
                <span>Name</span>
                {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            </span>
            <Input
                value={value}
                maxLength={MAX_NAME_LENGTH}
                onChange={(e) => setValue(e.target.value)}
                onBlur={save}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setValue(current);
                }}
                enterKeyHint="done"
                className="h-10"
            />
            {clash && <span className="mt-1 block text-muted-foreground">Another picture already has this name.</span>}
        </label>
    );
}

function PictureDrawer({ image, onClose }: { image: ImageRecord | null; onClose: () => void }) {
    const { data, setData, adminPassword } = useLibrary();
    const { play, busy } = useScreen();
    const [mode, setMode] = useState<PictureMode>('scroll');
    const [adding, setAdding] = useState(false);

    const items = () => (image ? itemsFromPictures([{ imageId: image.id, url: image.url, name: displayName(image) }], mode) : []);

    const remove = async () => {
        if (!image || !adminPassword) return;
        const res = await deleteImage(image.id, adminPassword);
        if (res?.success) {
            setData((d) => ({ ...d, images: d.images.filter((i) => i.id !== image.id) }));
            toast.success('Picture deleted');
            onClose();
        } else toast.error('Couldn’t delete the picture', { description: res?.error });
    };

    const move = async (folderId: string | null) => {
        if (!image) return;
        await updateImageFolder(image.id, folderId);
        setData((d) => ({ ...d, images: d.images.map((i) => (i.id === image.id ? { ...i, folderId } : i)) }));
    };

    return (
        <>
            <Drawer open={image !== null && !adding} onOpenChange={(o) => !o && onClose()}>
                <DrawerContent className="mx-auto max-w-2xl">
                    {image && (
                        <>
                            <DrawerHeader className="pb-2">
                                <DrawerTitle className="truncate">{displayName(image)}</DrawerTitle>
                            </DrawerHeader>
                            <div className="space-y-4 overflow-y-auto px-4 pb-2">
                                <LedImage
                                    urls={[image.url]}
                                    mode={mode === 'still' ? 'still' : 'endless'}
                                    label={displayName(image)}
                                />
                                <NameField key={image.id} image={image} />
                                <ToggleGroup
                                    variant="outline"
                                    className="w-full"
                                    value={[mode]}
                                    onValueChange={(v: unknown[]) => v[0] && setMode(v[0] as typeof mode)}
                                >
                                    {PICTURE_MODES.map((m) => (
                                        <ToggleGroupItem key={m.id} value={m.id} className="flex-1">{m.label}</ToggleGroupItem>
                                    ))}
                                </ToggleGroup>
                                {data.folders.length > 0 && (
                                    <label className="flex items-center justify-between gap-3 text-sm">
                                        <span>Folder</span>
                                        <select
                                            value={image.folderId ?? ''}
                                            onChange={(e) => move(e.target.value || null)}
                                            className="h-9 rounded-md border border-input bg-input/30 px-2 text-sm"
                                        >
                                            <option value="">None</option>
                                            {data.folders.map((f) => (
                                                <option key={f.id} value={f.id}>{f.name}</option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                                {adminPassword && (
                                    <Button variant="ghost" className="text-destructive" onClick={remove}>
                                        <Trash2 /> Delete picture
                                    </Button>
                                )}
                            </div>
                            <DrawerFooter className="flex-row">
                                <Button variant="secondary" size="lg" className="h-11 flex-1" onClick={() => setAdding(true)}>
                                    <ListPlus /> Add to playlist
                                </Button>
                                <Button
                                    size="lg"
                                    className="h-11 flex-1"
                                    disabled={busy}
                                    onClick={async () => {
                                        if (await play(items(), `“${displayName(image)}”`)) onClose();
                                    }}
                                >
                                    {busy ? <Loader2 className="animate-spin" /> : <Play />} Show now
                                </Button>
                            </DrawerFooter>
                        </>
                    )}
                </DrawerContent>
            </Drawer>
            <AddToPlaylist items={items} open={adding} onOpenChange={setAdding} onDone={onClose} />
        </>
    );
}
