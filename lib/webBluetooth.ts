/**
 * Web Bluetooth Client for iPixel 96x16 LED Panels
 * Includes Console Performance Profiling & Micro-Burst GATT Chunking
 */

import { useSyncExternalStore } from 'react';
import {
    parseAck, classifyTransferAck, toHexBytes, splitForMtu, frameWindows,
    buildDeviceInfoRequest, parseDeviceInfo, DEFAULT_WINDOW_SIZE,
    buildSetProgramList, buildDeleteSlots, buildDeleteAll,
    PROGRAM_LIST_OPCODE_U16, DELETE_SLOTS_OPCODE_U16, DELETE_ALL_OPCODE_U16,
    SERVICE_UUID, WRITE_UUID, NOTIFY_UUID, PANEL_WIDTH, PANEL_HEIGHT, readImageSize,
    TEXT_OPCODE_U16, IMAGE_OPCODE, IMAGE_OPCODE_U16, GIF_OPCODE, GIF_OPCODE_U16,
    AckFrame, AckVerdict, DeviceInfo,
} from './ipixel/protocol';

/**
 * Bluetooth write size. The app starts at 182 (0xb6) and raises it to the negotiated maximum,
 * which Web Bluetooth does not expose, so we stay at the value every phone supports.
 */
const SAFE_WRITE_SIZE = 182;

export interface BLEState {
    connected: boolean;
    deviceName: string | null;
    /** what the panel reported on connect; null if it did not answer the device-info request */
    panel: DeviceInfo | null;
    statusText: string;
    isBusy: boolean;
    toastMessage: string | null;
}

type StateListener = (state: BLEState) => void;

/// <reference types="web-bluetooth" />
let device: BluetoothDevice | null = null;
let writeChar: BluetoothRemoteGATTCharacteristic | null = null;
let notifyChar: BluetoothRemoteGATTCharacteristic | null = null;

type NotifyListener = (frame: Uint8Array) => void;
const notifyListeners: Set<NotifyListener> = new Set();

/** Subscribe to every raw notification frame from the panel. Returns an unsubscribe function. */
export function onBLENotify(listener: NotifyListener): () => void {
    notifyListeners.add(listener);
    return () => {
        notifyListeners.delete(listener);
    };
}

const INITIAL_STATE: BLEState = {
    connected: false,
    deviceName: null,
    panel: null,
    statusText: "Disconnected",
    isBusy: false,
    toastMessage: null
};

let currentState: BLEState = {
    connected: false,
    deviceName: null,
    panel: null,
    statusText: "Disconnected",
    isBusy: false,
    toastMessage: null
};

const listeners: Set<StateListener> = new Set();
let toastTimeout: ReturnType<typeof setTimeout> | null = null;

function updateState(partial: Partial<BLEState>) {
    currentState = { ...currentState, ...partial };
    listeners.forEach(fn => fn(currentState));
}

export function showToast(msg: string) {
    if (toastTimeout) clearTimeout(toastTimeout);
    updateState({ toastMessage: msg });
    toastTimeout = setTimeout(() => {
        updateState({ toastMessage: null });
    }, 3500);
}

export function subscribeBLEState(listener: StateListener): () => void {
    listeners.add(listener);
    listener(currentState);
    return () => {
        listeners.delete(listener);
    };
}

export function getBLEState(): BLEState {
    return currentState;
}

export function isWebBluetoothSupported(): boolean {
    return typeof window !== 'undefined' && typeof navigator.bluetooth !== 'undefined';
}

