'use client';

import { useState, useEffect, useRef } from 'react';
import { Type, Play, Sparkles, Sliders, Zap, Repeat, Eye, Gauge, Palette } from 'lucide-react';
import { sendTextToScreenAction } from '@/app/actions';
import { sendTextBLE, BLEState } from '@/lib/webBluetooth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface TextStudioProps {
    bleState: BLEState;
}

export type AnimationMode = 'auto' | 'scroll' | 'bounce' | 'typewriter' | 'pulse' | 'static';

const PRESETS = [
    { label: '🚀 WELCOME', text: 'WELCOME TO THE LAB' },
    { label: '🔴 ON AIR', text: 'ON AIR - DO NOT DISTURB' },
    { label: '🪩 PARTY TIME', text: 'PARTY TIME 🎉' },
    { label: '👾 GAME OVER', text: 'GAME OVER! TRY AGAIN' },
    { label: '☕ NEED COFFEE', text: 'COFFEE LOADING...' },
    { label: '⚡ LIVE STREAM', text: 'LIVE MATRIX DISPLAY' },
];

const PALETTES = [
    { name: 'Lime', color: '00FF00' },
    { name: 'Pink', color: 'FF007F' },
    { name: 'Cyan', color: '00F0FF' },
    { name: 'Amber', color: 'FFB000' },
    { name: 'Red', color: 'FF2A2A' },
    { name: 'White', color: 'FFFFFF' },
];

const FONTS = [
    { label: 'iPixel Default', value: 'GoogleSans-Medium, Arial, sans-serif', weight: '500' },
    { label: 'Clean Monospace', value: 'monospace', weight: '500' },
    { label: 'Modern Sans', value: 'system-ui, -apple-system, sans-serif', weight: '500' },
    { label: 'Condensed Display', value: '"Arial Narrow", "Trebuchet MS", sans-serif', weight: '600' },
];

