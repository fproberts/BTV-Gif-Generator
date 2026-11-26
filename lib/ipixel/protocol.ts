/**
 * iPixel Color native text protocol (pure functions, no browser dependencies).
 *
 * Everything here is derived from static analysis of the iPixel Color iOS app
 * (WIFI_LED, arm64). Each section notes where the information came from and how
 * much we trust it:
 *
 *   [observed]   read directly from decompiled code / assembly
 *   [inferred]   a reading of the decompiled code that has not been seen on hardware
 *   [unverified] a guess that needs a real panel (or a BLE capture) to confirm
 *
 * Nothing in this file touches Bluetooth; see lib/webBluetooth.ts for the sender.
 */

// ---------------------------------------------------------------------------
// Transport constants
// ---------------------------------------------------------------------------

export const SERVICE_UUID = '000000fa-0000-1000-8000-00805f9b34fb';
/** [inferred] write characteristic (the app calls it writeCharacteristic1) */
export const WRITE_UUID = '0000fa02-0000-1000-8000-00805f9b34fb';
/** [inferred] notify characteristic carrying the 5-byte replies */
export const NOTIFY_UUID = '0000fa03-0000-1000-8000-00805f9b34fb';

/** Panel geometry this studio targets. */
export const PANEL_WIDTH = 96;
export const PANEL_HEIGHT = 16;

/**
 * [observed] Chunk (window) payload size is 0x1000, or 0x3000 when the device
 * reports screenType 0 or 1. We default to the smaller, always-safe value.
 */
export const DEFAULT_WINDOW_SIZE = 0x1000;

/** Size of the per-window frame header. [observed] */
export const FRAME_HEADER_SIZE = 15;

/** [observed] opcode bytes for a native text send (header bytes 2 and 3). */
export const TEXT_OPCODE: readonly [number, number] = [0x00, 0x01];
/** The same opcode as a little-endian u16, which is how acks echo it. [observed] */
export const TEXT_OPCODE_U16 = 0x0100;

/** [observed, REA getSendImageData / getSendGifData] still image and animated GIF transfers. */
export const IMAGE_OPCODE: readonly [number, number] = [0x02, 0x00];
export const IMAGE_OPCODE_U16 = 0x0002;
export const GIF_OPCODE: readonly [number, number] = [0x03, 0x00];
export const GIF_OPCODE_U16 = 0x0003;

/**
 * [observed, REA FUN_100591078] the app's window size is 0x3000 only for screenType 0 or 1,
 * and 0x1000 for everything else, including the 96x16 panel (screenType 5).
 */
export function windowSizeForScreenType(screenType: number | null | undefined): number {
    return screenType === 0 || screenType === 1 ? 0x3000 : 0x1000;
}

/**
 * [observed, REA WMGlobalSetting getScreenWithValue:] device-info reply byte 4 -> screenType.
 * Anything not listed maps to 0.
 */
const SCREEN_CODE_TO_TYPE: Record<number, number> = {
    0x00: 0, 0x80: 0, 0x01: 1, 0x81: 1, 0x82: 2, 0x83: 4, 0x84: 5, 0x85: 9, 0x86: 10, 0x87: 0x0b,
    0x88: 0x0c, 0x89: 0x0e, 0x8a: 7, 0x8b: 0x0d, 0x8c: 0x12, 0x8d: 0x14, 0x8e: 0x15, 0x8f: 0x16,
    0x90: 0x18, 0x91: 0x19, 0x92: 0x1a, 0x93: 0x1b, 0x94: 3, 0x95: 0x1c, 0x96: 0x1e, 0x97: 0x1f,
    0x98: 0x20, 0x99: 0x21, 0x9a: 0x22, 0x9b: 0x23, 0x9c: 0x24, 0x9d: 0x25, 0x9e: 0x26, 0x9f: 0x28,
    0xa0: 0x29,
};

export function screenTypeFromCode(code: number): number {
    return SCREEN_CODE_TO_TYPE[code] ?? 0;
}

/** [observed] device-info request: 08 00 01 80 hh mm ss <flag>. The flag's meaning is open; the app often sends 0. */
export function buildDeviceInfoRequest(now: Date = new Date(), flag = 0): Uint8Array {
    return new Uint8Array([0x08, 0x00, 0x01, 0x80, now.getHours(), now.getMinutes(), now.getSeconds(), flag & 0xff]);
}

