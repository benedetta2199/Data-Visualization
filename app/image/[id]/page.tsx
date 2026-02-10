'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Script from 'next/script';

declare const cv: {
    Mat: new (...args: unknown[]) => CVMat;
    imread: (img: HTMLImageElement | HTMLCanvasElement) => CVMat;
    imshow: (canvas: HTMLCanvasElement, mat: CVMat) => void;
    cvtColor: (src: CVMat, dst: CVMat, code: number, dstCn: number) => void;
    threshold: (src: CVMat, dst: CVMat, thresh: number, maxval: number, type: number) => void;
    resize: (src: CVMat, dst: CVMat, dsize: { width: number; height: number }, fx: number, fy: number, interpolation: number) => void;
    bitwise_and: (src1: CVMat, src2: CVMat, dst: CVMat, mask?: CVMat) => void;
    addWeighted: (src1: CVMat, alpha: number, src2: CVMat, beta: number, gamma: number, dst: CVMat) => void;
    CV_8UC4: number;
    COLOR_RGBA2GRAY: number;
    THRESH_BINARY_INV: number;
    INTER_LINEAR: number;
};

interface CVMat {
    data: Uint8ClampedArray;
    delete: () => void;
    size: () => { width: number; height: number };
}

interface SegmentedImage {
    si_ID: number;
    si_nome: string;
}

interface Dataset {
    ID: number;
    nome: string;
}

interface Palette {
    id: number;
    name: string;
    colors: string[];
}

