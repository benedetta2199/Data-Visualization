'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const navLinks = [
    { text: 'Data set', url: '/dataset' },
    { text: 'Genera Immagine', url: '/image' },
    { text: 'Immagini', url: '/images-list' },
    { text: 'Immagini finali', url: '/final-images' },
];

export default function Navbar() {
    const pathname = usePathname();
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check if user is logged in
        fetch('/api/auth/session')
            .then(res => res.json())
            .then(data => {
                setIsLoggedIn(data.isLoggedIn);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [pathname]);

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        setIsLoggedIn(false);
        window.location.href = '/';
    };

    return (
        <nav className="navbar navbar-expand-lg navbar-dark bg-dark p-3">
            <div className="container-fluid">
                <Link className="navbar-brand" href="/">
                    Tirocinio
                </Link>

                <button
                    className="navbar-toggler"
                    type="button"
                    data-bs-toggle="collapse"
                    data-bs-target="#navbarNav"
                >
                    <span className="navbar-toggler-icon"></span>
                </button>

                <div className="collapse navbar-collapse" id="navbarNav">
                    <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                        {navLinks.map((page) => (
                            <li key={page.url} className="nav-item">
                                <Link
                                    className={`nav-link ${pathname === page.url ? 'active' : ''}`}
                                    href={page.url}
                                >
                                    {page.text}
                                </Link>
                            </li>
                        ))}
                    </ul>

                    <div className="ms-auto">
                        {!loading && (
                            <ul className="navbar-nav">
                                <li className="nav-item">
                                    {isLoggedIn ? (
                                        <button
                                            className="nav-link text-white btn btn-link"
                                            onClick={handleLogout}
                                        >
                                            Logout
                                        </button>
                                    ) : (
                                        <Link className="nav-link text-white" href="/login">
                                            Login
                                        </Link>
                                    )}
                                </li>
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}
