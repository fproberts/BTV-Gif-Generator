'use client';

import { useState, useEffect } from 'react';
import { Tv, Sun, Type, Bluetooth, BluetoothConnected, ExternalLink, Zap, Clock, Trash2 } from 'lucide-react';
import { sendTextToScreenAction, setBrightnessAction } from '@/app/actions';
import {
    subscribeBLEState,
    connectBLE,
    disconnectBLE,
    sendTextBLE,
    setBrightnessBLE,
    setClockBLE,
    clearMemoryBLE,
    BLEState
} from '@/lib/webBluetooth';

export function ScreenControlBar() {
    const [text, setText] = useState('');
    const [color, setColor] = useState('00FF00');
    const [isSendingText, setIsSendingText] = useState(false);
    const [bleState, setBleState] = useState<BLEState>({
        connected: false,
        deviceName: null,
        statusText: "Disconnected",
        isBusy: false
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
            alert(e.message || "Failed to connect to Bluetooth.");
        }
    };

    const handleSendText = async () => {
        if (!text.trim()) return;
        setIsSendingText(true);
        try {
            if (bleState.connected) {
                await sendTextBLE(text, color, '000000');
                alert(`Sent text "${text}" via Web Bluetooth!`);
            } else {
                await sendTextToScreenAction(text, color, '000000');
                alert(`Displayed text: "${text}" on LED screen (via Server)!`);
            }
            setText('');
        } catch (e: any) {
            alert(`Error sending text: ${e.message}`);
        } finally {
            setIsSendingText(false);
        }
    };

    const handleSetBrightness = async (level: number) => {
        try {
            if (bleState.connected) {
                await setBrightnessBLE(level);
                alert(`Brightness set to ${level}% via Web Bluetooth!`);
            } else {
                await setBrightnessAction(level);
                alert(`Brightness set to ${level}% (via Server)!`);
            }
        } catch (e: any) {
            alert(`Error setting brightness: ${e.message}`);
        }
    };

    const handleSetClock = async () => {
        try {
            if (bleState.connected) {
                await setClockBLE();
                alert("Switched to Clock Mode via Web Bluetooth!");
            } else {
                alert("Connect Web Bluetooth to set Clock mode directly!");
            }
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        }
    };

    const handleClearMemory = async () => {
        try {
            if (bleState.connected) {
                await clearMemoryBLE();
                alert("Cleared screen memory via Web Bluetooth!");
            } else {
                alert("Connect Web Bluetooth to clear memory!");
            }
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        }
    };

    return (
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4 mb-6 shadow-xl relative overflow-hidden">
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
                        className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
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
                    <span>⚡ <b>Direct Web Bluetooth Active</b>: Actions will stream directly from your browser to the screen!</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Send Text Control */}
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

                {/* Brightness & Quick Controls */}
                <div className="flex flex-wrap items-center gap-3 bg-black/40 p-2.5 rounded-xl border border-white/5 justify-between">
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
    );
}