export async function connectBLE(): Promise<boolean> {
    if (!isWebBluetoothSupported()) {
        const msg = "Web Bluetooth is not supported in this browser!\n• iOS: Open in 'Bluefy' app.\n• Android/Mac/Windows: Use Chrome or Edge.";
        showToast(msg);
        throw new Error(msg);
    }

    try {
        console.log("🔌 [BLE Debug] Requesting Bluetooth Device (LED_BLE)...");
        updateState({ statusText: "Scanning for BLE..." });
        const bluetooth = navigator.bluetooth;

        device = await bluetooth.requestDevice({
            filters: [{ namePrefix: "LED_BLE" }],
            optionalServices: [SERVICE_UUID, "0000fa00-0000-1000-8000-00805f9b34fb"]
        });

        device.addEventListener('gattserverdisconnected', () => {
            console.warn("🔌 [BLE Debug] GATT server disconnected.");
            device = null;
            writeChar = null;
            notifyChar = null;
            updateState({ connected: false, deviceName: null, panel: null, statusText: "Disconnected", isBusy: false });
            showToast("Bluetooth Disconnected");
        });

        console.log(`🔌 [BLE Debug] Connecting to GATT server on ${device.name}...`);
        updateState({ statusText: "Connecting GATT..." });
        if (!device.gatt) throw new Error("This Bluetooth device has no GATT server");
        const server = await device.gatt.connect();

        let service;
        try {
            service = await server.getPrimaryService(SERVICE_UUID);
        } catch {
            const services = await server.getPrimaryServices();
            service = services[0];
        }

        writeChar = await service.getCharacteristic(WRITE_UUID);
        console.log("🔌 [BLE Debug] Write Characteristic obtained:", WRITE_UUID, {
            properties: writeChar.properties
        });

        try {
            notifyChar = await service.getCharacteristic(NOTIFY_UUID);
            await notifyChar.startNotifications();
            notifyChar.addEventListener('characteristicvaluechanged', (e: Event) => {
                const dv = (e.target as BluetoothRemoteGATTCharacteristic).value!;
                const val = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength).slice();
                console.log("🔔 [BLE Debug] Received Notify ACK packet:", Array.from(val).map(b => b.toString(16).padStart(2, '0')).join(' '));
                notifyListeners.forEach((fn) => fn(val));
            });
            console.log("🔌 [BLE Debug] Notify Characteristic initialized:", NOTIFY_UUID);
        } catch (e) {
            console.log("🔌 [BLE Debug] Notify setup warning:", e);
        }

        const name = device.name || "iPixel Panel";
        updateState({ connected: true, deviceName: name, statusText: `Connected to ${name}` });
        const panel = notifyChar ? await requestDeviceInfo() : null;
        updateState({ panel });
        console.log("🔌 [BLE Debug] Panel info:", panel
            ? { screenCode: `0x${panel.screenCode.toString(16)}`, screenType: panel.screenType, windowSize: panel.windowSize, raw: toHexBytes(panel.raw) }
            : "no reply (using 4 KB windows)");
        showToast(`Connected to ${name}`);
        return true;
    } catch (e) {
        console.error("🔌 [BLE Debug] Connection error:", e);
        updateState({ connected: false, statusText: "Disconnected", isBusy: false });
        showToast("Connection canceled");
        throw e;
    }
}

export async function disconnectBLE(): Promise<void> {
    if (device && device.gatt && device.gatt.connected) {
        try {
            await device.gatt.disconnect();
        } catch (e) {
            console.error("Disconnect error:", e);
        }
    }
    device = null;
    writeChar = null;
    notifyChar = null;
    updateState({ connected: false, deviceName: null, panel: null, statusText: "Disconnected", isBusy: false });
    showToast("Disconnected Bluetooth");
}

/** Ask the panel for its device info (screen type, which sets the window size). Resolves null on timeout. */
async function requestDeviceInfo(timeoutMs = 2000): Promise<DeviceInfo | null> {
    let off: () => void = () => {};
    const reply = new Promise<DeviceInfo | null>((resolve) => {
        const timer = setTimeout(() => { off(); resolve(null); }, timeoutMs);
        off = onBLENotify((raw) => {
            const info = parseDeviceInfo(raw);
            if (!info) return;
            clearTimeout(timer);
            off();
            resolve(info);
        });
    });
    try {
        await sendRawCommandBLE(buildDeviceInfoRequest());
    } catch (e) {
        off();
        console.warn("🔌 [BLE Debug] Device info request failed:", e);
        return null;
    }
    return reply;
}

