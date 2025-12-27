import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { Readable } from 'stream';

// --- Reused Path Logic from actions.ts ---
const BASE_PATH = process.env.STORAGE_PATH || process.cwd();

const DATA_DIR = process.env.STORAGE_PATH
    ? path.join(process.env.STORAGE_PATH, 'data')
    : path.join(process.cwd(), 'data');

const UPLOADS_DIR = process.env.STORAGE_PATH
    ? path.join(process.env.STORAGE_PATH, 'uploads')
    : path.join(process.cwd(), 'public', 'uploads');

const DB_PATH = path.join(DATA_DIR, 'db.json');
// ----------------------------------------

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { folderIds = [], tags = [], includeAll = false } = body;

        // 1. Read Database
        if (!fs.existsSync(DB_PATH)) {
            return new NextResponse('Database not found', { status: 404 });
        }
        const dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        const images = dbData.images || [];

        // 2. Filter Images
        const filesToZip: { path: string; name: string }[] = [];

        images.forEach((img: any) => {
            // Only export if it has a generated GIF
            if (!img.gifUrl) return;

            let shouldInclude = false;

            if (includeAll) {
                shouldInclude = true;
            } else {
                // Check Folder
                if (folderIds.includes(img.folderId)) shouldInclude = true;
                // Check Tags
                if (img.tags && img.tags.some((t: string) => tags.includes(t))) shouldInclude = true;
            }

            if (shouldInclude) {
                const gifFilename = path.basename(img.gifUrl);
                const absPath = path.join(UPLOADS_DIR, gifFilename);

                if (fs.existsSync(absPath)) {
                    // Use custom name if available, else original file name logic
                    // Ensure unique names in ZIP? archiver handles collisions or we can prefix.
                    // Let's use clean name from UI if possible.
                    let exportName = img.name ? `${img.name}.gif` : gifFilename;

                    // Sanitize filename
                    exportName = exportName.replace(/[^a-z0-9.]/gi, '_');

                    filesToZip.push({
                        path: absPath,
                        name: exportName
                    });
                }
            }
        });

        if (filesToZip.length === 0) {
            return new NextResponse(JSON.stringify({ error: 'No matching GIFs found to export.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 3. Create ZIP Stream
        const archive = archiver('zip', {
            zlib: { level: 9 } // Compression level
        });

        // Pipe archive to a pass-through stream to send as response
        const stream = new Readable().wrap(archive);

        // Add files
        filesToZip.forEach(file => {
            archive.file(file.path, { name: file.name });
        });

        archive.finalize();

        // 4. Return Response
        return new NextResponse(stream as any, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="gifs_export_${Date.now()}.zip"`
            }
        });

    } catch (error) {
        console.error("Export Error:", error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
