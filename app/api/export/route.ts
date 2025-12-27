import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

// Helper to convert Node stream to Web Stream
function nodeToWeb(nodeStream: ReadableStream<Uint8Array> | NodeJS.ReadableStream) {
    const iterator = (nodeStream as NodeJS.ReadableStream)[Symbol.asyncIterator]();
    return new ReadableStream({
        async pull(controller) {
            const { value, done } = await iterator.next();
            if (done) controller.close();
            else controller.enqueue(value);
        },
    });
}

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
        // ... (existing DB read logic seems fine, relying on file system sync read for DB is ok for now)
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

        // 3. Create ZIP
        // Use Archiver
        const archive = archiver('zip', { zlib: { level: 9 } });

        // Trap errors inside the archive stream to avoid silent failures
        archive.on('error', (err) => {
            console.error('Archiver Error:', err);
            // We can't really change the response status once headers are sent,
            // but we can log it.
        });

        // Add files
        filesToZip.forEach(file => {
            archive.file(file.path, { name: file.name });
        });

        // We must finalize properly *after* setting up the download,
        // but `archive` is a stream that pushes data when we wrap it.
        // Important: finalize() is async-ish, it signals end of input.
        archive.finalize();

        // 4. Return Response with Web Stream
        // Convert the Node stream (archive) to a Web ReadableStream
        const stream = nodeToWeb(archive);

        return new NextResponse(stream, {
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
