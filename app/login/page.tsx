'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (data.error) {
                setError(data.error);
            } else if (data.success) {
                router.push('/');
                router.refresh();
            }
        } catch (err) {
            console.error('Errore durante la richiesta:', err);
            setError('Si è verificato un errore durante il login');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container">
            <form className="mt-5" onSubmit={handleSubmit}>
                <fieldset>
                    <legend>Login</legend>

                    <div className="mb-3">
                        <label htmlFor="email" className="form-label">Email:</label>
                        <input
                            type="email"
                            id="email"
                            className="form-control"
                            placeholder="La tua e-mail"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            required
                        />
                    </div>

                    <div className="mb-3">
                        <label htmlFor="password" className="form-label">Password:</label>
                        <input
                            type="password"
                            id="password"
                            className="form-control"
                            placeholder="La tua password"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            required
                        />
                    </div>

                    <button type="submit" className="btn btn-dark" disabled={loading}>
                        {loading ? 'Accesso in corso...' : 'Login'}
                    </button>
                </fieldset>
            </form>

            {error && (
                <div className="alert alert-danger mt-3" role="alert">
                    {error}
                </div>
            )}

            <p className="mt-3 text-center">
                Non sei ancora registrato?{' '}
                <Link href="/register" className="link-primary">
                    Registrati
                </Link>
            </p>
        </div>
    );
}
