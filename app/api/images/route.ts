import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ImageRecord } from '@/types';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// GET all images
export async function GET() {
    try {
        const images = await query<ImageRecord[]>('SELECT ID, nome FROM images');
        return NextResponse.json(images || []);
    } catch (error) {
        console.error('Error fetching images:', error);
        return NextResponse.json(
            { error: 'Errore durante il recupero delle immagini' },
            { status: 500 }
        );
    }
}

// POST new image
export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const imageFile = formData.get('imageFile') as File;
        const segmentedImageFile = formData.get('segmentedImageFile') as File;

        if (!imageFile) {
            return NextResponse.json(
                { error: 'Immagine richiesta' },
                { status: 400 }
            );
        }

        // Create upload directories if they don't exist
        const uploadDir = path.join(process.cwd(), 'public', 'upload');
        const segmentedDir = path.join(process.cwd(), 'public', 'segmentedImages');
        await mkdir(uploadDir, { recursive: true });
        await mkdir(segmentedDir, { recursive: true });

        // Generate unique filenames
        const timestamp = Date.now();
        const originalFilename = `upload/${timestamp}_${imageFile.name}`;
        const originalPath = path.join(process.cwd(), 'public', originalFilename);

        // Save original image
        const originalBuffer = Buffer.from(await imageFile.arrayBuffer());
        await writeFile(originalPath, originalBuffer);

        // Save to database
        const result = await query<{ insertId: number }>(
            'INSERT INTO images (nome) VALUES (?)',
            [originalFilename]
        );
        const imageId = (result as unknown as { insertId: number }).insertId;

        // Save segmented image if provided
        if (segmentedImageFile) {
            const segmentedFilename = `segmentedImages/${timestamp}_segmented_${imageFile.name.replace(/\.[^/.]+$/, '.png')}`;
            const segmentedPath = path.join(process.cwd(), 'public', segmentedFilename);
            const segmentedBuffer = Buffer.from(await segmentedImageFile.arrayBuffer());
            await writeFile(segmentedPath, segmentedBuffer);

            // Save segmented image to database
            await query(
                'INSERT INTO si_segmented_images (si_ID_ImmagineOriginale, si_nome) VALUES (?, ?)',
                [imageId, segmentedFilename]
            );
        }

        return NextResponse.json({
            success: 'Immagini salvate con successo',
            id: imageId
        });
    } catch (error) {
        console.error('Error saving image:', error);
        return NextResponse.json(
            { error: 'Errore durante il salvataggio dell\'immagine' },
            { status: 500 }
        );
    }
}
