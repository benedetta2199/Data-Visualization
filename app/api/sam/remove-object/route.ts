import { NextRequest, NextResponse } from 'next/server';

const SAM_BACKEND_URL = process.env.SAM_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();

        const response = await fetch(`${SAM_BACKEND_URL}/remove-object`, {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('SAM remove object error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to connect to SAM backend' },
            { status: 503 }
        );
    }
}
