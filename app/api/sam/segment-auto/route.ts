import { NextRequest, NextResponse } from 'next/server';

const SAM_BACKEND_URL = process.env.SAM_BACKEND_URL || 'http://localhost:8000';

// Allow large image uploads and long processing times
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';


export async function POST(request: NextRequest) {
    try {
        // Read the raw body and content-type to forward as-is to the backend
        const contentType = request.headers.get('content-type') || '';
        const body = await request.arrayBuffer();

        const response = await fetch(`${SAM_BACKEND_URL}/segment-auto`, {
            method: 'POST',
            headers: {
                'Content-Type': contentType,
            },
            body: Buffer.from(body),
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('SAM auto segment error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to connect to SAM backend: ' + (error instanceof Error ? error.message : 'Unknown error'), masks: [] },
            { status: 503 }
        );
    }
}
