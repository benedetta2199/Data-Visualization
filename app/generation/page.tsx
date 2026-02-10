'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';

// DeepLab types
declare const deeplab: {
    load: (config: { base: string; quantizationBytes: number }) => Promise<DeepLabModel>;
};

interface DeepLabModel {
    segment: (image: HTMLImageElement) => Promise<DeepLabPrediction>;
}

interface DeepLabPrediction {
    legend: Record<string, [number, number, number]>;
    height: number;
    width: number;
    segmentationMap: Uint8ClampedArray;
}

// SAM types
interface SAMMask {
    mask_id: number;
    mask_base64: string;
    score: number;
    area: number;
    coverage_percent: number;
    color: [number, number, number];
    bbox: [number, number, number, number];
}

interface SAMResponse {
    success: boolean;
    masks: SAMMask[];
    total_masks: number;
    image_width: number;
    image_height: number;
    message: string;
}

interface CombinedMaskResponse {
    success: boolean;
    mask_base64: string;
    area: number;
    coverage_percent: number;
    source_indices: number[];
    operation: string;
    message: string;
}

type ModelType = 'deeplab' | 'sam';
type DeepLabModelName = 'pascal' | 'cityscapes' | 'ade20k';
type SAMModelName = 'vit_b' | 'vit_l' | 'vit_h';
type CombineOperation = 'union' | 'intersection' | 'difference';

