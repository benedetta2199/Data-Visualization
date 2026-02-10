import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { Dataset } from '@/types';

// GET all datasets
export async function GET() {
    try {
        const datasets = await query<Dataset[]>('SELECT ID, Nome as nome FROM dataset');
        return NextResponse.json(datasets || []);
    } catch (error) {
        console.error('Error fetching datasets:', error);
        return NextResponse.json(
            { error: 'Errore durante il recupero dei dataset' },
            { status: 500 }
        );
    }
}

// POST new dataset
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, datasets: subDatasets } = body;

        if (!name) {
            return NextResponse.json(
                { error: 'Nome dataset richiesto' },
                { status: 400 }
            );
        }

        // Insert main dataset
        const result = await query<{ insertId: number }>(
            'INSERT INTO dataset (Nome) VALUES (?)',
            [name]
        );

        // Note: The original PHP code had nested datasets with data items
        // This is a simplified version - you may need to add additional tables

        return NextResponse.json({
            success: 'Dataset creato con successo',
            id: (result as unknown as { insertId: number }).insertId
        });
    } catch (error) {
        console.error('Error creating dataset:', error);
        return NextResponse.json(
            { error: 'Errore durante la creazione del dataset' },
            { status: 500 }
        );
    }
}