export async function sendRawCommandBLE(bytes: Uint8Array): Promise<void> {
    if (!writeChar) {
        showToast("Error: Connect Bluetooth first!");
        throw new Error("Bluetooth device not connected.");
    }
    const CHUNK = SAFE_WRITE_SIZE;
    const canWriteWithoutResponse = typeof writeChar.writeValueWithoutResponse === 'function';

    const tStart = performance.now();
    let chunksSent = 0;

    for (let i = 0; i < bytes.length; i += CHUNK) {
        const chunk = bytes.slice(i, i + CHUNK);
        if (canWriteWithoutResponse) {
            await writeChar.writeValueWithoutResponse(chunk);
        } else if (writeChar.writeValue) {
            await writeChar.writeValue(chunk);
        } else {
            await writeChar.writeValueWithResponse(chunk);
        }
        chunksSent++;
        await new Promise(r => setTimeout(r, 2));
    }

    const tEnd = performance.now();
    const elapsedSec = (tEnd - tStart) / 1000;
    const speedKBps = elapsedSec > 0 ? ((bytes.length / 1024) / elapsedSec).toFixed(1) : "N/A";

    console.log(`⚡ [BLE Debug] Sent chunk batch: ${bytes.length} bytes (${chunksSent} chunks) in ${(tEnd - tStart).toFixed(0)} ms (~${speedKBps} KB/s)`);
}

/** Defaults for image/GIF transfers, following the app (REA findings section 5.2). */
export const MEDIA_SEND_DEFAULTS = {
    mtu: SAFE_WRITE_SIZE,
    writeMode: 'auto' as WriteMode,
    interChunkDelayMs: 10,
    ackTimeoutMs: 6000,
    requireAck: true,
    maxRetries: 3,
};

/**
 * Send a PNG or GIF to the panel: frame it into windows sized for this panel, then send each
 * window and wait for the panel's reply (1 = next, 3 = done, 0 = restart, 2 = abort).
 */
export async function sendWindowFramesBLE(payloadBytes: Uint8Array, isGif = false, listId = 0, opts: { quiet?: boolean } = {}): Promise<void> {
    if (!writeChar) {
        showToast("Error: Connect Bluetooth first!");
        throw new Error("Bluetooth device not connected.");
    }
    const kind = isGif ? 'GIF' : 'Image';
    const dims = readImageSize(payloadBytes);
    if (!dims || dims.width !== PANEL_WIDTH || dims.height !== PANEL_HEIGHT) {
        // The app refuses anything that is not exactly the panel size (REA 6.2); the panel keeps the old content.
        const got = dims ? `${dims.width}×${dims.height}` : 'an unreadable image';
        showToast(`Not sent: the screen needs ${PANEL_WIDTH}×${PANEL_HEIGHT}, this is ${got}`);
        throw new Error(`Image must be ${PANEL_WIDTH}x${PANEL_HEIGHT}, got ${got}`);
    }
    const windowSize = currentState.panel?.windowSize ?? DEFAULT_WINDOW_SIZE;
    const windows = frameWindows(payloadBytes, {
        windowSize,
        listId,
        legacyLengthField: false,
        opcode: isGif ? GIF_OPCODE : IMAGE_OPCODE,
        typeByte: isGif ? 0x02 : 0x00,
    });
    const started = performance.now();
    console.log(`📡 [BLE Debug] Sending ${kind}: ${payloadBytes.length} bytes in ${windows.length} window(s) of ${windowSize}`);
    try {
        const res = await sendNativeWindowsBLE(windows, {
            ...MEDIA_SEND_DEFAULTS,
            opcode: isGif ? GIF_OPCODE_U16 : IMAGE_OPCODE_U16,
            busyText: `Sending ${kind.toLowerCase()} (${Math.round(payloadBytes.length / 1024)} KB)…`,
            onProgress: (p) => updateState({ statusText: `Sending ${kind.toLowerCase()}: ${p.message}` }),
        });
        const secs = (performance.now() - started) / 1000;
        console.log(`✅ [BLE Debug] ${kind} sent in ${secs.toFixed(2)} s, ${res.attempts} attempt(s), replies: ${res.acks.join(' | ')}`);
        if (!opts.quiet) showToast(isGif ? "GIF Sent to Screen!" : "Image Sent to Screen!");
    } catch (e) {
        console.error("❌ [BLE Debug] Send failed:", e);
        if (!opts.quiet) showToast(`Failed to send to screen: ${e instanceof Error ? e.message : 'unknown error'}`);
        throw e;
    }
}

export async function setBrightnessBLE(level: number): Promise<void> {
    await sendRawCommandBLE(new Uint8Array([5, 0, 4, 0x80, level]));
    showToast(`Brightness set to ${level}%`);
}

