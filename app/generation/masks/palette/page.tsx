'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    SCIENTIFIC_PALETTES,
    CustomPalette,
    LOCAL_STORAGE_KEY,
    interpolateColors,
    hexToRgb,
    shiftHSL,
    rgbToHsl,
    hslToRgb,
    buildGradientCSS,
    buildGradientFromHex,
    extractDominantColors,
    paletteContainsAnyDominantColor,
    findClosestLUTPosition
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
    paletteName: string;
    hueShift: number;           // -180 to 180 (non-selective, no palette)
    satShift: number;           // -100 to 100 (non-selective, no palette)
    lightShift: number;         // -100 to 100 (non-selective, no palette)
    selectiveMode: boolean;
    selectedDominantIdx: number;
    selectiveHue: number;       // 0-360 (selective, no palette)
    selectiveSat: number;       // 0-100 (selective, no palette)
    selectiveLight: number;     // 0-100 (selective, no palette)
    palettePosition: number;    // 0.0-1.0 master position in palette LUT
    paletteHue: number;         // 0-360 target hue (palette mode)
    paletteSat: number;         // 0-100 target saturation (palette mode)
    paletteLight: number;       // 0-100 target lightness (palette mode)
    paletteOpacity: number;     // 0-100 intensity of palette recoloring
}

const DEFAULT_SETTING: PaletteSetting = {
    paletteName: 'Originale',
    hueShift: 0,
    satShift: 0,
    lightShift: 0,
    selectiveMode: false,
    selectedDominantIdx: 0,
    selectiveHue: 0,
    selectiveSat: 50,
    selectiveLight: 50,
    palettePosition: 0.5,
    paletteHue: 0,
    paletteSat: 0,
    paletteLight: 50,
    paletteOpacity: 100
};

