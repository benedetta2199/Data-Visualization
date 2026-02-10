'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// SAM types
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

// Predefined palettes
interface Palette {
    name: string;
    icon: string;
    // Hue shift (degrees), saturation multiplier, brightness offset
    hueShift: number;
    saturationMult: number;
    brightnessOffset: number;
    // Optional tint color
    tint?: [number, number, number];
    tintStrength?: number;
}

const PALETTES: Palette[] = [
    { name: 'Originale', icon: '🔄', hueShift: 0, saturationMult: 1.0, brightnessOffset: 0 },
    { name: 'Caldo', icon: '🔥', hueShift: 15, saturationMult: 1.2, brightnessOffset: 10, tint: [255, 140, 50], tintStrength: 0.15 },
    { name: 'Freddo', icon: '❄️', hueShift: -20, saturationMult: 0.9, brightnessOffset: 5, tint: [100, 150, 255], tintStrength: 0.15 },
    { name: 'Vintage', icon: '📷', hueShift: 10, saturationMult: 0.7, brightnessOffset: -5, tint: [200, 170, 120], tintStrength: 0.2 },
    { name: 'Vivido', icon: '🌈', hueShift: 0, saturationMult: 1.5, brightnessOffset: 15 },
    { name: 'Seppia', icon: '🟤', hueShift: 0, saturationMult: 0.2, brightnessOffset: 0, tint: [180, 140, 100], tintStrength: 0.4 },
    { name: 'Notturno', icon: '🌙', hueShift: -10, saturationMult: 0.8, brightnessOffset: -30, tint: [50, 50, 120], tintStrength: 0.2 },
    { name: 'Pastello', icon: '🎀', hueShift: 0, saturationMult: 0.6, brightnessOffset: 30, tint: [255, 200, 220], tintStrength: 0.1 },
    { name: 'Drammatico', icon: '🎭', hueShift: 0, saturationMult: 1.3, brightnessOffset: -20 },
    { name: 'Solare', icon: '☀️', hueShift: 5, saturationMult: 1.1, brightnessOffset: 20, tint: [255, 220, 100], tintStrength: 0.1 },
];

// Per-mask palette assignment
interface MaskPaletteSettings {
    paletteIndex: number;
}

