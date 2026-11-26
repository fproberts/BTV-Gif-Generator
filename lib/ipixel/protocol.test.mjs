// Run with: npm run test:protocol   (Node >= 22.18 strips TypeScript types natively)
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
    crc32,
    packRowMajorLsb,
    packColumnMajorMsb,
    glyphRecord,
    buildTextHeader,
    buildTextPayload,
    frameWindows,
    splitForMtu,
    parseAck,
    classifyTextAck,
    describeWindow,
    parseHexColor,
    TEXT_OPCODE_U16,
    GIF_OPCODE,
    GIF_OPCODE_U16,
    IMAGE_OPCODE,
    classifyTransferAck,
    windowSizeForScreenType,
    screenTypeFromCode,
    buildDeviceInfoRequest,
    parseDeviceInfo,
    buildSetProgramList,
    buildDeleteSlots,
    buildDeleteAll,
    readImageSize,
} from './protocol.ts';

const px = (w, h, ink) => {
    const pixels = new Uint8Array(w * h);
    for (const [x, y] of ink) pixels[y * w + x] = 1;
    return { width: w, height: h, pixels };
};

const baseSettings = (over = {}) => ({
    effect: 1,
    speed: 80,
    hAlign: 1,
    vAlign: 1,
    textColorType: 1,
    textColor: { r: 0x11, g: 0x22, b: 0x33 },
    bgColorType: 0,
    bgColor: { r: 9, g: 9, b: 9 },
    vertical: false,
    board: null,
    ...over,
});

test('crc32 matches the standard check value and node zlib', () => {
    assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
    for (let n = 0; n < 20; n++) {
        const buf = new Uint8Array(n * 37 + 1).map((_, i) => (i * 31 + n * 7) & 0xff);
        assert.equal(crc32(buf), zlib.crc32(buf));
    }
});

test('row-major LSB packing: ceil(w/8) bytes per row, bit i = column 8j+i', () => {
    // 10x2 glyph: row 0 ink at x=0,3,9 ; row 1 ink at x=8
    const g = px(10, 2, [[0, 0], [3, 0], [9, 0], [8, 1]]);
    assert.deepEqual([...packRowMajorLsb(g)], [0x09, 0x02, 0x00, 0x01]);
    // exact multiple of 8 keeps w/8 bytes per row
    assert.equal(packRowMajorLsb(px(16, 16, [])).length, 32);
    assert.equal(packRowMajorLsb(px(8, 16, [])).length, 16);
    assert.equal(packRowMajorLsb(px(1, 16, [])).length, 16);
});

test('column-major MSB packing (legacy experiment format)', () => {
    const g = px(2, 16, [[0, 0], [1, 15]]);
    assert.deepEqual([...packColumnMajorMsb(g)], [0x80, 0x00, 0x00, 0x01]);
});

test('glyph record (app format): 0x80, BGR colour, width, height, bitmap', () => {
    const g = px(8, 2, [[0, 0], [7, 1]]);
    const rec = glyphRecord(g, { r: 1, g: 2, b: 3 }, { format: 'app', colorOrder: 'bgr' });
    assert.deepEqual([...rec], [0x80, 3, 2, 1, 8, 2, 0x01, 0x80]);
    const rgb = glyphRecord(g, { r: 1, g: 2, b: 3 }, { format: 'app', colorOrder: 'rgb' });
    assert.deepEqual([...rgb.subarray(0, 4)], [0x80, 1, 2, 3]);
});

test('glyph record (legacy columns): 0x00, RGB, bitmap', () => {
    const rec = glyphRecord(px(1, 16, [[0, 0]]), { r: 1, g: 2, b: 3 }, { format: 'legacy-columns', colorOrder: 'bgr' });
    assert.deepEqual([...rec], [0x00, 1, 2, 3, 0x80, 0x00]);
});

test('header: 14 bytes with the documented layout', () => {
    const h = buildTextHeader(baseSettings(), 300);
    assert.equal(h.length, 14);
    assert.deepEqual(
        [...h],
        [
            300 & 0xff, 300 >> 8, // count u16 LE
            1, 1, // hAlign, vAlign
            1, // effect
            80, // speed
            1, // text colour type
            0x11, 0x22, 0x33, // text rgb
            0, // bg colour type
            0, 0, 0, // bg forced black when type != 1
        ],
    );
});

