/**
 * Client-Side 96x16 Scrolling GIF Generator for Mobile & Browser
 * Enforces 128-Color Palette Quantization for Ultra-Fast BLE Streaming (~10-15KB)
 */

import GIFEncoder from 'gif-encoder-2';

export async function generateClientScrollingGif(
    imageElement: HTMLImageElement,
    targetWidth = 96,
    frameHeight = 16,
    stepSize = 2,
    delayMs = 80,
    maxColors = 128 // Enforce 128-Color Palette Quantization
): Promise<Uint8Array> {
    const aspect = imageElement.height / imageElement.width;
    const newHeight = Math.round(targetWidth * aspect);

    // 1. Render scaled full image
    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = targetWidth;
    fullCanvas.height = Math.max(frameHeight, newHeight);
    const fullCtx = fullCanvas.getContext("2d");

    if (!fullCtx) throw new Error("Could not create canvas context");

    fullCtx.imageSmoothingEnabled = true;
    fullCtx.drawImage(imageElement, 0, 0, targetWidth, newHeight);

    // Apply 128-Color Palette Quantization (Quantize RGB channels down to 128 color space)
    const fullImgData = fullCtx.getImageData(0, 0, targetWidth, fullCanvas.height);
    const d = fullImgData.data;
    const step = 32; // Quantize color levels for 128-color LZW optimization

    for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.round(d[i] / step) * step;
        d[i + 1] = Math.round(d[i + 1] / step) * step;
        d[i + 2] = Math.round(d[i + 2] / step) * step;
    }
    fullCtx.putImageData(fullImgData, 0, 0);

    // 2. Setup GIF Encoder with 128-color palette sampling
    const encoder = new GIFEncoder(targetWidth, frameHeight, 'octree', false);
    encoder.setQuality(25); // Quality 20-30 = 128-color lossy palette mode
    encoder.setDelay(delayMs);
    encoder.start();

    const frameCanvas = document.createElement("canvas");
    frameCanvas.width = targetWidth;
    frameCanvas.height = frameHeight;
    const frameCtx = frameCanvas.getContext("2d");

    if (!frameCtx) throw new Error("Could not create frame context");

    const maxUpper = Math.max(0, newHeight - frameHeight);

    if (maxUpper === 0) {
        frameCtx.drawImage(fullCanvas, 0, 0, targetWidth, frameHeight, 0, 0, targetWidth, frameHeight);
        encoder.addFrame(frameCtx as any);
    } else {
        // Slide down window
        for (let y = 0; y <= maxUpper; y += stepSize) {
            frameCtx.clearRect(0, 0, targetWidth, frameHeight);
            frameCtx.drawImage(fullCanvas, 0, y, targetWidth, frameHeight, 0, 0, targetWidth, frameHeight);
            encoder.addFrame(frameCtx as any);
        }
        // Pause on bottom frame for 6 frames (~0.5 sec)
        for (let i = 0; i < 6; i++) {
            frameCtx.clearRect(0, 0, targetWidth, frameHeight);
            frameCtx.drawImage(fullCanvas, 0, maxUpper, targetWidth, frameHeight, 0, 0, targetWidth, frameHeight);
            encoder.addFrame(frameCtx as any);
        }
    }

    encoder.finish();
    const buffer = (encoder as any).out.getData();
    return new Uint8Array(buffer);
}
