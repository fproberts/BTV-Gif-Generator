'use server';

import fs from 'fs/promises';
import path from 'path';
import { timingSafeEqual } from 'crypto';
import { revalidatePath } from 'next/cache';

// Storage locations. If STORAGE_PATH is set (e.g. /app/persistent in Docker) we use that root,
// otherwise the local project structure.
// Local:
//   DATA_DIR = ./data
//   UPLOADS_DIR = ./public/uploads
//
// Docker (STORAGE_PATH=/app/persistent):
//   DATA_DIR = /app/persistent/data
//   UPLOADS_DIR = /app/persistent/uploads

const DATA_DIR = process.env.STORAGE_PATH
    ? path.join(process.env.STORAGE_PATH, 'data')
    : path.join(process.cwd(), 'data');

const UPLOADS_DIR = process.env.STORAGE_PATH
    ? path.join(process.env.STORAGE_PATH, 'uploads')
    : path.join(process.cwd(), 'public', 'uploads');

const DB_PATH = path.join(DATA_DIR, 'db.json');

// Ensure directories exist
async function ensureDirs() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(UPLOADS_DIR, { recursive: true });

    try {
        await fs.access(DB_PATH);
    } catch {
        await fs.writeFile(DB_PATH, JSON.stringify({ images: [], folders: [] }, null, 2));
    }
}

import type { AppData as DB, ImageRecord, FolderRecord } from '@/lib/types';

async function readDb(): Promise<DB> {
    await ensureDirs();
    const data = await fs.readFile(DB_PATH, 'utf-8');
    return JSON.parse(data);
}

