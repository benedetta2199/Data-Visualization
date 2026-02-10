import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { FinalImage } from '@/types';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// GET final images (optionally filtered by palette)
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const paletteId = searchParams.get('paletteId');

        let sql = `
      SELECT fi.fi_ID, fi.fi_nome, fi.fi_ID_ImmagineOriginale, 
             fi.fi_ID_ImmagineSegmentata, fi.fi_ID_Dataset
      FROM fi_final_images fi
    `;
        const params: string[] = [];

        if (paletteId) {
            sql += `
        JOIN dataset_palette dp ON fi.fi_ID_Dataset = dp.dp_ID_Dataset
        WHERE dp.dp_ID_Palette = ?
      `;
            params.push(paletteId);
        }

        const finalImages = await query<FinalImage[]>(sql, params);
        return NextResponse.json(finalImages || []);
    } catch (error) {
        console.error('Error fetching final images:', error);
        return NextResponse.json(
            { error: 'Errore durante il recupero delle immagini finali' },
            { status: 500 }
        );
    }
}

// POST save final image
export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const finalImage = formData.get('finalImage') as File;
        const segmentedImageId = formData.get('segmentedImageId') as string;
        const originalImageId = formData.get('originalImageId') as string;
        const datasetId = formData.get('datasetId') as string;

        if (!finalImage) {
            return NextResponse.json(
                { error: 'Immagine finale richiesta' },
                { status: 400 }
            );
        }

        // Create directory if doesn't exist
        const finalDir = path.join(process.cwd(), 'public', 'finalImages');
        await mkdir(finalDir, { recursive: true });

        // Generate unique filename
        const timestamp = Date.now();
        const filename = `finalImages/${timestamp}_final.png`;
        const filePath = path.join(process.cwd(), 'public', filename);

        // Save file
        const buffer = Buffer.from(await finalImage.arrayBuffer());
        await writeFile(filePath, buffer);

        // Save to database
        await query(
            `INSERT INTO fi_final_images 
       (fi_nome, fi_ID_ImmagineOriginale, fi_ID_ImmagineSegmentata, fi_ID_Dataset) 
       VALUES (?, ?, ?, ?)`,
            [filename, originalImageId, segmentedImageId, datasetId]
        );

        return NextResponse.json({ success: 'Immagine salvata con successo' });
    } catch (error) {
        console.error('Error saving final image:', error);
        return NextResponse.json(
            { error: 'Errore durante il salvataggio dell\'immagine finale' },
            { status: 500 }
        );
    }
}
