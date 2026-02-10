'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// SAM types (matching masks page)
interface SAMMask {
    mask_id: number;
    name: string;
    mask_base64: string;
    score: number;
    area: number;
    coverage_percent: number;
    color: [number, number, number];
    bbox: [number, number, number, number];
}

// Per-mask edit settings
interface MaskEditSettings {
    name: string;
    color: [number, number, number];
    fullOpacity: boolean; // false = semi-transparent overlay, true = 100% image crop
}

export default function MasksEditPage() {
    const router = useRouter();

    // Mask data
    const [masks, setMasks] = useState<SAMMask[]>([]);
    const [editSettings, setEditSettings] = useState<Map<number, MaskEditSettings>>(new Map());

    // Image
    const [imageUrl, setImageUrl] = useState<string>('');

    // Refs
    const imageRef = useRef<HTMLImageElement | null>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // Load data from sessionStorage
    useEffect(() => {
        try {
            const masksJson = sessionStorage.getItem('sam_masks_edit');
            const imgUrl = sessionStorage.getItem('sam_image_url_edit');

            if (!masksJson || !imgUrl) {
                router.push('/generation/masks');
                return;
            }

            const loadedMasks: SAMMask[] = JSON.parse(masksJson);
            setMasks(loadedMasks);
            setImageUrl(imgUrl);

            // Initialize edit settings for each mask
            const settings = new Map<number, MaskEditSettings>();
            loadedMasks.forEach(m => {
                settings.set(m.mask_id, {
                    name: m.name || `Maschera #${m.mask_id + 1}`,
                    color: [...m.color] as [number, number, number],
                    fullOpacity: false
                });
            });
            setEditSettings(settings);
        } catch {
            router.push('/generation/masks');
        }
    }, [router]);

    // Helper: convert [r,g,b] to hex color
    const rgbToHex = (r: number, g: number, b: number): string => {
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    };

    // Helper: convert hex color to [r,g,b]
    const hexToRgb = (hex: string): [number, number, number] => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
            : [128, 128, 128];
    };

    // Update a single mask's edit settings
    const updateSetting = (maskId: number, key: keyof MaskEditSettings, value: string | boolean | [number, number, number]) => {
        setEditSettings(prev => {
            const newMap = new Map(prev);
            const current = newMap.get(maskId);
            if (current) {
                newMap.set(maskId, { ...current, [key]: value });
            }
            return newMap;
        });
    };

    // Draw mask overlays with current edit settings
    const drawMaskOverlays = useCallback(async () => {
        const overlayCanvas = overlayCanvasRef.current;
        const img = imageRef.current;
        if (!overlayCanvas || !img || masks.length === 0) return;

        const ctx = overlayCanvas.getContext('2d');
        if (!ctx) return;

        overlayCanvas.width = img.clientWidth;
        overlayCanvas.height = img.clientHeight;
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        const scaleX = img.clientWidth / img.naturalWidth;
        const scaleY = img.clientHeight / img.naturalHeight;

        for (const mask of masks) {
            const settings = editSettings.get(mask.mask_id);
            if (!settings) continue;

            const color = settings.color;
            const isFullOpacity = settings.fullOpacity;

            await new Promise<void>((resolve) => {
                const maskImg = new Image();
                maskImg.onload = () => {
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = overlayCanvas.width;
                    tempCanvas.height = overlayCanvas.height;
                    const tempCtx = tempCanvas.getContext('2d');

                    if (tempCtx) {
                        tempCtx.drawImage(maskImg, 0, 0, overlayCanvas.width, overlayCanvas.height);
                        const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                        const data = imgData.data;

                        if (isFullOpacity && img) {
                            // Full opacity: show actual image portion
                            const srcCanvas = document.createElement('canvas');
                            srcCanvas.width = overlayCanvas.width;
                            srcCanvas.height = overlayCanvas.height;
                            const srcCtx = srcCanvas.getContext('2d');
                            if (srcCtx) {
                                srcCtx.drawImage(img, 0, 0, overlayCanvas.width, overlayCanvas.height);
                                const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

                                for (let i = 0; i < data.length; i += 4) {
                                    if (data[i + 3] > 0) {
                                        // Show actual image pixel
                                        data[i] = srcData.data[i];
                                        data[i + 1] = srcData.data[i + 1];
                                        data[i + 2] = srcData.data[i + 2];
                                        data[i + 3] = 255;
                                    }
                                }
                            }
                        } else {
                            // Semi-transparent colored overlay
                            for (let i = 0; i < data.length; i += 4) {
                                if (data[i + 3] > 0) {
                                    data[i] = color[0];
                                    data[i + 1] = color[1];
                                    data[i + 2] = color[2];
                                    data[i + 3] = 150;
                                }
                            }
                        }

                        tempCtx.putImageData(imgData, 0, 0);
                        ctx.drawImage(tempCanvas, 0, 0);
                    }
                    resolve();
                };
                maskImg.onerror = () => resolve();
                maskImg.src = `data:image/png;base64,${mask.mask_base64}`;
            });
        }
    }, [masks, editSettings]);

    // Redraw when settings change
    useEffect(() => {
        if (masks.length > 0) {
            drawMaskOverlays();
        }
    }, [masks, editSettings, drawMaskOverlays]);

    // Save and go to palette page
    const goToNextStep = () => {
        // Apply edit settings to masks
        const updatedMasks = masks.map(m => {
            const settings = editSettings.get(m.mask_id);
            if (settings) {
                return {
                    ...m,
                    name: settings.name,
                    color: settings.color
                };
            }
            return m;
        });

        // Save to sessionStorage for palette page
        sessionStorage.setItem('sam_masks_palette', JSON.stringify(updatedMasks));
        sessionStorage.setItem('sam_image_url_palette', imageUrl);
        router.push('/generation/masks/palette');
    };

    // Go back without saving
    const goBackWithoutSaving = () => {
        router.push('/generation/masks');
    };

    if (!imageUrl) {
        return (
            <div className="container mt-5 text-center">
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Caricamento...</span>
                </div>
                <p className="mt-3">Caricamento editor...</p>
            </div>
        );
    }

    return (
        <div className="container-fluid mt-3" style={{ maxHeight: '100vh', overflow: 'hidden' }}>
            {/* Header */}
            <div className="d-flex align-items-center justify-content-between mb-3 px-3">
                <div className="d-flex align-items-center gap-3">
                    <button className="btn btn-outline-secondary" onClick={goBackWithoutSaving}>
                        ← Indietro
                    </button>
                    <h4 className="mb-0">🎨 Modifica Maschere</h4>
                </div>
                <button className="btn btn-success" onClick={goToNextStep}>
                    Avanti →
                </button>
            </div>

            {/* Two-column layout */}
            <div className="row px-3" style={{ height: 'calc(100vh - 100px)' }}>
                {/* Left column — Image with overlay (col-5) */}
                <div className="col-5 d-flex flex-column">
                    <div className="card h-100">
                        <div className="card-header bg-dark text-white py-2">
                            <strong>📷 Anteprima</strong>
                            <small className="ms-2 text-light">Le modifiche si aggiornano in tempo reale</small>
                        </div>
                        <div
                            className="card-body d-flex align-items-center justify-content-center p-2"
                            style={{ overflow: 'auto', backgroundColor: '#1a1a1a' }}
                        >
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                <img
                                    ref={imageRef}
                                    src={imageUrl}
                                    alt="Immagine originale"
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: 'calc(100vh - 200px)',
                                        display: 'block',
                                        borderRadius: '4px'
                                    }}
                                    crossOrigin="anonymous"
                                    onLoad={() => {
                                        if (overlayCanvasRef.current && imageRef.current) {
                                            overlayCanvasRef.current.width = imageRef.current.clientWidth;
                                            overlayCanvasRef.current.height = imageRef.current.clientHeight;
                                            drawMaskOverlays();
                                        }
                                    }}
                                />
                                <canvas
                                    ref={overlayCanvasRef}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        pointerEvents: 'none',
                                        width: '100%',
                                        height: '100%'
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right column — Mask edit list (col-7) */}
                <div className="col-7 d-flex flex-column">
                    <div className="card h-100">
                        <div className="card-header bg-primary text-white py-2">
                            <strong>🎨 Proprietà Maschere ({masks.length})</strong>
                        </div>
                        <div className="card-body p-0" style={{ overflowY: 'auto' }}>
                            {masks.map((mask) => {
                                const settings = editSettings.get(mask.mask_id);
                                if (!settings) return null;

                                return (
                                    <div
                                        key={mask.mask_id}
                                        className="border-bottom p-3"
                                        style={{ backgroundColor: '#fafafa' }}
                                    >
                                        <div className="d-flex align-items-center gap-3">
                                            {/* Mask mini preview */}
                                            <div style={{ flexShrink: 0 }}>
                                                <img
                                                    src={`data:image/png;base64,${mask.mask_base64}`}
                                                    alt={`Mask ${mask.mask_id}`}
                                                    style={{
                                                        width: '80px',
                                                        height: '60px',
                                                        objectFit: 'contain',
                                                        borderRadius: '6px',
                                                        backgroundColor: '#eee',
                                                        border: `3px solid rgb(${settings.color.join(',')})`
                                                    }}
                                                />
                                            </div>

                                            {/* Name input */}
                                            <div style={{ flex: 1 }}>
                                                <label className="form-label mb-1" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                                                    Nome
                                                </label>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    value={settings.name}
                                                    onChange={(e) => updateSetting(mask.mask_id, 'name', e.target.value)}
                                                    placeholder={`Maschera #${mask.mask_id + 1}`}
                                                />
                                            </div>

                                            {/* Color picker */}
                                            <div style={{ flexShrink: 0, textAlign: 'center' }}>
                                                <label className="form-label mb-1 d-block" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                                                    Colore
                                                </label>
                                                <input
                                                    type="color"
                                                    value={rgbToHex(...settings.color)}
                                                    onChange={(e) => updateSetting(mask.mask_id, 'color', hexToRgb(e.target.value))}
                                                    style={{
                                                        width: '40px',
                                                        height: '34px',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        borderRadius: '4px'
                                                    }}
                                                />
                                            </div>

                                            {/* Opacity toggle */}
                                            <div style={{ flexShrink: 0, textAlign: 'center', minWidth: '100px' }}>
                                                <label className="form-label mb-1 d-block" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                                                    Opacità
                                                </label>
                                                <div className="form-check form-switch d-flex align-items-center justify-content-center gap-1">
                                                    <input
                                                        className="form-check-input"
                                                        type="checkbox"
                                                        role="switch"
                                                        id={`opacity-${mask.mask_id}`}
                                                        checked={settings.fullOpacity}
                                                        onChange={(e) => updateSetting(mask.mask_id, 'fullOpacity', e.target.checked)}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                    <label
                                                        className="form-check-label"
                                                        htmlFor={`opacity-${mask.mask_id}`}
                                                        style={{ fontSize: '0.75rem', cursor: 'pointer' }}
                                                    >
                                                        {settings.fullOpacity ? '100%' : 'Semi'}
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Info */}
                                            <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '80px' }}>
                                                <small className="text-muted d-block" style={{ fontSize: '0.7rem' }}>
                                                    {mask.coverage_percent.toFixed(1)}%
                                                </small>
                                                <small className="text-muted d-block" style={{ fontSize: '0.7rem' }}>
                                                    {mask.area.toLocaleString()} px
                                                </small>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
