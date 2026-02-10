'use client';

import { useState, useEffect } from 'react';

interface Palette {
    id: number;
    name: string;
    colors: string[];
}

interface FinalImage {
    fi_ID: number;
    fi_nome: string;
}

export default function FinalImagesPage() {
    const [palettes, setPalettes] = useState<Palette[]>([]);
    const [selectedPalette, setSelectedPalette] = useState<number | null>(null);
    const [images, setImages] = useState<FinalImage[]>([]);

    useEffect(() => {
        fetchPalettes();
    }, []);

    useEffect(() => {
        if (selectedPalette !== null) {
            fetchImages();
        }
    }, [selectedPalette]);

    const fetchPalettes = async () => {
        try {
            const response = await fetch('/api/palettes');
            const data = await response.json();
            setPalettes(data);
            if (data.length > 0) {
                setSelectedPalette(data[0].id);
            }
        } catch (error) {
            console.error('Error fetching palettes:', error);
        }
    };

    const fetchImages = async () => {
        try {
            const response = await fetch(`/api/final-images?paletteId=${selectedPalette}`);
            const data = await response.json();
            setImages(data);
        } catch (error) {
            console.error('Error fetching images:', error);
        }
    };

    const deleteImage = async (imageId: number, imageName: string) => {
        if (!confirm('Sei sicuro di voler eliminare questa immagine?')) return;

        try {
            await fetch(`/api/final-images/${imageId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageName })
            });
            fetchImages();
        } catch (error) {
            console.error('Error deleting image:', error);
        }
    };

    const saveImage = (imageName: string) => {
        const downloadLink = document.createElement('a');
        downloadLink.href = `/${imageName}`;
        downloadLink.download = imageName.split('/').pop() || 'image.png';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    };

    return (
        <div className="container mt-5">
            <div className="row">
                <div className="col-md-6">
                    <h2>Filtra in base alla palette</h2>
                    <select
                        className="form-control"
                        value={selectedPalette || ''}
                        onChange={(e) => setSelectedPalette(parseInt(e.target.value))}
                    >
                        {palettes.map(palette => (
                            <option key={palette.id} value={palette.id}>
                                {palette.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="image-container mt-4">
                {images.map(image => (
                    <div key={image.fi_ID} className="image-box">
                        <img src={`/${image.fi_nome}`} alt="Immagine" />
                        <div className="button-container mt-2">
                            <button
                                className="delete-button"
                                onClick={() => deleteImage(image.fi_ID, image.fi_nome)}
                            >
                                Elimina
                            </button>
                            <button
                                className="btn btn-primary save-button ms-2"
                                onClick={() => saveImage(image.fi_nome)}
                            >
                                Salva
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {images.length === 0 && (
                <p className="mt-4">Nessuna immagine finale trovata per questa palette.</p>
            )}
        </div>
    );
}
