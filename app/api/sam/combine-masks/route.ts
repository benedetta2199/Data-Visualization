import { NextRequest, NextResponse } from 'next/server';

const SAM_BACKEND_URL = process.env.SAM_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const response = await fetch(`${SAM_BACKEND_URL}/combine-masks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('SAM combine masks error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to connect to SAM backend' },
            { status: 503 }
        );
    }
}
