'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Images, ListMusic, Type } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { checkAdminPassword } from '@/app/actions';
import type { AppData } from '@/lib/types';
import { LibraryProvider, useLibrary } from './LibraryContext';
import { ScreenBar } from './ScreenBar';
import { OfflineProvider } from './OfflineProvider';
import { PlaylistsView } from '@/components/playlists/PlaylistsView';
import { PlaylistEditor } from '@/components/playlists/PlaylistEditor';
import { LibraryView } from '@/components/library/LibraryView';
import { TextView } from '@/components/text/TextView';
import { getPlaylist, usePlaylists } from '@/lib/playlist/store';

type Tab = 'playlists' | 'library' | 'text';

const TABS: { id: Tab; label: string; icon: typeof ListMusic }[] = [
    { id: 'playlists', label: 'Playlists', icon: ListMusic },
    { id: 'library', label: 'Library', icon: Images },
    { id: 'text', label: 'Text', icon: Type },
];

export function AppShell({ initialData }: { initialData: AppData }) {
    return (
        <LibraryProvider initialData={initialData}>
            <OfflineProvider>
                <Shell />
            </OfflineProvider>
        </LibraryProvider>
    );
}

// Sections live in the URL hash (#library, #text, #playlist/<id>) so the phone's back button works.
type Route = { tab: Tab; openId: string | null };

function parseRoute(hash: string): Route {
    const h = hash.replace(/^#/, '');
    if (h.startsWith('playlist/')) return { tab: 'playlists', openId: decodeURIComponent(h.slice(9)) || null };
    if (h === 'library' || h === 'text') return { tab: h, openId: null };
    return { tab: 'playlists', openId: null };
}

function routeHash(r: Route): string {
    if (r.openId) return `#playlist/${encodeURIComponent(r.openId)}`;
    return r.tab === 'playlists' ? '#' : `#${r.tab}`;
}

function subscribeHash(cb: () => void) {
    window.addEventListener('hashchange', cb);
    return () => window.removeEventListener('hashchange', cb);
}

function useRoute(): [Route, (r: Route) => void] {
    const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => '');
    const route = useMemo(() => parseRoute(hash), [hash]);
    const go = useCallback((r: Route) => {
        const next = routeHash(r);
        if (next === (window.location.hash || '#')) return;
        if (next === '#') history.pushState(null, '', window.location.pathname + window.location.search);
        else history.pushState(null, '', next);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
    }, []);
    return [route, go];
}

function Shell() {
    const [{ tab, openId }, go] = useRoute();
    const setOpenId = (id: string | null) => go({ tab: 'playlists', openId: id });
    const playlists = usePlaylists();
    const open = openId ? playlists.find((p) => p.id === openId) ?? getPlaylist(openId) : undefined;
    const admin = useAdminUnlock();

    useEffect(() => {
        window.scrollTo({ top: 0 });
    }, [tab, openId]);

    return (
        <div className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))]">
            <ScreenBar onTitleTap={admin.tap} />

            <main>
                {tab === 'playlists' && (open ? <PlaylistEditor key={open.id} playlist={open} onBack={() => setOpenId(null)} /> : <PlaylistsView onOpen={setOpenId} />)}
                {tab === 'library' && <LibraryView />}
                {tab === 'text' && <TextView />}
            </main>

            <nav
                aria-label="Sections"
                className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
            >
                <div className="mx-auto grid h-16 max-w-2xl grid-cols-3">
                    {TABS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => {
                                go({ tab: id, openId: null });
                            }}
                            aria-current={tab === id ? 'page' : undefined}
                            className={cn(
                                'flex flex-col items-center justify-center gap-1 text-xs transition-colors',
                                tab === id ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <Icon className="size-5" />
                            {label}
                        </button>
                    ))}
                </div>
            </nav>

            {admin.dialog}
        </div>
    );
}

/** Tap the title five times to unlock deleting (checked again on the server for every delete). */
function useAdminUnlock() {
    const { adminPassword, setAdminPassword } = useLibrary();
    const taps = useRef<number[]>([]);
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState('');

    const tap = () => {
        const now = Date.now();
        taps.current = [...taps.current.filter((t) => now - t < 1500), now];
        if (taps.current.length >= 5) {
            taps.current = [];
            if (adminPassword) {
                setAdminPassword(null);
                toast('Admin mode off');
            } else setOpen(true);
        }
    };

    const submit = async () => {
        if (await checkAdminPassword(value)) {
            setAdminPassword(value);
            toast.success('Admin mode on', { description: 'You can now delete pictures, folders and saved texts.' });
            setOpen(false);
        } else toast.error('Wrong password');
        setValue('');
    };

    const dialog = (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Admin password</DialogTitle>
                </DialogHeader>
                <Input type="password" autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} className="h-10" />
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={submit} disabled={!value}>Unlock</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );

    return { tap, dialog };
}
