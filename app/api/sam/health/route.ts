import { NextRequest, NextResponse } from 'next/server';

const SAM_BACKEND_URL = process.env.SAM_BACKEND_URL || 'http://localhost:8000';

export async function GET() {
    try {
        const response = await fetch(`${SAM_BACKEND_URL}/health`);
        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json(
            {
                status: 'error',
                model_loaded: false,
                message: 'SAM backend not available. Make sure the Python server is running.'
            },
            { status: 503 }
        );
    }
}
