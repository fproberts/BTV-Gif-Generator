'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { uploadImage } from '@/app/actions';
import { displayName, useLibrary } from '@/components/app/LibraryContext';
import { preparePhoto } from '@/lib/preparePhoto';
import { MAX_NAME_LENGTH, sameName, suggestName } from '@/lib/photoNames';

type Row = {
    key: string;
    original: File;
    /** null while being prepared */
    file: File | null;
    error: string | null;
    preview: string | null;
    name: string;
    status: 'ready' | 'sending';
};

/**
 * After choosing photos: shrink them, show each with a name box, then upload.
 * Camera-style names ("1000012345", "IMG_…") start blank so they get a real name.
 */
export function UploadSheet({ files, folderId, onClose }: { files: File[] | null; folderId: string | null; onClose: () => void }) {
    const { data, setData, online } = useLibrary();
    const [rows, setRows] = useState<Row[]>([]);
    const [sending, setSending] = useState(false);
    const firstBlank = useRef<HTMLInputElement>(null);

    // Prepare the chosen files whenever a new set arrives.
    useEffect(() => {
        if (!files?.length) return;
        let cancelled = false;
        const initial: Row[] = files.map((f, i) => ({
            key: `${i}-${f.name}-${f.size}`,
            original: f,
            file: null,
            error: null,
            preview: null,
            name: suggestName(f.name),
            status: 'ready',
        }));
        // a new selection replaces the sheet's contents
        setRows(initial);
        (async () => {
            for (const row of initial) {
                const prepared = await preparePhoto(row.original);
                if (cancelled) return;
                setRows((rs) =>
                    rs.map((r) =>
                        r.key !== row.key
                            ? r
                            : prepared.ok
                              ? { ...r, file: prepared.file, preview: URL.createObjectURL(prepared.file) }
                              : { ...r, error: prepared.error },
                    ),
                );
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [files]);

    // free preview memory when rows go away
    const previews = useRef(new Set<string>());
    useEffect(() => {
        const now = new Set(rows.map((r) => r.preview).filter((p): p is string => !!p));
        for (const p of previews.current) if (!now.has(p)) URL.revokeObjectURL(p);
        previews.current = now;
    }, [rows]);
    useEffect(() => () => previews.current.forEach((p) => URL.revokeObjectURL(p)), []);

    const usable = rows.filter((r) => !r.error);
    const preparing = usable.some((r) => !r.file);
    const unnamed = usable.filter((r) => !r.name.trim()).length;
    const existing = useMemo(() => data.images.map(displayName), [data.images]);
    const duplicateOf = (row: Row) =>
        !!row.name.trim() && (existing.some((n) => sameName(n, row.name)) || usable.some((r) => r !== row && sameName(r.name, row.name)));

    const close = () => {
        if (sending) return;
        setRows([]);
        onClose();
    };

    const send = async () => {
        setSending(true);
        let done = 0;
        let failed = 0;
        for (const row of usable) {
            if (!row.file) continue;
            setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, status: 'sending' } : r)));
            try {
                const fd = new FormData();
                fd.append('file', row.file);
                fd.append('customName', row.name.trim());
                const res = await uploadImage(fd, folderId);
                if (!res.ok) throw new Error(res.error);
                done++;
                setData((d) => ({ ...d, images: [...d.images, res.image] }));
                setRows((rs) => rs.filter((r) => r.key !== row.key));
            } catch (e) {
                const msg = e instanceof Error && !/fetch|network|load failed/i.test(e.message) ? e.message : online ? 'The connection dropped. Try again.' : 'You’re offline. Uploads need signal.';
                failed++;
                setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, status: 'ready' } : r)));
                toast.error(`Couldn’t upload “${row.name.trim()}”`, { description: msg });
            }
        }
        setSending(false);
        if (done) toast.success(done === 1 ? 'Picture uploaded' : `${done} pictures uploaded`);
        // close once everything went up; failed ones stay so they can be tried again
        if (failed === 0) {
            setRows([]);
            onClose();
        }
    };

    const count = usable.length;
    const label = sending
        ? 'Uploading…'
        : preparing
          ? 'Getting pictures ready…'
          : unnamed
            ? `Name ${unnamed === 1 ? 'the picture' : `${unnamed} pictures`} to upload`
            : `Upload ${count === 1 ? 'picture' : `${count} pictures`}`;

    let blankSeen = false;
    return (
        <Drawer open={!!files?.length && rows.length > 0} onOpenChange={(o) => !o && close()}>
            <DrawerContent className="mx-auto max-w-2xl">
                <DrawerHeader className="pb-2">
                    <DrawerTitle>{rows.length === 1 ? 'Name this picture' : 'Name these pictures'}</DrawerTitle>
                </DrawerHeader>
                <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-2">
                    {rows.map((row) => {
                        const isFirstBlank = !row.error && !row.name.trim() && !blankSeen;
                        if (isFirstBlank) blankSeen = true;
                        return (
                            <li key={row.key} className="flex items-start gap-3">
                                <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                                    {row.preview ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={row.preview} alt="" className="size-full object-cover" />
                                    ) : row.error ? (
                                        <X className="size-5 text-destructive" />
                                    ) : (
                                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    {row.error ? (
                                        <>
                                            <p className="truncate text-sm font-medium">{row.original.name || 'Picture'}</p>
                                            <p className="text-sm text-destructive">{row.error}</p>
                                        </>
                                    ) : (
                                        <>
                                            <Input
                                                ref={isFirstBlank ? firstBlank : undefined}
                                                autoFocus={isFirstBlank}
                                                value={row.name}
                                                maxLength={MAX_NAME_LENGTH}
                                                disabled={row.status === 'sending'}
                                                placeholder="Name"
                                                aria-label={`Name for ${row.original.name || 'picture'}`}
                                                enterKeyHint={unnamed <= 1 ? 'done' : 'next'}
                                                onChange={(e) => {
                                                    const name = e.target.value;
                                                    setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, name } : r)));
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key !== 'Enter') return;
                                                    e.preventDefault();
                                                    if (!unnamed && !preparing && !sending) send();
                                                    else firstBlank.current?.focus();
                                                }}
                                                className={cn('h-10', !row.name.trim() && 'border-primary')}
                                            />
                                            {row.status === 'sending' ? (
                                                <p className="mt-1 text-sm text-muted-foreground">Uploading…</p>
                                            ) : duplicateOf(row) ? (
                                                <p className="mt-1 text-sm text-muted-foreground">Another picture already has this name.</p>
                                            ) : null}
                                        </>
                                    )}
                                </div>
                                {!sending && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Don’t upload this one"
                                        onClick={() => {
                                            const next = rows.filter((r) => r.key !== row.key);
                                            if (!next.length) close();
                                            else setRows(next);
                                        }}
                                    >
                                        <X />
                                    </Button>
                                )}
                            </li>
                        );
                    })}
                </ul>
                <DrawerFooter>
                    <Button size="lg" className="h-11" disabled={sending || preparing || unnamed > 0 || count === 0} onClick={send}>
                        {sending || preparing ? <Loader2 className="animate-spin" /> : <Check />} {label}
                    </Button>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}
