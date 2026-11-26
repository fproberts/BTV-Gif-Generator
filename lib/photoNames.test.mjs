// Run with: npm run test:image
import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestName } from './photoNames.ts';

test('camera and app codes start blank', () => {
    for (const n of ['1000012345', '1000012345.jpg', 'IMG_20231103_142233.jpg', 'IMG_1234.HEIC', 'PXL_20240512_093012345.jpg', 'PXL_20240512_093012345.MP.jpg',
        'DSC00123.JPG', 'Screenshot_20240101-120000.png', 'IMG-20240101-WA0003.jpg', '20240101_120000.jpg', 'image.png', 'image (1).png'.replace(' (1)', '1'),
        'received_1234567890.jpeg', 'b3f1c2d4-1234-4abc-9def-0123456789ab.jpg']) {
        assert.equal(suggestName(n), '', n);
    }
});

test('real names are kept, tidied', () => {
    assert.equal(suggestName('dog crying.png'), 'dog crying');
    assert.equal(suggestName('magnus_and_finn.jpg'), 'magnus and finn');
    assert.equal(suggestName('Imagine Dragons.jpg'), 'Imagine Dragons');
    assert.equal(suggestName('photobomb.jpg'), 'photobomb');
    assert.equal(suggestName('IMG_1234 Rome trip.jpg'), 'IMG 1234 Rome trip');
    assert.equal(suggestName('2024 festival.jpg'), '2024 festival');
});
