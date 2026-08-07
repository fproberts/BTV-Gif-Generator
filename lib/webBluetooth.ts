/**
 * Web Bluetooth Client for iPixel 96x16 LED Panels
 */

const SERVICE_UUID = "000000fa-0000-1000-8000-00805f9b34fb";
const WRITE_UUID = "0000fa02-0000-1000-8000-00805f9b34fb";
const NOTIFY_UUID = "0000fa03-0000-1000-8000-00805f9b34fb";

export interface BLEState {
    connected: boolean;
    deviceName: string | null;
    statusText: string;
    isBusy: boolean;
}

type StateListener = (state: BLEState) => void;

let device: any = null;
let writeChar: any = null;
let notifyChar: any = null;
let currentState: BLEState = {
    connected: false,
    deviceName: null,
    statusText: "Disconnected",
    isBusy: false
};

const listeners: Set<StateListener> = new Set();

function updateState(partial: Partial<BLEState>) {
    currentState = { ...currentState, ...partial };
    listeners.forEach(fn => fn(currentState));
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

export async function connectBLE(): Promise<boolean> {
    if (!isWebBluetoothSupported()) {
        throw new Error(
            "Web Bluetooth is not supported in this browser!\n\n" +
            "• iOS (iPhone/iPad): Open in the free 'Bluefy' app from the App Store.\n" +
            "• Android/Mac/Windows: Use Google Chrome or MS Edge."
        );
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
        } catch (e) {
            console.log("Notify setup warning:", e);
        }

        const name = device.name || "iPixel Panel";
        updateState({ connected: true, deviceName: name, statusText: `Connected to ${name}` });
        return true;
    } catch (e: any) {
        updateState({ connected: false, statusText: "Disconnected", isBusy: false });
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
}

export async function sendRawCommandBLE(bytes: Uint8Array): Promise<void> {
    if (!writeChar) {
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
        throw new Error("Bluetooth device not connected.");
    }

    updateState({ isBusy: true, statusText: `Streaming ${isGif ? 'GIF' : 'Image'}...` });

    try {
        const totalSize = payloadBytes.length;
        const crcVal = crc32(payloadBytes);

        const cmdByte = isGif ? 0x03 : 0x02;
        const typeByte = isGif ? 0x02 : 0x00;

        const header = new Uint8Array(13);
        header[0] = cmdByte;
        header[1] = 0x00;
        header[2] = 0x00;

        new DataView(header.buffer).setUint32(3, totalSize, true);
        new DataView(header.buffer).setUint32(7, crcVal, true);
        header[11] = typeByte;
        header[12] = 0x00;

        const frame = new Uint8Array(header.length + totalSize);
        frame.set(header, 0);
        frame.set(payloadBytes, header.length);

        const prefix = new Uint8Array(2);
        new DataView(prefix.buffer).setUint16(0, frame.length + 2, true);

        const fullMsg = new Uint8Array(prefix.length + frame.length);
        fullMsg.set(prefix, 0);
        fullMsg.set(frame, prefix.length);

        await sendRawCommandBLE(fullMsg);
        updateState({ isBusy: false, statusText: `Connected to ${currentState.deviceName}` });
    } catch (e) {
        updateState({ isBusy: false, statusText: `Connected to ${currentState.deviceName}` });
        throw e;
    }
}

export function renderTextPNG(text: string, textColor: string, bgColor: string): Promise<Uint8Array> {
    return new Promise((resolve) => {
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 16;
        const ctx = canvas.getContext("2d");

        if (ctx) {
            ctx.fillStyle = bgColor.startsWith("#") ? bgColor : `#${bgColor}`;
            ctx.fillRect(0, 0, 96, 16);

            ctx.fillStyle = textColor.startsWith("#") ? textColor : `#${textColor}`;
            ctx.font = "bold 13px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, 48, 8);
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

export async function sendUrlBLE(url: string, isGif = false): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch media from ${url}`);
    }
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (!isGif) {
        // Render image onto 96x16 canvas
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        await img.decode();

        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 16;
        const ctx = canvas.getContext("2d");
        if (ctx) {
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
}

export async function clearMemoryBLE(): Promise<void> {
    await sendRawCommandBLE(new Uint8Array([4, 0, 3, 0x80]));
}
