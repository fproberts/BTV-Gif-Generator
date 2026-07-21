'use client';

import { useState } from 'react';
import { Tv, Play, Sun, Type } from 'lucide-react';
import { sendTextToScreenAction, setBrightnessAction } from '@/app/actions';

export function ScreenControlBar() {
    const [text, setText] = useState('');
    const [color, setColor] = useState('00FF00');
    const [isSendingText, setIsSendingText] = useState(false);

    const handleSendText = async () => {
        if (!text.trim()) return;
        setIsSendingText(true);
        try {
            await sendTextToScreenAction(text, color, '000000');
            alert(`Displayed text: "${text}" on LED screen!`);
            setText('');
        } catch (e: any) {
            alert(`Error sending text: ${e.message}`);
        } finally {
            setIsSendingText(false);
        }
    };

    const handleSetBrightness = async (level: number) => {
        try {
            await setBrightnessAction(level);
            alert(`Brightness set to ${level}%`);
        } catch (e: any) {
            alert(`Error setting brightness: ${e.message}`);
        }
    };

    return (
        <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-4 mb-6 shadow-xl">
            <div className="flex items-center space-x-2 text-emerald-400 font-extrabold text-sm tracking-wider uppercase">
                <Tv className="w-5 h-5" />
                <span>iPixel 96x16 Screen Controls</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Send Text Control */}
                <div className="flex items-center gap-2 bg-black/40 p-2 rounded-xl border border-white/5">
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
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs rounded-lg transition-colors disabled:opacity-50"
                    >
                        {isSendingText ? 'Sending...' : 'Send Text'}
                    </button>
                </div>

                {/* Brightness & Commands */}
                <div className="flex items-center gap-3 bg-black/40 p-2 rounded-xl border border-white/5 justify-between">
                    <div className="flex items-center space-x-1 text-xs text-white/70 font-bold">
                        <Sun className="w-4 h-4 text-yellow-400 mr-1" />
                        <span>Brightness:</span>
                    </div>
                    <div className="flex gap-1">
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
                </div>
            </div>
        </div>
    );
}
