import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { PaletteRecord } from '@/types';

// GET all palettes with colors
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const minGradient = parseInt(searchParams.get('minGradient') || '0');
        const maxGradient = parseInt(searchParams.get('maxGradient') || '100');

        const sql = `
      SELECT 
        palette.ID AS palette_id, 
        palette.nome AS palette_name, 
        GROUP_CONCAT(colore.codice ORDER BY cd_colori_discreti.cd_ordine) AS colors 
      FROM palette 
      JOIN cd_colori_discreti ON palette.ID = cd_colori_discreti.cd_ID_Palette 
      JOIN colore ON cd_colori_discreti.cd_ID_Colore = colore.ID 
      WHERE cd_colori_discreti.cd_ordine BETWEEN ? AND ?
      GROUP BY palette.ID
    `;

        const palettes = await query<PaletteRecord[]>(sql, [minGradient, maxGradient]);

        if (!palettes || palettes.length === 0) {
            return NextResponse.json([]);
        }

        const formattedPalettes = palettes.map(palette => ({
            id: palette.palette_id,
            name: palette.palette_name,
            colors: palette.colors.split(',')
        }));

        return NextResponse.json(formattedPalettes);
    } catch (error) {
        console.error('Error fetching palettes:', error);
        return NextResponse.json(
            { error: 'Errore durante il recupero delle palette' },
            { status: 500 }
        );
    }
}
