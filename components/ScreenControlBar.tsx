'use client';

import { useState, useEffect, useRef } from 'react';
import { Tv, Sun, Type, Bluetooth, BluetoothConnected, ExternalLink, Zap, Clock, Trash2, Camera, Radio, Sliders, Flame } from 'lucide-react';
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
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export function ScreenControlBar() {
    const [text, setText] = useState('');
    const [color, setColor] = useState('00FF00');
    const [isSendingText, setIsSendingText] = useState(false);
    const [isProcessingPhoneImg, setIsProcessingPhoneImg] = useState(false);
    const [isConnectingBLE, setIsConnectingBLE] = useState(false);
    const [activeBrightness, setActiveBrightness] = useState<number | null>(null);
    const [isClockBusy, setIsClockBusy] = useState(false);
    const [isMemoryBusy, setIsMemoryBusy] = useState(false);

    const phoneFileRef = useRef<HTMLInputElement>(null);

    const [bleState, setBleState] = useState<BLEState>({
        connected: false,
        deviceName: null,
        statusText: "Disconnected",
        isBusy: false,
        toastMessage: null
    });

    useEffect(() => {
        const unsubscribe = subscribeBLEState((state) => {
            setBleState(state);
            if (state.toastMessage) {
                toast.info(state.toastMessage);
            }
        });
        return () => unsubscribe();
    }, []);

    const handleConnectBLE = async () => {
        setIsConnectingBLE(true);
        const toastId = toast.loading(bleState.connected ? "Disconnecting Bluetooth..." : "Connecting to screen...");
        try {
            if (bleState.connected) {
                await disconnectBLE();
                toast.success("Bluetooth disconnected", { id: toastId });
            } else {
                await connectBLE();
                toast.success("Bluetooth connected to screen!", { id: toastId });
            }
        } catch (e: any) {
            console.warn("Bluetooth error:", e);
            toast.error(`Bluetooth issue: ${e?.message || 'Canceled'}`, { id: toastId });
        } finally {
            setIsConnectingBLE(false);
        }
    };

    const handleSendText = async () => {
        if (!text.trim()) return;
        setIsSendingText(true);
        const toastId = toast.loading(`Broadcasting "${text}" to screen...`);
        try {
            if (bleState.connected) {
                await sendTextBLE(text, color, '000000');
                toast.success(`Broadcasting "${text}" live!`, { id: toastId });
            } else {
                await sendTextToScreenAction(text, color, '000000');
                toast.success(`Broadcasting "${text}" to screen!`, { id: toastId });
            }
            setText('');
        } catch (e: any) {
            toast.error(`Broadcast failed: ${e?.message || 'Error'}`, { id: toastId });
        } finally {
            setIsSendingText(false);
        }
    };

    const handlePhonePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        setIsProcessingPhoneImg(true);
        const toastId = toast.loading("Processing photo for screen animation...");

        try {
            if (!bleState.connected) {
                toast.loading("Connecting Bluetooth first...", { id: toastId });
                await connectBLE();
            }

            toast.loading("Encoding animation & streaming...", { id: toastId });
            const isGif = file.name.toLowerCase().endsWith(".gif");
            const buf = await file.arrayBuffer();

            if (isGif) {
                await sendWindowFramesBLE(new Uint8Array(buf), true);
            } else {
                const img = new Image();
                img.src = URL.createObjectURL(file);
                await img.decode();

                const gifBytes = await generateClientScrollingGif(img, 96, 16, 2, 80);
                await sendWindowFramesBLE(gifBytes, true);
            }
            toast.success("Photo streaming live on screen!", { id: toastId });
        } catch (err: any) {
            toast.error("Error streaming phone photo: " + err.message, { id: toastId });
        } finally {
            setIsProcessingPhoneImg(false);
            if (phoneFileRef.current) phoneFileRef.current.value = "";
        }
    };

    const handleSetBrightness = async (level: number) => {
        setActiveBrightness(level);
        const toastId = toast.loading(`Setting brightness to ${level}%...`);
        try {
            if (bleState.connected) {
                await setBrightnessBLE(level);
            } else {
                await setBrightnessAction(level);
            }
            toast.success(`Brightness set to ${level}%`, { id: toastId });
        } catch (e: any) {
            toast.error(`Error setting brightness: ${e?.message || 'Failed'}`, { id: toastId });
        } finally {
            setActiveBrightness(null);
        }
    };

    const handleSetClock = async () => {
        if (!bleState.connected) {
            toast.error("Connect Bluetooth first to enable Clock mode!");
            return;
        }
        setIsClockBusy(true);
        const toastId = toast.loading("Enabling Clock mode...");
        try {
            await setClockBLE();
            toast.success("Clock mode active!", { id: toastId });
        } catch (e: any) {
            toast.error(`Error: ${e?.message || 'Failed'}`, { id: toastId });
        } finally {
            setIsClockBusy(false);
        }
    };

    const handleClearMemory = async () => {
        if (!bleState.connected) {
            toast.error("Connect Bluetooth first to clear screen memory!");
            return;
        }
        setIsMemoryBusy(true);
        const toastId = toast.loading("Clearing display memory...");
        try {
            await clearMemoryBLE();
            toast.success("Screen memory cleared!", { id: toastId });
        } catch (e: any) {
            toast.error(`Error: ${e?.message || 'Failed'}`, { id: toastId });
        } finally {
            setIsMemoryBusy(false);
        }
    };

    return (
        <Card className="p-5 sm:p-6 space-y-5 mb-8 bg-[#201b18] border-[#38302b] shadow-xl rounded-3xl">
            {/* Header & Bluetooth Pair Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#38302b]">
                <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-2xl bg-[#c85a32]/15 text-[#e06b43] border border-[#c85a32]/30">
                        <Radio className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center space-x-2">
                            <h2 className="font-bold text-sm tracking-wide text-[#f4ebe1]">
                                SCREEN CONTROLLER
                            </h2>
                        </div>
                        <p className="text-xs text-[#a89b8c]">Send messages & photos live</p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    <Button
                        variant={bleState.connected ? "amber" : "terracotta"}
                        size="sm"
                        onClick={handleConnectBLE}
                        isLoading={isConnectingBLE || bleState.isBusy}
                        loadingText={bleState.connected ? "Disconnecting..." : "Connecting..."}
                        className="h-9 px-4 rounded-2xl font-bold"
                    >
                        {bleState.connected ? (
                            <>
                                <BluetoothConnected className="w-4 h-4 mr-1.5 animate-pulse" />
                                <span>{bleState.deviceName || 'Connected'}</span>
                            </>
                        ) : (
                            <>
                                <Bluetooth className="w-4 h-4 mr-1.5" />
                                <span>Pair Bluetooth</span>
                            </>
                        )}
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="h-9 px-3.5 rounded-2xl border-[#38302b]"
                    >
                        <a
                            href="/offline.html"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-1.5 text-xs text-[#a89b8c] hover:text-[#f4ebe1]"
                            title="Open Offline Controller PWA"
                        >
                            <Zap className="w-3.5 h-3.5 text-[#d97706]" />
                            <span>Offline Link</span>
                        </a>
                    </Button>
                </div>
            </div>

            {/* Connection Banner */}
            {bleState.connected && (
                <div className="text-xs px-4 py-2.5 rounded-2xl bg-[#d97706]/15 border border-[#d97706]/30 text-[#f59e0b] flex items-center justify-between font-medium">
                    <div className="flex items-center space-x-2">
                        <Flame className="w-4 h-4 text-[#f59e0b] animate-bounce" />
                        <span><b>Live Bluetooth Link Active</b> — Streaming to screen!</span>
                    </div>
                    {bleState.isBusy && <span className="font-bold text-[#f4ebe1]">Streaming...</span>}
                </div>
            )}

            {/* Action Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Live Text Broadcaster & Quick Photo Streamer */}
                <div className="flex flex-col gap-3">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#a89b8c] flex items-center">
                        <Type className="w-3.5 h-3.5 mr-1.5 text-[#c85a32]" />
                        Send Text Caption
                    </label>

                    <div className="flex items-center gap-2 bg-[#171311] p-1.5 rounded-2xl border border-[#38302b] focus-within:border-[#c85a32]/60 transition-colors">
                        <Input
                            type="text"
                            placeholder="Type a quick message..."
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                            className="bg-transparent border-0 h-9 focus-visible:ring-0 text-xs px-2"
                        />
                        <input
                            type="color"
                            value={`#${color}`}
                            onChange={(e) => setColor(e.target.value.replace('#', ''))}
                            className="w-8 h-8 rounded-xl cursor-pointer border-0 bg-transparent shrink-0"
                            title="Text Color"
                        />
                        <Button
                            variant="terracotta"
                            size="sm"
                            onClick={handleSendText}
                            isLoading={isSendingText}
                            loadingText="Sending..."
                            disabled={!text.trim()}
                            className="h-9 px-4 shrink-0 rounded-xl"
                        >
                            Broadcast
                        </Button>
                    </div>

                    {/* Instant Phone Photo Streamer */}
                    <div>
                        <input
                            ref={phoneFileRef}
                            type="file"
                            accept="image/*,.gif"
                            className="hidden"
                            onChange={handlePhonePhotoSelected}
                        />
                        <Button
                            variant="moss"
                            onClick={() => phoneFileRef.current?.click()}
                            isLoading={isProcessingPhoneImg}
                            loadingText="Encoding animation..."
                            disabled={bleState.isBusy}
                            className="w-full h-11 text-xs justify-center font-bold rounded-2xl"
                        >
                            <Camera className="w-4 h-4 mr-2" />
                            <span>📷 Stream Photo from Phone</span>
                        </Button>
                    </div>
                </div>

                {/* Display Controls Deck */}
                <div className="flex flex-col justify-between bg-[#171311] p-4 rounded-2xl border border-[#38302b] gap-4">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#a89b8c] flex items-center">
                        <Sliders className="w-3.5 h-3.5 mr-1.5 text-[#6b7c4d]" />
                        Screen Tuning & Controls
                    </label>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center space-x-1.5 text-xs text-[#e6d7c3] font-bold">
                            <Sun className="w-4 h-4 text-[#d97706] mr-0.5" />
                            <span>Brightness:</span>
                        </div>

                        <div className="flex gap-2">
                            {[25, 50, 75, 100].map((level) => (
                                <Button
                                    key={level}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleSetBrightness(level)}
                                    isLoading={activeBrightness === level}
                                    className="h-8 px-3 text-xs rounded-xl font-bold bg-[#201b18]"
                                >
                                    {level}%
                                </Button>
                            ))}
                        </div>
                    </div>

                    {bleState.connected && (
                        <div className="flex items-center justify-between pt-3 border-t border-[#38302b] gap-2">
                            <span className="text-xs text-[#a89b8c]">Quick Modes:</span>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleSetClock}
                                    isLoading={isClockBusy}
                                    className="h-8 text-xs rounded-xl text-[#e6d7c3]"
                                >
                                    <Clock className="w-3.5 h-3.5 mr-1.5 text-[#d97706]" />
                                    Clock Mode
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleClearMemory}
                                    isLoading={isMemoryBusy}
                                    className="h-8 text-xs rounded-xl text-[#e65c53]"
                                >
                                    <Trash2 className="w-3.5 h-3.5 mr-1.5 text-[#99332c]" />
                                    Clear Memory
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
}
