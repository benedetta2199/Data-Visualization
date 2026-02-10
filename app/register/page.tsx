'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        password2: ''
    });
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (data.error) {
                setError(data.error);
                setSuccess(null);
            } else if (data.success) {
                setSuccess(data.success);
                setError(null);
                setTimeout(() => {
                    router.push('/login');
                }, 1500);
            }
        } catch (err) {
            console.error('Errore durante la richiesta:', err);
            setError('Si è verificato un errore durante la registrazione');
            setSuccess(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container">
            <form className="mt-5" onSubmit={handleSubmit}>
                <h2 className="mb-4">Registrazione</h2>

                <div className="form-group mb-3">
                    <label htmlFor="username">Nome utente:</label>
                    <input
                        type="text"
                        id="username"
                        className="form-control"
                        placeholder="Inserisci nome utente"
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        required
                    />
                </div>

                <div className="form-group mb-3">
                    <label htmlFor="email">Email:</label>
                    <input
                        type="email"
                        id="email"
                        className="form-control"
                        placeholder="Inserisci email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                    />
                </div>

                <div className="form-group mb-3">
                    <label htmlFor="password">Password:</label>
                    <input
                        type="password"
                        id="password"
                        className="form-control"
                        placeholder="Inserisci password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                    />
                </div>

                <div className="form-group mb-3">
                    <label htmlFor="password2">Conferma password:</label>
                    <input
                        type="password"
                        id="password2"
                        className="form-control"
                        placeholder="Ripeti password"
                        value={formData.password2}
                        onChange={(e) => setFormData({ ...formData, password2: e.target.value })}
                        required
                    />
                </div>

                <button type="submit" className="btn btn-dark btn-block mt-2" disabled={loading}>
                    {loading ? 'Registrazione...' : 'Registrati'}
                </button>
            </form>

            {error && (
                <div className="alert alert-danger mt-3" role="alert">
                    {error}
                </div>
            )}

            {success && (
                <div className="alert alert-success mt-3" role="alert">
                    {success}
                </div>
            )}

            <p className="mt-3 text-center">
                Hai già un account?{' '}
                <Link href="/login" className="link-primary">
                    Accedi
                </Link>
            </p>
        </div>
    );
}
