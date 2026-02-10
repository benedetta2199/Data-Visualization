import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions } from '@/lib/auth';
import { SessionData } from '@/types';

export async function POST() {
    try {
        const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
        session.destroy();

        return NextResponse.json({ success: 'Logout effettuato con successo' });
    } catch (error) {
        console.error('Logout error:', error);
        return NextResponse.json(
            { error: 'Errore durante il logout' },
            { status: 500 }
        );
    }
}