export default function MasksPalettePage() {
    const router = useRouter();

    const [masks, setMasks] = useState<SAMMask[]>([]);
    const [imageUrl, setImageUrl] = useState<string>('');
    const [paletteSettings, setPaletteSettings] = useState<Map<number, MaskPaletteSettings>>(new Map());

    const imageRef = useRef<HTMLImageElement | null>(null);
    const resultCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // Load data
    useEffect(() => {
        try {
            const masksJson = sessionStorage.getItem('sam_masks_palette');
            const imgUrl = sessionStorage.getItem('sam_image_url_palette');

            if (!masksJson || !imgUrl) {
                router.push('/generation/masks/edit');
                return;
            }

            const loadedMasks: SAMMask[] = JSON.parse(masksJson);
            setMasks(loadedMasks);
            setImageUrl(imgUrl);

            const settings = new Map<number, MaskPaletteSettings>();
            loadedMasks.forEach(m => {
                settings.set(m.mask_id, { paletteIndex: 0 }); // 0 = Originale
            });
            setPaletteSettings(settings);
        } catch {
            router.push('/generation/masks/edit');
        }
    }, [router]);

    // Helper: clamp value between 0 and 255
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

    // Helper: RGB to HSL
    const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        let h = 0, s = 0;

        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return [h * 360, s, l];
    };

    // Helper: HSL to RGB
    const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
        h = ((h % 360) + 360) % 360;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        let r = 0, g = 0, b = 0;

        if (h < 60) { r = c; g = x; }
        else if (h < 120) { r = x; g = c; }
        else if (h < 180) { g = c; b = x; }
        else if (h < 240) { g = x; b = c; }
        else if (h < 300) { r = x; b = c; }
        else { r = c; b = x; }

        return [clamp((r + m) * 255), clamp((g + m) * 255), clamp((b + m) * 255)];
    };

    // Apply palette to a pixel
    const applyPalette = (r: number, g: number, b: number, palette: Palette): [number, number, number] => {
        if (palette.hueShift === 0 && palette.saturationMult === 1.0 && palette.brightnessOffset === 0 && !palette.tint) {
            return [r, g, b]; // Original, no change
        }

        let [h, s, l] = rgbToHsl(r, g, b);

        // Apply hue shift
        h = (h + palette.hueShift + 360) % 360;

        // Apply saturation multiplier
        s = Math.min(1, Math.max(0, s * palette.saturationMult));

        // Apply brightness offset
        l = Math.min(1, Math.max(0, l + palette.brightnessOffset / 100));

        let [nr, ng, nb] = hslToRgb(h, s, l);

        // Apply tint if present
        if (palette.tint && palette.tintStrength) {
            const t = palette.tintStrength;
            nr = clamp(nr * (1 - t) + palette.tint[0] * t);
            ng = clamp(ng * (1 - t) + palette.tint[1] * t);
            nb = clamp(nb * (1 - t) + palette.tint[2] * t);
        }

        return [nr, ng, nb];
    };

    // Draw the result: original image with palette applied per-mask
    const drawResult = useCallback(async () => {
        const canvas = resultCanvasRef.current;
        const img = imageRef.current;
        if (!canvas || !img || masks.length === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // Draw original image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Get original image data
        const originalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const resultData = ctx.createImageData(canvas.width, canvas.height);

        // Copy original as base
        resultData.data.set(originalData.data);

        // For each mask, load its bitmap, find which pixels belong to it, and apply palette
        for (const mask of masks) {
            const settings = paletteSettings.get(mask.mask_id);
            if (!settings || settings.paletteIndex === 0) continue; // 0 = original

            const palette = PALETTES[settings.paletteIndex];
            if (!palette) continue;

            // Load mask image
            const maskBitmap = await new Promise<Uint8Array | null>((resolve) => {
                const maskImg = new Image();
                maskImg.onload = () => {
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvas.width;
                    tempCanvas.height = canvas.height;
                    const tempCtx = tempCanvas.getContext('2d');
                    if (tempCtx) {
                        tempCtx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
                        const maskData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
                        // Extract alpha channel as mask
                        const alphaMask = new Uint8Array(canvas.width * canvas.height);
                        for (let i = 0; i < maskData.data.length; i += 4) {
                            alphaMask[i / 4] = maskData.data[i + 3] > 0 ? 1 : 0;
                        }
                        resolve(alphaMask);
                    } else {
                        resolve(null);
                    }
                };
                maskImg.onerror = () => resolve(null);
                maskImg.src = `data:image/png;base64,${mask.mask_base64}`;
            });

            if (!maskBitmap) continue;

            // Apply palette to masked pixels
            for (let i = 0; i < maskBitmap.length; i++) {
                if (maskBitmap[i] === 1) {
                    const idx = i * 4;
                    const [nr, ng, nb] = applyPalette(
                        originalData.data[idx],
                        originalData.data[idx + 1],
                        originalData.data[idx + 2],
                        palette
                    );
                    resultData.data[idx] = nr;
                    resultData.data[idx + 1] = ng;
                    resultData.data[idx + 2] = nb;
                }
            }
        }

        ctx.putImageData(resultData, 0, 0);
    }, [masks, paletteSettings]);

    // Redraw when palette settings change
    useEffect(() => {
        if (masks.length > 0 && imageRef.current) {
            drawResult();
        }
    }, [masks, paletteSettings, drawResult]);

    // Update palette for a mask
    const setPalette = (maskId: number, paletteIndex: number) => {
        setPaletteSettings(prev => {
            const newMap = new Map(prev);
            newMap.set(maskId, { paletteIndex });
            return newMap;
        });
    };

    // Go back to edit page
    const goBack = () => {
        router.push('/generation/masks/edit');
    };

    // Download result
    const downloadResult = () => {
        const canvas = resultCanvasRef.current;
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = 'immagine_palette.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    if (!imageUrl) {
        return (
            <div className="container mt-5 text-center">
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Caricamento...</span>
                </div>
                <p className="mt-3">Caricamento...</p>
            </div>
        );
    }

    return (
        <div className="container-fluid mt-3" style={{ maxHeight: '100vh', overflow: 'hidden' }}>
            {/* Header */}
            <div className="d-flex align-items-center justify-content-between mb-3 px-3">
                <div className="d-flex align-items-center gap-3">
                    <button className="btn btn-outline-secondary" onClick={goBack}>
                        ← Indietro
                    </button>
                    <h4 className="mb-0">🎨 Applica Palette</h4>
                </div>
                <button className="btn btn-success" onClick={downloadResult}>
                    💾 Scarica Risultato
                </button>
            </div>

            {/* Two-column layout */}
            <div className="row px-3" style={{ height: 'calc(100vh - 100px)' }}>
                {/* Left column — Result preview (col-5) */}
                <div className="col-5 d-flex flex-column">
                    <div className="card h-100">
                        <div className="card-header bg-dark text-white py-2">
                            <strong>📷 Anteprima Risultato</strong>
                        </div>
                        <div
                            className="card-body d-flex align-items-center justify-content-center p-2"
                            style={{ overflow: 'auto', backgroundColor: '#1a1a1a' }}
                        >
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                {/* Hidden original image for pixel data */}
                                <img
                                    ref={imageRef}
                                    src={imageUrl}
                                    alt="Immagine originale"
                                    style={{ display: 'none' }}
                                    crossOrigin="anonymous"
                                    onLoad={() => drawResult()}
                                />
                                {/* Result canvas */}
                                <canvas
                                    ref={resultCanvasRef}
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: 'calc(100vh - 200px)',
                                        display: 'block',
                                        borderRadius: '4px'
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right column — Palette selection per mask (col-7) */}
                <div className="col-7 d-flex flex-column">
                    <div className="card h-100">
                        <div className="card-header bg-primary text-white py-2">
                            <strong>🎨 Palette per Maschera ({masks.length})</strong>
                        </div>
                        <div className="card-body p-0" style={{ overflowY: 'auto' }}>
                            {masks.map((mask) => {
                                const settings = paletteSettings.get(mask.mask_id);
                                const currentPaletteIndex = settings?.paletteIndex ?? 0;

                                return (
                                    <div
                                        key={mask.mask_id}
                                        className="border-bottom p-3"
                                        style={{ backgroundColor: '#fafafa' }}
                                    >
                                        {/* Mask header */}
                                        <div className="d-flex align-items-center gap-3 mb-2">
                                            <img
                                                src={`data:image/png;base64,${mask.mask_base64}`}
                                                alt={mask.name}
                                                style={{
                                                    width: '60px',
                                                    height: '45px',
                                                    objectFit: 'contain',
                                                    borderRadius: '4px',
                                                    backgroundColor: '#eee',
                                                    border: `2px solid rgb(${mask.color.join(',')})`
                                                }}
                                            />
                                            <div>
                                                <strong style={{ fontSize: '0.9rem' }}>{mask.name}</strong>
                                                <small className="text-muted d-block" style={{ fontSize: '0.75rem' }}>
                                                    {mask.coverage_percent.toFixed(1)}% dell'immagine
                                                </small>
                                            </div>
                                            <span className="ms-auto badge bg-secondary">
                                                {PALETTES[currentPaletteIndex]?.icon} {PALETTES[currentPaletteIndex]?.name}
                                            </span>
                                        </div>

                                        {/* Palette buttons */}
                                        <div className="d-flex gap-1 flex-wrap">
                                            {PALETTES.map((palette, idx) => (
                                                <button
                                                    key={idx}
                                                    className={`btn btn-sm ${currentPaletteIndex === idx ? 'btn-primary' : 'btn-outline-secondary'}`}
                                                    onClick={() => setPalette(mask.mask_id, idx)}
                                                    title={palette.name}
                                                    style={{
                                                        fontSize: '0.75rem',
                                                        padding: '3px 8px',
                                                        minWidth: '75px'
                                                    }}
                                                >
                                                    {palette.icon} {palette.name}
                                                </button>
                                            ))}
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
