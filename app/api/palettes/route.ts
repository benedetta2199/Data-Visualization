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
        colore.codice AS color_code,
        cd_colori_discreti.cd_ordine AS color_order
      FROM palette 
      JOIN cd_colori_discreti ON palette.ID = cd_colori_discreti.cd_ID_Palette 
      JOIN colore ON cd_colori_discreti.cd_ID_Colore = colore.ID 
      WHERE cd_colori_discreti.cd_ordine BETWEEN ? AND ?
      ORDER BY palette.ID, cd_colori_discreti.cd_ordine
    `;

        type RawRow = { palette_id: number; palette_name: string; color_code: string; color_order: number };
        const rows = await query<RawRow[]>(sql, [minGradient, maxGradient]);

        if (!rows || rows.length === 0) {
            return NextResponse.json([]);
        }

        const paletteMap = new Map<number, { id: number; name: string; colors: string[] }>();
        rows.forEach(row => {
            if (!paletteMap.has(row.palette_id)) {
                paletteMap.set(row.palette_id, {
                    id: row.palette_id,
                    name: row.palette_name,
                    colors: []
                });
            }
            paletteMap.get(row.palette_id)!.colors.push(row.color_code);
        });

        const formattedPalettes = Array.from(paletteMap.values());

        return NextResponse.json(formattedPalettes);
    } catch (error: any) {
        console.error('Error fetching palettes:', error);
        return NextResponse.json(
            { error: error?.message || 'Errore durante il recupero delle palette' },
            { status: 500 }
        );
    }
}
