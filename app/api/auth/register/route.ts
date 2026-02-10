import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { User, ApiResponse } from '@/types';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, email, password, password2 } = body;

        // Validation
        if (!username || !email || !password || !password2) {
            return NextResponse.json(
                { error: 'Tutti i campi sono obbligatori' } as ApiResponse,
                { status: 400 }
            );
        }

        if (password !== password2) {
            return NextResponse.json(
                { error: 'Le password non corrispondono' } as ApiResponse,
                { status: 400 }
            );
        }

        if (password.length < 6) {
            return NextResponse.json(
                { error: 'La password deve essere di almeno 6 caratteri' } as ApiResponse,
                { status: 400 }
            );
        }

        // Check if email already exists
        const existingUsers = await query<User[]>(
            'SELECT ID FROM utente WHERE email = ?',
            [email]
        );

        if (existingUsers && existingUsers.length > 0) {
            return NextResponse.json(
                { error: 'Email già registrata' } as ApiResponse,
                { status: 400 }
            );
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        await query(
            'INSERT INTO utente (username, email, Password) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );

        return NextResponse.json({ success: 'Registrazione completata con successo' });
    } catch (error) {
        console.error('Registration error:', error);
        return NextResponse.json(
            { error: 'Errore durante la registrazione' },
            { status: 500 }
        );
    }
}