test('header: vertical sets 0x80 on the effect byte; non-custom text type forces white', () => {
    const h = buildTextHeader(baseSettings({ vertical: true, effect: 3, textColorType: 0 }), 1);
    assert.equal(h[4], 0x83);
    assert.deepEqual([...h.subarray(7, 10)], [255, 255, 255]);
});

test('header: custom background is written when bgColorType is 1', () => {
    const h = buildTextHeader(baseSettings({ bgColorType: 1, bgColor: { r: 4, g: 5, b: 6 } }), 1);
    assert.equal(h[10], 1);
    assert.deepEqual([...h.subarray(11, 14)], [4, 5, 6]);
});

test('header: border adds three bytes (17 total)', () => {
    const h = buildTextHeader(baseSettings({ board: { type: 7, speed: 40, effect: 2 } }), 1);
    assert.equal(h.length, 17);
    assert.deepEqual([...h.subarray(14)], [7, 40, 2]);
});

test('payload = header + records in order', () => {
    const glyphs = [px(8, 1, [[0, 0]]), px(8, 1, [[7, 0]])];
    const p = buildTextPayload(baseSettings(), glyphs, { format: 'app', colorOrder: 'bgr' });
    assert.equal(p.length, 14 + 2 * 7);
    assert.equal(p[0], 2); // count
    assert.deepEqual([...p.subarray(14, 21)], [0x80, 0x33, 0x22, 0x11, 8, 1, 0x01]);
    assert.deepEqual([...p.subarray(21, 28)], [0x80, 0x33, 0x22, 0x11, 8, 1, 0x80]);
});

test('single window framing: 15-byte header, length = payload + 15', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const [w, ...rest] = frameWindows(payload, { windowSize: 0x1000, listId: 7, legacyLengthField: false });
    assert.equal(rest.length, 0);
    assert.equal(w.length, 20);
    const crc = zlib.crc32(payload);
    assert.deepEqual(
        [...w.subarray(0, 15)],
        [
            20, 0, // declared length u16 LE
            0x00, 0x01, // text opcode
            0x00, // first window
            5, 0, 0, 0, // total size
            crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff,
            0x00,
            7, // list id
        ],
    );
    assert.deepEqual([...w.subarray(15)], [1, 2, 3, 4, 5]);
});

test('multi-window framing: continuation marker, shared total+CRC, lossless reassembly', () => {
    const payload = new Uint8Array(10).map((_, i) => i + 1);
    const wins = frameWindows(payload, { windowSize: 4, listId: 0, legacyLengthField: false });
    assert.equal(wins.length, 3);
    assert.deepEqual(wins.map((w) => w[4]), [0x00, 0x02, 0x02]);
    assert.deepEqual(wins.map((w) => w.length - 15), [4, 4, 2]);
    const crc = zlib.crc32(payload);
    for (const w of wins) {
        const d = describeWindow(w);
        assert.equal(d.totalSize, 10);
        assert.equal(parseInt(d.crc, 16), crc);
        assert.equal(d.declaredLength, w.length);
    }
    const joined = new Uint8Array(wins.flatMap((w) => [...w.subarray(15)]));
    assert.deepEqual(joined, payload);
});

test('legacy length field uses chunk + 10', () => {
    const [w] = frameWindows(new Uint8Array(5), { windowSize: 0x1000, listId: 0, legacyLengthField: true });
    assert.equal(describeWindow(w).declaredLength, 15);
});

test('splitForMtu', () => {
    const parts = splitForMtu(new Uint8Array(500), 244);
    assert.deepEqual(parts.map((p) => p.length), [244, 244, 12]);
});

test('ack parsing and classification', () => {
    const ack = (status, lo = 0x00, hi = 0x01) => parseAck(new Uint8Array([5, 0, lo, hi, status]));
    assert.equal(TEXT_OPCODE_U16, 0x0100);
    assert.equal(classifyTextAck(ack(1)), 'continue');
    assert.equal(classifyTextAck(ack(3)), 'complete');
    assert.equal(classifyTextAck(ack(0)), 'retry');
    assert.equal(classifyTextAck(ack(2)), 'abort');
    // the app treats unknown statuses like 1 (REA parseReceiveData)
    assert.equal(classifyTextAck(ack(9)), 'continue');
    // brightness ack (05 00 04 80 xx) must not release a text window
    assert.equal(classifyTextAck(parseAck(new Uint8Array([5, 0, 4, 0x80, 1]))), 'ignore');
    assert.equal(parseAck(new Uint8Array([5, 0, 0])), null);
    assert.equal(parseAck(new Uint8Array([6, 0, 0, 1, 1])), null);
});

