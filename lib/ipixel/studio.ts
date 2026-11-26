/**
 * Text Studio settings: the shape of the form state, its defaults, and which
 * parts of it are "portable" (saved in the shared library). Pure module: no
 * React, no browser or server APIs, so both the UI and the server can use it.
 *
 * To change what a fresh Text Studio starts with, edit DEFAULT_STUDIO below.
 */

import type { WriteMode } from '../webBluetooth';

export type GlyphFormat = 'app' | 'legacy-columns';
export type GlyphColorOrder = 'bgr' | 'rgb';

export interface Studio {
    text: string;
    effect: number;
    speed: number;
    invertSpeed: boolean;
    color: string;
    bgEnabled: boolean;
    bgColor: string;
    fontId: string;
    customFont: string;
    weight: string;
    sizePx: number;
    letterSpacing: number;
    yOffset: number;
    inkThreshold: number;
    hAlign: number;
    vAlign: number;
    vertical: boolean;
    borderEnabled: boolean;
    borderType: number;
    borderSpeed: number;
    borderEffect: number;
    textColorType: number;
    // advanced / protocol
    listId: number;
    windowSize: number;
    mtu: number;
    writeMode: WriteMode;
    interChunkDelayMs: number;
    ackTimeoutMs: number;
    requireAck: boolean;
    maxRetries: number;
    glyphFormat: GlyphFormat;
    colorOrder: GlyphColorOrder;
    legacyLength: boolean;
}

/** What a brand-new Text Studio starts with. Edit freely. */
export const DEFAULT_STUDIO: Studio = {
    text: 'WELCOME TO THE MATRIX',
    effect: 1, // 1 = Move Left (see TEXT_EFFECTS in protocol.ts)
    speed: 80,
    invertSpeed: false,
    color: '00FF00',
    bgEnabled: false,
    bgColor: '000000',
    fontId: 'google', // an id from FONT_CHOICES in presets.ts
    customFont: '',
    weight: '500',
    sizePx: 14,
    letterSpacing: 1,
    yOffset: 0,
    inkThreshold: 128,
    hAlign: 1,
    vAlign: 1,
    vertical: false,
    borderEnabled: false,
    borderType: 1,
    borderSpeed: 60,
    borderEffect: 0,
    textColorType: 1,
    listId: 0,
    windowSize: 0x1000, // keep equal to DEFAULT_WINDOW_SIZE in protocol.ts
    mtu: 244,
    writeMode: 'auto',
    interChunkDelayMs: 4,
    ackTimeoutMs: 6000,
    requireAck: true,
    maxRetries: 3,
    glyphFormat: 'app',
    colorOrder: 'bgr',
    legacyLength: false,
};

// ---------------------------------------------------------------------------
// Portable subset (what the shared library stores)
// ---------------------------------------------------------------------------

type Spec =
    | { kind: 'string'; max: number }
    | { kind: 'int'; min: number; max: number }
    | { kind: 'bool' }
    | { kind: 'hex' }
    | { kind: 'enum'; values: readonly string[] };

const int = (min: number, max: number): Spec => ({ kind: 'int', min, max });

/**
 * Settings that describe the *message* (what it says and how it looks and
 * moves). Transport tuning (window size, BLE write size, timeouts, retries) is
 * deliberately excluded: it belongs to a device/browser, not to a saved text.
 */
export const PORTABLE_SPEC = {
    text: { kind: 'string', max: 300 },
    effect: int(0, 127),
    speed: int(0, 255),
    invertSpeed: { kind: 'bool' },
    color: { kind: 'hex' },
    bgEnabled: { kind: 'bool' },
    bgColor: { kind: 'hex' },
    fontId: { kind: 'string', max: 32 },
    customFont: { kind: 'string', max: 200 },
    weight: { kind: 'enum', values: ['400', '500', '700'] },
    sizePx: int(8, 24),
    letterSpacing: int(0, 4),
    yOffset: int(-4, 4),
    inkThreshold: int(40, 220),
    hAlign: int(0, 2),
    vAlign: int(0, 2),
    vertical: { kind: 'bool' },
    borderEnabled: { kind: 'bool' },
    borderType: int(1, 24),
    borderSpeed: int(0, 255),
    borderEffect: int(0, 255),
    textColorType: int(0, 255),
    listId: int(0, 255),
    glyphFormat: { kind: 'enum', values: ['app', 'legacy-columns'] },
    colorOrder: { kind: 'enum', values: ['bgr', 'rgb'] },
    legacyLength: { kind: 'bool' },
} as const satisfies Partial<Record<keyof Studio, Spec>>;

export type PortableKey = keyof typeof PORTABLE_SPEC;
export type PortableStudio = Pick<Studio, PortableKey>;

export const PORTABLE_KEYS = Object.keys(PORTABLE_SPEC) as PortableKey[];

export function pickPortable(s: Studio): PortableStudio {
    const out: Partial<Record<PortableKey, unknown>> = {};
    for (const k of PORTABLE_KEYS) out[k] = s[k];
    return out as PortableStudio;
}

function coerce(spec: Spec, value: unknown, fallback: unknown): unknown {
    switch (spec.kind) {
        case 'string':
            return typeof value === 'string' ? value.slice(0, spec.max) : fallback;
        case 'int': {
            if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
            return Math.max(spec.min, Math.min(spec.max, Math.round(value)));
        }
        case 'bool':
            return typeof value === 'boolean' ? value : fallback;
        case 'hex':
            return typeof value === 'string' && /^[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : fallback;
        case 'enum':
            return typeof value === 'string' && spec.values.includes(value) ? value : fallback;
    }
}

/**
 * Turn arbitrary (untrusted) input into a complete, valid PortableStudio:
 * unknown keys are dropped, bad values fall back to the defaults, numbers are clamped.
 */
export function sanitizePortable(input: unknown): PortableStudio {
    const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const out: Partial<Record<PortableKey, unknown>> = {};
    for (const k of PORTABLE_KEYS) out[k] = coerce(PORTABLE_SPEC[k], src[k], DEFAULT_STUDIO[k]);
    return out as PortableStudio;
}

/** True when two settings describe exactly the same message and look (after sanitising). */
export function portableEqual(a: unknown, b: unknown): boolean {
    const x = sanitizePortable(a);
    const y = sanitizePortable(b);
    return PORTABLE_KEYS.every((k) => x[k] === y[k]);
}
