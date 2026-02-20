'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    SCIENTIFIC_PALETTES,
    CustomPalette,
    LOCAL_STORAGE_KEY,
    interpolateColors,
    hexToRgb,
    shiftHue,
    rgbToHsl,
    buildGradientCSS,
    buildGradientFromHex
} from '@/app/lib/palettes';

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

interface PaletteSetting {
    paletteName: string; // "viridis", "custom_xyz", or "Originale"
    hueShift: number;    // -180 to 180
}

export default function MasksPalettePage() {
    const router = useRouter();

    const [masks, setMasks] = useState<SAMMask[]>([]);
    const [imageUrl, setImageUrl] = useState<string>('');
    const [paletteSettings, setPaletteSettings] = useState<Map<number, PaletteSetting>>(new Map());
    const [customPalettes, setCustomPalettes] = useState<CustomPalette[]>([]);
    const [openDropdown, setOpenDropdown] = useState<number | null>(null);

    const imageRef = useRef<HTMLImageElement | null>(null);
    const resultCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const dropdownContainerRef = useRef<HTMLDivElement | null>(null);

    // Cache generated LUTs to avoid recomputing every frame
    const lutCache = useRef<Map<string, [number, number, number][]>>(new Map());

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownContainerRef.current && !dropdownContainerRef.current.contains(e.target as Node)) {
                setOpenDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

            // Initialize settings
            const settings = new Map<number, PaletteSetting>();
            loadedMasks.forEach(m => {
                settings.set(m.mask_id, { paletteName: 'Originale', hueShift: 0 });
            });
            setPaletteSettings(settings);

            // Load custom palettes
            const customData = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (customData) {
                setCustomPalettes(JSON.parse(customData));
            }
        } catch {
            router.push('/generation/masks/edit');
        }
    }, [router]);

    // Helper: Get LUT for a palette name
    const getLUT = useCallback((name: string): [number, number, number][] | null => {
        if (name === 'Originale') return null;
        if (lutCache.current.has(name)) return lutCache.current.get(name)!;

        let colors: [number, number, number][] | null = null;

        // Check scientific
        const scientific = SCIENTIFIC_PALETTES.find(p => p.name === name);
        if (scientific) {
            colors = scientific.colors;
        } else {
            // Check custom
            const custom = customPalettes.find(p => p.name === name); // using name as identifier for simplicity in UI, but could be ID
            if (custom) {
                colors = custom.colors.map(hexToRgb);
            }
        }

        if (colors) {
            const lut = interpolateColors(colors, 256);
            lutCache.current.set(name, lut);
            return lut;
        }

        return null;
    }, [customPalettes]);

    // Draw the result
    const drawResult = useCallback(async () => {
        const canvas = resultCanvasRef.current;
        const img = imageRef.current;
        if (!canvas || !img) return;
        if (img.naturalWidth === 0 || img.naturalHeight === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // Draw original image base
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const originalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const resultData = ctx.createImageData(canvas.width, canvas.height);

        // Copy original (for unmasked areas)
        resultData.data.set(originalData.data);

        // Process each mask
        for (const mask of masks) {
            const setting = paletteSettings.get(mask.mask_id);
            if (!setting || setting.paletteName === 'Originale') continue;

            const lut = getLUT(setting.paletteName);
            if (!lut) continue;

            // Load mask bitmap
            const maskBitmap = await new Promise<Uint8Array | null>((resolve) => {
                const maskImg = new Image();
                maskImg.crossOrigin = "Anonymous";
                maskImg.onload = () => {
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvas.width;
                    tempCanvas.height = canvas.height;
                    const tempCtx = tempCanvas.getContext('2d');
                    if (!tempCtx) { resolve(null); return; }

                    tempCtx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
                    const mData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
                    const alphaMask = new Uint8Array(canvas.width * canvas.height);
                    for (let i = 0; i < mData.data.length; i += 4) {
                        alphaMask[i / 4] = mData.data[i + 3] > 0 ? 1 : 0;
                    }
                    resolve(alphaMask);
                };
                maskImg.onerror = () => resolve(null);
                maskImg.src = `data:image/png;base64,${mask.mask_base64}`;
            });

            if (!maskBitmap) continue;

            // Apply palette
            for (let i = 0; i < maskBitmap.length; i++) {
                if (maskBitmap[i] === 1) {
                    const idx = i * 4;
                    const r = originalData.data[idx];
                    const g = originalData.data[idx + 1];
                    const b = originalData.data[idx + 2];

                    // Calculate luminance (0-255)
                    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

                    // Map to LUT
                    const lutColor = lut[Math.min(255, Math.max(0, lum))];

                    // Apply hue shift if needed
                    let finalColor = lutColor;
                    if (setting.hueShift !== 0) {
                        finalColor = shiftHue(lutColor[0], lutColor[1], lutColor[2], setting.hueShift);
                    }

                    resultData.data[idx] = finalColor[0];
                    resultData.data[idx + 1] = finalColor[1];
                    resultData.data[idx + 2] = finalColor[2];
                    // Alpha remains 255 from original copy
                }
            }
        }

        ctx.putImageData(resultData, 0, 0);

    }, [masks, paletteSettings, getLUT]);

    // Re-draw when dependencies change
    useEffect(() => {
        if (masks.length > 0 && imageRef.current) {
            // small debounce/delay to ensure image loaded
            const t = setTimeout(() => drawResult(), 50);
            return () => clearTimeout(t);
        }
    }, [masks, paletteSettings, drawResult]);

    // Update handlers
    const setPalette = (maskId: number, paletteName: string) => {
        setPaletteSettings(prev => {
            const newMap = new Map(prev);
            const current = newMap.get(maskId) || { paletteName: 'Originale', hueShift: 0 };
            newMap.set(maskId, { ...current, paletteName });
            return newMap;
        });
        setOpenDropdown(null);
    };

    const setHueShift = (maskId: number, shift: number) => {
        setPaletteSettings(prev => {
            const newMap = new Map(prev);
            const current = newMap.get(maskId) || { paletteName: 'Originale', hueShift: 0 };
            newMap.set(maskId, { ...current, hueShift: shift });
            return newMap;
        });
    };

    const goBack = () => router.push('/generation/masks/edit');

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

    // Combine all palettes for the dropdown
    const allPalettes = [
        { name: 'Originale', label: 'Nessuna (Originale)', gradient: 'linear-gradient(to right, #ccc, #eee)', type: 'original' },
        ...SCIENTIFIC_PALETTES.map(p => ({
            name: p.name,
            label: p.name,
            gradient: buildGradientCSS(p.colors),
            type: 'scientific'
        })),
        ...customPalettes.map(p => ({
            name: p.name,
            label: p.name + ' (Custom)',
            gradient: buildGradientFromHex(p.colors),
            type: 'custom'
        }))
    ];

    return (
        <div className="container-fluid mt-3" style={{ maxHeight: '100vh', overflow: 'hidden' }}>
            {/* Header */}
            <div className="d-flex align-items-center justify-content-between mb-3 px-3">
                <div className="d-flex align-items-center gap-3">
                    <button className="btn btn-outline-secondary" onClick={goBack}>
                        ← Indietro
                    </button>
                    <h4 className="mb-0">🎨 Applica Palette Scientifiche</h4>
                </div>
                <button className="btn btn-success" onClick={downloadResult}>
                    💾 Scarica Risultato
                </button>
            </div>

            {/* Layout */}
            <div className="row px-3" style={{ height: 'calc(100vh - 100px)' }}>
                {/* Preview Column */}
                <div className="col-5 d-flex flex-column">
                    <div className="card h-100 bg-dark">
                        <div className="card-header bg-dark text-white border-bottom border-secondary py-2">
                            <strong>📷 Anteprima</strong>
                        </div>
                        <div className="card-body d-flex align-items-start justify-content-center p-2" style={{ overflow: 'hidden' }}>
                            <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <img
                                    ref={imageRef}
                                    src={imageUrl}
                                    alt="Source"
                                    style={{ display: 'none' }}
                                    crossOrigin="anonymous"
                                    onLoad={() => drawResult()}
                                />
                                <canvas
                                    ref={resultCanvasRef}
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: '100%',
                                        objectFit: 'contain'
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Controls Column */}
                <div className="col-7 d-flex flex-column">
                    <div className="card h-100 d-flex flex-column">
                        <div className="card-header bg-primary text-white py-2 flex-shrink-0">
                            <strong>🛠️ Configurazione Maschere ({masks.length})</strong>
                        </div>
                        <div className="card-body p-0 flex-grow-1" ref={dropdownContainerRef} style={{ overflowY: 'auto', minHeight: 0 }}>
                            {masks.map((mask) => {
                                const setting = paletteSettings.get(mask.mask_id) || { paletteName: 'Originale', hueShift: 0 };
                                const currentPaletteObj = allPalettes.find(p => p.name === setting.paletteName);
                                const isOpen = openDropdown === mask.mask_id;

                                return (
                                    <div key={mask.mask_id} className="border-bottom p-3">
                                        <div className="row align-items-center">
                                            {/* Mask Info */}
                                            <div className="col-2 text-center">
                                                <img
                                                    src={`data:image/png;base64,${mask.mask_base64}`}
                                                    alt={mask.name}
                                                    style={{
                                                        width: '50px',
                                                        height: '50px',
                                                        objectFit: 'contain',
                                                        backgroundColor: '#eee',
                                                        border: `2px solid rgb(${mask.color.join(',')})`,
                                                        borderRadius: '4px'
                                                    }}
                                                />
                                                <div className="mt-1 small fw-bold text-truncate">{mask.name}</div>
                                            </div>

                                            {/* Controls */}
                                            <div className="col-10">
                                                {/* Palette Select */}
                                                <div className="mb-2">
                                                    <label className="form-label small text-muted mb-1">Palette</label>
                                                    <div className="dropdown" style={{ position: 'relative' }}>
                                                        <button
                                                            className="btn btn-outline-secondary btn-sm dropdown-toggle w-100 d-flex align-items-center justify-content-between"
                                                            type="button"
                                                            onClick={() => setOpenDropdown(isOpen ? null : mask.mask_id)}
                                                        >
                                                            <div className="d-flex align-items-center gap-2 overflow-hidden">
                                                                <div
                                                                    style={{
                                                                        width: '60px',
                                                                        height: '15px',
                                                                        background: currentPaletteObj?.gradient,
                                                                        borderRadius: '2px'
                                                                    }}
                                                                />
                                                                <span className="text-truncate">{currentPaletteObj?.label}</span>
                                                            </div>
                                                        </button>
                                                        <ul
                                                            className={`dropdown-menu w-100 shadow ${isOpen ? 'show' : ''}`}
                                                            style={{ maxHeight: '300px', overflowY: 'auto', ...(isOpen ? { display: 'block' } : {}) }}
                                                        >
                                                            <li><h6 className="dropdown-header">Standard</h6></li>
                                                            {allPalettes.filter(p => p.type === 'scientific').map(p => (
                                                                <li key={p.name}>
                                                                    <button
                                                                        className={`dropdown-item d-flex align-items-center gap-2 ${setting.paletteName === p.name ? 'active' : ''}`}
                                                                        onClick={() => setPalette(mask.mask_id, p.name)}
                                                                    >
                                                                        <div
                                                                            style={{
                                                                                width: '40px',
                                                                                height: '15px',
                                                                                background: p.gradient,
                                                                                borderRadius: '2px',
                                                                                border: '1px solid #ddd'
                                                                            }}
                                                                        />
                                                                        <span>{p.label}</span>
                                                                    </button>
                                                                </li>
                                                            ))}

                                                            {customPalettes.length > 0 && (
                                                                <>
                                                                    <li><hr className="dropdown-divider" /></li>
                                                                    <li><h6 className="dropdown-header">Personalizzate</h6></li>
                                                                    {allPalettes.filter(p => p.type === 'custom').map(p => (
                                                                        <li key={p.name}>
                                                                            <button
                                                                                className={`dropdown-item d-flex align-items-center gap-2 ${setting.paletteName === p.name ? 'active' : ''}`}
                                                                                onClick={() => setPalette(mask.mask_id, p.name)}
                                                                            >
                                                                                <div
                                                                                    style={{
                                                                                        width: '40px',
                                                                                        height: '15px',
                                                                                        background: p.gradient,
                                                                                        borderRadius: '2px',
                                                                                        border: '1px solid #ddd'
                                                                                    }}
                                                                                />
                                                                                <span>{p.label.replace(' (Custom)', '')}</span>
                                                                            </button>
                                                                        </li>
                                                                    ))}
                                                                </>
                                                            )}

                                                            <li><hr className="dropdown-divider" /></li>
                                                            <li>
                                                                <button
                                                                    className={`dropdown-item d-flex align-items-center gap-2 ${setting.paletteName === 'Originale' ? 'active' : ''}`}
                                                                    onClick={() => setPalette(mask.mask_id, 'Originale')}
                                                                >
                                                                    <div
                                                                        style={{
                                                                            width: '40px',
                                                                            height: '15px',
                                                                            background: 'linear-gradient(to right, #ccc, #eee)',
                                                                            borderRadius: '2px',
                                                                            border: '1px solid #ddd'
                                                                        }}
                                                                    />
                                                                    <span>Nessuna (Originale)</span>
                                                                </button>
                                                            </li>
                                                        </ul>
                                                    </div>
                                                </div>

                                                {/* Hue Slider (Only if not Originale) */}
                                                {setting.paletteName !== 'Originale' && (
                                                    <div>
                                                        <div className="d-flex justify-content-between mb-1">
                                                            <label className="form-label small text-muted mb-0">Tonalità (Hue Shift)</label>
                                                            <span className="badge bg-secondary">{setting.hueShift}°</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            className="form-range"
                                                            min="-180"
                                                            max="180"
                                                            step="5"
                                                            value={setting.hueShift}
                                                            onChange={(e) => setHueShift(mask.mask_id, parseInt(e.target.value))}
                                                        />
                                                    </div>
                                                )}
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

