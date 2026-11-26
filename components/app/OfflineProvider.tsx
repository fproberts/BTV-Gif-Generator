'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLibrary } from './LibraryContext';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface OfflineStatus {
    /** a service worker is controlling the page (offline support is active) */
    ready: boolean;
    /** pictures saved for offline use / total */
    saved: number;
    total: number;
    saving: boolean;
    /** the browser offered to install the app (Android Chrome, desktop Chrome/Edge) */
    canInstall: boolean;
    install: () => Promise<void>;
    /** running as an installed app */
    installed: boolean;
}

const OfflineContext = createContext<OfflineStatus | null>(null);

/** Ask the service worker to save `urls`; resolves when it has finished. */
function cacheUrls(sw: ServiceWorker, urls: string[], onProgress: (done: number) => void): Promise<{ done: number; failed: number }> {
    return new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (e) => {
            onProgress(e.data.done);
            if (e.data.finished) resolve(e.data);
        };
        sw.postMessage({ type: 'cache-urls', urls }, [channel.port2]);
    });
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
    const { images, online } = useLibrary();
    const [ready, setReady] = useState(false);
    const [saved, setSaved] = useState(0);
    const [saving, setSaving] = useState(false);
    const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
    const [installed, setInstalled] = useState(false);
    const lastSaved = useRef('');

    // Register the service worker (production only: it would fight hot reload in development).
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;
        if (process.env.NODE_ENV !== 'production' && !window.location.search.includes('sw=1')) return;
        navigator.serviceWorker.register('/sw.js').catch(() => {});
        navigator.serviceWorker.ready.then(() => setReady(true));
        // display-mode is only known in the browser, after mount
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setInstalled(window.matchMedia('(display-mode: standalone)').matches);
    }, []);

    useEffect(() => {
        const onPrompt = (e: Event) => {
            e.preventDefault();
            setInstallEvent(e as BeforeInstallPromptEvent);
        };
        const onInstalled = () => {
            setInstallEvent(null);
            setInstalled(true);
        };
        window.addEventListener('beforeinstallprompt', onPrompt);
        window.addEventListener('appinstalled', onInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', onPrompt);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    // Save every library picture, plus the scripts and styles this page loaded, whenever there's signal.
    const urls = useMemo(() => images.map((i) => i.url), [images]);
    useEffect(() => {
        if (!ready || !online || urls.length === 0) return;
        const key = urls.join('|');
        if (key === lastSaved.current) return;
        let cancelled = false;
        (async () => {
            const reg = await navigator.serviceWorker.ready;
            if (!reg.active || cancelled) return;
            const assets = performance
                .getEntriesByType('resource')
                .map((e) => e.name)
                .filter((u) => u.startsWith(window.location.origin) && /\/_next\/static\/|\/fonts\//.test(u));
            setSaving(true);
            await cacheUrls(reg.active, assets, () => {});
            const res = await cacheUrls(reg.active, urls, (done) => !cancelled && setSaved(done));
            if (cancelled) return;
            setSaved(res.done - res.failed);
            setSaving(false);
            if (res.failed === 0) lastSaved.current = key;
        })();
        return () => {
            cancelled = true;
        };
    }, [ready, online, urls]);

    const install = useCallback(async () => {
        if (!installEvent) return;
        await installEvent.prompt();
        await installEvent.userChoice;
        setInstallEvent(null);
    }, [installEvent]);

    const value = useMemo<OfflineStatus>(
        () => ({ ready, saved, total: urls.length, saving, canInstall: !!installEvent && !installed, install, installed }),
        [ready, saved, urls.length, saving, installEvent, installed, install],
    );
    return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineStatus {
    const v = useContext(OfflineContext);
    if (!v) throw new Error('useOffline must be used inside OfflineProvider');
    return v;
}
