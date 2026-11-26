/**
 * Minimal GIF89a encoder that writes only what the LED panel decodes reliably:
 *   - one global colour table, no local tables
 *   - every frame covers the full canvas (no partial frames)
 *   - no transparency; disposal method 1 ("leave in place") since every frame is opaque
 * The panel mis-draws GIFs that rely on transparent or partial frames (hardware test, Nov 2026).
 *
 * Pure functions, no browser dependencies, so it runs in Node tests too.
 */

export interface GifFrame {
    /** palette index per pixel, row-major, width*height entries */
    indices: Uint8Array;
    /** frame delay in milliseconds (GIF stores hundredths, so this is rounded to 10 ms) */
    delayMs: number;
}

export interface GifSpec {
    width: number;
    height: number;
    /** flat RGB triples, at most 256 colours */
    palette: Uint8Array;
    frames: GifFrame[];
    /** 0 = loop forever */
    loop?: number;
}

class ByteWriter {
    private buf = new Uint8Array(4096);
    length = 0;
    private ensure(n: number) {
        if (this.length + n <= this.buf.length) return;
        let size = this.buf.length * 2;
        while (size < this.length + n) size *= 2;
        const next = new Uint8Array(size);
        next.set(this.buf.subarray(0, this.length));
        this.buf = next;
    }
    byte(b: number) {
        this.ensure(1);
        this.buf[this.length++] = b & 0xff;
    }
    u16(v: number) {
        this.byte(v);
        this.byte(v >> 8);
    }
    bytes(b: ArrayLike<number>) {
        this.ensure(b.length);
        for (let i = 0; i < b.length; i++) this.buf[this.length++] = b[i] & 0xff;
    }
    result(): Uint8Array {
        return this.buf.slice(0, this.length);
    }
}

/** Bits needed for a colour table of this many entries (GIF tables are powers of two, min 2). */
function tableBits(colours: number): number {
    let bits = 1;
    while (1 << bits < colours) bits++;
    return bits;
}

/** GIF-flavoured LZW, written as 255-byte sub-blocks terminated by a zero-length block. */
function lzwEncode(indices: Uint8Array, minCodeSize: number, out: ByteWriter) {
    const clear = 1 << minCodeSize;
    const end = clear + 1;
    let codeSize = minCodeSize + 1;
    let next = end + 1;
    // dictionary keyed by (prefix code << 8 | byte)
    let dict = new Map<number, number>();

    const block: number[] = [];
    let bitBuf = 0;
    let bitCount = 0;
    const flushBlock = () => {
        if (block.length === 0) return;
        out.byte(block.length);
        out.bytes(block);
        block.length = 0;
    };
    const emit = (code: number) => {
        bitBuf |= code << bitCount;
        bitCount += codeSize;
        while (bitCount >= 8) {
            block.push(bitBuf & 0xff);
            bitBuf >>>= 8;
            bitCount -= 8;
            if (block.length === 255) flushBlock();
        }
    };

    out.byte(minCodeSize);
    emit(clear);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
        const k = indices[i];
        const key = (prefix << 8) | k;
        const found = dict.get(key);
        if (found !== undefined) {
            prefix = found;
            continue;
        }
        emit(prefix);
        if (next < 4096) {
            dict.set(key, next++);
            // the decoder widens one code later than the encoder adds the entry
            if (next > 1 << codeSize && codeSize < 12) codeSize++;
        } else {
            emit(clear);
            dict = new Map();
            codeSize = minCodeSize + 1;
            next = end + 1;
        }
        prefix = k;
    }
    emit(prefix);
    emit(end);
    if (bitCount > 0) block.push(bitBuf & 0xff);
    flushBlock();
    out.byte(0);
}

export function encodeGif(spec: GifSpec): Uint8Array {
    const { width, height, palette, frames } = spec;
    const colours = palette.length / 3;
    if (!Number.isInteger(colours) || colours < 1 || colours > 256) throw new Error('Palette must hold 1-256 RGB colours');
    if (frames.length === 0) throw new Error('A GIF needs at least one frame');
    const bits = tableBits(colours);
    const tableSize = 1 << bits;
    const minCodeSize = Math.max(2, bits);

    const w = new ByteWriter();
    w.bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
    w.u16(width);
    w.u16(height);
    w.byte(0x80 | ((bits - 1) << 4) | (bits - 1)); // global table present, colour resolution, size
    w.byte(0); // background colour index
    w.byte(0); // pixel aspect ratio
    for (let i = 0; i < tableSize * 3; i++) w.byte(i < palette.length ? palette[i] : 0);

    // NETSCAPE2.0 looping extension
    w.bytes([0x21, 0xff, 0x0b, ...Array.from('NETSCAPE2.0', (c) => c.charCodeAt(0)), 0x03, 0x01]);
    w.u16(spec.loop ?? 0);
    w.byte(0);

    for (const frame of frames) {
        if (frame.indices.length !== width * height) throw new Error('Frame size does not match the canvas');
        // graphic control extension: disposal 1, no transparency
        w.bytes([0x21, 0xf9, 0x04, 1 << 2]);
        w.u16(Math.max(0, Math.round(frame.delayMs / 10)));
        w.byte(0); // transparent index (unused)
        w.byte(0);
        // image descriptor: full canvas, no local table, not interlaced
        w.byte(0x2c);
        w.u16(0);
        w.u16(0);
        w.u16(width);
        w.u16(height);
        w.byte(0);
        lzwEncode(frame.indices, minCodeSize, w);
    }
    w.byte(0x3b);
    return w.result();
}