export default function GenerationPage() {
    const router = useRouter();
    // Model selection
    const [modelType, setModelType] = useState<ModelType>('sam');
    const [deeplabModelName, setDeeplabModelName] = useState<DeepLabModelName>('pascal');
    const [samModelName, setSamModelName] = useState<SAMModelName>('vit_b');

    // Status
    const [modelLoadedStatus, setModelLoadedStatus] = useState('Modello non caricato...');
    const [segmentButtonDisabled, setSegmentButtonDisabled] = useState(true);
    const [isLoading, setIsLoading] = useState(false);

    // Image and canvas
    const [imageUrl, setImageUrl] = useState<string>('');
    const [showResults, setShowResults] = useState(false);

    // DeepLab state
    const [legends, setLegends] = useState<Record<string, [number, number, number]>>({});
    const [selectedObjects, setSelectedObjects] = useState<Record<string, [number, number, number]>>({});

    // SAM state
    const [samBackendAvailable, setSamBackendAvailable] = useState<boolean | null>(null);

    // Script loading chain state (for DeepLab)
    const [tfCoreLoaded, setTfCoreLoaded] = useState(false);
    const [tfConverterLoaded, setTfConverterLoaded] = useState(false);
    const [tfBackendLoaded, setTfBackendLoaded] = useState(false);
    const [scriptsLoaded, setScriptsLoaded] = useState(false);

    // Refs
    const modelRef = useRef<DeepLabModel | null>(null);
    const predictionRef = useRef<DeepLabPrediction | null>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const originalFileRef = useRef<File | null>(null);

    // Check SAM backend availability
    const checkSamBackend = useCallback(async () => {
        try {
            const response = await fetch('/api/sam/health');
            const data = await response.json();
            setSamBackendAvailable(data.status === 'healthy' || response.ok);
            if (data.model_loaded) {
                setModelLoadedStatus(`SAM ${data.current_model} già caricato`);
                setSegmentButtonDisabled(false);
            }
        } catch {
            setSamBackendAvailable(false);
        }
    }, []);

    // Handle model type change
    const handleModelTypeChange = (type: ModelType) => {
        setModelType(type);
        setModelLoadedStatus('Modello non caricato...');
        setSegmentButtonDisabled(true);
        setShowResults(false);
        setLegends({});
        setSelectedObjects({});

        if (type === 'sam') {
            checkSamBackend();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            originalFileRef.current = file;
            const url = URL.createObjectURL(file);
            setImageUrl(url);
            setShowResults(false);
            setSelectedObjects({});
        }
    };

    // Load DeepLab model
    const loadDeeplabModel = async () => {
        setSegmentButtonDisabled(true);
        setModelLoadedStatus('Caricamento modello...');
        setIsLoading(true);

        try {
            modelRef.current = await deeplab.load({ base: deeplabModelName, quantizationBytes: 2 });
            setModelLoadedStatus(`Modello ${deeplabModelName} caricato!`);
            setSegmentButtonDisabled(false);
        } catch (error) {
            console.error('Error loading model:', error);
            setModelLoadedStatus('Errore nel caricamento del modello');
        } finally {
            setIsLoading(false);
        }
    };

    // Load SAM model
    const loadSamModel = async () => {
        setSegmentButtonDisabled(true);
        setModelLoadedStatus('Caricamento modello SAM...');
        setIsLoading(true);

        try {
            const response = await fetch(`/api/sam/load-model/${samModelName}`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                setModelLoadedStatus(`Modello SAM ${samModelName} caricato su ${data.device}!`);
                setSegmentButtonDisabled(false);
            } else {
                setModelLoadedStatus(`Errore: ${data.detail || data.message}`);
            }
        } catch (error) {
            console.error('Error loading SAM model:', error);
            setModelLoadedStatus('Errore: backend SAM non disponibile');
        } finally {
            setIsLoading(false);
        }
    };

    const loadModel = () => {
        if (modelType === 'deeplab') {
            loadDeeplabModel();
        } else {
            loadSamModel();
        }
    };

    // Segment with DeepLab
    const segmentWithDeeplab = async () => {
        if (!modelRef.current || !imageRef.current) return;

        setIsLoading(true);
        try {
            const prediction = await modelRef.current.segment(imageRef.current);
            predictionRef.current = prediction;
            renderDeeplabPrediction(prediction);
        } catch (error) {
            console.error('Error segmenting:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Segment with SAM (AUTOMATIC)
    const segmentWithSam = async () => {
        if (!originalFileRef.current) {
            alert('Seleziona un\'immagine prima');
            return;
        }

        setIsLoading(true);
        setModelLoadedStatus('Segmentazione automatica in corso...');

        try {
            const formData = new FormData();
            formData.append('image', originalFileRef.current);

            const response = await fetch('/api/sam/segment-auto', {
                method: 'POST',
                body: formData
            });

            const data: SAMResponse = await response.json();

            if (data.success) {
                // Save data to sessionStorage for the masks editor page
                sessionStorage.setItem('sam_masks', JSON.stringify(data.masks));
                sessionStorage.setItem('sam_image_url', imageUrl);

                setModelLoadedStatus(`Trovati ${data.total_masks} oggetti! Apertura editor...`);

                // Navigate to mask editor
                router.push('/generation/masks');
            } else {
                alert(`Errore: ${data.message}`);
                setModelLoadedStatus('Errore nella segmentazione');
            }
        } catch (error) {
            console.error('Error with SAM segmentation:', error);
            alert('Errore nella segmentazione SAM');
            setModelLoadedStatus('Errore nella segmentazione');
        } finally {
            setIsLoading(false);
        }
    };

    const segmentImage = () => {
        if (modelType === 'deeplab') {
            segmentWithDeeplab();
        } else {
            segmentWithSam();
        }
    };

    const renderDeeplabPrediction = (prediction: DeepLabPrediction) => {
        const { legend, height, width, segmentationMap } = prediction;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const segmentationMapData = new ImageData(segmentationMap as any, width, height);

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.putImageData(segmentationMapData, 0, 0);
        }

        setLegends(legend);
        setShowResults(true);
    };





    const toggleObjectSelection = (objectName: string, color: [number, number, number]) => {
        setSelectedObjects(prev => {
            const newSelection = { ...prev };
            if (newSelection[objectName]) {
                delete newSelection[objectName];
            } else {
                newSelection[objectName] = color;
            }
            return newSelection;
        });
    };

    const removeOrRestoreDeeplabObjects = (remove: boolean) => {
        if (!predictionRef.current || !imageRef.current || !canvasRef.current) return;

        const { height, width, segmentationMap } = predictionRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(imageRef.current, 0, 0, width, height);

        const imgData = ctx.getImageData(0, 0, width, height);
        const alphaValue = remove ? 0 : 255;

        for (let i = 0; i < segmentationMap.length; i += 4) {
            Object.entries(selectedObjects).forEach(([, color]) => {
                if (
                    segmentationMap[i] === color[0] &&
                    segmentationMap[i + 1] === color[1] &&
                    segmentationMap[i + 2] === color[2]
                ) {
                    imgData.data[i + 3] = alphaValue;
                }
            });
        }

        ctx.putImageData(imgData, 0, 0);
    };

    const saveImage = async () => {
        if (!originalFileRef.current || !canvasRef.current) {
            alert('Nessuna immagine da salvare');
            return;
        }

        const formData = new FormData();
        formData.append('imageFile', originalFileRef.current);

        canvasRef.current.toBlob(async (blob) => {
            if (blob) {
                formData.append('segmentedImageFile', blob, 'segmented_image.png');

                try {
                    const response = await fetch('/api/images', {
                        method: 'POST',
                        body: formData
                    });

                    if (response.ok) {
                        alert('Immagini salvate con successo!');
                    } else {
                        alert('Errore durante il salvataggio delle immagini.');
                    }
                } catch (error) {
                    console.error('Error:', error);
                }
            }
        }, 'image/png');
    };

    const isLoadButtonDisabled = () => {
        if (modelType === 'deeplab') {
            return !scriptsLoaded || isLoading;
        }
        return samBackendAvailable === false || isLoading;
    };



    return (
        <>
            {/* DeepLab Scripts - only load when DeepLab is selected */}
            {modelType === 'deeplab' && (
                <>
                    <Script
                        src="https://unpkg.com/@tensorflow/tfjs-core@3.3.0/dist/tf-core.js"
                        onLoad={() => {
                            console.log('tf-core loaded');
                            setTfCoreLoaded(true);
                        }}
                    />
                    {tfCoreLoaded && (
                        <Script
                            src="https://unpkg.com/@tensorflow/tfjs-converter@3.3.0/dist/tf-converter.js"
                            onLoad={() => {
                                console.log('tf-converter loaded');
                                setTfConverterLoaded(true);
                            }}
                        />
                    )}
                    {tfConverterLoaded && (
                        <Script
                            src="https://unpkg.com/@tensorflow/tfjs-backend-webgl@3.3.0/dist/tf-backend-webgl.js"
                            onLoad={() => {
                                console.log('tf-backend-webgl loaded');
                                setTfBackendLoaded(true);
                            }}
                        />
                    )}
                    {tfBackendLoaded && (
                        <Script
                            src="https://unpkg.com/@tensorflow-models/deeplab@0.2.1/dist/deeplab.js"
                            onLoad={() => {
                                console.log('deeplab loaded');
                                setScriptsLoaded(true);
                            }}
                        />
                    )}
                </>
            )}

            <div className="container mt-4">
                {/* Model Type Selector */}
                <div className="row mb-4">
                    <div className="col-12">
                        <h2 className="mb-3">🎯 Segmentazione Immagini</h2>
                        <div className="btn-group" role="group">
                            <input
                                type="radio"
                                className="btn-check"
                                name="modelType"
                                id="deeplabRadio"
                                checked={modelType === 'deeplab'}
                                onChange={() => handleModelTypeChange('deeplab')}
                            />
                            <label className="btn btn-outline-primary" htmlFor="deeplabRadio">
                                DeepLab (Browser)
                            </label>

                            <input
                                type="radio"
                                className="btn-check"
                                name="modelType"
                                id="samRadio"
                                checked={modelType === 'sam'}
                                onChange={() => handleModelTypeChange('sam')}
                            />
                            <label className="btn btn-outline-success" htmlFor="samRadio">
                                🔥 SAM Automatico (Server)
                            </label>
                        </div>
                        {modelType === 'sam' && samBackendAvailable === false && (
                            <div className="alert alert-warning mt-2">
                                ⚠️ Backend SAM non disponibile. Avvia il server Python con: <code>cd sam_backend && python sam_server.py</code>
                            </div>
                        )}
                        {modelType === 'sam' && samBackendAvailable && (
                            <div className="alert alert-success mt-2">
                                ✅ SAM segmenta automaticamente TUTTI gli oggetti nell'immagine!
                            </div>
                        )}
                    </div>
                </div>

                <div className="row">
                    <div className="col-md-6">
                        <div className="mb-3">
                            <label htmlFor="modelNameSelect" className="form-label">
                                {modelType === 'deeplab' ? 'Seleziona Modello DeepLab' : 'Seleziona Modello SAM'}
                            </label>
                            {modelType === 'deeplab' ? (
                                <select
                                    className="form-select"
                                    id="modelNameSelect"
                                    value={deeplabModelName}
                                    onChange={(e) => setDeeplabModelName(e.target.value as DeepLabModelName)}
                                >
                                    <option value="pascal">Pascal (20 classi)</option>
                                    <option value="cityscapes">City Scapes (19 classi)</option>
                                    <option value="ade20k">ADE20K (150 classi)</option>
                                </select>
                            ) : (
                                <select
                                    className="form-select"
                                    id="modelNameSelect"
                                    value={samModelName}
                                    onChange={(e) => setSamModelName(e.target.value as SAMModelName)}
                                >
                                    <option value="vit_b">ViT-B (Base, ~375MB) - Consigliato</option>
                                    <option value="vit_l">ViT-L (Large, ~1.2GB)</option>
                                    <option value="vit_h">ViT-H (Huge, ~2.5GB) - Più accurato</option>
                                </select>
                            )}
                        </div>
                        <button
                            className="btn btn-primary"
                            onClick={loadModel}
                            disabled={isLoadButtonDisabled()}
                        >
                            {isLoading ? (
                                <>
                                    <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                                    Caricamento...
                                </>
                            ) : (
                                'Carica Modello'
                            )}
                        </button>
                        <p className="mt-2" style={{ color: 'mediumblue', fontWeight: 'bold' }}>
                            {modelLoadedStatus}
                        </p>
                    </div>

                    <div className="col-md-6">
                        <div className="mb-3">
                            <label htmlFor="chooseFiles" className="form-label">Scegli Immagine</label>
                            <input
                                type="file"
                                className="form-control"
                                id="chooseFiles"
                                accept="image/*"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                            />
                        </div>

                        <button
                            className="btn btn-success me-2"
                            onClick={segmentImage}
                            disabled={segmentButtonDisabled || !imageUrl || isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                                    Segmentazione...
                                </>
                            ) : modelType === 'sam' ? (
                                '🚀 Segmenta Automaticamente'
                            ) : (
                                'Segmenta Immagine'
                            )}
                        </button>
                        <button className="btn btn-primary" onClick={saveImage}>
                            💾 Salva
                        </button>
                    </div>
                </div>

                {/* Image Display */}
                {/* Image Display */}
                <div className="row mt-4">
                    <div className="col-12">
                        <div className="d-flex justify-content-center gap-4 flex-wrap">
                            {imageUrl && (
                                <div>
                                    <h5 className="text-center">Immagine Originale</h5>
                                    <img
                                        ref={imageRef}
                                        src={imageUrl}
                                        alt="Original"
                                        style={{ maxWidth: '600px', maxHeight: '600px', display: 'block' }}
                                        crossOrigin="anonymous"
                                    />
                                </div>
                            )}
                            {showResults && (
                                <div>
                                    <h5 className="text-center">Risultato</h5>
                                    <canvas
                                        ref={canvasRef}
                                        style={{ maxWidth: '600px', maxHeight: '600px', display: 'block' }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* DeepLab Legends */}
                {showResults && modelType === 'deeplab' && Object.keys(legends).length > 0 && (
                    <>
                        <div className="row mt-4">
                            <div className="col">
                                <h5>Clicca sulle legende per selezionare oggetti:</h5>
                                <div className="d-flex flex-wrap gap-2 mt-2">
                                    {Object.entries(legends).map(([name, color]) => (
                                        <span
                                            key={name}
                                            onClick={() => toggleObjectSelection(name, color)}
                                            style={{
                                                backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
                                                padding: '8px 16px',
                                                color: '#fff',
                                                cursor: 'pointer',
                                                border: selectedObjects[name] ? '4px solid #00ff00' : '2px solid #333',
                                                borderRadius: '5px',
                                                fontWeight: 'bold'
                                            }}
                                        >
                                            {name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="row mt-3">
                            <div className="col">
                                <button
                                    className="btn btn-danger me-2"
                                    onClick={() => removeOrRestoreDeeplabObjects(true)}
                                    disabled={Object.keys(selectedObjects).length === 0}
                                >
                                    Rimuovi Oggetti Selezionati
                                </button>
                                <button
                                    className="btn btn-success"
                                    onClick={() => removeOrRestoreDeeplabObjects(false)}
                                    disabled={Object.keys(selectedObjects).length === 0}
                                >
                                    Ripristina Oggetti Selezionati
                                </button>
                            </div>
                        </div>
                    </>
                )}


            </div>
        </>
    );
}
