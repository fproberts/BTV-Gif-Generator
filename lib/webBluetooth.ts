/**
 * Web Bluetooth Client for iPixel 96x16 LED Panels
 * Includes Console Performance Profiling & Micro-Burst GATT Chunking
 */

import { generateClientScrollingGif } from './clientGifGenerator';

const SERVICE_UUID = "000000fa-0000-1000-8000-00805f9b34fb";
const WRITE_UUID = "0000fa02-0000-1000-8000-00805f9b34fb";
const NOTIFY_UUID = "0000fa03-0000-1000-8000-00805f9b34fb";
const WINDOW_SIZE = 12288; // 12 KB per window frame

export interface BLEState {
    connected: boolean;
    deviceName: string | null;
    statusText: string;
    isBusy: boolean;
    toastMessage: string | null;
}

type StateListener = (state: BLEState) => void;

let device: any = null;
let writeChar: any = null;
let notifyChar: any = null;
let notifyAckResolver: (() => void) | null = null;

let currentState: BLEState = {
    connected: false,
    deviceName: null,
    statusText: "Disconnected",
    isBusy: false,
    toastMessage: null
};

const listeners: Set<StateListener> = new Set();
let toastTimeout: any = null;

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
    return typeof window !== 'undefined' && typeof (navigator as any).bluetooth !== 'undefined';
}

function crc32(bytes: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
        crc ^= bytes[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
    let c = hex.replace("#", "");
    if (c.length === 3) c = c.split("").map(x => x + x).join("");
    const num = parseInt(c, 16);
    if (isNaN(num)) return { r: 255, g: 255, b: 255 };
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

function waitForNotifyAck(timeoutMs = 800): Promise<void> {
    return new Promise<void>((resolve) => {
        let timer = setTimeout(() => {
            notifyAckResolver = null;
            resolve();
        }, timeoutMs);

        notifyAckResolver = () => {
            clearTimeout(timer);
            resolve();
        };
    });
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
        const bluetooth = (navigator as any).bluetooth;

        device = await bluetooth.requestDevice({
            filters: [{ namePrefix: "LED_BLE" }],
            optionalServices: [SERVICE_UUID, "0000fa00-0000-1000-8000-00805f9b34fb"]
        });

        device.addEventListener('gattserverdisconnected', () => {
            console.warn("🔌 [BLE Debug] GATT server disconnected.");
            device = null;
            writeChar = null;
            notifyChar = null;
            updateState({ connected: false, deviceName: null, statusText: "Disconnected", isBusy: false });
            showToast("Bluetooth Disconnected");
        });

        console.log(`🔌 [BLE Debug] Connecting to GATT server on ${device.name}...`);
        updateState({ statusText: "Connecting GATT..." });
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
            notifyChar.addEventListener('characteristicvaluechanged', (e: any) => {
                const val = new Uint8Array(e.target.value.buffer);
                console.log("🔔 [BLE Debug] Received Notify ACK packet:", Array.from(val).map(b => b.toString(16).padStart(2, '0')).join(' '));
                if (val.length >= 5 && val[0] === 0x05) {
                    if (notifyAckResolver) {
                        notifyAckResolver();
                        notifyAckResolver = null;
                    }
                }
            });
            console.log("🔌 [BLE Debug] Notify Characteristic initialized:", NOTIFY_UUID);
        } catch (e) {
            console.log("🔌 [BLE Debug] Notify setup warning:", e);
        }

        const name = device.name || "iPixel Panel";
        updateState({ connected: true, deviceName: name, statusText: `Connected to ${name}` });
        showToast(`Connected to ${name}`);
        return true;
    } catch (e: any) {
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
    updateState({ connected: false, deviceName: null, statusText: "Disconnected", isBusy: false });
    showToast("Disconnected Bluetooth");
}

export async function sendRawCommandBLE(bytes: Uint8Array): Promise<void> {
    if (!writeChar) {
        showToast("Error: Connect Bluetooth first!");
        throw new Error("Bluetooth device not connected.");
    }
    const CHUNK = 244;
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

        // Micro-bursting: throttling delay every 2 chunks to maximize throughput
        if (chunksSent % 2 === 0) {
            await new Promise(r => setTimeout(r, 4));
        }
    }

    const tEnd = performance.now();
    const elapsedSec = (tEnd - tStart) / 1000;
    const speedKBps = elapsedSec > 0 ? ((bytes.length / 1024) / elapsedSec).toFixed(1) : "N/A";

    console.log(`⚡ [BLE Debug] Sent chunk batch: ${bytes.length} bytes (${chunksSent} chunks) in ${(tEnd - tStart).toFixed(0)} ms (~${speedKBps} KB/s)`);
}

