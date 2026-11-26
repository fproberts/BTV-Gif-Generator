'use client';

/**
 * Dot-matrix previews of what the 96x16 panel will show.
 * One drawing routine; previews for images (scroll / endless / still), strips and text.
 */

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { PANEL_WIDTH, PANEL_HEIGHT } from '@/lib/ipixel/protocol';
import { loadScrollStrip, loadStillFrame, type StillFit } from '@/lib/ipixel/imageStrip';
import { stackStrips, type RgbStrip } from '@/lib/ipixel/panelGif';
import { composeBitmap } from '@/lib/ipixel/glyphs';
import { renderPreviewFrame } from '@/lib/ipixel/preview';
import { rasterizeStudioText, textSettings } from '@/lib/playlist/engine';
import type { PortableStudio } from '@/lib/ipixel/studio';
import type { PlaylistItem } from '@/lib/playlist/model';

const OFF = [35, 40, 66];

/** Draw one 96x16 frame as LEDs. `px(x, y)` returns [r, g, b]. */
function drawDots(canvas: HTMLCanvasElement, px: (x: number, y: number) => [number, number, number]) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const pitch = w / PANEL_WIDTH;
    // Below ~3 device px per LED, round dots turn to mush: draw solid pixels instead.
    const dots = pitch >= 3;
    const r = pitch * 0.36;
    ctx.fillStyle = '#0f1220';
    ctx.fillRect(0, 0, w, canvas.height);
    for (let y = 0; y < PANEL_HEIGHT; y++) {
        for (let x = 0; x < PANEL_WIDTH; x++) {
            const [cr, cg, cb] = px(x, y);
            const lit = cr + cg + cb > 30;
            ctx.fillStyle = lit ? `rgb(${cr},${cg},${cb})` : `rgb(${OFF[0]},${OFF[1]},${OFF[2]})`;
            if (dots) {
                ctx.beginPath();
                ctx.arc((x + 0.5) * pitch, (y + 0.5) * pitch, r, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(Math.floor(x * pitch), Math.floor(y * pitch), Math.ceil(pitch), Math.ceil(pitch));
            }
        }
    }
}

/** Canvas sized to its container at device resolution; calls draw(canvas, t) per animation frame. */
function useLedCanvas(draw: ((c: HTMLCanvasElement, tMs: number) => void) | null, animate: boolean) {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas || !draw) return;
        const size = () => {
            const cssW = canvas.clientWidth || 288;
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            canvas.width = Math.round(cssW * dpr);
            canvas.height = Math.round((canvas.width * PANEL_HEIGHT) / PANEL_WIDTH);
        };
        size();
        let raf = 0;
        let last = 0;
        const start = performance.now();
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const tick = (now: number) => {
            last = now - start;
            draw(canvas, last);
            if (animate && !reduce) raf = requestAnimationFrame(tick);
        };
        const ro = new ResizeObserver(() => {
            size();
            draw(canvas, last);
        });
        ro.observe(canvas);
        raf = requestAnimationFrame(tick);
        return () => {
            ro.disconnect();
            cancelAnimationFrame(raf);
        };
    }, [animate, draw]);

    return ref;
}

function Frame({ canvasRef, className, label }: { canvasRef: React.RefObject<HTMLCanvasElement | null>; className?: string; label: string }) {
    return (
        <canvas
            ref={canvasRef}
            role="img"
            aria-label={label}
            className={cn('block w-full rounded-md bg-led-bezel', className)}
            style={{ aspectRatio: `${PANEL_WIDTH} / ${PANEL_HEIGHT}` }}
        />
    );
}

// ---------------------------------------------------------------------------
// Data loading (cached per URL for the session)
// ---------------------------------------------------------------------------

const stripCache = new Map<string, Promise<RgbStrip>>();
const stillCache = new Map<string, Promise<Uint8Array>>();

export function cachedStrip(url: string) {
    let p = stripCache.get(url);
    if (!p) {
        p = loadScrollStrip(url);
        p.catch(() => stripCache.delete(url));
        stripCache.set(url, p);
    }
    return p;
}

