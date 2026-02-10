import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { unlink } from 'fs/promises';
import path from 'path';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// DELETE final image
export async function DELETE(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params;
        const body = await request.json();
        const imageName = body.imageName;

        // Delete file from disk
        if (imageName) {
            const filePath = path.join(process.cwd(), 'public', imageName);
            try {
                await unlink(filePath);
            } catch {
                console.log('File not found or already deleted');
            }
        }

        // Delete from database
        await query('DELETE FROM fi_final_images WHERE fi_ID = ?', [id]);

        return NextResponse.json({ success: 'Immagine eliminata con successo' });
    } catch (error) {
        console.error('Error deleting final image:', error);
        return NextResponse.json(
            { error: 'Errore durante l\'eliminazione dell\'immagine' },
            { status: 500 }
        );
    }
}