test('parseHexColor', () => {
    assert.deepEqual(parseHexColor('#ff8000'), { r: 255, g: 128, b: 0 });
    assert.deepEqual(parseHexColor('0f0'), { r: 0, g: 255, b: 0 });
    assert.deepEqual(parseHexColor('nonsense'), { r: 255, g: 255, b: 255 });
});

test('window size follows screen type (REA FUN_100591078)', () => {
    assert.equal(windowSizeForScreenType(0), 0x3000);
    assert.equal(windowSizeForScreenType(1), 0x3000);
    assert.equal(windowSizeForScreenType(5), 0x1000); // 96x16
    assert.equal(windowSizeForScreenType(null), 0x1000);
});

test('device info request and reply', () => {
    const req = buildDeviceInfoRequest(new Date(2026, 0, 1, 13, 14, 15));
    assert.deepEqual([...req], [0x08, 0x00, 0x01, 0x80, 13, 14, 15, 0]);
    const info = parseDeviceInfo(new Uint8Array([0x0b, 0x00, 0x01, 0x80, 0x84, 0, 0, 0, 0, 0, 0]));
    assert.equal(info.screenCode, 0x84);
    assert.equal(info.screenType, 5);
    assert.equal(info.windowSize, 0x1000);
    assert.equal(screenTypeFromCode(0x81), 1);
    assert.equal(screenTypeFromCode(0xff), 0);
    // a 5-byte ack is not a device-info reply
    assert.equal(parseDeviceInfo(new Uint8Array([0x05, 0x00, 0x01, 0x80, 0x01])), null);
});

test('GIF windows: opcode 03 00, type byte 0x02, 15-byte header, list id', () => {
    const payload = new Uint8Array(0x1000 + 10).map((_, i) => i & 0xff);
    const wins = frameWindows(payload, { windowSize: 0x1000, listId: 1, legacyLengthField: false, opcode: GIF_OPCODE, typeByte: 0x02 });
    assert.equal(wins.length, 2);
    const [a, b] = wins;
    assert.deepEqual([a[0] | (a[1] << 8), a[2], a[3], a[4], a[13], a[14]], [0x1000 + 15, 0x03, 0x00, 0x00, 0x02, 1]);
    assert.deepEqual([b[0] | (b[1] << 8), b[4]], [10 + 15, 0x02]);
    const crc = new DataView(a.buffer).getUint32(9, true);
    assert.equal(crc, zlib.crc32(payload));
    const img = frameWindows(new Uint8Array(20), { windowSize: 0x1000, listId: 0, legacyLengthField: false, opcode: IMAGE_OPCODE });
    assert.deepEqual([img[0][2], img[0][3], img[0][13]], [0x02, 0x00, 0x00]);
    assert.equal(classifyTransferAck(parseAck(new Uint8Array([5, 0, 3, 0, 1])), GIF_OPCODE_U16), 'continue');
    assert.equal(classifyTransferAck(parseAck(new Uint8Array([5, 0, 0, 1, 1])), GIF_OPCODE_U16), 'ignore');
});

test('program list commands (REA section 6.1)', () => {
    assert.deepEqual([...buildSetProgramList([1, 2, 3])], [9, 0, 0x08, 0x80, 3, 0, 1, 2, 3]);
    assert.deepEqual([...buildSetProgramList([7])], [7, 0, 0x08, 0x80, 1, 0, 7]);
    assert.deepEqual([...buildDeleteSlots([4, 5])], [8, 0, 0x02, 0x01, 2, 0, 4, 5]);
    assert.deepEqual([...buildDeleteAll()], [4, 0, 3, 0x80]);
    assert.throws(() => buildSetProgramList([]));
    assert.throws(() => buildSetProgramList([0]));
    assert.throws(() => buildSetProgramList([101]));
});

test('readImageSize reads GIF and PNG headers', () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 96, 0, 16, 0]);
    assert.deepEqual(readImageSize(gif), { width: 96, height: 16 });
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    new DataView(png.buffer).setUint32(16, 220);
    new DataView(png.buffer).setUint32(20, 220);
    assert.deepEqual(readImageSize(png), { width: 220, height: 220 });
    assert.equal(readImageSize(new Uint8Array([1, 2, 3])), null);
});