export function TextStudio({ bleState }: TextStudioProps) {
    const [text, setText] = useState('WELCOME TO THE MATRIX');
    const [color, setColor] = useState('00FF00');
    const [bgColor, setBgColor] = useState('000000');
    const [mode, setMode] = useState<AnimationMode>('scroll');
    const [font, setFont] = useState('GoogleSans-Medium, Arial, sans-serif');
    const [speed, setSpeed] = useState(50);
    const [isSending, setIsSending] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number | null>(null);

    // Live 96x16 LED Matrix Simulator Canvas Effect
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let startTime = performance.now();

        const renderMatrixSimulator = (time: number) => {
            const width = 96;
            const height = 16;
            const scale = 4; // Render crisp subpixels

            // Offscreen render canvas
            const offscreen = document.createElement('canvas');
            offscreen.width = width;
            offscreen.height = height;
            const oCtx = offscreen.getContext('2d')!;

            oCtx.fillStyle = `#${bgColor}`;
            oCtx.fillRect(0, 0, width, height);

            oCtx.fillStyle = `#${color}`;
            const fontObj = FONTS.find(f => f.value === font) || FONTS[0];
            oCtx.font = `${fontObj.weight} 14px ${fontObj.value}`;
            oCtx.textBaseline = 'middle';

            const elapsed = time - startTime;
            const textMetrics = oCtx.measureText(text || ' ');
            const textW = Math.ceil(textMetrics.width);

            if (mode === 'static' || (mode === 'auto' && textW <= width)) {
                oCtx.textAlign = 'center';
                oCtx.fillText(text || ' ', width / 2, height / 2);
            } else if (mode === 'scroll' || mode === 'auto') {
                const padded = (text || ' ') + '    ';
                const pW = Math.ceil(oCtx.measureText(padded).width);
                const step = (elapsed / speed) * 2;
                const scrollX = (step % pW);
                oCtx.textAlign = 'left';
                oCtx.fillText(padded + padded, width - scrollX, height / 2);
            } else if (mode === 'bounce') {
                const maxOffset = Math.max(1, Math.abs(textW - width));
                const cycle = (elapsed / (speed * 20)) % 2;
                const pos = cycle < 1 ? cycle * maxOffset : (2 - cycle) * maxOffset;
                oCtx.textAlign = 'left';
                oCtx.fillText(text || ' ', textW <= width ? pos : -pos + 4, height / 2);
            } else if (mode === 'typewriter') {
                const totalChars = (text || ' ').length;
                const charIdx = Math.min(totalChars, Math.floor((elapsed / (speed * 2)) % (totalChars + 5)));
                const partial = (text || ' ').slice(0, Math.max(1, charIdx));
                oCtx.textAlign = 'center';
                oCtx.fillText(partial, width / 2, height / 2);
            } else if (mode === 'pulse') {
                const factor = 0.3 + 0.7 * Math.abs(Math.sin(elapsed / 300));
                oCtx.globalAlpha = factor;
                oCtx.textAlign = 'center';
                oCtx.fillText(text || ' ', width / 2, height / 2);
            }

            // Draw to visible high-res grid canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const imgData = oCtx.getImageData(0, 0, width, height);

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const r = imgData.data[idx];
                    const g = imgData.data[idx + 1];
                    const b = imgData.data[idx + 2];

                    const px = x * scale;
                    const py = y * scale;

                    // Simulated LED pixel grid
                    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                    ctx.beginPath();
                    ctx.arc(px + 2, py + 2, 1.6, 0, Math.PI * 2);
                    ctx.fill();

                    // LED Subpixel Glow
                    if (r > 50 || g > 50 || b > 50) {
                        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.25)`;
                        ctx.beginPath();
                        ctx.arc(px + 2, py + 2, 2.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }

            animFrameRef.current = requestAnimationFrame(renderMatrixSimulator);
        };

        animFrameRef.current = requestAnimationFrame(renderMatrixSimulator);

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [text, color, bgColor, mode, font, speed]);

    const handleBroadcast = async () => {
        if (!text.trim()) return;
        setIsSending(true);
        const toastId = toast.loading(`Broadcasting text ("${mode}" mode)...`);

        try {
            if (bleState.connected) {
                await sendTextBLE(text, color, bgColor, mode, font, 14, speed, 1);
                toast.success(`Broadcasting "${text}" live on BLE!`, { id: toastId });
            } else {
                await sendTextToScreenAction(text, color, bgColor, mode, 14, speed, 1);
                toast.success(`Sent "${text}" to screen!`, { id: toastId });
            }
        } catch (e: any) {
            toast.error(`Broadcast issue: ${e?.message || 'Error'}`, { id: toastId });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Card className="p-5 sm:p-6 space-y-6 bg-[#201b18] border-[#38302b] shadow-2xl rounded-3xl">
            {/* Title Bar */}
            <div className="flex items-center justify-between border-b border-[#38302b] pb-4">
                <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-2xl bg-[#c85a32]/20 text-[#e06b43] border border-[#c85a32]/30">
                        <Type className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="font-bold text-sm tracking-wide text-[#f4ebe1]">TEXT BROADCASTER STUDIO</h2>
                        <p className="text-xs text-[#a89b8c]">Design & stream animated messages live to display</p>
                    </div>
                </div>

                <Badge variant="outline" className="border-[#c85a32]/40 text-[#e06b43] font-bold text-[11px] px-3 py-1 rounded-xl">
                    96x16 MATRIX ENGINE
                </Badge>
            </div>

            {/* LED Matrix Simulator Display Screen */}
            <div className="bg-[#0e0c0b] p-4 rounded-2xl border border-[#38302b] shadow-inner flex flex-col items-center gap-2">
                <div className="flex items-center justify-between w-full text-[11px] text-[#a89b8c] font-bold px-1">
                    <span className="flex items-center gap-1.5 text-[#e06b43]">
                        <Eye className="w-3.5 h-3.5" /> LIVE SIMULATION PREVIEW
                    </span>
                    <span>96 x 16 PIXELS</span>
                </div>
                <div className="p-2 bg-[#000] rounded-xl border border-[#2a2420] shadow-2xl overflow-hidden max-w-full">
                    <canvas
                        ref={canvasRef}
                        width={384}
                        height={64}
                        className="w-full max-w-[384px] h-auto block rounded"
                    />
                </div>
            </div>

            {/* Input & Quick Swatches */}
            <div className="space-y-3">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#a89b8c] flex items-center justify-between">
                    <span>Message Input ({text.length} chars)</span>
                    <span className="text-[#c85a32] cursor-pointer hover:underline" onClick={() => setText('')}>Clear</span>
                </label>

                <div className="flex items-center gap-2 bg-[#171311] p-2 rounded-2xl border border-[#38302b] focus-within:border-[#c85a32]">
                    <Input
                        type="text"
                        placeholder="Type text message..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleBroadcast()}
                        className="bg-transparent border-0 focus-visible:ring-0 text-sm px-2 text-[#f4ebe1] font-semibold"
                    />

                    {/* Color Swatch Picker */}
                    <div className="flex items-center gap-1.5 shrink-0 pr-1">
                        <input
                            type="color"
                            value={`#${color}`}
                            onChange={(e) => setColor(e.target.value.replace('#', ''))}
                            className="w-8 h-8 rounded-xl cursor-pointer border-0 bg-transparent shrink-0"
                            title="Text Color"
                        />
                        <input
                            type="color"
                            value={`#${bgColor}`}
                            onChange={(e) => setBgColor(e.target.value.replace('#', ''))}
                            className="w-8 h-8 rounded-xl cursor-pointer border-0 bg-transparent shrink-0 opacity-75"
                            title="Background Color"
                        />
                    </div>
                </div>

                {/* Preset Text Badges */}
                <div className="flex flex-wrap gap-2 pt-1">
                    {PRESETS.map((p) => (
                        <button
                            key={p.label}
                            onClick={() => setText(p.text)}
                            className="text-[11px] px-2.5 py-1 rounded-xl bg-[#171311] border border-[#38302b] text-[#a89b8c] hover:text-[#f4ebe1] hover:border-[#c85a32]/50 font-medium transition-colors"
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Animation Mode Selector */}
            <div className="space-y-3">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#a89b8c] flex items-center">
                    <Repeat className="w-3.5 h-3.5 mr-1.5 text-[#c85a32]" />
                    Animation Mode
                </label>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {[
                        { id: 'scroll', label: 'Marquee', icon: '↔️' },
                        { id: 'bounce', label: 'Bounce', icon: '↕️' },
                        { id: 'typewriter', label: 'Typewriter', icon: '⌨️' },
                        { id: 'pulse', label: 'Pulse', icon: '✨' },
                        { id: 'static', label: 'Static', icon: '⏹️' },
                    ].map((m) => (
                        <button
                            key={m.id}
                            onClick={() => setMode(m.id as AnimationMode)}
                            className={`p-2.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                                mode === m.id
                                    ? 'bg-[#c85a32]/20 border-[#c85a32] text-[#f4ebe1] font-bold shadow-lg'
                                    : 'bg-[#171311] border-[#38302b] text-[#a89b8c] hover:text-[#f4ebe1]'
                            }`}
                        >
                            <span className="text-base">{m.icon}</span>
                            <span className="text-xs">{m.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Fine Tuning Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#171311] p-4 rounded-2xl border border-[#38302b]">
                {/* Font Selector */}
                <div className="space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#a89b8c] flex items-center">
                        <Type className="w-3.5 h-3.5 mr-1.5 text-[#6b7c4d]" />
                        Font Style
                    </label>
                    <select
                        value={font}
                        onChange={(e) => setFont(e.target.value)}
                        className="w-full bg-[#201b18] border border-[#38302b] rounded-xl text-xs text-[#f4ebe1] p-2.5 focus:border-[#c85a32] outline-none"
                    >
                        {FONTS.map((f) => (
                            <option key={f.value} value={f.value}>
                                {f.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Speed Slider */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold uppercase text-[#a89b8c]">
                        <span className="flex items-center">
                            <Gauge className="w-3.5 h-3.5 mr-1.5 text-[#d97706]" />
                            Animation Speed
                        </span>
                        <span className="text-[#f4ebe1]">{speed} ms</span>
                    </div>
                    <input
                        type="range"
                        min={30}
                        max={180}
                        step={10}
                        value={speed}
                        onChange={(e) => setSpeed(Number(e.target.value))}
                        className="w-full accent-[#c85a32] cursor-pointer"
                    />
                </div>
            </div>

            {/* Action Broadcast Button */}
            <Button
                variant="terracotta"
                size="lg"
                onClick={handleBroadcast}
                isLoading={isSending}
                loadingText="Broadcasting Message..."
                disabled={!text.trim()}
                className="w-full h-12 text-sm font-bold rounded-2xl shadow-xl justify-center"
            >
                <Zap className="w-4 h-4 mr-2" />
                <span>Broadcast Live to Screen</span>
            </Button>
        </Card>
    );
}