export interface DeviceInfo {
    /** raw screen code from byte 4 (0x84 for a 96x16 panel) */
    screenCode: number;
    screenType: number;
    windowSize: number;
    raw: Uint8Array;
}

/** [observed] reply: <len > 8> 00 01 80 <screen code> ... */
export function parseDeviceInfo(data: Uint8Array): DeviceInfo | null {
    if (data.length < 5 || data[0] <= 8 || data[1] !== 0x00 || data[2] !== 0x01 || data[3] !== 0x80) return null;
    const screenType = screenTypeFromCode(data[4]);
    return { screenCode: data[4], screenType, windowSize: windowSizeForScreenType(screenType), raw: data };
}

// ---------------------------------------------------------------------------
// App option tables
// ---------------------------------------------------------------------------

export interface TextEffect {
    id: number;
    key: string;
    label: string;
    /** short description for the UI */
    hint: string;
}

/**
 * Effect names in the order the iOS app lists them (Text_guding, Text_left, ...).
 * [unverified] that the list index is the effect byte the device expects.
 * This is the single place to correct the mapping after testing on hardware.
 */
export const TEXT_EFFECTS: readonly TextEffect[] = [
    { id: 0, key: 'fixed', label: 'Fixed', hint: 'Static text' },
    { id: 1, key: 'left', label: 'Move Left', hint: 'Scrolls right-to-left' },
    { id: 2, key: 'right', label: 'Move Right', hint: 'Scrolls left-to-right' },
    { id: 3, key: 'up', label: 'Up', hint: 'Scrolls upward' },
    { id: 4, key: 'down', label: 'Down', hint: 'Scrolls downward' },
    { id: 5, key: 'blink', label: 'Blink', hint: 'Flashes on and off' },
    { id: 6, key: 'breathe', label: 'Breathe', hint: 'Fades in and out' },
    { id: 7, key: 'snowflake', label: 'Snowflake', hint: 'Falling sparkle overlay' },
    { id: 8, key: 'laser', label: 'Laser', hint: 'Sweeping beam reveal' },
] as const;

/** [unverified] alignment ids; 1 is the app's default for both axes. */
export const H_ALIGNS = [
    { id: 0, label: 'Left' },
    { id: 1, label: 'Center' },
    { id: 2, label: 'Right' },
] as const;
export const V_ALIGNS = [
    { id: 0, label: 'Top' },
    { id: 1, label: 'Middle' },
    { id: 2, label: 'Bottom' },
] as const;

/** The app ships 24 border styles per panel size (ani_border_96_16_1..24). [observed] */
export const BORDER_STYLE_COUNT = 24;

// ---------------------------------------------------------------------------
// CRC-32 (IEEE, poly 0xEDB88320). [observed] identical to the app's routine.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

export interface RGB {
    r: number;
    g: number;
    b: number;
}

