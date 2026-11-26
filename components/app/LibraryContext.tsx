'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getAppData } from '@/app/actions';
import { listTextConfigs } from '@/app/textLibraryActions';
import type { AppData, ImageRecord } from '@/lib/types';
import type { SavedTextConfig } from '@/lib/ipixel/library';

const TEXTS_CACHE = 'bb.texts.v1';
const LIBRARY_CACHE = 'bb.library.v1';

interface LibraryValue {
    data: AppData;
    images: ImageRecord[];
    refresh: () => Promise<void>;
    setData: React.Dispatch<React.SetStateAction<AppData>>;
    texts: SavedTextConfig[];
    reloadTexts: () => Promise<void>;
    setTexts: React.Dispatch<React.SetStateAction<SavedTextConfig[]>>;
    adminPassword: string | null;
    setAdminPassword: (p: string | null) => void;
    online: boolean;
}

const LibraryContext = createContext<LibraryValue | null>(null);

function readCache<T>(key: string): T | null {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

function writeCache(key: string, value: unknown) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* ignore */
    }
}

export function displayName(img: ImageRecord): string {
    return img.name || img.originalName.replace(/\.[^.]+$/, '');
}

export function LibraryProvider({ initialData, children }: { initialData: AppData; children: React.ReactNode }) {
    const [data, setData] = useState<AppData>(initialData);
    const [texts, setTexts] = useState<SavedTextConfig[]>([]);
    const [adminPassword, setAdminPassword] = useState<string | null>(null);
    const [online, setOnline] = useState(true);

    // Remember the library for offline use; fall back to the cached copy if the server sent nothing.
    useEffect(() => {
        if (initialData.images.length > 0) writeCache(LIBRARY_CACHE, initialData);
        else {
            const cached = readCache<AppData>(LIBRARY_CACHE);
            // localStorage only exists after mount, so the offline copy is applied in an effect
            // eslint-disable-next-line react-hooks/set-state-in-effect
            if (cached) setData(cached);
        }
    }, [initialData]);

    useEffect(() => {
        const update = () => setOnline(navigator.onLine);
        update();
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        return () => {
            window.removeEventListener('online', update);
            window.removeEventListener('offline', update);
        };
    }, []);

    const refresh = useCallback(async () => {
        try {
            const next = await getAppData();
            setData(next);
            writeCache(LIBRARY_CACHE, next);
        } catch {
            /* offline: keep what we have */
        }
    }, []);

    const reloadTexts = useCallback(async () => {
        const cached = readCache<SavedTextConfig[]>(TEXTS_CACHE);
        if (cached) setTexts(cached);
        try {
            const res = await listTextConfigs();
            if (res.ok) {
                setTexts(res.value);
                writeCache(TEXTS_CACHE, res.value);
            }
        } catch {
            /* offline: cached copy stays */
        }
    }, []);

    useEffect(() => {
        // shows the cached list straight away, then refreshes from the server
        // eslint-disable-next-line react-hooks/set-state-in-effect
        reloadTexts();
    }, [reloadTexts]);

    const value = useMemo<LibraryValue>(() => ({
        data,
        images: data.images,
        refresh,
        setData,
        texts,
        reloadTexts,
        setTexts,
        adminPassword,
        setAdminPassword,
        online,
    }), [data, refresh, texts, reloadTexts, adminPassword, online]);

    return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryValue {
    const v = useContext(LibraryContext);
    if (!v) throw new Error('useLibrary must be used inside LibraryProvider');
    return v;
}
