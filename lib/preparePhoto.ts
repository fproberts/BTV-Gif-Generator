'use client';

/**
 * Get a picture from the phone ready to upload. Camera photos are often 3-12 MB and 4000 px
 * wide; the screen only needs 96 px and the library 1600 px at most, so they are shrunk here
 * (faster on weak signal). GIFs are kept as they are (shrinking would lose the animation).
 */

import { sniffImage, type ImageKind } from './imageType';

const MAX_SIDE = 1600;
/** Small enough to send as it is. */
const KEEP_BYTES = 1.5 * 1024 * 1024;
const MAX_GIF_BYTES = 20 * 1024 * 1024;

export type Prepared = { ok: true; file: File; name: string } | { ok: false; error: string };

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
    if ('createImageBitmap' in window) {
        try {
            // applies the photo's rotation (EXIF orientation)
            const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
            return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
        } catch {
            /* fall back to <img> */
        }
    }
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch (e) {
        URL.revokeObjectURL(url);
        throw e;
    }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, '').trim() || 'Picture';

export async function preparePhoto(file: File): Promise<Prepared> {
    const kind: ImageKind | null = sniffImage(new Uint8Array(await file.slice(0, 32).arrayBuffer()));
    const name = baseName(file.name);

    if (kind === 'gif') {
        return file.size > MAX_GIF_BYTES ? { ok: false, error: 'GIFs can be 20 MB at most.' } : { ok: true, file, name };
    }

    let image;
    try {
        image = await decode(file);
    } catch {
        if (kind === 'heic') return { ok: false, error: 'This phone saved it as HEIC, which the browser can’t read. Turn off “High efficiency pictures” in the camera settings, or send a screenshot of it.' };
        return { ok: false, error: kind ? 'This picture couldn’t be read.' : 'That file isn’t a picture.' };
    }

    try {
        const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
        const plainEnough = (kind === 'png' || kind === 'jpeg' || kind === 'webp') && scale === 1 && file.size <= KEEP_BYTES;
        if (plainEnough) return { ok: true, file, name };

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);

        // WebP keeps transparency; browsers that can't make WebP give PNG back, so use JPEG then
        let blob = await toBlob(canvas, 'image/webp', 0.9);
        if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.9);
        if (!blob) return { ok: false, error: 'This picture couldn’t be prepared.' };
        const ext = blob.type === 'image/webp' ? '.webp' : '.jpg';
        return { ok: true, file: new File([blob], `${name}${ext}`, { type: blob.type }), name };
    } finally {
        image.close();
    }
}
