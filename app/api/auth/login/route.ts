import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { User, LoginResponse, SessionData } from '@/types';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password } = body;

        // Get session
        const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

        // Check if already logged in
        if (session.userId) {
            return NextResponse.json(
                { error: "L'utente è già loggato" } as LoginResponse,
                { status: 400 }
            );
        }

        // Find user by email
        const users = await query<User[]>(
            'SELECT * FROM utente WHERE email = ?',
            [email]
        );

        if (!users || users.length === 0) {
            return NextResponse.json(
                { error: "L'utente non esiste", show_form: true } as LoginResponse,
                { status: 401 }
            );
        }

        const user = users[0];

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.Password);
        if (!isValidPassword) {
            return NextResponse.json(
                { error: 'Password errata', show_form: true } as LoginResponse,
                { status: 401 }
            );
        }

        // Set session
        session.userId = user.ID;
        session.isLoggedIn = true;
        await session.save();

        return NextResponse.json({ success: 'Login effettuato con successo' });
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json(
            { error: 'Errore durante il login' },
            { status: 500 }
        );
    }
}
