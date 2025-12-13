'use server';

import fs from 'fs/promises';
import path from 'path';
import { generateGif } from '@/lib/gifGenerator';
import { revalidatePath } from 'next/cache';

// Constants
// Constants
// If STORAGE_PATH is set (e.g. /app/persistent in Docker), we use that root.
// Otherwise we default to the local project structure.
const BASE_PATH = process.env.STORAGE_PATH || process.cwd();

// If we are in Docker (STORAGE_PATH is set), we might need to append 'data' and 'uploads' explicitly
// dependent on if we want them nested.
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

// Types
type ImageRecord = {
    id: string;
    filename: string;
    url: string;
    originalName: string;
    name?: string; // Display name
    tags: string[];
    folderId: string | null;
    createdAt: number;
    gifUrl?: string;
};

type FolderRecord = {
    id: string;
    name: string;
    color?: string;
};

type DB = {
    images: ImageRecord[];
    folders: FolderRecord[];
};

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
    const folder = { id: crypto.randomUUID(), name };
    db.folders.push(folder);
    await writeDb(db);
    revalidatePath('/');
    return folder;
}

export async function uploadImage(formData: FormData, folderId: string | null = null) {
    const file = formData.get('file') as File;
    const customName = formData.get('customName') as string;

    if (!file) throw new Error('No file uploaded');

    const buffer = Buffer.from(await file.arrayBuffer());
    const id = crypto.randomUUID();
    const ext = path.extname(file.name);
    const filename = `${id}${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);

    await ensureDirs();
    await fs.writeFile(filepath, buffer);

    const db = await readDb();
    // Sort newest first by reversing the list (since they are read in alphabetical/date order usually, 
    // or just reverse the result if relying on file system order which is roughly creation time for UUIDs? 
    // Actually UUIDs aren't time ordered. But file system readdir isn't guaranteed order.
    // Ideally we sort by mtime.

    // Let's sort by mtime descending.
    // This comment block seems to be misplaced here, as `uploadImage` adds a single image,
    // it doesn't read a directory of images to sort.
    // If the intent is to reverse the *entire* images array in the DB after adding a new one,
    // that would be `db.images.reverse()`. However, this is usually done when *retrieving*
    // images for display, not when storing them, as it would constantly reorder the entire DB.
    // Assuming the instruction "Reverse image array" refers to the order of images in the DB
    // after an upload, and that new images should appear first, we'll use `unshift`.
    // If the intent was to reverse the array *after* it's been read for display,
    // that would happen in `getAppData` or a similar retrieval function.
    // Given the placement, we'll interpret it as affecting the storage order.
    const image: ImageRecord = {
        id,
        filename,
        url: `/uploads/${filename}`,
        originalName: file.name,
        // Use custom name if provided, else filename logic or base name
        // actually schema didn't have 'name' before, we rely on 'originalName' usually.
        // Let's add 'name' property to record or just store it in originalName?
        // Plan said "Update ImageRecord type to include name".
        // Since Typescript types are runtime-erased here but good for consistency we should assume 'name' exists on the object.
        // To match 'ImageCard' usage later we'll use 'name'.
        // We add it to the object.
        // @ts-ignore - straightforward addition
        name: customName || file.name,
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

export async function deleteImage(imageId: string) {
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
        } catch (e: any) {
            console.error(`[Delete] CRITICAL ERROR removing file:`, e);
            // If error is ENOENT (file not found), we should probably still remove from DB
            // But if EACCES (permission), we need to know.
            if (e.code !== 'ENOENT') {
                // Return detailed error to UI
                return { success: false, error: `${e.code}: ${e.message}` };
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

export async function generateGifForImage(imageId: string) {
    const db = await readDb();
    const img = db.images.find(i => i.id === imageId);
    if (!img) throw new Error('Image not found');

    const inputPath = path.join(UPLOADS_DIR, img.filename);

    // The generator runs locally.
    try {
        const outputPath = await generateGif(inputPath);
        // Path returned is absolute. We need to make it relative to public or just filename.
        // The generator saves as <filename>_1px_scroll.gif in same dir.

        const gifFilename = path.basename(outputPath);
        // Ensure it is in uploads dir (it should be)

        img.gifUrl = `/uploads/${gifFilename}`;
        await writeDb(db);
        revalidatePath('/');
        return img.gifUrl;
    } catch (error) {
        console.error("Gif gen failed", error);
        throw error;
    }
}

export async function checkAdminPassword(password: string) {
    // Hardcoded for "Easter Egg" simplicity as requested
    return password === 'admin123';
}

export async function deleteFolder(folderId: string) {
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
