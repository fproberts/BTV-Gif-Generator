'use server';

import fs from 'fs/promises';
import { EXTENSION, sniffImage } from '@/lib/imageType';
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

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export type UploadResult = { ok: true; image: ImageRecord } | { ok: false; error: string };

/**
 * Store an uploaded picture. The type comes from the file's own bytes (not its name, which
 * phones don't always set), so a renamed HTML/SVG file can't be stored as an "image".
 * Returns an error message instead of throwing: thrown errors are hidden in production.
 */
export async function uploadImage(formData: FormData, folderId: string | null = null): Promise<UploadResult> {
    const file = formData.get('file');
    const customName = formData.get('customName');
    if (!(file instanceof File)) return { ok: false, error: 'No file arrived. Try again.' };
    if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'The picture is larger than 20 MB.' };

    const buffer = Buffer.from(await file.arrayBuffer());
    const kind = sniffImage(buffer);
    if (kind !== 'png' && kind !== 'jpeg' && kind !== 'gif' && kind !== 'webp') {
        return { ok: false, error: kind === 'heic' || kind === 'avif' ? 'This photo format isn’t supported. Use a JPEG or PNG.' : 'That file isn’t a picture.' };
    }

    const id = crypto.randomUUID();
    const filename = `${id}${EXTENSION[kind]}`;
    await ensureDirs();
    await fs.writeFile(path.join(UPLOADS_DIR, filename), buffer);

    const db = await readDb();
    const name = (typeof customName === 'string' && customName.replace(/\s+/g, ' ').trim().slice(0, 60)) || file.name.replace(/\.[^.]+$/, '') || 'Picture';
    const image: ImageRecord = {
        id,
        filename,
        url: `/uploads/${filename}`,
        originalName: file.name || filename,
        name,
        tags: [],
        folderId,
        createdAt: Date.now(),
    };
    db.images.push(image);
    await writeDb(db);
    revalidatePath('/');
    return { ok: true, image };
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

/** Rename a picture (shared, so everyone sees the new name). */
export async function renameImage(imageId: string, name: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
    const clean = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    if (!clean) return { ok: false, error: 'Give it a name.' };
    const db = await readDb();
    const img = db.images.find((i) => i.id === imageId);
    if (!img) return { ok: false, error: 'That picture no longer exists.' };
    img.name = clean;
    await writeDb(db);
    revalidatePath('/');
    return { ok: true, name: clean };
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

