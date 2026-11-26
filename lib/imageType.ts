/**
 * Picture type from a file's first bytes. Phones don't always give a usable name or type:
 * some Android galleries hand over names like "1000012345" with no extension and an empty type.
 */
export type ImageKind = 'png' | 'jpeg' | 'gif' | 'webp' | 'heic' | 'avif';

export const EXTENSION: Record<'png' | 'jpeg' | 'gif' | 'webp', string> = { png: '.png', jpeg: '.jpg', gif: '.gif', webp: '.webp' };

export function sniffImage(b: Uint8Array): ImageKind | null {
    const at = (i: number, ...bytes: number[]) => bytes.every((x, k) => b[i + k] === x);
    const ascii = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
    if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'png';
    if (at(0, 0xff, 0xd8, 0xff)) return 'jpeg';
    if (ascii(0, 4) === 'GIF8') return 'gif';
    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp';
    if (ascii(4, 4) === 'ftyp') {
        const brand = ascii(8, 4);
        if (brand === 'avif' || brand === 'avis') return 'avif';
        if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'heic';
    }
    return null;
}
