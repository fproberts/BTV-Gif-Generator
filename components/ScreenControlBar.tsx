'use client';

import { useState, useEffect, useRef } from 'react';
import { Tv, Sun, Type, Bluetooth, BluetoothConnected, ExternalLink, Zap, Clock, Trash2, CheckCircle, Image as ImageIcon, Film } from 'lucide-react';
import { sendTextToScreenAction, setBrightnessAction } from '@/app/actions';
import {
    subscribeBLEState,
    connectBLE,
    disconnectBLE,
    sendTextBLE,
    sendWindowFramesBLE,
    setBrightnessBLE,
    setClockBLE,
    clearMemoryBLE,
    showToast,
    BLEState
} from '@/lib/webBluetooth';
import { generateClientScrollingGif } from '@/lib/clientGifGenerator';

export function ScreenControlBar() {
    const [text, setText] = useState('');
    const [color, setColor] = useState('00FF00');
    const [isSendingText, setIsSendingText] = useState(false);
    const [isProcessingPhoneImg, setIsProcessingPhoneImg] = useState(false);
    const phoneFileRef = useRef<HTMLInputElement>(null);

    const [bleState, setBleState] = useState<BLEState>({
        connected: false,
        deviceName: null,
        statusText: "Disconnected",
        isBusy: false,
        toastMessage: null
    });

    useEffect(() => {
        const unsubscribe = subscribeBLEState(setBleState);
        return () => unsubscribe();
    }, []);

    const handleConnectBLE = async () => {
        try {
            if (bleState.connected) {
                await disconnectBLE();
            } else {
                await connectBLE();
            }
        } catch (e: any) {
            console.warn("Bluetooth connection canceled or failed:", e);
        }
    };

    const handleSendText = async () => {
        if (!text.trim()) return;
        setIsSendingText(true);
        try {
            if (bleState.connected) {
                await sendTextBLE(text, color, '000000');
            } else {
                await sendTextToScreenAction(text, color, '000000');
                showToast(`Displayed text: "${text}" on LED screen!`);
            }
            setText('');
        } catch (e: any) {
            showToast(`Error sending text: ${e.message}`);
        } finally {
            setIsSendingText(false);
        }
    };

    const handlePhonePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        setIsProcessingPhoneImg(true);

        try {
            if (!bleState.connected) {
                showToast("Connecting Bluetooth...");
                await connectBLE();
            }

            showToast("Generating smooth scrolling GIF on phone...");
            const isGif = file.name.toLowerCase().endsWith(".gif");
            const buf = await file.arrayBuffer();

            if (isGif) {
                await sendWindowFramesBLE(new Uint8Array(buf), true);
            } else {
                // Generate scrolling 96x16 GIF on phone client-side
                const img = new Image();
                img.src = URL.createObjectURL(file);
                await img.decode();

                const gifBytes = await generateClientScrollingGif(img, 96, 16, 2, 80);
                await sendWindowFramesBLE(gifBytes, true);
            }
        } catch (err: any) {
            showToast("Error processing phone photo: " + err.message);
        } finally {
            setIsProcessingPhoneImg(false);
            if (phoneFileRef.current) phoneFileRef.current.value = "";
        }
    };

    const handleSetBrightness = async (level: number) => {
        try {
            if (bleState.connected) {
                await setBrightnessBLE(level);
            } else {
                await setBrightnessAction(level);
                showToast(`Brightness set to ${level}%`);
            }
        } catch (e: any) {
            showToast(`Error setting brightness: ${e.message}`);
        }
    };

    const handleSetClock = async () => {
        try {
            if (bleState.connected) {
                await setClockBLE();
            } else {
                showToast("Connect Web Bluetooth to set Clock mode!");
            }
        } catch (e: any) {
            showToast(`Error: ${e.message}`);
        }
    };

    const handleClearMemory = async () => {
        try {
            if (bleState.connected) {
                await clearMemoryBLE();
            } else {
                showToast("Connect Web Bluetooth to clear memory!");
            }
        } catch (e: any) {
            showToast(`Error: ${e.message}`);
        }
    };

    return (
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4 mb-6 shadow-xl relative overflow-hidden">
            {/* Toast Notification Banner */}
            {bleState.toastMessage && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-emerald-500 text-black font-extrabold text-xs rounded-full shadow-2xl flex items-center space-x-2 animate-bounce">
                    <CheckCircle className="w-4 h-4" />
                    <span>{bleState.toastMessage}</span>
                </div>
            )}

            {/* Top Bar: Title & Connection / Offline Link Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
                <div className="flex items-center space-x-2 text-emerald-400 font-extrabold text-sm tracking-wider uppercase">
                    <Tv className="w-5 h-5" />
                    <span>iPixel 96x16 Screen Controls</span>
                </div>

                <div className="flex items-center gap-3">
                    {/* Web Bluetooth Connection Button */}
                    <button
                        onClick={handleConnectBLE}
                        disabled={bleState.isBusy}
                        className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all ${
                            bleState.connected
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/30'
                                : 'bg-primary/20 text-purple-300 border border-primary/40 hover:bg-primary/30'
                        }`}
                    >
                        {bleState.connected ? (
                            <>
                                <BluetoothConnected className="w-4 h-4 text-emerald-400 animate-pulse" />
                                <span>{bleState.deviceName || 'BLE Connected'} (Disconnect)</span>
                            </>
                        ) : (
                            <>
                                <Bluetooth className="w-4 h-4 text-purple-400" />
                                <span>Connect Bluetooth (Web BLE)</span>
                            </>
                        )}
                    </button>

                    {/* Offline Web App Link */}
                    <a
                        href="/offline.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-all"
                        title="Open Offline Controller PWA"
                    >
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>Offline Controller Page</span>
                        <ExternalLink className="w-3 h-3 text-amber-400/70 ml-0.5" />
                    </a>
                </div>
            </div>

            {/* Mode Indicator notice if Web BLE connected */}
            {bleState.connected && (
                <div className="text-[11px] px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 flex items-center justify-between">
                    <span>⚡ <b>Direct Web Bluetooth Active</b>: Actions stream directly from your browser over Bluetooth!</span>
                    {bleState.isBusy && <span className="font-bold animate-pulse text-amber-300">Streaming...</span>}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Send Text & Instant Phone Photo Control */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 bg-black/40 p-2.5 rounded-xl border border-white/5">
                        <Type className="w-4 h-4 text-white/50 ml-2" />
                        <input
                            type="text"
                            placeholder="Type live text for display..."
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            className="bg-transparent text-white text-xs px-2 py-1 outline-none flex-1"
                            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                        />
                        <input
                            type="color"
                            value={`#${color}`}
                            onChange={(e) => setColor(e.target.value.replace('#', ''))}
                            className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                            title="Text Color"
                        />
                        <button
                            onClick={handleSendText}
                            disabled={isSendingText || !text.trim()}
                            className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs rounded-lg transition-colors disabled:opacity-50"
                        >
                            {isSendingText ? 'Sending...' : 'Send Text'}
                        </button>
                    </div>

                    {/* Instant Phone Photo Panning Button */}
                    <div className="flex items-center">
                        <input
                            ref={phoneFileRef}
                            type="file"
                            accept="image/*,.gif"
                            className="hidden"
                            onChange={handlePhonePhotoSelected}
                        />
                        <button
                            onClick={() => phoneFileRef.current?.click()}
                            disabled={isProcessingPhoneImg || bleState.isBusy}
                            className="w-full flex items-center justify-center space-x-2 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 font-bold text-xs transition-all disabled:opacity-50 shadow-md"
                        >
                            <Film className="w-4 h-4 text-purple-400" />
                            <span>{isProcessingPhoneImg ? 'Generating Panning GIF...' : '📱 Stream Phone Photo (Instant 96x16 Panning GIF)'}</span>
                        </button>
                    </div>
                </div>

                {/* Brightness & Quick Controls */}
                <div className="flex flex-col justify-between bg-black/40 p-2.5 rounded-xl border border-white/5">
                    <div className="flex flex-wrap items-center gap-3 justify-between">
                        <div className="flex items-center space-x-1 text-xs text-white/70 font-bold">
                            <Sun className="w-4 h-4 text-yellow-400 mr-1" />
                            <span>Brightness:</span>
                        </div>
                        <div className="flex gap-1.5">
                            {[25, 50, 75, 100].map((level) => (
                                <button
                                    key={level}
                                    onClick={() => handleSetBrightness(level)}
                                    className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded transition-colors"
                                >
                                    {level}%
                                </button>
                            ))}
                        </div>

                        {bleState.connected && (
                            <div className="flex gap-1.5 border-l border-white/10 pl-2">
                                <button
                                    onClick={handleSetClock}
                                    className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
                                    title="Clock Mode"
                                >
                                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                                </button>
                                <button
                                    onClick={handleClearMemory}
                                    className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
                                    title="Clear Screen Memory"
                                >
                                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
