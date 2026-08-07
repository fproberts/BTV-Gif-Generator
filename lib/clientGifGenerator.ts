/**
 * Client-Side 96x16 Scrolling GIF Generator for Mobile & Browser
 */

import GIFEncoder from 'gif-encoder-2';

export async function generateClientScrollingGif(
    imageElement: HTMLImageElement,
    targetWidth = 96,
    frameHeight = 16,
    stepSize = 2,
    delayMs = 80
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

    // 2. Setup GIF Encoder
    const encoder = new GIFEncoder(targetWidth, frameHeight, 'octree', false);
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
