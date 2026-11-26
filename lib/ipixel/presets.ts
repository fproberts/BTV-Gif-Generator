/**
 * Editable defaults for the Text Studio UI.
 *
 *   TEXT_PRESETS   the quick-pick chips under the message box
 *   COLOUR_SWATCHES the colour dots next to "Text colour"
 *   FONT_CHOICES   the font dropdown
 *
 * What a fresh studio starts with (default text, effect, speed, colour...) lives
 * in DEFAULT_STUDIO in lib/ipixel/studio.ts.
 */

import type { PortableStudio } from './studio';

export interface TextPreset {
    label: string;
    text: string;
    /**
     * Optional extra settings applied together with the text, for example
     * { color: 'FF2A2A', effect: 5 } for red blinking text. Any key from
     * PORTABLE_SPEC in studio.ts is allowed; omitted keys are left as they are.
     */
    settings?: Partial<PortableStudio>;
}

export const TEXT_PRESETS: TextPreset[] = [
    { label: '🚀 WELCOME', text: 'WELCOME TO THE LAB' },
    { label: '🔴 ON AIR', text: 'ON AIR - DO NOT DISTURB', settings: { color: 'FF2A2A', effect: 5 } },
    { label: '🪩 PARTY TIME', text: 'PARTY TIME' },
    { label: '👾 GAME OVER', text: 'GAME OVER! TRY AGAIN' },
    { label: '☕ NEED COFFEE', text: 'COFFEE LOADING...' },
    { label: '⚡ LIVE STREAM', text: 'LIVE MATRIX DISPLAY' },
];

export const COLOUR_SWATCHES = [
    { name: 'Lime', color: '00FF00' },
    { name: 'Pink', color: 'FF007F' },
    { name: 'Cyan', color: '00F0FF' },
    { name: 'Amber', color: 'FFB000' },
    { name: 'Red', color: 'FF2A2A' },
    { name: 'White', color: 'FFFFFF' },
    { name: 'Blue', color: '3B82F6' },
    { name: 'Violet', color: 'A855F7' },
];

export interface FontChoice {
    id: string;
    label: string;
    /** CSS font-family list */
    family: string;
    /** default weight when this font is picked: '400' | '500' | '700' */
    weight: string;
}

export const FONT_CHOICES: FontChoice[] = [
    { id: 'google', label: 'iPixel Default (Google Sans)', family: 'GoogleSans-Medium, Arial, sans-serif', weight: '500' },
    { id: 'arial', label: 'Arial / Helvetica', family: 'Arial, Helvetica, sans-serif', weight: '400' },
    { id: 'condensed', label: 'Condensed', family: '"Arial Narrow", "Helvetica Neue", sans-serif', weight: '400' },
    { id: 'mono', label: 'Monospace', family: '"Courier New", monospace', weight: '700' },
    { id: 'serif', label: 'Serif', family: 'Georgia, "Times New Roman", serif', weight: '400' },
    { id: 'rounded', label: 'Rounded', family: '"Trebuchet MS", system-ui, sans-serif', weight: '500' },
    { id: 'custom', label: 'Custom font-family…', family: '', weight: '500' },
];