export default function MasksPalettePage() {
    const router = useRouter();

    const [masks, setMasks] = useState<SAMMask[]>([]);
    const [imageUrl, setImageUrl] = useState<string>('');
    const [paletteSettings, setPaletteSettings] = useState<Map<number, PaletteSetting>>(new Map());
    const [customPalettes, setCustomPalettes] = useState<CustomPalette[]>([]);
    const [openDropdown, setOpenDropdown] = useState<number | null>(null);
    const [maskDominantColors, setMaskDominantColors] = useState<Map<number, [number, number, number][]>>(new Map());
    const [analyzingColors, setAnalyzingColors] = useState(false);

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
                settings.set(m.mask_id, { ...DEFAULT_SETTING });
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

    // Analyze dominant colors for each mask
    const analyzeDominantColors = useCallback(async () => {
        const img = imageRef.current;
        if (!img || img.naturalWidth === 0 || masks.length === 0) return;

        setAnalyzingColors(true);

        // Draw original image to a temp canvas to get pixel data
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.naturalWidth;
        tempCanvas.height = img.naturalHeight;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) { setAnalyzingColors(false); return; }
        tempCtx.drawImage(img, 0, 0);
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

        const dominantMap = new Map<number, [number, number, number][]>();

        for (const mask of masks) {
            // Load mask bitmap
            const maskBitmap = await new Promise<Uint8Array | null>((resolve) => {
                const maskImg = new Image();
                maskImg.crossOrigin = 'Anonymous';
                maskImg.onload = () => {
                    const mc = document.createElement('canvas');
                    mc.width = tempCanvas.width;
                    mc.height = tempCanvas.height;
                    const mctx = mc.getContext('2d');
                    if (!mctx) { resolve(null); return; }
                    mctx.drawImage(maskImg, 0, 0, mc.width, mc.height);
                    const mData = mctx.getImageData(0, 0, mc.width, mc.height);
                    const alpha = new Uint8Array(mc.width * mc.height);
                    for (let i = 0; i < mData.data.length; i += 4) {
                        alpha[i / 4] = mData.data[i + 3] > 0 ? 1 : 0;
                    }
                    resolve(alpha);
                };
                maskImg.onerror = () => resolve(null);
                maskImg.src = `data:image/png;base64,${mask.mask_base64}`;
            });

            if (maskBitmap) {
                const colors = extractDominantColors(imageData, maskBitmap, 3);
                dominantMap.set(mask.mask_id, colors);
            } else {
                dominantMap.set(mask.mask_id, []);
            }
        }

        setMaskDominantColors(dominantMap);
        setAnalyzingColors(false);
    }, [masks]);

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
            const setting = paletteSettings.get(mask.mask_id) || DEFAULT_SETTING;
            const hasPalette = setting.paletteName !== 'Originale';
            const lut = hasPalette ? getLUT(setting.paletteName) : null;
            if (hasPalette && !lut) continue;

            // Skip if nothing to do
            const hasNonSelectiveShift = setting.hueShift !== 0 || setting.satShift !== 0 || setting.lightShift !== 0;
            if (!hasPalette && !hasNonSelectiveShift && !setting.selectiveMode) continue;
            if (hasPalette && setting.paletteOpacity === 0) continue;

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

            const dominant = maskDominantColors.get(mask.mask_id) || [];

            const opacity = hasPalette ? setting.paletteOpacity / 100 : 1;

            // Compute target color for palette modes
            const targetRgb = hasPalette ? hslToRgb(setting.paletteHue, setting.paletteSat / 100, setting.paletteLight / 100) : null;

            if (setting.selectiveMode && dominant.length > setting.selectedDominantIdx) {
                const dc = dominant[setting.selectedDominantIdx];

                if (hasPalette && targetRgb) {
                    // ── SELECTIVE + PALETTE: blend matched pixels toward target color ──
                    const [origDomH] = rgbToHsl(dc[0], dc[1], dc[2]);

                    for (let i = 0; i < maskBitmap.length; i++) {
                        if (maskBitmap[i] === 1) {
                            const idx = i * 4;
                            const r = originalData.data[idx];
                            const g = originalData.data[idx + 1];
                            const b = originalData.data[idx + 2];

                            const [pixH] = rgbToHsl(r, g, b);
                            let hueDiff = Math.abs(pixH - origDomH);
                            if (hueDiff > 180) hueDiff = 360 - hueDiff;

                            if (hueDiff <= 30) {
                                const closeness = 1 - (hueDiff / 30);
                                const blendAmt = closeness * opacity;
                                resultData.data[idx] = Math.round(r + (targetRgb[0] - r) * blendAmt);
                                resultData.data[idx + 1] = Math.round(g + (targetRgb[1] - g) * blendAmt);
                                resultData.data[idx + 2] = Math.round(b + (targetRgb[2] - b) * blendAmt);
                            }
                        }
                    }
                } else {
                    // ── SELECTIVE + NO PALETTE: hue-shift on matched pixels ──
                    const [origDomH, origDomS, origDomL] = rgbToHsl(dc[0], dc[1], dc[2]);
                    const hDelta = setting.selectiveHue - origDomH;
                    const sDelta = (setting.selectiveSat / 100) - origDomS;
                    const lDelta = (setting.selectiveLight / 100) - origDomL;
                    const hasShift = hDelta !== 0 || sDelta !== 0 || lDelta !== 0;

                    if (hasShift) {
                        for (let i = 0; i < maskBitmap.length; i++) {
                            if (maskBitmap[i] === 1) {
                                const idx = i * 4;
                                const r = originalData.data[idx];
                                const g = originalData.data[idx + 1];
                                const b = originalData.data[idx + 2];

                                const [pixH] = rgbToHsl(r, g, b);
                                let hueDiff = Math.abs(pixH - origDomH);
                                if (hueDiff > 180) hueDiff = 360 - hueDiff;

                                if (hueDiff <= 30) {
                                    const fc = shiftHSL(r, g, b, hDelta, sDelta, lDelta);
                                    resultData.data[idx] = fc[0];
                                    resultData.data[idx + 1] = fc[1];
                                    resultData.data[idx + 2] = fc[2];
                                }
                            }
                        }
                    }
                }
            } else {
                // ── NON-SELECTIVE MODE ──
                if (hasPalette && targetRgb) {
                    // ── NON-SELECTIVE + PALETTE: RGB blend toward target ──
                    for (let i = 0; i < maskBitmap.length; i++) {
                        if (maskBitmap[i] === 1) {
                            const idx = i * 4;
                            const r = originalData.data[idx];
                            const g = originalData.data[idx + 1];
                            const b = originalData.data[idx + 2];

                            resultData.data[idx] = Math.round(r + (targetRgb[0] - r) * opacity);
                            resultData.data[idx + 1] = Math.round(g + (targetRgb[1] - g) * opacity);
                            resultData.data[idx + 2] = Math.round(b + (targetRgb[2] - b) * opacity);
                        }
                    }
                } else {
                    // ── NON-SELECTIVE + NO PALETTE: classic hue-shift ──
                    const hDelta = setting.hueShift;
                    const sDelta = setting.satShift / 100;
                    const lDelta = setting.lightShift / 100;
                    const hasShift = hDelta !== 0 || sDelta !== 0 || lDelta !== 0;

                    if (hasShift) {
                        for (let i = 0; i < maskBitmap.length; i++) {
                            if (maskBitmap[i] === 1) {
                                const idx = i * 4;
                                const r = originalData.data[idx];
                                const g = originalData.data[idx + 1];
                                const b = originalData.data[idx + 2];

                                const fc = shiftHSL(r, g, b, hDelta, sDelta, lDelta);
                                resultData.data[idx] = fc[0];
                                resultData.data[idx + 1] = fc[1];
                                resultData.data[idx + 2] = fc[2];
                            }
                        }
                    }
                }
            }
        }

        ctx.putImageData(resultData, 0, 0);

    }, [masks, paletteSettings, getLUT, maskDominantColors]);

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
            const current = newMap.get(maskId) || { ...DEFAULT_SETTING };
            newMap.set(maskId, { ...current, paletteName });
            return newMap;
        });
        setOpenDropdown(null);
    };

    const updateMaskSetting = (maskId: number, updates: Partial<PaletteSetting>) => {
        setPaletteSettings(prev => {
            const newMap = new Map(prev);
            const current = newMap.get(maskId) || { ...DEFAULT_SETTING };
            newMap.set(maskId, { ...current, ...updates });
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
                        <div className="card-body d-flex align-items-start justify-content-center p-2"
                            style={{ overflow: 'auto', backgroundColor: '#1a1a1a' }}
                        >
                            <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', maxHeight: '100%' }}>
                                <img
                                    ref={imageRef}
                                    src={imageUrl}
                                    alt="Source"
                                    style={{ display: 'none' }}
                                    crossOrigin="anonymous"
                                    onLoad={() => { drawResult(); analyzeDominantColors(); }}
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
                        <div className="card-body p-0 flex-grow-1" ref={dropdownContainerRef} style={{ overflowY: 'auto', height: 0 }}>
                            {masks.map((mask) => {
                                const setting = paletteSettings.get(mask.mask_id) || { ...DEFAULT_SETTING };
                                const dominant = maskDominantColors.get(mask.mask_id) || [];
                                // Filter palettes: show only those containing a similar color, or all if no dominant colors
                                const filteredScientific = dominant.length > 0
                                    ? allPalettes.filter(p => p.type === 'scientific' && paletteContainsAnyDominantColor(
                                        SCIENTIFIC_PALETTES.find(sp => sp.name === p.name)?.colors || [], dominant))
                                    : allPalettes.filter(p => p.type === 'scientific');
                                const filteredCustom = dominant.length > 0
                                    ? allPalettes.filter(p => p.type === 'custom' && paletteContainsAnyDominantColor(
                                        customPalettes.find(cp => cp.name === p.name)?.colors.map(hexToRgb) || [], dominant))
                                    : allPalettes.filter(p => p.type === 'custom');
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
                                                {/* Dominant color swatches */}
                                                {dominant.length > 0 && (
                                                    <div className="d-flex gap-1 mt-1 justify-content-center">
                                                        {dominant.map((c, i) => (
                                                            <div
                                                                key={i}
                                                                title={`rgb(${c[0]},${c[1]},${c[2]})`}
                                                                style={{
                                                                    width: '14px',
                                                                    height: '14px',
                                                                    borderRadius: '3px',
                                                                    backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})`,
                                                                    border: '1px solid rgba(0,0,0,0.2)'
                                                                }}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                                {analyzingColors && dominant.length === 0 && (
                                                    <div className="mt-1"><small className="text-muted">Analisi...</small></div>
                                                )}
                                            </div>

                                            {/* Controls */}
                                            <div className="col-10">
                                                <div>
                                                    {/* Selective mode switch + Reset */}
                                                    <div className="d-flex align-items-center justify-content-between mb-2">
                                                        {dominant.length > 0 && (
                                                            <div className="form-check form-switch mb-0">
                                                                <input
                                                                    className="form-check-input"
                                                                    type="checkbox"
                                                                    role="switch"
                                                                    id={`selective-${mask.mask_id}`}
                                                                    checked={setting.selectiveMode}
                                                                    onChange={(e) => {
                                                                        const on = e.target.checked;
                                                                        const updates: Partial<PaletteSetting> = { selectiveMode: on };
                                                                        if (on && dominant.length > 0) {
                                                                            const dc = dominant[setting.selectedDominantIdx] || dominant[0];
                                                                            const hasPal = setting.paletteName !== 'Originale';
                                                                            if (hasPal) {
                                                                                const palLut = getLUT(setting.paletteName);
                                                                                if (palLut) {
                                                                                    const pos = findClosestLUTPosition(palLut, dc);
                                                                                    const lutColor = palLut[Math.round(pos * (palLut.length - 1))];
                                                                                    const [h, s, l] = rgbToHsl(lutColor[0], lutColor[1], lutColor[2]);
                                                                                    updates.palettePosition = pos;
                                                                                    updates.paletteHue = Math.round(h);
                                                                                    updates.paletteSat = Math.round(s * 100);
                                                                                    updates.paletteLight = Math.round(l * 100);
                                                                                }
                                                                            } else {
                                                                                const [dh, ds, dl] = rgbToHsl(dc[0], dc[1], dc[2]);
                                                                                updates.selectiveHue = Math.round(dh);
                                                                                updates.selectiveSat = Math.round(ds * 100);
                                                                                updates.selectiveLight = Math.round(dl * 100);
                                                                            }
                                                                        }
                                                                        updateMaskSetting(mask.mask_id, updates);
                                                                    }}
                                                                />
                                                                <label className="form-check-label small text-muted" htmlFor={`selective-${mask.mask_id}`}>
                                                                    Modifica selettiva
                                                                </label>
                                                            </div>
                                                        )}
                                                        <button
                                                            className="btn btn-outline-secondary btn-sm py-0 px-2"
                                                            title="Ripristina valori originali"
                                                            onClick={() => updateMaskSetting(mask.mask_id, {
                                                                hueShift: 0, satShift: 0, lightShift: 0,
                                                                selectiveMode: false, selectedDominantIdx: 0,
                                                                selectiveHue: 0, selectiveSat: 50, selectiveLight: 50,
                                                                palettePosition: 0.5, paletteHue: 0, paletteSat: 0, paletteLight: 50,
                                                                paletteOpacity: 100, paletteName: 'Originale'
                                                            })}
                                                        >
                                                            🔄 Reset
                                                        </button>
                                                    </div>

                                                    {/* Dominant color selector (selective mode) */}
                                                    {setting.selectiveMode && dominant.length > 0 && (
                                                        <div className="d-flex gap-1 align-items-center mb-2">
                                                            <small className="text-muted me-1">Colore:</small>
                                                            {dominant.map((c, i) => {
                                                                // Always show original dominant color
                                                                const displayColor: [number, number, number] = c;
                                                                return (
                                                                    <button
                                                                        key={i}
                                                                        title={`rgb(${displayColor[0]},${displayColor[1]},${displayColor[2]})`}
                                                                        className="btn btn-sm p-0"
                                                                        style={{
                                                                            width: '24px',
                                                                            height: '24px',
                                                                            borderRadius: '4px',
                                                                            backgroundColor: `rgb(${displayColor[0]},${displayColor[1]},${displayColor[2]})`,
                                                                            border: setting.selectedDominantIdx === i
                                                                                ? '3px solid #0d6efd'
                                                                                : '1px solid rgba(0,0,0,0.2)',
                                                                            cursor: 'pointer'
                                                                        }}
                                                                        onClick={() => {
                                                                            const dc = dominant[i];
                                                                            const hasPal = setting.paletteName !== 'Originale';
                                                                            if (hasPal) {
                                                                                const palLut = getLUT(setting.paletteName);
                                                                                if (palLut) {
                                                                                    const pos = findClosestLUTPosition(palLut, dc);
                                                                                    const lutColor = palLut[Math.round(pos * (palLut.length - 1))];
                                                                                    const [h, s, l] = rgbToHsl(lutColor[0], lutColor[1], lutColor[2]);
                                                                                    updateMaskSetting(mask.mask_id, {
                                                                                        selectedDominantIdx: i,
                                                                                        palettePosition: pos,
                                                                                        paletteHue: Math.round(h),
                                                                                        paletteSat: Math.round(s * 100),
                                                                                        paletteLight: Math.round(l * 100)
                                                                                    });
                                                                                } else {
                                                                                    updateMaskSetting(mask.mask_id, { selectedDominantIdx: i });
                                                                                }
                                                                            } else {
                                                                                const [dh, ds, dl] = rgbToHsl(dc[0], dc[1], dc[2]);
                                                                                updateMaskSetting(mask.mask_id, {
                                                                                    selectedDominantIdx: i,
                                                                                    selectiveHue: Math.round(dh),
                                                                                    selectiveSat: Math.round(ds * 100),
                                                                                    selectiveLight: Math.round(dl * 100)
                                                                                });
                                                                            }
                                                                        }}
                                                                    />
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
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
                                                            {filteredScientific.length > 0 && (
                                                                <li><h6 className="dropdown-header">Standard ({filteredScientific.length})</h6></li>
                                                            )}
                                                            {filteredScientific.map(p => (
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

                                                            {filteredCustom.length > 0 && (
                                                                <>
                                                                    <li><hr className="dropdown-divider" /></li>
                                                                    <li><h6 className="dropdown-header">Personalizzate ({filteredCustom.length})</h6></li>
                                                                    {filteredCustom.map(p => (
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

                                                {/* HSL Controls */}
                                                <div className="mt-2">
                                                    {/* Sliders – different UI depending on whether a palette is selected */}
                                                    {(() => {
                                                        const isSelective = setting.selectiveMode;
                                                        const hasPalette = setting.paletteName !== 'Originale';

                                                        // Editable badge input helper style
                                                        const badgeInputStyle: React.CSSProperties = {
                                                            width: '52px', fontSize: '0.75rem', fontWeight: 700,
                                                            textAlign: 'center' as const, backgroundColor: '#6c757d', color: '#fff',
                                                            border: 'none', borderRadius: '0.375rem',
                                                            padding: '0.25em 0.4em', lineHeight: 1, outline: 'none',
                                                            MozAppearance: 'textfield'
                                                        };

                                                        if (hasPalette) {
                                                            const paletteGradient = currentPaletteObj?.gradient || '';
                                                            const posPercent = Math.round(setting.palettePosition * 100);
                                                            const currentLut = getLUT(setting.paletteName);
                                                            return (
                                                                <>
                                                                    {/* Posizione Palette (master) */}
                                                                    <div className="mb-1">
                                                                        <div className="d-flex justify-content-between">
                                                                            <label className="form-label small text-muted mb-0">Posizione Palette</label>
                                                                            <input type="number" style={badgeInputStyle}
                                                                                min={0} max={100} value={posPercent}
                                                                                onChange={(e) => {
                                                                                    const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                                                                                    const pos = v / 100;
                                                                                    const updates: Partial<PaletteSetting> = { palettePosition: pos };
                                                                                    if (currentLut) {
                                                                                        const lutColor = currentLut[Math.round(pos * (currentLut.length - 1))];
                                                                                        const [h, s, l] = rgbToHsl(lutColor[0], lutColor[1], lutColor[2]);
                                                                                        updates.paletteHue = Math.round(h);
                                                                                        updates.paletteSat = Math.round(s * 100);
                                                                                        updates.paletteLight = Math.round(l * 100);
                                                                                    }
                                                                                    updateMaskSetting(mask.mask_id, updates);
                                                                                }}
                                                                            />
                                                                        </div>
                                                                        <div style={{ position: 'relative', height: '28px' }}>
                                                                            <div style={{
                                                                                position: 'absolute', top: '10px', left: '2px', right: '2px',
                                                                                height: '8px', borderRadius: '4px',
                                                                                background: paletteGradient,
                                                                                opacity: 0.7, pointerEvents: 'none'
                                                                            }} />
                                                                            <input
                                                                                type="range" className="form-range"
                                                                                style={{ position: 'relative', zIndex: 1 }}
                                                                                min="0" max="100" step="1" value={posPercent}
                                                                                onChange={(e) => {
                                                                                    const pos = parseInt(e.target.value) / 100;
                                                                                    const updates: Partial<PaletteSetting> = { palettePosition: pos };
                                                                                    if (currentLut) {
                                                                                        const lutColor = currentLut[Math.round(pos * (currentLut.length - 1))];
                                                                                        const [h, s, l] = rgbToHsl(lutColor[0], lutColor[1], lutColor[2]);
                                                                                        updates.paletteHue = Math.round(h);
                                                                                        updates.paletteSat = Math.round(s * 100);
                                                                                        updates.paletteLight = Math.round(l * 100);
                                                                                    }
                                                                                    updateMaskSetting(mask.mask_id, updates);
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    {/* Tonalità (H) */}
                                                                    <div className="mb-1">
                                                                        <div className="d-flex justify-content-between">
                                                                            <label className="form-label small text-muted mb-0">Tonalità</label>
                                                                            <input type="number" style={badgeInputStyle}
                                                                                min={0} max={360} value={setting.paletteHue}
                                                                                onChange={(e) => updateMaskSetting(mask.mask_id, { paletteHue: Math.max(0, Math.min(360, parseInt(e.target.value) || 0)) })}
                                                                            />
                                                                        </div>
                                                                        <input type="range" className="form-range"
                                                                            min="0" max="360" step="1"
                                                                            value={setting.paletteHue}
                                                                            onChange={(e) => updateMaskSetting(mask.mask_id, { paletteHue: parseInt(e.target.value) })}
                                                                        />
                                                                    </div>
                                                                    {/* Saturazione (S) */}
                                                                    <div className="mb-1">
                                                                        <div className="d-flex justify-content-between">
                                                                            <label className="form-label small text-muted mb-0">Saturazione</label>
                                                                            <input type="number" style={badgeInputStyle}
                                                                                min={0} max={100} value={setting.paletteSat}
                                                                                onChange={(e) => updateMaskSetting(mask.mask_id, { paletteSat: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
                                                                            />
                                                                        </div>
                                                                        <input type="range" className="form-range"
                                                                            min="0" max="100" step="1"
                                                                            value={setting.paletteSat}
                                                                            onChange={(e) => updateMaskSetting(mask.mask_id, { paletteSat: parseInt(e.target.value) })}
                                                                        />
                                                                    </div>
                                                                    {/* Luminosità (L) */}
                                                                    <div className="mb-1">
                                                                        <div className="d-flex justify-content-between">
                                                                            <label className="form-label small text-muted mb-0">Luminosità</label>
                                                                            <input type="number" style={badgeInputStyle}
                                                                                min={0} max={100} value={setting.paletteLight}
                                                                                onChange={(e) => updateMaskSetting(mask.mask_id, { paletteLight: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
                                                                            />
                                                                        </div>
                                                                        <input type="range" className="form-range"
                                                                            min="0" max="100" step="1"
                                                                            value={setting.paletteLight}
                                                                            onChange={(e) => updateMaskSetting(mask.mask_id, { paletteLight: parseInt(e.target.value) })}
                                                                        />
                                                                    </div>
                                                                    {/* Opacità */}
                                                                    <div className="mb-1">
                                                                        <div className="d-flex justify-content-between">
                                                                            <label className="form-label small text-muted mb-0">Opacità</label>
                                                                            <input type="number" style={badgeInputStyle}
                                                                                min={0} max={100} value={setting.paletteOpacity}
                                                                                onChange={(e) => updateMaskSetting(mask.mask_id, { paletteOpacity: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
                                                                            />
                                                                        </div>
                                                                        <input type="range" className="form-range"
                                                                            min="0" max="100" step="5"
                                                                            value={setting.paletteOpacity}
                                                                            onChange={(e) => updateMaskSetting(mask.mask_id, { paletteOpacity: parseInt(e.target.value) })}
                                                                        />
                                                                    </div>
                                                                </>
                                                            );
                                                        }

                                                        // ── NO PALETTE ("Originale"): hue/sat/light sliders with editable badges ──
                                                        const hueGradient = 'linear-gradient(to right, hsl(0,80%,50%), hsl(60,80%,50%), hsl(120,80%,50%), hsl(180,80%,50%), hsl(240,80%,50%), hsl(300,80%,50%), hsl(360,80%,50%))';
                                                        const hVal = isSelective ? setting.selectiveHue : setting.hueShift;
                                                        const sVal = isSelective ? setting.selectiveSat : setting.satShift;
                                                        const lVal = isSelective ? setting.selectiveLight : setting.lightShift;
                                                        const hMin = isSelective ? 0 : -180;
                                                        const hMax = isSelective ? 360 : 180;
                                                        const sMin = isSelective ? 0 : -100;

                                                        return (
                                                            <>
                                                                <div className="mb-1">
                                                                    <div className="d-flex justify-content-between">
                                                                        <label className="form-label small text-muted mb-0">Tonalità</label>
                                                                        <input type="number" style={badgeInputStyle}
                                                                            min={hMin} max={hMax} value={hVal}
                                                                            onChange={(e) => {
                                                                                const v = Math.max(hMin, Math.min(hMax, parseInt(e.target.value) || 0));
                                                                                if (isSelective) updateMaskSetting(mask.mask_id, { selectiveHue: v });
                                                                                else updateMaskSetting(mask.mask_id, { hueShift: v });
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <div style={{ position: 'relative', height: '28px' }}>
                                                                        <div style={{
                                                                            position: 'absolute', top: '10px', left: '2px', right: '2px',
                                                                            height: '8px', borderRadius: '4px',
                                                                            background: hueGradient,
                                                                            opacity: 0.7, pointerEvents: 'none'
                                                                        }} />
                                                                        <input
                                                                            type="range" className="form-range"
                                                                            style={{ position: 'relative', zIndex: 1 }}
                                                                            min={String(hMin)} max={String(hMax)} step="5" value={hVal}
                                                                            onChange={(e) => {
                                                                                const v = parseInt(e.target.value);
                                                                                if (isSelective) updateMaskSetting(mask.mask_id, { selectiveHue: v });
                                                                                else updateMaskSetting(mask.mask_id, { hueShift: v });
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="mb-1">
                                                                    <div className="d-flex justify-content-between">
                                                                        <label className="form-label small text-muted mb-0">Saturazione</label>
                                                                        <input type="number" style={badgeInputStyle}
                                                                            min={sMin} max={100} value={sVal}
                                                                            onChange={(e) => {
                                                                                const v = Math.max(sMin, Math.min(100, parseInt(e.target.value) || 0));
                                                                                if (isSelective) updateMaskSetting(mask.mask_id, { selectiveSat: v });
                                                                                else updateMaskSetting(mask.mask_id, { satShift: v });
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <input type="range" className="form-range"
                                                                        min={String(sMin)} max="100" step="5" value={sVal}
                                                                        onChange={(e) => {
                                                                            const v = parseInt(e.target.value);
                                                                            if (isSelective) updateMaskSetting(mask.mask_id, { selectiveSat: v });
                                                                            else updateMaskSetting(mask.mask_id, { satShift: v });
                                                                        }}
                                                                    />
                                                                </div>

                                                                <div className="mb-1">
                                                                    <div className="d-flex justify-content-between">
                                                                        <label className="form-label small text-muted mb-0">Luminosità</label>
                                                                        <input type="number" style={badgeInputStyle}
                                                                            min={sMin} max={100} value={lVal}
                                                                            onChange={(e) => {
                                                                                const v = Math.max(sMin, Math.min(100, parseInt(e.target.value) || 0));
                                                                                if (isSelective) updateMaskSetting(mask.mask_id, { selectiveLight: v });
                                                                                else updateMaskSetting(mask.mask_id, { lightShift: v });
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <input type="range" className="form-range"
                                                                        min={String(sMin)} max="100" step="5" value={lVal}
                                                                        onChange={(e) => {
                                                                            const v = parseInt(e.target.value);
                                                                            if (isSelective) updateMaskSetting(mask.mask_id, { selectiveLight: v });
                                                                            else updateMaskSetting(mask.mask_id, { lightShift: v });
                                                                        }}
                                                                    />
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
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