export default function ImageDetailPage() {
    const params = useParams();
    const imageId = params.id as string;

    const [originalImage, setOriginalImage] = useState<string>('');
    const [segmentedImages, setSegmentedImages] = useState<SegmentedImage[]>([]);
    const [selectedSegmented, setSelectedSegmented] = useState<string>('');
    const [selectedSegmentedId, setSelectedSegmentedId] = useState<number | null>(null);
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [selectedDataset, setSelectedDataset] = useState<string>('');
    const [gradientType, setGradientType] = useState('rightToLeft');
    const [palettes, setPalettes] = useState<Palette[]>([]);
    const [selectedPalette, setSelectedPalette] = useState<number | null>(null);
    const [minGradient, setMinGradient] = useState(0);
    const [maxGradient, setMaxGradient] = useState(100);
    const [opencvReady, setOpencvReady] = useState(false);

    const originalImageRef = useRef<HTMLImageElement>(null);
    const segmentedImageRef = useRef<HTMLImageElement>(null);
    const resultCanvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        fetchImageData();
        fetchDatasets();
        fetchPalettes();
    }, [imageId]);

    useEffect(() => {
        fetchPalettes();
    }, [minGradient, maxGradient]);

    const fetchImageData = async () => {
        try {
            const response = await fetch(`/api/images/${imageId}`);
            const data = await response.json();
            setOriginalImage(`/${data.nome}`);
            setSegmentedImages(data.segmentedImages || []);
            if (data.segmentedImages?.length > 0) {
                setSelectedSegmented(data.segmentedImages[0].si_nome);
                setSelectedSegmentedId(data.segmentedImages[0].si_ID);
            }
        } catch (error) {
            console.error('Error fetching image:', error);
        }
    };

    const fetchDatasets = async () => {
        try {
            const response = await fetch('/api/datasets');
            const data = await response.json();
            setDatasets(data);
            if (data.length > 0) {
                setSelectedDataset(data[0].ID.toString());
            }
        } catch (error) {
            console.error('Error fetching datasets:', error);
        }
    };

    const fetchPalettes = async () => {
        try {
            const response = await fetch(`/api/palettes?minGradient=${minGradient}&maxGradient=${maxGradient}`);
            const data = await response.json();
            setPalettes(data);
        } catch (error) {
            console.error('Error fetching palettes:', error);
        }
    };

    const handleSegmentedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const option = e.target.options[e.target.selectedIndex];
        setSelectedSegmented(e.target.value);
        setSelectedSegmentedId(parseInt(option.dataset.id || '0'));
    };

    const hexToRgba = (hex: string): number[] => {
        hex = hex.replace(/^#/, '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return [r, g, b, 255];
    };

    const generateGradient = async () => {
        if (!opencvReady || !originalImageRef.current || !segmentedImageRef.current || !resultCanvasRef.current) {
            alert('OpenCV non è ancora pronto o immagini non caricate');
            return;
        }

        try {
            // Fetch colors for selected dataset
            const formData = new FormData();
            formData.append('dataset', selectedDataset);

            const response = await fetch('/api/dataset-colors', {
                method: 'POST',
                body: formData
            });
            const colors: string[] = await response.json();

            if (!colors || colors.length === 0) {
                alert('Nessun colore trovato per questo dataset');
                return;
            }

            // Generate gradient based on type
            const width = originalImageRef.current.naturalWidth;
            const height = originalImageRef.current.naturalHeight;

            let gradient: CVMat;

            if (gradientType === 'concentric') {
                gradient = new cv.Mat(height, width, cv.CV_8UC4);
                const centerX = width / 2;
                const centerY = height / 2;
                const maxDist = Math.max(width, height);

                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const distToCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                        const colorIndex = Math.floor((distToCenter / maxDist) * (colors.length - 1));
                        const colorRgba = hexToRgba(colors[Math.min(colorIndex, colors.length - 1)]);
                        const idx = (y * width + x) * 4;
                        gradient.data[idx] = colorRgba[0];
                        gradient.data[idx + 1] = colorRgba[1];
                        gradient.data[idx + 2] = colorRgba[2];
                        gradient.data[idx + 3] = colorRgba[3];
                    }
                }
            } else {
                gradient = new cv.Mat(1, colors.length, cv.CV_8UC4);
                for (let i = 0; i < colors.length; i++) {
                    const colorRgba = hexToRgba(colors[i]);
                    const idx = gradientType === 'leftToRight' ? (colors.length - i - 1) * 4 : i * 4;
                    gradient.data[idx] = colorRgba[0];
                    gradient.data[idx + 1] = colorRgba[1];
                    gradient.data[idx + 2] = colorRgba[2];
                    gradient.data[idx + 3] = colorRgba[3];
                }
            }

            // Read images
            const originalMat = cv.imread(originalImageRef.current);
            const segmentedMat = cv.imread(segmentedImageRef.current);

            // Create mask from segmented image
            const missingPartMask = new cv.Mat();
            cv.cvtColor(segmentedMat, missingPartMask, cv.COLOR_RGBA2GRAY, 0);
            cv.threshold(missingPartMask, missingPartMask, 1, 255, cv.THRESH_BINARY_INV);

            // Resize gradient to match original
            cv.resize(gradient, gradient, originalMat.size(), 0, 0, cv.INTER_LINEAR);

            // Apply gradient to missing area
            const resultMat = new cv.Mat();
            cv.bitwise_and(gradient, gradient, resultMat, missingPartMask);
            cv.addWeighted(resultMat, 1, originalMat, 1, 0.0, resultMat);

            // Display result
            cv.imshow(resultCanvasRef.current, resultMat);

            // Cleanup
            originalMat.delete();
            segmentedMat.delete();
            missingPartMask.delete();
            gradient.delete();
            resultMat.delete();
        } catch (error) {
            console.error('Error generating gradient:', error);
            alert('Errore durante la generazione del gradiente');
        }
    };

    const saveResultImage = async () => {
        if (!resultCanvasRef.current) {
            alert('Nessuna immagine risultato da salvare');
            return;
        }

        resultCanvasRef.current.toBlob(async (blob) => {
            if (!blob) return;

            const formData = new FormData();
            formData.append('finalImage', blob, 'result_image.png');
            formData.append('segmentedImageId', selectedSegmentedId?.toString() || '');
            formData.append('originalImageId', imageId);
            formData.append('datasetId', selectedDataset);

            try {
                const response = await fetch('/api/final-images', {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    alert('Immagine salvata con successo!');
                } else {
                    alert('Errore durante il salvataggio dell\'immagine');
                }
            } catch (error) {
                console.error('Error saving image:', error);
            }
        }, 'image/png');
    };

    const handlePaletteSubmit = async () => {
        if (selectedPalette === null) return;

        try {
            await fetch('/api/save-dataset-palette', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dataset: selectedDataset,
                    palette: palettes[selectedPalette].id,
                    minGradient,
                    maxGradient
                })
            });
            console.log('Collegamento creato');
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const getGradientPreview = () => {
        if (selectedPalette === null || !palettes[selectedPalette]) return {};
        const colors = palettes[selectedPalette].colors.join(', ');
        return {
            leftToRight: `linear-gradient(to right, ${colors})`,
            rightToLeft: `linear-gradient(to left, ${colors})`,
            concentric: `radial-gradient(circle, ${colors})`
        };
    };

    const gradientPreviews = getGradientPreview();

    return (
        <>
            <Script
                src="https://docs.opencv.org/4.5.0/opencv.js"
                strategy="afterInteractive"
                onLoad={() => setOpencvReady(true)}
            />

            <div className="container mt-4">
                <form onSubmit={(e) => { e.preventDefault(); generateGradient(); }}>
                    <div className="input-group mb-3">
                        <select
                            className="form-select"
                            value={selectedSegmented}
                            onChange={handleSegmentedChange}
                        >
                            {segmentedImages.length > 0 ? (
                                segmentedImages.map(seg => (
                                    <option key={seg.si_ID} value={seg.si_nome} data-id={seg.si_ID}>
                                        {seg.si_nome}
                                    </option>
                                ))
                            ) : (
                                <option value="">Nessuna immagine segmentata disponibile</option>
                            )}
                        </select>
                        <label className="input-group-text">Seleziona Immagine Segmentata</label>
                    </div>

                    <div className="input-group mb-3">
                        <select
                            className="form-select"
                            value={selectedDataset}
                            onChange={(e) => setSelectedDataset(e.target.value)}
                        >
                            {datasets.length > 0 ? (
                                datasets.map(ds => (
                                    <option key={ds.ID} value={ds.ID}>{ds.nome}</option>
                                ))
                            ) : (
                                <option value="">Nessun dataset disponibile</option>
                            )}
                        </select>
                        <label className="input-group-text">Seleziona Dataset</label>
                    </div>

                    <div className="input-group mb-3">
                        <select
                            className="form-select"
                            value={gradientType}
                            onChange={(e) => setGradientType(e.target.value)}
                        >
                            <option value="rightToLeft">Right to Left</option>
                            <option value="leftToRight">Left to Right</option>
                            <option value="concentric">Concentric</option>
                        </select>
                        <label className="input-group-text">Seleziona Tipo Gradiente</label>
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={!opencvReady}>
                        Genera Immagine
                    </button>
                </form>

                <button className="btn btn-success mt-3" onClick={saveResultImage}>
                    Salva Immagine
                </button>

                {/* Palette selection section */}
                <div className="row mt-5">
                    <div className="col-md-6">
                        <h2>Choose Palette</h2>
                        <select
                            className="form-control"
                            value={selectedPalette ?? ''}
                            onChange={(e) => setSelectedPalette(parseInt(e.target.value))}
                        >
                            <option value="">Seleziona una palette</option>
                            {palettes.map((palette, index) => (
                                <option key={palette.id} value={index}>{palette.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="row mt-3">
                    <div className="col-md-6">
                        <h2>Minimum Gradient</h2>
                        <input
                            type="number"
                            className="form-control"
                            value={minGradient}
                            onChange={(e) => setMinGradient(parseInt(e.target.value))}
                        />
                    </div>
                    <div className="col-md-6">
                        <h2>Maximum Gradient</h2>
                        <input
                            type="number"
                            className="form-control"
                            value={maxGradient}
                            onChange={(e) => setMaxGradient(parseInt(e.target.value))}
                        />
                    </div>
                </div>

                <div className="row mt-3">
                    <div className="col">
                        <h2>Gradient Preview</h2>
                        <div className="gradient-box" style={{ background: gradientPreviews.leftToRight || 'none' }}></div>
                        <div className="gradient-box" style={{ background: gradientPreviews.rightToLeft || 'none' }}></div>
                        <div className="gradient-box" style={{ background: gradientPreviews.concentric || 'none' }}></div>
                    </div>
                </div>

                <button type="button" className="btn btn-primary mt-3" onClick={handlePaletteSubmit}>
                    Crea collegamento
                </button>

                {/* Images display */}
                <div className="mt-5 d-flex gap-4 flex-wrap">
                    {originalImage && (
                        <img
                            ref={originalImageRef}
                            src={originalImage}
                            alt="Immagine Originale"
                            style={{ width: '500px' }}
                            crossOrigin="anonymous"
                        />
                    )}
                    {selectedSegmented && (
                        <img
                            ref={segmentedImageRef}
                            src={`/${selectedSegmented}`}
                            alt="Immagine Segmentata"
                            style={{ width: '500px' }}
                            crossOrigin="anonymous"
                        />
                    )}
                </div>

                <div className="mt-4 d-flex justify-content-center">
                    <canvas ref={resultCanvasRef} style={{ width: '500px' }} id="resultImage" />
                </div>
            </div>
        </>
    );
}
