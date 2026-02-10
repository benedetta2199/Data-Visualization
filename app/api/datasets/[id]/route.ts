import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET single dataset details
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params;

        const datasets = await query<Array<{ ID: number; Nome: string }>>(
            'SELECT ID, Nome as name FROM dataset WHERE ID = ?',
            [id]
        );

        if (!datasets || datasets.length === 0) {
            return NextResponse.json(
                { error: 'Dataset non trovato' },
                { status: 404 }
            );
        }

        return NextResponse.json(datasets[0]);
    } catch (error) {
        console.error('Error fetching dataset:', error);
        return NextResponse.json(
            { error: 'Errore durante il recupero del dataset' },
            { status: 500 }
        );
    }
}

// PUT update dataset
export async function PUT(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { name } = body;

        await query(
            'UPDATE dataset SET Nome = ? WHERE ID = ?',
            [name, id]
        );

        return NextResponse.json({ success: 'Dataset aggiornato con successo' });
    } catch (error) {
        console.error('Error updating dataset:', error);
        return NextResponse.json(
            { error: 'Errore durante l\'aggiornamento del dataset' },
            { status: 500 }
        );
    }
}

// DELETE dataset
export async function DELETE(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params;

        await query('DELETE FROM dataset WHERE ID = ?', [id]);

        return NextResponse.json({ success: 'Dataset eliminato con successo' });
    } catch (error) {
        console.error('Error deleting dataset:', error);
        return NextResponse.json(
            { error: 'Errore durante l\'eliminazione del dataset' },
            { status: 500 }
        );
    }
}
