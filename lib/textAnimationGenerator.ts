/**
 * Client-Side Text Animation Generator for 96x16 LED Panels
 * 
 * Matches the official iPixel Color app's rendering approach:
 * - Uses GoogleSans-Medium font (same as bundled in app)
 * - 2-color palette GIF compression for minimal BLE payload size
 * - 1px step scrolling for hardware-quality smoothness
 * - Crisp pixel thresholding (no antialiasing artifacts on LED matrix)
 */

import GIFEncoder from 'gif-encoder-2';

export interface TextAnimationOptions {
    text: string;
    textColor?: string;
    bgColor?: string;
    mode?: 'auto' | 'scroll' | 'scroll-right' | 'bounce' | 'typewriter' | 'pulse' | 'static';
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    stepSize?: number;
    delayMs?: number;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
    let c = (hex || "#ffffff").replace("#", "");
    if (c.length === 3) c = c.split("").map(x => x + x).join("");
    const num = parseInt(c, 16);
    if (isNaN(num)) return { r: 255, g: 255, b: 255 };
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

/**
 * Threshold canvas pixel data to crisp 2-color output.
 * Eliminates antialiasing artifacts that look bad on LED matrix.
 */
function thresholdPixels(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    textRgb: { r: number; g: number; b: number },
    bgRgb: { r: number; g: number; b: number }
) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // Simple brightness threshold: if pixel is closer to text color than bg
        const bgDist = Math.abs(r - bgRgb.r) + Math.abs(g - bgRgb.g) + Math.abs(b - bgRgb.b);
        if (bgDist > 80) {
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

export async function generateClientTextGif(options: TextAnimationOptions): Promise<Uint8Array> {
    const {
        text,
        textColor = '00FF00',
        bgColor = '000000',
        mode: rawMode = 'auto',
        fontFamily = 'GoogleSans-Medium, Arial, sans-serif',
        fontSize = 14,
        fontWeight = '500',
        stepSize = 1,
        delayMs = 50
    } = options;

    const width = 96;
    const height = 16;

    const textRgb = parseHexColor(textColor);
    const bgRgb = parseHexColor(bgColor);

    // Measure text width
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d')!;
    const fontStr = `${fontWeight} ${fontSize}px ${fontFamily}`;
    measureCtx.font = fontStr;
    const metrics = measureCtx.measureText(text);
    const textWidth = Math.ceil(metrics.width);

    // Auto mode: scroll if text doesn't fit, static if it does
    let mode = rawMode;
    if (mode === 'auto') {
        mode = textWidth > (width - 4) ? 'scroll' : 'static';
    }

    // ─── Static mode: single PNG frame ───────────────────────────
    if (mode === 'static') {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;

        ctx.fillStyle = `rgb(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b})`;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = `rgb(${textRgb.r}, ${textRgb.g}, ${textRgb.b})`;
        ctx.font = fontStr;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, width / 2, height / 2);

        // Threshold to crisp 2-color
        thresholdPixels(ctx, width, height, textRgb, bgRgb);

        return new Promise((resolve) => {
            canvas.toBlob(async (blob) => {
                if (blob) {
                    const buf = await blob.arrayBuffer();
                    resolve(new Uint8Array(buf));
                } else {
                    resolve(new Uint8Array(0));
                }
            }, 'image/png');
        });
    }

    // ─── Animation modes: GIF with 2-color palette ──────────────
    const encoder = new GIFEncoder(width, height, 'octree', false);
    encoder.setQuality(1); // Best quality quantization (we're using 2 colors anyway)
    encoder.setDelay(delayMs);
    encoder.start();

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;
    const frameCtx = frameCanvas.getContext('2d')!;
    frameCtx.imageSmoothingEnabled = false;

    /**
     * Render a single animation frame, threshold it, and add to GIF encoder.
     */
    const addFrame = (drawCb: (ctx: CanvasRenderingContext2D) => void) => {
        frameCtx.fillStyle = `rgb(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b})`;
        frameCtx.fillRect(0, 0, width, height);
        frameCtx.fillStyle = `rgb(${textRgb.r}, ${textRgb.g}, ${textRgb.b})`;
        frameCtx.font = fontStr;
        drawCb(frameCtx);
        // Threshold every frame to crisp 2-color for optimal GIF LZW compression
        thresholdPixels(frameCtx, width, height, textRgb, bgRgb);
        encoder.addFrame(frameCtx as any);
    };

    if (mode === 'scroll' || mode === 'scroll-right') {
        // ─── Marquee Scroll ─────────────────────────────────────
        // Match app behavior: render full text onto wide offscreen canvas,
        // then slide a 96px viewport across it 1px at a time.
        const paddedText = text + '    ';
        measureCtx.font = fontStr;
        const paddedWidth = Math.ceil(measureCtx.measureText(paddedText).width);

        // Build wide offscreen canvas with text rendered once
        const wideCanvas = document.createElement('canvas');
        const wideW = paddedWidth + width;
        wideCanvas.width = wideW;
        wideCanvas.height = height;
        const wideCtx = wideCanvas.getContext('2d')!;
        wideCtx.imageSmoothingEnabled = false;

        wideCtx.fillStyle = `rgb(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b})`;
        wideCtx.fillRect(0, 0, wideW, height);
        wideCtx.fillStyle = `rgb(${textRgb.r}, ${textRgb.g}, ${textRgb.b})`;
        wideCtx.font = fontStr;
        wideCtx.textBaseline = 'middle';
        wideCtx.fillText(paddedText, width, height / 2);

        // Threshold the entire wide canvas once for crisp pixels
        thresholdPixels(wideCtx, wideW, height, textRgb, bgRgb);

        // Use stepSize directly — no aggressive frame capping.
        // With 2-color thresholding, GIF LZW compression is extremely efficient.
        const step = stepSize;
        const direction = mode === 'scroll-right' ? -1 : 1;

        if (direction === 1) {
            for (let x = 0; x < paddedWidth; x += step) {
                frameCtx.drawImage(wideCanvas, x, 0, width, height, 0, 0, width, height);
                encoder.addFrame(frameCtx as any);
            }
        } else {
            for (let x = paddedWidth; x >= 0; x -= step) {
                frameCtx.drawImage(wideCanvas, x, 0, width, height, 0, 0, width, height);
                encoder.addFrame(frameCtx as any);
            }
        }

    } else if (mode === 'bounce') {
        // ─── Bounce ─────────────────────────────────────────────
        if (textWidth <= width) {
            const margin = width - textWidth;
            const positions: number[] = [];
            for (let x = 0; x <= margin; x += stepSize) positions.push(x);
            for (let x = margin; x >= 0; x -= stepSize) positions.push(x);
            for (const x of positions) {
                addFrame((ctx) => {
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(text, x, height / 2);
                });
            }
        } else {
            const wideCanvas = document.createElement('canvas');
            const wideW = textWidth + 16;
            wideCanvas.width = wideW;
            wideCanvas.height = height;
            const wideCtx = wideCanvas.getContext('2d')!;
            wideCtx.fillStyle = `rgb(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b})`;
            wideCtx.fillRect(0, 0, wideW, height);
            wideCtx.fillStyle = `rgb(${textRgb.r}, ${textRgb.g}, ${textRgb.b})`;
            wideCtx.font = fontStr;
            wideCtx.textBaseline = 'middle';
            wideCtx.fillText(text, 8, height / 2);
            thresholdPixels(wideCtx, wideW, height, textRgb, bgRgb);

            const maxScroll = wideW - width;
            for (let x = 0; x <= maxScroll; x += stepSize) {
                frameCtx.drawImage(wideCanvas, x, 0, width, height, 0, 0, width, height);
                encoder.addFrame(frameCtx as any);
            }
            for (let x = maxScroll; x >= 0; x -= stepSize) {
                frameCtx.drawImage(wideCanvas, x, 0, width, height, 0, 0, width, height);
                encoder.addFrame(frameCtx as any);
            }
        }

    } else if (mode === 'typewriter') {
        // ─── Typewriter ─────────────────────────────────────────
        for (let i = 1; i <= text.length; i++) {
            const partial = text.slice(0, i);
            for (let f = 0; f < 2; f++) {
                addFrame((ctx) => {
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(partial, width / 2, height / 2);
                });
            }
        }
        // Hold full text
        for (let f = 0; f < 6; f++) {
            addFrame((ctx) => {
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, width / 2, height / 2);
            });
        }

    } else if (mode === 'pulse') {
        // ─── Pulse ──────────────────────────────────────────────
        const factors = [0.2, 0.4, 0.7, 1.0, 1.0, 0.7, 0.4, 0.2, 0.0];
        for (const factor of factors) {
            const pr = Math.round(bgRgb.r + (textRgb.r - bgRgb.r) * factor);
            const pg = Math.round(bgRgb.g + (textRgb.g - bgRgb.g) * factor);
            const pb = Math.round(bgRgb.b + (textRgb.b - bgRgb.b) * factor);
            frameCtx.fillStyle = `rgb(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b})`;
            frameCtx.fillRect(0, 0, width, height);
            frameCtx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
            frameCtx.font = fontStr;
            frameCtx.textAlign = 'center';
            frameCtx.textBaseline = 'middle';
            frameCtx.fillText(text, width / 2, height / 2);
            encoder.addFrame(frameCtx as any);
        }
    }

    encoder.finish();
    const buffer = (encoder as any).out.getData();
    return new Uint8Array(buffer);
}
