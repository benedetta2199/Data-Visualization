import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { unlink } from 'fs/promises';
import path from 'path';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET single image
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params;

        const images = await query<Array<{ ID: number; nome: string }>>(
            'SELECT ID, nome FROM images WHERE ID = ?',
            [id]
        );

        if (!images || images.length === 0) {
            return NextResponse.json(
                { error: 'Immagine non trovata' },
                { status: 404 }
            );
        }

        // Get segmented images for this original
        const segmentedImages = await query<Array<{ si_ID: number; si_nome: string }>>(
            'SELECT si_ID, si_nome FROM si_segmented_images WHERE si_ID_ImmagineOriginale = ?',
            [id]
        );

        return NextResponse.json({
            ...images[0],
            segmentedImages: segmentedImages || []
        });
    } catch (error) {
        console.error('Error fetching image:', error);
        return NextResponse.json(
            { error: 'Errore durante il recupero dell\'immagine' },
            { status: 500 }
        );
    }
}

// DELETE image
export async function DELETE(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params;

        // Get image info
        const images = await query<Array<{ nome: string }>>(
            'SELECT nome FROM images WHERE ID = ?',
            [id]
        );

        if (images && images.length > 0) {
            // Delete file from disk
            const filePath = path.join(process.cwd(), 'public', images[0].nome);
            try {
                await unlink(filePath);
            } catch {
                console.log('File not found or already deleted');
            }
        }

        // Delete segmented images associated with this image
        const segmentedImages = await query<Array<{ si_nome: string }>>(
            'SELECT si_nome FROM si_segmented_images WHERE si_ID_ImmagineOriginale = ?',
            [id]
        );

        for (const segImg of segmentedImages || []) {
            const segPath = path.join(process.cwd(), 'public', segImg.si_nome);
            try {
                await unlink(segPath);
            } catch {
                console.log('Segmented file not found or already deleted');
            }
        }

        // Delete from database
        await query('DELETE FROM si_segmented_images WHERE si_ID_ImmagineOriginale = ?', [id]);
        await query('DELETE FROM images WHERE ID = ?', [id]);

        return NextResponse.json({ success: 'Immagine eliminata con successo' });
    } catch (error) {
        console.error('Error deleting image:', error);
        return NextResponse.json(
            { error: 'Errore durante l\'eliminazione dell\'immagine' },
            { status: 500 }
        );
    }
}
