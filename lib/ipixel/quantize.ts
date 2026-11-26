/**
 * Colour reduction for panel GIFs: median-cut palette + nearest-colour mapping, no dithering
 * (dithering looked worse on the LEDs in the hardware test). Pure functions, no browser APIs.
 */

/** Packed 0xRRGGBB colours with how often each occurs. */
function histogram(rgb: Uint8Array): Map<number, number> {
    const counts = new Map<number, number>();
    for (let i = 0; i < rgb.length; i += 3) {
        const c = (rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2];
        counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return counts;
}

interface Box {
    colours: number[];
    weights: number[];
}

const channel = (c: number, ch: number) => (c >> (16 - ch * 8)) & 0xff;

function widestChannel(box: Box): { ch: number; range: number } {
    let best = { ch: 0, range: -1 };
    for (let ch = 0; ch < 3; ch++) {
        let lo = 255;
        let hi = 0;
        for (const c of box.colours) {
            const v = channel(c, ch);
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
        if (hi - lo > best.range) best = { ch, range: hi - lo };
    }
    return best;
}

function averageColour(box: Box): [number, number, number] {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    box.colours.forEach((c, i) => {
        const w = box.weights[i];
        r += channel(c, 0) * w;
        g += channel(c, 1) * w;
        b += channel(c, 2) * w;
        n += w;
    });
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** Median-cut palette of at most `maxColours` colours (flat RGB triples). */
export function buildPalette(rgb: Uint8Array, maxColours: number): Uint8Array {
    const hist = histogram(rgb);
    const all: Box = { colours: [...hist.keys()], weights: [...hist.values()] };
    if (all.colours.length <= maxColours) {
        const out = new Uint8Array(all.colours.length * 3);
        all.colours.forEach((c, i) => out.set([channel(c, 0), channel(c, 1), channel(c, 2)], i * 3));
        return out;
    }
    const boxes: Box[] = [all];
    while (boxes.length < maxColours) {
        // split the box with the most pixels times the widest spread
        let pick = -1;
        let score = 0;
        boxes.forEach((b, i) => {
            if (b.colours.length < 2) return;
            const s = widestChannel(b).range * b.weights.reduce((a, w) => a + w, 0);
            if (s > score) {
                score = s;
                pick = i;
            }
        });
        if (pick < 0) break;
        const box = boxes[pick];
        const { ch } = widestChannel(box);
        const order = box.colours.map((c, i) => i).sort((a, b) => channel(box.colours[a], ch) - channel(box.colours[b], ch));
        const total = box.weights.reduce((a, w) => a + w, 0);
        let acc = 0;
        let cut = 1;
        for (let k = 0; k < order.length - 1; k++) {
            acc += box.weights[order[k]];
            if (acc >= total / 2) {
                cut = k + 1;
                break;
            }
            cut = k + 1;
        }
        const take = (idx: number[]): Box => ({ colours: idx.map((i) => box.colours[i]), weights: idx.map((i) => box.weights[i]) });
        boxes.splice(pick, 1, take(order.slice(0, cut)), take(order.slice(cut)));
    }
    const out = new Uint8Array(boxes.length * 3);
    boxes.forEach((b, i) => out.set(averageColour(b), i * 3));
    return out;
}

/** Map every pixel to its nearest palette entry (squared RGB distance), caching repeated colours. */
export function mapToPalette(rgb: Uint8Array, palette: Uint8Array): Uint8Array {
    const n = palette.length / 3;
    const out = new Uint8Array(rgb.length / 3);
    const cache = new Map<number, number>();
    for (let p = 0, i = 0; i < rgb.length; i += 3, p++) {
        const key = (rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2];
        let best = cache.get(key);
        if (best === undefined) {
            let bestD = Infinity;
            best = 0;
            for (let k = 0; k < n; k++) {
                const dr = rgb[i] - palette[k * 3];
                const dg = rgb[i + 1] - palette[k * 3 + 1];
                const db = rgb[i + 2] - palette[k * 3 + 2];
                const d = dr * dr + dg * dg + db * db;
                if (d < bestD) {
                    bestD = d;
                    best = k;
                }
            }
            cache.set(key, best);
        }
        out[p] = best;
    }
    return out;
}
