'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ImageRecord {
    ID: number;
    nome: string;
}

export default function ImagesListPage() {
    const [images, setImages] = useState<ImageRecord[]>([]);

    useEffect(() => {
        fetchImages();
    }, []);

    const fetchImages = async () => {
        try {
            const response = await fetch('/api/images');
            const data = await response.json();
            setImages(data);
        } catch (error) {
            console.error('Error fetching images:', error);
        }
    };

    return (
        <div className="container mt-5">
            <h1 className="mb-4">Lista Immagini</h1>

            {images.length > 0 ? (
                <div className="image-container">
                    {images.map(image => (
                        <div key={image.ID} className="image-box">
                            <Link href={`/image/${image.ID}`} className="image-link">
                                <img src={`/${image.nome}`} alt="Immagine" />
                            </Link>
                        </div>
                    ))}
                </div>
            ) : (
                <p>Nessuna immagine trovata nel database.</p>
            )}
        </div>
    );
}
