'use client';

import { useState } from 'react';
import { Bluetooth, Clock, CloudCheck, CloudOff, Download, Ellipsis, Eraser, Loader2, Sun, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { connectBLE, disconnectBLE, isWebBluetoothSupported } from '@/lib/webBluetooth';
import { slotStore } from '@/lib/playlist/store';
import { startFresh } from '@/lib/playlist/engine';
import { useScreen } from './useScreen';
import { useLibrary } from './LibraryContext';
import { useOffline } from './OfflineProvider';

function timeAgo(ms: number): string {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 90) return 'just now';
    const m = Math.round(s / 60);
    if (m < 90) return `${m} minutes ago`;
    const h = Math.round(m / 60);
    if (h < 36) return `${h} hours ago`;
    return `${Math.round(h / 24)} days ago`;
}

export function ScreenBar({ onTitleTap }: { onTitleTap?: () => void }) {
    const { ble, brightness, clock, busy } = useScreen();
    const [connecting, setConnecting] = useState(false);
    const [level, setLevel] = useState(80);
    const [dialog, setDialog] = useState<null | 'resume' | 'clear'>(null);
    const [wiping, setWiping] = useState(false);
    const [lastSetup, setLastSetup] = useState(0);
    const { online } = useLibrary();
    const offline = useOffline();
    const offlineLabel = !offline.ready
        ? 'Offline use starts after the next visit'
        : offline.saving
          ? `Saving pictures for offline use: ${offline.saved} of ${offline.total}`
          : offline.saved >= offline.total
            ? `Works offline: all ${offline.total} pictures saved`
            : `${offline.saved} of ${offline.total} pictures saved for offline use`;

    const connect = async () => {
        if (!isWebBluetoothSupported()) {
            toast.error('This browser can’t use Bluetooth', {
                description: 'Use Chrome on Android or a computer, or the Bluefy browser on iPhone.',
            });
            return;
        }
        setConnecting(true);
        try {
            await connectBLE();
            const map = slotStore.get();
            if (map.entries.length > 0) {
                setLastSetup(map.updatedAt);
                setDialog('resume');
            }
        } catch (e) {
            const m = e instanceof Error ? e.message : '';
            if (!/cancel/i.test(m)) toast.error('Couldn’t connect to the screen', { description: m });
        } finally {
            setConnecting(false);
        }
    };

    const wipe = async () => {
        setWiping(true);
        try {
            await startFresh();
            toast.success('Screen cleared', { description: 'Playlists will be sent again when you play them.' });
            setDialog(null);
        } catch (e) {
            toast.error('Couldn’t clear the screen', { description: e instanceof Error ? e.message : undefined });
        } finally {
            setWiping(false);
        }
    };

    return (
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
            <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-4">
                <button type="button" onClick={onTitleTap} className="mr-auto text-lg font-semibold tracking-tight select-none">
                    Boogie Board
                </button>

                {!online && (
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-sm text-muted-foreground">
                        <CloudOff className="size-3.5" /> Offline
                    </span>
                )}

                {ble.connected && (
                    <Popover>
                        <PopoverTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Brightness" />}>
                            <Sun />
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-64">
                            <div className="flex items-center justify-between text-sm">
                                <span>Brightness</span>
                                <span className="tabular-nums text-muted-foreground">{level}%</span>
                            </div>
                            <Slider
                                className="mt-4"
                                min={5}
                                max={100}
                                step={5}
                                value={[level]}
                                onValueChange={(v) => setLevel(Array.isArray(v) ? v[0] : v)}
                                onValueCommitted={(v) => brightness(Array.isArray(v) ? v[0] : v)}
                            />
                        </PopoverContent>
                    </Popover>
                )}

                <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label="More options" />}>
                        <Ellipsis />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                        {ble.connected && (
                            <>
                                <DropdownMenuItem onClick={clock}>
                                    <Clock /> Show the clock
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDialog('clear')}>
                                    <Eraser /> Clear the screen…
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => disconnectBLE()}>
                                    <Unplug /> Disconnect
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                            </>
                        )}
                        {offline.canInstall && (
                            <DropdownMenuItem onClick={offline.install}>
                                <Download /> Install app
                            </DropdownMenuItem>
                        )}
                        <div className="flex items-start gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                            {offline.saving ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" /> : <CloudCheck className="mt-0.5 size-4 shrink-0" />}
                            <span>{offlineLabel}</span>
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>

                {ble.connected ? (
                    <span
                        className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3 text-sm"
                        title={ble.deviceName ?? undefined}
                    >
                        {busy ? <Loader2 className="size-3.5 animate-spin text-primary" /> : <span className="size-2 rounded-full bg-primary" aria-hidden />}
                        {busy ? 'Sending' : 'Connected'}
                    </span>
                ) : (
                    <Button onClick={connect} disabled={connecting} size="lg" className="px-3.5">
                        {connecting ? <Loader2 className="animate-spin" /> : <Bluetooth />}
                        {connecting ? 'Connecting' : 'Connect'}
                    </Button>
                )}
            </div>

            <Dialog open={dialog !== null} onOpenChange={(o) => !o && !wiping && setDialog(null)}>
                <DialogContent showCloseButton={false}>
                    {dialog === 'resume' ? (
                        <DialogHeader>
                            <DialogTitle>Keep what’s on the screen?</DialogTitle>
                            <DialogDescription>
                                This phone last set up the screen {timeAgo(lastSetup)}. If someone else has used it since,
                                start fresh so your playlists are sent again.
                            </DialogDescription>
                        </DialogHeader>
                    ) : (
                        <DialogHeader>
                            <DialogTitle>Clear the screen?</DialogTitle>
                            <DialogDescription>
                                Removes everything stored on the screen. Playlists are sent again the next time you play them.
                            </DialogDescription>
                        </DialogHeader>
                    )}
                    <DialogFooter>
                        {dialog === 'resume' ? (
                            <>
                                <Button variant="ghost" onClick={wipe} disabled={wiping}>
                                    {wiping && <Loader2 className="animate-spin" />} Start fresh
                                </Button>
                                <Button onClick={() => setDialog(null)} disabled={wiping}>Keep it</Button>
                            </>
                        ) : (
                            <>
                                <Button variant="ghost" onClick={() => setDialog(null)} disabled={wiping}>Cancel</Button>
                                <Button variant="destructive" onClick={wipe} disabled={wiping}>
                                    {wiping && <Loader2 className="animate-spin" />} Clear screen
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </header>
    );
}