export async function sendWindowFramesBLE(payloadBytes: Uint8Array, isGif = false): Promise<void> {
    if (!writeChar) {
        showToast("Error: Connect Bluetooth first!");
        throw new Error("Bluetooth device not connected.");
    }

    console.group("📡 [BLE Media Stream Debug]");
    const streamStart = performance.now();

    const totalSize = payloadBytes.length;
    const crcVal = crc32(payloadBytes);

    const cmdByte = isGif ? 0x03 : 0x02;
    const typeByte = isGif ? 0x02 : 0x00;

    let pos = 0;
    let windowIndex = 0;
    const totalWindows = Math.ceil(totalSize / WINDOW_SIZE) || 1;

    console.log(`[BLE Debug] Starting Stream: Type=${isGif ? 'GIF' : 'PNG'}, Total Size=${totalSize} bytes (${(totalSize/1024).toFixed(1)} KB), Windows=${totalWindows}, CRC32=0x${crcVal.toString(16).toUpperCase()}`);

    updateState({ isBusy: true, statusText: `Streaming ${isGif ? 'GIF' : 'Image'} (${Math.round(totalSize / 1024)} KB)...` });

    try {
        while (pos < totalSize) {
            const windowStart = performance.now();
            const windowEnd = Math.min(pos + WINDOW_SIZE, totalSize);
            const chunkData = payloadBytes.subarray(pos, windowEnd);

            const option = (windowIndex === 0) ? 0x00 : 0x02;

            const header = new Uint8Array(13);
            header[0] = cmdByte;
            header[1] = 0x00;
            header[2] = option;

            new DataView(header.buffer).setUint32(3, totalSize, true);
            new DataView(header.buffer).setUint32(7, crcVal, true);
            header[11] = typeByte;
            header[12] = 0x00;

            const frame = new Uint8Array(header.length + chunkData.length);
            frame.set(header, 0);
            frame.set(chunkData, header.length);

            const prefix = new Uint8Array(2);
            new DataView(prefix.buffer).setUint16(0, frame.length + 2, true);

            const fullMsg = new Uint8Array(prefix.length + frame.length);
            fullMsg.set(prefix, 0);
            fullMsg.set(frame, prefix.length);

            const pct = Math.round(((windowIndex + 1) / totalWindows) * 100);
            console.log(`[BLE Debug] Window ${windowIndex + 1}/${totalWindows} (${fullMsg.length} bytes, Option 0x${option.toString(16)})...`);
            updateState({ statusText: `Streaming ${isGif ? 'GIF' : 'Image'}: ${pct}% (Window ${windowIndex + 1}/${totalWindows})...` });

            await sendRawCommandBLE(fullMsg);

            if (pos + WINDOW_SIZE < totalSize) {
                const ackStart = performance.now();
                await waitForNotifyAck(800);
                console.log(`[BLE Debug] Window ${windowIndex + 1} ACK wait time: ${(performance.now() - ackStart).toFixed(0)} ms`);
            }

            const windowTime = (performance.now() - windowStart).toFixed(0);
            console.log(`[BLE Debug] Window ${windowIndex + 1} finished in ${windowTime} ms`);

            windowIndex++;
            pos = windowEnd;
        }

        const totalTimeSec = ((performance.now() - streamStart) / 1000).toFixed(2);
        console.log(`✅ [BLE Debug] Media stream COMPLETE! Total elapsed time: ${totalTimeSec} seconds (${(totalSize / 1024 / parseFloat(totalTimeSec)).toFixed(1)} KB/s avg)`);
        console.groupEnd();

        updateState({ isBusy: false, statusText: `Connected to ${currentState.deviceName}` });
        showToast(isGif ? "GIF Sent to Screen!" : "Image Sent to Screen!");
    } catch (e: any) {
        console.error("❌ [BLE Debug] Stream failed:", e);
        console.groupEnd();
        updateState({ isBusy: false, statusText: `Connected to ${currentState.deviceName}` });
        showToast("Failed to send to screen");
        throw e;
    }
}