export async function setClockBLE(): Promise<void> {
    const now = new Date();
    await sendRawCommandBLE(new Uint8Array([
        11, 0, 6, 1, 1, 1, 1,
        now.getFullYear() % 100,
        now.getMonth() + 1,
        now.getDate(),
        now.getDay() || 7
    ]));
    showToast("Clock Mode active");
}

// ---------------------------------------------------------------------------
// Native text transfer (windows built by lib/ipixel/protocol.ts)
// ---------------------------------------------------------------------------

export type WriteMode = 'auto' | 'response' | 'noresponse';

export interface NativeSendOptions {
    /** transfer opcode the panel echoes in its replies (u16 LE of header bytes 2-3); defaults to text */
    opcode?: number;
    /** status text while sending */
    busyText?: string;
    /** max bytes per GATT write */
    mtu: number;
    writeMode: WriteMode;
    /** pause between GATT writes */
    interChunkDelayMs: number;
    /** how long to wait for the panel's reply to each window */
    ackTimeoutMs: number;
    /** fail if the panel does not acknowledge a window (recommended) */
    requireAck: boolean;
    /** extra full attempts after a "failure" (status 0) reply; the app allows 3 */
    maxRetries: number;
    onProgress?: (p: { window: number; windows: number; attempt: number; message: string }) => void;
}

export interface NativeSendResult {
    attempts: number;
    /** hex of every acknowledgement frame received */
    acks: string[];
}

function getWriteCapabilities(): { response: boolean; noResponse: boolean } | null {
    if (!writeChar) return null;
    const p = writeChar.properties || {};
    return { response: !!p.write, noResponse: !!p.writeWithoutResponse };
}

function resolveWriteMode(mode: WriteMode): 'response' | 'noresponse' {
    const caps = getWriteCapabilities() ?? { response: true, noResponse: false };
    if (mode === 'response') return caps.response ? 'response' : 'noresponse';
    if (mode === 'noresponse') return caps.noResponse ? 'noresponse' : 'response';
    // auto: the app prefers write-without-response when the characteristic offers it
    return caps.noResponse ? 'noresponse' : 'response';
}

async function writePieces(bytes: Uint8Array, opts: NativeSendOptions): Promise<void> {
    if (!writeChar) throw new Error('Bluetooth device not connected.');
    const mode = resolveWriteMode(opts.writeMode);
    for (const part of splitForMtu(bytes, opts.mtu)) {
        // copy into a plain ArrayBuffer-backed view (Web Bluetooth rejects shared buffers)
        const piece = new Uint8Array(part);
        if (mode === 'noresponse' && typeof writeChar.writeValueWithoutResponse === 'function') {
            await writeChar.writeValueWithoutResponse(piece);
        } else if (typeof writeChar.writeValueWithResponse === 'function') {
            await writeChar.writeValueWithResponse(piece);
        } else {
            await writeChar.writeValue(piece);
        }
        if (opts.interChunkDelayMs > 0) await new Promise((r) => setTimeout(r, opts.interChunkDelayMs));
    }
}

type AckOutcome = { verdict: AckVerdict | 'timeout'; frame?: AckFrame };

/** Start listening *before* writing so a fast reply cannot be missed. */
function createAckWaiter(timeoutMs: number, opcode: number): { promise: Promise<AckOutcome>; cancel: () => void } {
    let off: () => void = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<AckOutcome>((resolve) => {
        timer = setTimeout(() => {
            off();
            resolve({ verdict: 'timeout' });
        }, timeoutMs);
        off = onBLENotify((raw) => {
            const frame = parseAck(raw);
            if (!frame) return;
            const verdict = classifyTransferAck(frame, opcode);
            if (verdict === 'ignore') return;
            if (timer) clearTimeout(timer);
            off();
            resolve({ verdict, frame });
        });
    });
    return {
        promise,
        cancel: () => {
            if (timer) clearTimeout(timer);
            off();
        },
    };
}

class RetryableTransferError extends Error {}

/**
 * Send pre-framed windows, waiting for the panel's `05 00 <opcode> <status>`
 * reply after each one: 1 = next window, 3 = done, 0 = restart (up to maxRetries),
 * 2 = abort. A missing reply is an error unless requireAck is off.
 */
