'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ImageRecord {
    ID: number;
    nome: string;
}

interface SegmentedImage {
    si_ID: number;
    si_ID_ImmagineOriginale: number;
    si_nome: string;
}

export default function ImagePage() {
    const [images, setImages] = useState<ImageRecord[]>([]);
    const [segmentedImages, setSegmentedImages] = useState<SegmentedImage[]>([]);
    const [filteredSegmented, setFilteredSegmented] = useState<SegmentedImage[]>([]);
    const [selectedSegmented, setSelectedSegmented] = useState<string>('');
    const [displayedImage, setDisplayedImage] = useState<string>('');

    useEffect(() => {
        fetchImages();
        fetchSegmentedImages();
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

    const fetchSegmentedImages = async () => {
        try {
            const response = await fetch('/api/segmented-images');
            const data = await response.json();
            setSegmentedImages(data);
            setFilteredSegmented(data);
        } catch (error) {
            console.error('Error fetching segmented images:', error);
        }
    };

    const handleOriginalImageClick = (image: ImageRecord) => {
        // Filter segmented images by original
        const filtered = segmentedImages.filter(
            seg => seg.si_ID_ImmagineOriginale === image.ID
        );
        setFilteredSegmented(filtered);
        setDisplayedImage(`/${image.nome}`);
    };

    const handleSegmentedSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        setSelectedSegmented(value);
        if (value) {
            setDisplayedImage(`/${value}`);
        }
    };

    const handleDeleteImage = async (imageId: number) => {
        if (!confirm('Sei sicuro di voler eliminare questa immagine?')) return;

        try {
            const response = await fetch(`/api/images/${imageId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                alert('Immagine eliminata con successo!');
                fetchImages();
                fetchSegmentedImages();
            } else {
                alert('Errore durante l\'eliminazione dell\'immagine.');
            }
        } catch (error) {
            console.error('Error:', error);
        }
    };

    return (
        <div className="container-fluid h-100">
            <div className="row h-100">
                <div className="col-md-6 p-5">
                    <Link href="/generation" className="d-block text-decoration-none">
                        <div className="bg-primary p-5 text-center text-white h-100 opacity-hover rounded">
                            <h2>Carica Immagine</h2>
                            <p>Carica una nuova immagine per iniziare</p>
                        </div>
                    </Link>

                    <h2 className="mt-4">Immagini Originali</h2>
                    {images.length > 0 ? (
                        images.map(image => (
                            <div key={image.ID} className="mb-3">
                                <img
                                    src={`/${image.nome}`}
                                    alt="Immagine"
                                    style={{ maxWidth: '100px', cursor: 'pointer' }}
                                    className="original-image"
                                    onClick={() => handleOriginalImageClick(image)}
                                />
                                <button
                                    className="btn btn-danger ms-2"
                                    onClick={() => handleDeleteImage(image.ID)}
                                >
                                    Elimina
                                </button>
                            </div>
                        ))
                    ) : (
                        <p>Nessuna immagine trovata.</p>
                    )}
                </div>

                <div className="col-md-6 p-5">
                    <h2 className="mt-4">Immagini Segmentate</h2>
                    {filteredSegmented.length > 0 ? (
                        <>
                            <select
                                id="segmented_image_select"
                                className="form-select"
                                value={selectedSegmented}
                                onChange={handleSegmentedSelect}
                            >
                                <option value="">Seleziona un'immagine segmentata</option>
                                {filteredSegmented.map(seg => (
                                    <option key={seg.si_ID} value={seg.si_nome}>
                                        {seg.si_nome}
                                    </option>
                                ))}
                            </select>
                        </>
                    ) : (
                        <p>Nessuna immagine segmentata trovata.</p>
                    )}

                    <div id="segmented_image_display" className="mt-3">
                        {displayedImage && (
                            <img
                                src={displayedImage}
                                alt="Immagine"
                                style={{ maxWidth: '100%' }}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