export function parseHexColor(hex: string): RGB {
    let c = hex.replace('#', '').trim();
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const n = parseInt(c, 16);
    if (Number.isNaN(n) || c.length !== 6) return { r: 255, g: 255, b: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: RGB): string {
    return [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Glyph bitmaps
// ---------------------------------------------------------------------------

/** A single rendered element (one character image). pixels: width*height, 1 = ink. */
export interface GlyphElement {
    width: number;
    height: number;
    pixels: Uint8Array;
}

/**
 * [observed, from assembly of getAnyFontStrDataWithIm:] 1 bit per pixel, row-major,
 * ceil(width/8) bytes per row, bit i of byte j is column 8*j+i (LSB first).
 */
export function packRowMajorLsb(g: GlyphElement): Uint8Array {
    const bytesPerRow = Math.ceil(g.width / 8);
    const out = new Uint8Array(bytesPerRow * g.height);
    for (let y = 0; y < g.height; y++) {
        for (let x = 0; x < g.width; x++) {
            if (g.pixels[y * g.width + x]) out[y * bytesPerRow + (x >> 3)] |= 1 << (x & 7);
        }
    }
    return out;
}

/**
 * Column-major, MSB-first (top row = bit 7), height/8 bytes per column. This is
 * what the earlier Python experiment (scripts/test_native_text_protocol.py) used.
 * [unverified] kept as a compatibility option only.
 */
export function packColumnMajorMsb(g: GlyphElement): Uint8Array {
    const bytesPerCol = Math.ceil(g.height / 8);
    const out = new Uint8Array(bytesPerCol * g.width);
    for (let x = 0; x < g.width; x++) {
        for (let by = 0; by < bytesPerCol; by++) {
            let v = 0;
            for (let bit = 0; bit < 8; bit++) {
                const y = by * 8 + bit;
                if (y < g.height && g.pixels[y * g.width + x]) v |= 0x80 >> bit;
            }
            out[x * bytesPerCol + by] = v;
        }
    }
    return out;
}

export type GlyphFormat = 'app' | 'legacy-columns';
export type GlyphColorOrder = 'bgr' | 'rgb';

export interface GlyphRecordOptions {
    format: GlyphFormat;
    /**
     * [inferred] In the app's glyph record the three colour bytes come out in the
     * reverse order of the header colour. 'bgr' follows the decompile.
     */
    colorOrder: GlyphColorOrder;
}

/**
 * One element record.
 *   app:            0x80, c0, c1, c2, width, height, row-major bitmap   [observed]
 *   legacy-columns: 0x00, R,  G,  B,  column-major bitmap               [unverified]
 */
export function glyphRecord(g: GlyphElement, color: RGB, opts: GlyphRecordOptions): Uint8Array {
    if (opts.format === 'legacy-columns') {
        const bitmap = packColumnMajorMsb(g);
        const rec = new Uint8Array(4 + bitmap.length);
        rec.set([0x00, color.r, color.g, color.b], 0);
        rec.set(bitmap, 4);
        return rec;
    }
    const bitmap = packRowMajorLsb(g);
    const rec = new Uint8Array(6 + bitmap.length);
    const [c0, c1, c2] = opts.colorOrder === 'bgr' ? [color.b, color.g, color.r] : [color.r, color.g, color.b];
    rec.set([0x80, c0, c1, c2, g.width & 0xff, g.height & 0xff], 0);
    rec.set(bitmap, 6);
    return rec;
}

// ---------------------------------------------------------------------------
// Text payload
// ---------------------------------------------------------------------------

export interface BorderSettings {
    type: number;
    speed: number;
    effect: number;
}

export interface TextSettings {
    effect: number;
    /** raw device speed byte (0-255). Direction (higher = faster?) is [unverified]. */
    speed: number;
    hAlign: number;
    vAlign: number;
    /** [observed] the app only honours the supplied colour when this is 1. */
    textColorType: number;
    textColor: RGB;
    /** [observed] likewise for the background; 0 = no custom background. */
    bgColorType: number;
    bgColor: RGB;
    /** vertical text; sets bit 0x80 of the effect byte. [observed] */
    vertical: boolean;
    board: BorderSettings | null;
}

/**
 * [observed] Header is 14 bytes, or 17 when a border is enabled:
 *   0-1  element count (u16 LE)      2 hAlign        3 vAlign
 *   4    effect (| 0x80 if vertical) 5 speed         6 textColorType
 *   7-9  text RGB                    10 bgColorType  11-13 background RGB
 *   14-16 [border only] type, speed, effect
 */
export function buildTextHeader(s: TextSettings, count: number): Uint8Array {
    const hasBoard = s.board !== null;
    const out = new Uint8Array(hasBoard ? 17 : 14);
    // The app substitutes white / black when the colour type is not "custom".
    const fg = s.textColorType === 1 ? s.textColor : { r: 255, g: 255, b: 255 };
    const bg = s.bgColorType === 1 ? s.bgColor : { r: 0, g: 0, b: 0 };

    out[0] = count & 0xff;
    out[1] = (count >> 8) & 0xff;
    out[2] = s.hAlign & 0xff;
    out[3] = s.vAlign & 0xff;
    out[4] = (s.effect + (s.vertical ? 0x80 : 0)) & 0xff;
    out[5] = s.speed & 0xff;
    out[6] = s.textColorType & 0xff;
    out[7] = fg.r;
    out[8] = fg.g;
    out[9] = fg.b;
    out[10] = s.bgColorType & 0xff;
    out[11] = bg.r;
    out[12] = bg.g;
    out[13] = bg.b;
    if (s.board) {
        out[14] = s.board.type & 0xff;
        out[15] = s.board.speed & 0xff;
        out[16] = s.board.effect & 0xff;
    }
    return out;
}

export function buildTextPayload(s: TextSettings, glyphs: GlyphElement[], rec: GlyphRecordOptions): Uint8Array {
    const fg = s.textColorType === 1 ? s.textColor : { r: 255, g: 255, b: 255 };
    const records = glyphs.map((g) => glyphRecord(g, fg, rec));
    const header = buildTextHeader(s, glyphs.length);
    const total = header.length + records.reduce((n, r) => n + r.length, 0);
    const out = new Uint8Array(total);
    out.set(header, 0);
    let pos = header.length;
    for (const r of records) {
        out.set(r, pos);
        pos += r.length;
    }
    return out;
}

// ---------------------------------------------------------------------------
// Framing into windows
// ---------------------------------------------------------------------------

export interface FrameOptions {
    /** payload bytes per window; app uses 0x1000, or 0x3000 for screenType 0/1 */
    windowSize: number;
    /** program/list id (header byte 14). [inferred] */
    listId: number;
    /**
     * [observed] for screenType 0 with old firmware (REA: version 0xe8 and below) the app writes
     * chunkLength + 10 instead of chunkLength + 15 into the length field.
     */
    legacyLengthField: boolean;
    opcode?: readonly [number, number];
    /** header byte 13. [observed] 0x00 for text and images, 0x02 for GIFs. */
    typeByte?: number;
}

/**
 * [observed] Each window is:
 *   0-1  u16 LE length (chunk + 15)     2-3 opcode (00 01 for text)
 *   4    0x00 first window, 0x02 later  5-8 total payload size (u32 LE)
 *   9-12 CRC-32 of the entire payload (u32 LE)
 *   13   0x00                           14  list id
 *   15.. this window's slice of the payload
 */
export function frameWindows(payload: Uint8Array, opts: FrameOptions): Uint8Array[] {
    const size = Math.max(1, Math.floor(opts.windowSize));
    const crc = crc32(payload);
    const op = opts.opcode ?? TEXT_OPCODE;
    const windows: Uint8Array[] = [];
    let index = 0;
    for (let pos = 0; pos < payload.length || index === 0; pos += size) {
        const chunk = payload.subarray(pos, Math.min(pos + size, payload.length));
        const frame = new Uint8Array(FRAME_HEADER_SIZE + chunk.length);
        const view = new DataView(frame.buffer);
        view.setUint16(0, chunk.length + (opts.legacyLengthField ? 10 : FRAME_HEADER_SIZE), true);
        frame[2] = op[0];
        frame[3] = op[1];
        frame[4] = index === 0 ? 0x00 : 0x02;
        view.setUint32(5, payload.length, true);
        view.setUint32(9, crc, true);
        frame[13] = (opts.typeByte ?? 0) & 0xff;
        frame[14] = opts.listId & 0xff;
        frame.set(chunk, FRAME_HEADER_SIZE);
        windows.push(frame);
        index++;
        if (payload.length === 0) break;
    }
    return windows;
}

/** Split a window into BLE write pieces no larger than `mtu` bytes. */
export function splitForMtu(window: Uint8Array, mtu: number): Uint8Array[] {
    const n = Math.max(1, Math.floor(mtu));
    const out: Uint8Array[] = [];
    for (let i = 0; i < window.length; i += n) out.push(window.subarray(i, i + n));
    return out;
}

// ---------------------------------------------------------------------------
// Device replies
// ---------------------------------------------------------------------------

export interface AckFrame {
    /** u16 LE of bytes 2-3; echoes the opcode of the command being answered */
    opcode: number;
    status: number;
    raw: Uint8Array;
}

/** [observed] replies are 5-byte frames: 05 00 <opcode lo> <opcode hi> <status>. */
export function parseAck(data: Uint8Array): AckFrame | null {
    if (data.length < 5 || data[0] !== 0x05 || data[1] !== 0x00) return null;
    return { opcode: data[2] | (data[3] << 8), status: data[4], raw: data };
}

export type AckVerdict = 'continue' | 'complete' | 'retry' | 'abort' | 'ignore';

/**
 * [observed, REA parseReceiveData] For transfers (text 0x0100, GIF 0x0003, and others):
 * status 1 = window accepted (send the next), 3 = whole transfer complete,
 * 0 = failure (the app restarts from the first window, giving up after three failures),
 * 2 = abort. The app treats any other status like 1. Frames for other opcodes are ignored.
 */
export function classifyTextAck(frame: AckFrame, opcode: number = TEXT_OPCODE_U16): AckVerdict {
    if (frame.opcode !== opcode) return 'ignore';
    switch (frame.status) {
        case 1:
            return 'continue';
        case 3:
            return 'complete';
        case 0:
            return 'retry';
        case 2:
            return 'abort';
        default:
            return 'continue';
    }
}

/** Same rules for any transfer opcode (images, GIFs, text). */
export const classifyTransferAck = classifyTextAck;

/** Width and height from a GIF or PNG header, or null if the bytes are neither. */
export function readImageSize(bytes: Uint8Array): { width: number; height: number } | null {
    if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
        return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) };
    }
    if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return { width: v.getUint32(16), height: v.getUint32(20) };
    }
    return null;
}