export async function sendNativeWindowsBLE(windows: Uint8Array[], opts: NativeSendOptions): Promise<NativeSendResult> {
    if (!writeChar) {
        showToast('Error: Connect Bluetooth first!');
        throw new Error('Bluetooth device not connected.');
    }
    const acks: string[] = [];
    let attempt = 0;
    const idle = `Connected to ${currentState.deviceName}`;
    const opcode = opts.opcode ?? TEXT_OPCODE_U16;
    updateState({ isBusy: true, statusText: opts.busyText ?? 'Sending text…' });
    try {
        for (;;) {
            attempt++;
            try {
                for (let i = 0; i < windows.length; i++) {
                    opts.onProgress?.({
                        window: i + 1,
                        windows: windows.length,
                        attempt,
                        message: `Window ${i + 1}/${windows.length}${attempt > 1 ? ` (attempt ${attempt})` : ''}`,
                    });
                    const waiter = opts.requireAck ? createAckWaiter(opts.ackTimeoutMs, opcode) : null;
                    try {
                        await writePieces(windows[i], opts);
                    } catch (e) {
                        waiter?.cancel();
                        throw e;
                    }
                    if (!waiter) {
                        if (i < windows.length - 1) await new Promise((r) => setTimeout(r, 30));
                        continue;
                    }
                    const res = await waiter.promise;
                    if (res.frame) acks.push(toHexBytes(res.frame.raw));
                    if (res.verdict === 'timeout') {
                        throw new Error(
                            `No acknowledgement from the panel for window ${i + 1}/${windows.length} within ${opts.ackTimeoutMs} ms. ` +
                                'If the panel never replies, turn off "Require acknowledgement" in Advanced.'
                        );
                    }
                    if (res.verdict === 'retry') throw new RetryableTransferError('Panel reported a failed transfer (status 0).');
                    if (res.verdict === 'abort') throw new Error('Panel aborted the transfer (status 2).');
                    if (res.verdict === 'complete') break;
                }
                return { attempts: attempt, acks };
            } catch (e) {
                if (e instanceof RetryableTransferError && attempt <= opts.maxRetries) continue;
                throw e;
            }
        }
    } finally {
        updateState({ isBusy: false, statusText: currentState.connected ? idle : 'Disconnected' });
    }
}

// ---------------------------------------------------------------------------
// Program list (playlist) on the panel. REA findings section 6.
// ---------------------------------------------------------------------------

/** Send a short command and wait for the panel's `05 00 <opcode> <status>` reply. Resolves the status byte. */
export async function sendCommandAwaitReply(bytes: Uint8Array, opcode: number, timeoutMs = 5000): Promise<number> {
    let off: () => void = () => {};
    const reply = new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => { off(); reject(new Error(`No reply from the panel within ${timeoutMs} ms`)); }, timeoutMs);
        off = onBLENotify((raw) => {
            const frame = parseAck(raw);
            if (!frame || frame.opcode !== opcode) return;
            clearTimeout(timer);
            off();
            resolve(frame.status);
        });
    });
    try {
        await sendRawCommandBLE(bytes);
    } catch (e) {
        off();
        throw e;
    }
    return reply;
}

/** Tell the panel which slots to play, in order. The app treats a non-zero reply as success. */
export async function setProgramListBLE(slots: number[]): Promise<number> {
    const status = await sendCommandAwaitReply(buildSetProgramList(slots), PROGRAM_LIST_OPCODE_U16);
    console.log(`🎞️ [BLE Debug] Program list [${slots.join(', ')}] -> status ${status}`);
    if (status === 0) throw new Error('Panel rejected the program list (status 0)');
    return status;
}

/** Delete stored slots. Which reply status means success is not known yet, so it is returned as-is. */
export async function deleteSlotsBLE(slots: number[]): Promise<number> {
    const status = await sendCommandAwaitReply(buildDeleteSlots(slots), DELETE_SLOTS_OPCODE_U16);
    console.log(`🗑️ [BLE Debug] Delete slots [${slots.join(', ')}] -> status ${status}`);
    return status;
}