async function writeDb(data: DB) {
    await ensureDirs();
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

export async function getAppData() {
    const db = await readDb();
    // Return images in reverse chronological order (newest first)
    // We create a copy to avoid mutating the original DB object if it were cached
    return {
        ...db,
        images: [...db.images].reverse()
    };
}

export async function createFolder(name: string) {
    const db = await readDb();
    const folder: FolderRecord = { id: crypto.randomUUID(), name };
    db.folders.push(folder);
    await writeDb(db);
    revalidatePath('/');
    return folder;
}

const ALLOWED_UPLOAD_TYPES: Record<string, string[]> = {
    '.png': ['image/png'],
    '.jpg': ['image/jpeg'],
    '.jpeg': ['image/jpeg'],
    '.jfif': ['image/jpeg', 'image/pjpeg'],
    '.gif': ['image/gif'],
    '.webp': ['image/webp'],
};
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Checks the file's leading bytes, so a renamed HTML/SVG file can't be stored as an "image". */
function hasImageSignature(buf: Buffer, ext: string): boolean {
    const startsWith = (...bytes: number[]) => bytes.every((b, i) => buf[i] === b);
    switch (ext) {
        case '.png': return startsWith(0x89, 0x50, 0x4e, 0x47);
        case '.jpg':
        case '.jpeg':
        case '.jfif': return startsWith(0xff, 0xd8, 0xff);
        case '.gif': return startsWith(0x47, 0x49, 0x46, 0x38);
        case '.webp': return startsWith(0x52, 0x49, 0x46, 0x46) && buf.subarray(8, 12).toString('ascii') === 'WEBP';
        default: return false;
    }
}

export async function uploadImage(formData: FormData, folderId: string | null = null) {
    const file = formData.get('file');
    const customName = formData.get('customName');

    if (!(file instanceof File)) throw new Error('No file uploaded');

    const ext = path.extname(file.name).toLowerCase();
    const allowedMimes = ALLOWED_UPLOAD_TYPES[ext];
    if (!allowedMimes) throw new Error('Only PNG, JPEG, GIF and WebP images can be uploaded');
    if (file.type && !allowedMimes.includes(file.type)) throw new Error('File type does not match its extension');
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('Image is too large (max 20 MB)');

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasImageSignature(buffer, ext)) throw new Error('File is not a valid image');

    const id = crypto.randomUUID();
    const filename = `${id}${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);

    await ensureDirs();
    await fs.writeFile(filepath, buffer);

    const db = await readDb();
    const image: ImageRecord = {
        id,
        filename,
        url: `/uploads/${filename}`,
        originalName: file.name,
        name: (typeof customName === 'string' && customName.trim()) || file.name,
        tags: [],
        folderId,
        createdAt: Date.now(),
    };

    db.images.push(image);
    await writeDb(db);
    revalidatePath('/');
    return image;
}

export async function updateImageTags(imageId: string, tags: string[]) {
    const db = await readDb();
    const img = db.images.find(i => i.id === imageId);
    if (img) {
        img.tags = tags;
        await writeDb(db);
        revalidatePath('/');
    }
}

export async function updateImageFolder(imageId: string, folderId: string | null) {
    const db = await readDb();
    const img = db.images.find(i => i.id === imageId);
    if (img) {
        img.folderId = folderId;
        await writeDb(db);
        revalidatePath('/');
    }
}

export async function deleteImage(imageId: string, adminPassword: string) {
    if (!passwordMatches(adminPassword)) {
        return { success: false, error: 'Deleting images needs admin mode' };
    }
    console.log(`[Delete] Request to delete imageId: ${imageId}`);
    const db = await readDb();
    const index = db.images.findIndex(i => i.id === imageId);

    if (index !== -1) {
        const img = db.images[index];
        console.log(`[Delete] Found image in DB: ${img.filename}`);

        // Try delete file
        const filepath = path.join(UPLOADS_DIR, img.filename);
        console.log(`[Delete] Target filepath: ${filepath}`);

        try {
            await fs.unlink(filepath);
            console.log(`[Delete] Successfully deleted original file`);

            if (img.gifUrl) {
                const gifName = path.basename(img.gifUrl);
                const gifPath = path.join(UPLOADS_DIR, gifName);
                console.log(`[Delete] Target GIF path: ${gifPath}`);
                await fs.unlink(gifPath).catch((e) => {
                    console.error(`[Delete] Failed to delete GIF: ${e.message}`);
                });
            }
        } catch (e) {
            const err = e as NodeJS.ErrnoException;
            console.error(`[Delete] Error removing file:`, err);
            // A missing file is fine (still remove it from the DB); anything else (e.g. EACCES) is reported.
            if (err.code !== 'ENOENT') {
                return { success: false, error: `${err.code}: ${err.message}` };
            } else {
                console.warn(`[Delete] File passed was not found, removing from DB anyway.`);
            }
        }

        db.images.splice(index, 1);
        await writeDb(db);
        revalidatePath('/');
        return { success: true };
    } else {
        console.error(`[Delete] Image ID ${imageId} not found in DB`);
        return { success: false, error: "Image not found in database" };
    }
}

// Set ADMIN_PASSWORD in the environment for any deployment; the fallback keeps local dev working.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
if (!process.env.ADMIN_PASSWORD && process.env.NODE_ENV === 'production') {
    console.warn('[admin] ADMIN_PASSWORD is not set; using the built-in default password.');
}

function passwordMatches(candidate: unknown): boolean {
    if (typeof candidate !== 'string') return false;
    const a = Buffer.from(candidate);
    const b = Buffer.from(ADMIN_PASSWORD);
    return a.length === b.length && timingSafeEqual(a, b);
}

export async function checkAdminPassword(password: string) {
    return passwordMatches(password);
}

export async function deleteFolder(folderId: string, adminPassword: string) {
    if (!passwordMatches(adminPassword)) throw new Error('Deleting folders needs admin mode');
    const db = await readDb();

    // 1. Move images to root (null)
    db.images.forEach(img => {
        if (img.folderId === folderId) {
            img.folderId = null;
        }
    });

    // 2. Remove folder
    const folderIndex = db.folders.findIndex(f => f.id === folderId);
    if (folderIndex !== -1) {
        db.folders.splice(folderIndex, 1);
        await writeDb(db);
        revalidatePath('/');
    }
}

