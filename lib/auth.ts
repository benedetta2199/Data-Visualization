import { SessionOptions } from 'iron-session';
import { SessionData } from '@/types';

export const sessionOptions: SessionOptions = {
    password: process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long',
    cookieName: 'tirocinio_session',
    cookieOptions: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 1 week
    },
};

export const defaultSession: SessionData = {
    isLoggedIn: false,
};