export async function deleteAllSlotsBLE(): Promise<number> {
    const status = await sendCommandAwaitReply(buildDeleteAll(), DELETE_ALL_OPCODE_U16);
    console.log(`🗑️ [BLE Debug] Delete all -> status ${status}`);
    return status;
}

export type PlaylistUploadItem = { kind: 'image' | 'gif'; bytes: Uint8Array };

type TestBuildSpec =
    | { type: 'scroll'; url: string; pxPerSecond?: number; stepPx?: number; wrap?: boolean; colours?: number }
    | { type: 'strip'; urls: string[]; pxPerSecond?: number; stepPx?: number; wrap?: boolean; colours?: number }
    | { type: 'still'; url: string; seconds?: number; fit?: 'cover' | 'contain'; colours?: number };

/**
 * The app's sequence (REA 6.5): set the program list to slots 1..n, then upload each item
 * into its slot, waiting for the panel to finish each one before the next.
 */
export async function uploadPlaylistBLE(items: PlaylistUploadItem[], firstSlot = 1): Promise<number[]> {
    const slots = items.map((_, i) => firstSlot + i);
    await setProgramListBLE(slots);
    for (let i = 0; i < items.length; i++) {
        updateState({ statusText: `Uploading playlist item ${i + 1}/${items.length}…` });
        await sendWindowFramesBLE(items[i].bytes, items[i].kind === 'gif', slots[i]);
    }
    return slots;
}

// Temporary console hook for hardware tests, e.g. in DevTools:
//   await __ipixel.testPlaylist(['/uploads/a.gif', '/uploads/b.gif'])
//   await __ipixel.setProgramList([2])      // show only slot 2
//   await __ipixel.deleteSlots([1, 2])
if (typeof window !== 'undefined') {
    const fetchItem = async (url: string): Promise<PlaylistUploadItem> => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not fetch ${url}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const isGif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
        return { kind: isGif ? 'gif' : 'image', bytes };
    };
    (window as unknown as { __ipixel: unknown }).__ipixel = {
        setProgramList: setProgramListBLE,
        deleteSlots: deleteSlotsBLE,
        deleteAll: deleteAllSlotsBLE,
        sendCommandAwaitReply,
        testPlaylist: async (urls: string[], firstSlot = 1) => uploadPlaylistBLE(await Promise.all(urls.map(fetchItem)), firstSlot),
        /**
         * Build panel-safe GIFs in the browser from original images, then upload them as a playlist:
         *   await __ipixel.testBuild([{ type: 'scroll', url, pxPerSecond: 16, wrap: true },
         *                             { type: 'strip', urls: [a, b] }, { type: 'still', url, seconds: 8 }])
         */
        testBuild: async (specs: TestBuildSpec[]) => {
            const [{ buildScrollGif, buildStillGif, stackStrips }, { loadScrollStrip, loadStillFrame }] = await Promise.all([
                import('./ipixel/panelGif'),
                import('./ipixel/imageStrip'),
            ]);
            const items: PlaylistUploadItem[] = [];
            for (const spec of specs) {
                const t0 = performance.now();
                let built;
                if (spec.type === 'still') built = buildStillGif(await loadStillFrame(spec.url, spec.fit ?? 'cover'), spec.seconds ?? 8, spec.colours);
                else {
                    const strip = spec.type === 'strip'
                        ? stackStrips(await Promise.all(spec.urls.map(loadScrollStrip)))
                        : await loadScrollStrip(spec.url);
                    built = buildScrollGif(strip, { colours: spec.colours, pxPerSecond: spec.pxPerSecond, stepPx: spec.stepPx, wrap: spec.wrap ?? spec.type === 'strip' });
                }
                console.log(`🧪 [Build] ${spec.type}: ${built.frames} frames, ${(built.durationMs / 1000).toFixed(1)} s, ${(built.bytes.length / 1024).toFixed(1)} KB, built in ${(performance.now() - t0).toFixed(0)} ms`);
                items.push({ kind: 'gif', bytes: built.bytes });
            }
            return uploadPlaylistBLE(items);
        },
        state: getBLEState,
    };
}

/** React hook: the live Bluetooth connection state. */
export function useBLEState(): BLEState {
    return useSyncExternalStore(
        (cb) => subscribeBLEState(() => cb()),
        getBLEState,
        () => INITIAL_STATE,
    );
}