// ---------------------------------------------------------------------------
// Program list (playlist) commands. REA findings section 6.
// ---------------------------------------------------------------------------

/** [observed] the panel stores items in slots 1-100 (header byte 14 = slot). */
export const MIN_SLOT = 1;
export const MAX_SLOT = 100;

/** Reply opcodes as little-endian u16 of bytes 2-3. */
export const PROGRAM_LIST_OPCODE_U16 = 0x8008; // 08 80
export const DELETE_SLOTS_OPCODE_U16 = 0x0102; // 02 01
export const DELETE_ALL_OPCODE_U16 = 0x8003; // 03 80

function slotIds(ids: readonly number[]): number[] {
    if (ids.length === 0) throw new Error('At least one slot is needed');
    return ids.map((id) => {
        if (!Number.isInteger(id) || id < MIN_SLOT || id > MAX_SLOT) throw new Error(`Slot ${id} is outside ${MIN_SLOT}-${MAX_SLOT}`);
        return id;
    });
}

function countedIdFrame(op0: number, op1: number, ids: readonly number[]): Uint8Array {
    const list = slotIds(ids);
    const out = new Uint8Array(6 + list.length);
    const v = new DataView(out.buffer);
    v.setUint16(0, out.length, true);
    out[2] = op0;
    out[3] = op1;
    v.setUint16(4, list.length, true);
    out.set(list, 6);
    return out;
}

