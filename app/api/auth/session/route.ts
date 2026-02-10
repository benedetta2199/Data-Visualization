import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions } from '@/lib/auth';
import { SessionData } from '@/types';

export async function GET() {
    try {
        const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

        return NextResponse.json({
            isLoggedIn: session.isLoggedIn || false,
            userId: session.userId
        });
    } catch (error) {
        console.error('Session error:', error);
        return NextResponse.json({ isLoggedIn: false });
    }
}
