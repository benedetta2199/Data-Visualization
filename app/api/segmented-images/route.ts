import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { SegmentedImage } from '@/types';

// GET segmented images (optionally filtered by original image ID)
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const originalId = searchParams.get('originalId');

        let sql = 'SELECT si_ID, si_ID_ImmagineOriginale, si_nome FROM si_segmented_images';
        const params: string[] = [];

        if (originalId) {
            sql += ' WHERE si_ID_ImmagineOriginale = ?';
            params.push(originalId);
        }

        const segmentedImages = await query<SegmentedImage[]>(sql, params);
        return NextResponse.json(segmentedImages || []);
    } catch (error) {
        console.error('Error fetching segmented images:', error);
        return NextResponse.json(
            { error: 'Errore durante il recupero delle immagini segmentate' },
            { status: 500 }
        );
    }
}
