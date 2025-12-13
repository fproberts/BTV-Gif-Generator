import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

export async function GET(
    request: Request,
    props: { params: Promise<{ filename: string }> }
) {
    const params = await props.params;
    const filename = params.filename;

    // Basic security check to prevent directory traversal
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return new NextResponse('Invalid filename', { status: 400 });
    }

    // Look for the file in the correct uploads directory
    // Logic must match app/actions.ts
    const UPLOADS_DIR = process.env.STORAGE_PATH
        ? path.join(process.env.STORAGE_PATH, 'uploads')
        : path.join(process.cwd(), 'public', 'uploads');

    const filePath = path.join(UPLOADS_DIR, filename);

    try {
        const fileBuffer = await fs.readFile(filePath);

        // Determine content type
        const ext = path.extname(filename).toLowerCase();
        let contentType = 'application/octet-stream';
        if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        if (ext === '.png') contentType = 'image/png';
        if (ext === '.gif') contentType = 'image/gif';
        if (ext === '.webp') contentType = 'image/webp';
        if (ext === '.svg') contentType = 'image/svg+xml';

        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': contentType,
                // Cache control: allow caching but revalidate often since we might overwrite? 
                // Actually for this app, immutable names are used (uuids). 
                // But let's set a short max-age to be safe.
                'Cache-Control': 'public, max-age=60',
            },
        });
    } catch (error) {
        // console.error(`Error serving file ${filename}:`, error); 
        // Silent error preferred for 404s to avoid log spam? 
        // Or maybe log it to help debug if needed.
        return new NextResponse('File not found', { status: 404 });
    }
}
