import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET dataset colors for gradient generation
export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const datasetId = formData.get('dataset');

        if (!datasetId) {
            return NextResponse.json(
                { error: 'Dataset ID richiesto' },
                { status: 400 }
            );
        }

        // This query needs to be adjusted based on your actual database schema
        // The original PHP fetches colors associated with a dataset through a dataset_palette relationship
        const sql = `
      SELECT c.codice 
      FROM colore c
      JOIN cd_colori_discreti cd ON c.ID = cd.cd_ID_Colore
      JOIN dataset_palette dp ON cd.cd_ID_Palette = dp.dp_ID_Palette
      WHERE dp.dp_ID_Dataset = ?
      ORDER BY cd.cd_ordine
    `;

        const colors = await query<Array<{ codice: string }>>(sql, [datasetId]);

        if (!colors || colors.length === 0) {
            // Fallback: return some default colors
            return NextResponse.json(['#ff0000', '#00ff00', '#0000ff']);
        }

        return NextResponse.json(colors.map(c => c.codice));
    } catch (error) {
        console.error('Error fetching dataset colors:', error);
        return NextResponse.json(
            { error: 'Errore durante il recupero dei colori del dataset' },
            { status: 500 }
        );
    }
}
