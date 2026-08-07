/**
 * Web Bluetooth Client for iPixel 96x16 LED Panels
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

function waitForNotifyAck(timeoutMs = 1000): Promise<void> {
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
        updateState({ statusText: "Scanning for BLE..." });
        const bluetooth = (navigator as any).bluetooth;

        device = await bluetooth.requestDevice({
            filters: [{ namePrefix: "LED_BLE" }],
            optionalServices: [SERVICE_UUID, "0000fa00-0000-1000-8000-00805f9b34fb"]
        });

        device.addEventListener('gattserverdisconnected', () => {
            device = null;
            writeChar = null;
            notifyChar = null;
            updateState({ connected: false, deviceName: null, statusText: "Disconnected", isBusy: false });
            showToast("Bluetooth Disconnected");
        });

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
        try {
            notifyChar = await service.getCharacteristic(NOTIFY_UUID);
            await notifyChar.startNotifications();
            notifyChar.addEventListener('characteristicvaluechanged', (e: any) => {
                const val = new Uint8Array(e.target.value.buffer);
                if (val.length >= 5 && val[0] === 0x05) {
                    if (notifyAckResolver) {
                        notifyAckResolver();
                        notifyAckResolver = null;
                    }
                }
            });
        } catch (e) {
            console.log("Notify setup warning:", e);
        }

        const name = device.name || "iPixel Panel";
        updateState({ connected: true, deviceName: name, statusText: `Connected to ${name}` });
        showToast(`Connected to ${name}`);
        return true;
    } catch (e: any) {
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
    for (let i = 0; i < bytes.length; i += CHUNK) {
        const chunk = bytes.slice(i, i + CHUNK);
        if (writeChar.writeValueWithResponse) {
            await writeChar.writeValueWithResponse(chunk);
        } else {
            await writeChar.writeValue(chunk);
        }
        await new Promise(r => setTimeout(r, 20));
    }
}

export async function sendWindowFramesBLE(payloadBytes: Uint8Array, isGif = false): Promise<void> {
    if (!writeChar) {
        showToast("Error: Connect Bluetooth first!");
        throw new Error("Bluetooth device not connected.");
    }

    const totalSize = payloadBytes.length;
    const crcVal = crc32(payloadBytes);

    const cmdByte = isGif ? 0x03 : 0x02;
    const typeByte = isGif ? 0x02 : 0x00;

    let pos = 0;
    let windowIndex = 0;
    const totalWindows = Math.ceil(totalSize / WINDOW_SIZE) || 1;

    updateState({ isBusy: true, statusText: `Streaming ${isGif ? 'GIF' : 'Image'} (${Math.round(totalSize / 1024)} KB)...` });

    try {
        while (pos < totalSize) {
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

            if (totalWindows > 1) {
                updateState({ statusText: `Streaming window ${windowIndex + 1}/${totalWindows}...` });
            }

            await sendRawCommandBLE(fullMsg);

            // If there are more windows, wait for hardware notify ACK
            if (pos + WINDOW_SIZE < totalSize) {
                await waitForNotifyAck(800);
            }

            windowIndex++;
            pos = windowEnd;
        }

        updateState({ isBusy: false, statusText: `Connected to ${currentState.deviceName}` });
        showToast(isGif ? "GIF Sent to Screen!" : "Image Sent to Screen!");
    } catch (e: any) {
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
    const response = await fetch(url);
    if (!response.ok) {
        showToast("Error fetching media URL");
        throw new Error(`Failed to fetch media from ${url}`);
    }
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Optimization: If pre-uploaded GIF is > 40 KB (large server file), render client-side to 15 KB!
    if (isGif && bytes.length > 40000) {
        showToast("Fast-optimizing image for Bluetooth...");
        const targetSrc = fallbackImageUrl || url;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = targetSrc;
        await img.decode();

        const fastGifBytes = await generateClientScrollingGif(img, 96, 16, 2, 80);
        await sendWindowFramesBLE(fastGifBytes, true);
        return;
    }

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
