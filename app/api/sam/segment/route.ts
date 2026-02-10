import { NextRequest, NextResponse } from 'next/server';

const SAM_BACKEND_URL = process.env.SAM_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();

        // Forward the request to the Python backend
        const response = await fetch(`${SAM_BACKEND_URL}/segment-with-image`, {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('SAM segment error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to connect to SAM backend', masks: [] },
            { status: 503 }
        );
    }
}