/**
 * [observed, send_listID] set which slots play, in this order:
 * <n+6 u16 LE> 08 80 <n u16 LE> <id_1> ... <id_n>. Reply 05 00 08 80 <s>; s != 0 is OK.
 */
export function buildSetProgramList(ids: readonly number[]): Uint8Array {
    return countedIdFrame(0x08, 0x80, ids);
}

/** [observed, deteParagramList] delete slots: <n+6 u16 LE> 02 01 <n u16 LE> <ids>. Success status is open. */
export function buildDeleteSlots(ids: readonly number[]): Uint8Array {
    return countedIdFrame(0x02, 0x01, ids);
}

/** [observed] delete everything stored on the panel. Reply 05 00 03 80 <s>; s != 0 is OK. */
export function buildDeleteAll(): Uint8Array {
    return new Uint8Array([0x04, 0x00, 0x03, 0x80]);
}

// ---------------------------------------------------------------------------
// Inspector helpers
// ---------------------------------------------------------------------------

export function toHexBytes(bytes: Uint8Array, limit = bytes.length): string {
    const shown = Array.from(bytes.subarray(0, limit), (b) => b.toString(16).padStart(2, '0')).join(' ');
    return bytes.length > limit ? `${shown} … (+${bytes.length - limit} bytes)` : shown;
}

export interface DescribedWindow {
    length: number;
    declaredLength: number;
    opcode: string;
    marker: string;
    totalSize: number;
    crc: string;
    listId: number;
}

export function describeWindow(window: Uint8Array): DescribedWindow {
    const v = new DataView(window.buffer, window.byteOffset, window.byteLength);
    return {
        length: window.length,
        declaredLength: v.getUint16(0, true),
        opcode: `${window[2].toString(16).padStart(2, '0')} ${window[3].toString(16).padStart(2, '0')}`,
        marker: window[4] === 0 ? 'first' : window[4] === 2 ? 'continuation' : `0x${window[4].toString(16)}`,
        totalSize: v.getUint32(5, true),
        crc: v.getUint32(9, true).toString(16).padStart(8, '0'),
        listId: window[14],
    };
}