export function cachedStill(url: string, fit: StillFit) {
    const k = `${fit}:${url}`;
    let p = stillCache.get(k);
    if (!p) {
        p = loadStillFrame(url, fit);
        p.catch(() => stillCache.delete(k));
        stillCache.set(k, p);
    }
    return p;
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

type ScrollMode = 'scroll' | 'endless';

function stripDrawer(strip: RgbStrip, mode: ScrollMode, pxPerSecond: number) {
    const { rgb, height } = strip;
    const travel = mode === 'endless' ? height : Math.max(0, height - PANEL_HEIGHT);
    const holdMs = 1200;
    return (canvas: HTMLCanvasElement, t: number) => {
        let top = 0;
        if (travel > 0) {
            if (mode === 'endless') top = Math.floor((t / 1000) * pxPerSecond) % height;
            else {
                const run = (travel / pxPerSecond) * 1000;
                const cycle = t % (run + holdMs);
                top = Math.min(travel, Math.floor((cycle / 1000) * pxPerSecond));
            }
        }
        drawDots(canvas, (x, y) => {
            let row = top + y;
            row = mode === 'endless' ? row % height : Math.min(height - 1, row);
            const i = (row * PANEL_WIDTH + x) * 3;
            return [rgb[i], rgb[i + 1], rgb[i + 2]];
        });
    };
}

function frameDrawer(frame: Uint8Array) {
    return (canvas: HTMLCanvasElement) =>
        drawDots(canvas, (x, y) => {
            const i = (y * PANEL_WIDTH + x) * 3;
            return [frame[i], frame[i + 1], frame[i + 2]];
        });
}

const blank = (canvas: HTMLCanvasElement) => drawDots(canvas, () => [0, 0, 0]);

export function LedBlank({ className }: { className?: string }) {
    const ref = useLedCanvas(blank, false);
    return <Frame canvasRef={ref} className={className} label="Empty screen" />;
}

export function LedImage({
    urls, mode, pxPerSecond = 16, fit = 'cover', animate = true, className, label,
}: {
    urls: string[];
    mode: ScrollMode | 'still';
    pxPerSecond?: number;
    fit?: StillFit;
    animate?: boolean;
    className?: string;
    label: string;
}) {
    const [draw, setDraw] = useState<((c: HTMLCanvasElement, t: number) => void) | null>(() => blank);
    const key = urls.join('|');
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (mode === 'still') {
                    const f = await cachedStill(urls[0], fit);
                    if (!cancelled) setDraw(() => frameDrawer(f));
                } else {
                    const strips = await Promise.all(urls.map(cachedStrip));
                    const strip = strips.length === 1 ? strips[0] : stackStrips(strips);
                    if (!cancelled) setDraw(() => stripDrawer(strip, mode, pxPerSecond));
                }
            } catch {
                if (!cancelled) setDraw(() => blank);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, mode, pxPerSecond, fit]);
    const ref = useLedCanvas(draw, animate && mode !== 'still');
    return <Frame canvasRef={ref} className={className} label={label} />;
}

export function LedText({ text, animate = true, className }: { text: PortableStudio; animate?: boolean; className?: string }) {
    const [draw, setDraw] = useState<((c: HTMLCanvasElement, t: number) => void) | null>(() => blank);
    const json = JSON.stringify(text);
    useEffect(() => {
        let cancelled = false;
        const id = setTimeout(async () => {
            const glyphs = await rasterizeStudioText(text);
            if (cancelled) return;
            const bitmap = composeBitmap(glyphs);
            const s = textSettings(text);
            const opts = {
                // a still thumbnail of moving text would often catch it off-screen: show it centred instead
                effect: animate ? s.effect : 0,
                speed: s.speed,
                hAlign: s.hAlign,
                textColor: s.textColorType === 1 ? s.textColor : { r: 255, g: 255, b: 255 },
                bgColor: text.bgEnabled ? s.bgColor : { r: 0, g: 0, b: 0 },
                border: null,
            };
            setDraw(() => (canvas: HTMLCanvasElement, t: number) => {
                const f = renderPreviewFrame(bitmap, opts, t);
                drawDots(canvas, (x, y) => {
                    const i = (y * PANEL_WIDTH + x) * 4;
                    return [f[i], f[i + 1], f[i + 2]];
                });
            });
        }, 80);
        return () => {
            cancelled = true;
            clearTimeout(id);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [json, animate]);
    const ref = useLedCanvas(draw, animate);
    return <Frame canvasRef={ref} className={className} label={`Text: ${text.text}`} />;
}

export function LedItem({ item, animate = true, className }: { item: PlaylistItem; animate?: boolean; className?: string }) {
    switch (item.kind) {
        case 'scroll':
            return <LedImage urls={[item.url]} mode={item.endless ? 'endless' : 'scroll'} pxPerSecond={item.pxPerSecond} animate={animate} className={className} label={item.name} />;
        case 'still':
            return <LedImage urls={[item.url]} mode="still" fit={item.fit} animate={false} className={className} label={item.name} />;
        case 'strip':
            return <LedImage urls={item.images.map((i) => i.url)} mode="endless" pxPerSecond={item.pxPerSecond} animate={animate} className={className} label={item.images.map((i) => i.name).join(', ')} />;
        case 'text':
            return <LedText text={item.text} animate={animate} className={className} />;
    }
}