/**
 * Render text to PNG with Crisp Pixel Thresholding
 */
export function renderTextPNG(text: string, textColor: string, bgColor: string): Promise<Uint8Array> {
    return new Promise((resolve) => {
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 16;
        const ctx = canvas.getContext("2d");

        if (ctx) {
            ctx.imageSmoothingEnabled = false;

            const bgRgb = parseHexColor(bgColor);
            ctx.fillStyle = `rgb(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b})`;
            ctx.fillRect(0, 0, 96, 16);

            const textRgb = parseHexColor(textColor);
            ctx.fillStyle = `rgb(${textRgb.r}, ${textRgb.g}, ${textRgb.b})`;
            ctx.font = "bold 12px Arial, Helvetica, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, 48, 8.5);

            const imgData = ctx.getImageData(0, 0, 96, 16);
            const data = imgData.data;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
                const diff = Math.abs(r - bgRgb.r) + Math.abs(g - bgRgb.g) + Math.abs(b - bgRgb.b);

                if (a > 60 && diff > 50) {
                    data[i] = textRgb.r;
                    data[i + 1] = textRgb.g;
                    data[i + 2] = textRgb.b;
                    data[i + 3] = 255;
                } else {
                    data[i] = bgRgb.r;
                    data[i + 1] = bgRgb.g;
                    data[i + 2] = bgRgb.b;
                    data[i + 3] = 255;
                }
            }

            ctx.putImageData(imgData, 0, 0);
        }

        canvas.toBlob(async (blob) => {
            if (blob) {
                const buf = await blob.arrayBuffer();
                resolve(new Uint8Array(buf));
            } else {
                resolve(new Uint8Array(0));
            }
        }, "image/png");
    });
}

export async function sendTextBLE(text: string, textColor: string, bgColor: string): Promise<void> {
    const pngBytes = await renderTextPNG(text, textColor, bgColor);
    await sendWindowFramesBLE(pngBytes, false);
}

export async function sendUrlBLE(url: string, isGif = false, fallbackImageUrl?: string): Promise<void> {
    console.log(`🌐 [BLE Debug] sendUrlBLE called with url: "${url}", isGif: ${isGif}`);
    const fetchStart = performance.now();

    const response = await fetch(url);
    if (!response.ok) {
        showToast("Error fetching media URL");
        throw new Error(`Failed to fetch media from ${url}`);
    }
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    console.log(`🌐 [BLE Debug] Media fetched in ${(performance.now() - fetchStart).toFixed(0)} ms. Size: ${bytes.length} bytes (${(bytes.length/1024).toFixed(1)} KB)`);

    if (!isGif) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = URL.createObjectURL(blob);
        await img.decode();

        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 16;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, 96, 16);
        }

        const pngBytes = await new Promise<Uint8Array>((resolve) => {
            canvas.toBlob(async (b) => {
                if (b) {
                    const buf = await b.arrayBuffer();
                    resolve(new Uint8Array(buf));
                } else {
                    resolve(new Uint8Array(0));
                }
            }, "image/png");
        });

        await sendWindowFramesBLE(pngBytes, false);
    } else {
        await sendWindowFramesBLE(bytes, true);
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

export async function clearMemoryBLE(): Promise<void> {
    await sendRawCommandBLE(new Uint8Array([4, 0, 3, 0x80]));
    showToast("Cleared Screen Memory");
}
