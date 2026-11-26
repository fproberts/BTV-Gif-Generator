/**
 * Names for uploaded pictures. Phones often give photos meaningless names
 * ("1000012345", "IMG_20231103_142233", "PXL_…"); those start blank so people name them.
 */

const CAMERA_NAME = /^(?:\d{4,}(?:[_ -]\d+)*(?:[._-]?[a-z]{1,4})?|(?:img|pxl|dsc|dscn|dcim|mvimg|photo|image|picture|screenshot|scr|wp|signal|received|fb_img|snapchat|capture)(?:[_ -]?\d[\d_ .-]*(?:[._-]?[a-z]{1,4})?)?|img-\d{8}-wa\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export const MAX_NAME_LENGTH = 60;

export function baseName(fileName: string): string {
    return fileName.replace(/\.[^.]+$/, '').trim();
}

/** A starting name for an uploaded file: its own name, or '' when that is just a camera/app code. */
export function suggestName(fileName: string): string {
    const base = baseName(fileName);
    if (!base || CAMERA_NAME.test(base)) return '';
    return base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

export function sameName(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}
