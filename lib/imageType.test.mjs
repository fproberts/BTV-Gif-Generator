// Run with: npm run test:image
import test from 'node:test';
import assert from 'node:assert/strict';
import { sniffImage } from './imageType.ts';

const bytes = (...parts) => new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));

test('recognises pictures by content, not name', () => {
    assert.equal(sniffImage(bytes([0x89], 'PNG\r\n')), 'png');
    assert.equal(sniffImage(bytes([0xff, 0xd8, 0xff, 0xe1])), 'jpeg');
    assert.equal(sniffImage(bytes('GIF89a')), 'gif');
    assert.equal(sniffImage(bytes('RIFF', [1, 2, 3, 4], 'WEBPVP8 ')), 'webp');
    assert.equal(sniffImage(bytes([0, 0, 0, 0x18], 'ftypheic')), 'heic');
    assert.equal(sniffImage(bytes([0, 0, 0, 0x18], 'ftypmif1')), 'heic');
    assert.equal(sniffImage(bytes([0, 0, 0, 0x18], 'ftypavif')), 'avif');
});

test('rejects things that are not pictures', () => {
    assert.equal(sniffImage(bytes('<svg xmlns=')), null);
    assert.equal(sniffImage(bytes('<!doctype html>')), null);
    assert.equal(sniffImage(new Uint8Array(0)), null);
});
