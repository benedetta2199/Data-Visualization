'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    SCIENTIFIC_PALETTES,
    CustomPalette,
    LOCAL_STORAGE_KEY,
    buildGradientCSS,
    buildGradientFromHex,
    hexToRgb
} from '@/app/lib/palettes';

export default function PalettesPage() {
    // Custom palette builder state
    const [startColor, setStartColor] = useState('#0000ff');
    const [endColor, setEndColor] = useState('#ff0000');
    const [mid1Enabled, setMid1Enabled] = useState(false);
    const [mid1Color, setMid1Color] = useState('#00ff00');
    const [mid2Enabled, setMid2Enabled] = useState(false);
    const [mid2Color, setMid2Color] = useState('#ffff00');
    const [customName, setCustomName] = useState('');

    // Saved custom palettes
    const [customPalettes, setCustomPalettes] = useState<CustomPalette[]>([]);

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const data = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (data) setCustomPalettes(JSON.parse(data));
        } catch { /* ignore */ }
    }, []);

    // Persist to localStorage whenever customPalettes changes
    const persist = useCallback((palettes: CustomPalette[]) => {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(palettes));
    }, []);

    // Build preview colors array
    const previewColors = (): string[] => {
        const arr = [startColor];
        if (mid1Enabled) arr.push(mid1Color);
        if (mid2Enabled) arr.push(mid2Color);
        arr.push(endColor);
        return arr;
    };

    // Save custom palette
    const saveCustomPalette = () => {
        const name = customName.trim() || `Palette personalizzata ${customPalettes.length + 1}`;
        const newPalette: CustomPalette = {
            id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name,
            colors: previewColors(),
            createdAt: Date.now(),
        };
        const updated = [...customPalettes, newPalette];
        setCustomPalettes(updated);
        persist(updated);
        setCustomName('');
    };

    // Delete custom palette
    const deleteCustomPalette = (id: string) => {
        const updated = customPalettes.filter(p => p.id !== id);
        setCustomPalettes(updated);
        persist(updated);
    };

    // Group scientific palettes by category
    const categories = Array.from(new Set(SCIENTIFIC_PALETTES.map(p => p.category)));

    return (
        <div className="container mt-4 mb-5">
            {/* Header */}
            <div className="mb-4">
                <h2 className="mb-1">
                    <i className="bi bi-palette me-2"></i>
                    Palette Scientifiche
                </h2>
                <p className="text-muted mb-0">
                    Colour map scientifiche per la ricolorazione. Ogni palette è una sequenza lineare di colori.
                </p>
            </div>

            {/* ── Scientific palettes by category ── */}
            {categories.map(cat => (
                <div key={cat} className="mb-4">
                    <h5 className="text-uppercase text-secondary mb-3" style={{ letterSpacing: '0.05em' }}>
                        {cat}
                    </h5>
                    <div className="row g-3">
                        {SCIENTIFIC_PALETTES.filter(p => p.category === cat).map(palette => (
                            <div key={palette.name} className="col-md-6 col-lg-4">
                                <div className="card border-0 shadow-sm h-100">
                                    <div className="card-body p-3">
                                        <div
                                            style={{
                                                height: '40px',
                                                borderRadius: '8px',
                                                background: buildGradientCSS(palette.colors),
                                                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                                            }}
                                        />
                                        <div className="mt-2 d-flex align-items-center justify-content-between">
                                            <strong style={{ fontSize: '0.9rem' }}>{palette.name}</strong>
                                            <small className="text-muted">{palette.colors.length} stop</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            <hr className="my-4" />

            {/* ── Custom Palette Builder ── */}
            <div className="mb-4">
                <h4 className="mb-3">
                    <i className="bi bi-plus-circle me-2"></i>
                    Crea Palette Personalizzata
                </h4>

                <div className="card shadow-sm border-0">
                    <div className="card-body">
                        {/* Color pickers row */}
                        <div className="row g-3 align-items-end">
                            {/* Start color */}
                            <div className="col-auto">
                                <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                                    Colore iniziale
                                </label>
                                <div className="d-flex align-items-center gap-2">
                                    <input
                                        type="color"
                                        className="form-control form-control-color"
                                        value={startColor}
                                        onChange={e => setStartColor(e.target.value)}
                                        style={{ width: '50px', height: '40px' }}
                                    />
                                    <input
                                        type="text"
                                        className="form-control form-control-sm"
                                        value={startColor}
                                        onChange={e => setStartColor(e.target.value)}
                                        style={{ width: '80px', fontFamily: 'monospace' }}
                                        maxLength={7}
                                    />
                                </div>
                            </div>

                            {/* Mid1 */}
                            <div className="col-auto">
                                <div className="form-check mb-1">
                                    <input
                                        type="checkbox"
                                        className="form-check-input"
                                        id="mid1Check"
                                        checked={mid1Enabled}
                                        onChange={e => setMid1Enabled(e.target.checked)}
                                    />
                                    <label className="form-check-label fw-semibold" htmlFor="mid1Check" style={{ fontSize: '0.85rem' }}>
                                        Intermedio 1
                                    </label>
                                </div>
                                <div className="d-flex align-items-center gap-2">
                                    <input
                                        type="color"
                                        className="form-control form-control-color"
                                        value={mid1Color}
                                        onChange={e => setMid1Color(e.target.value)}
                                        disabled={!mid1Enabled}
                                        style={{ width: '50px', height: '40px', opacity: mid1Enabled ? 1 : 0.4 }}
                                    />
                                    <input
                                        type="text"
                                        className="form-control form-control-sm"
                                        value={mid1Color}
                                        onChange={e => setMid1Color(e.target.value)}
                                        disabled={!mid1Enabled}
                                        style={{ width: '80px', fontFamily: 'monospace', opacity: mid1Enabled ? 1 : 0.4 }}
                                        maxLength={7}
                                    />
                                </div>
                            </div>

                            {/* Mid2 */}
                            <div className="col-auto">
                                <div className="form-check mb-1">
                                    <input
                                        type="checkbox"
                                        className="form-check-input"
                                        id="mid2Check"
                                        checked={mid2Enabled}
                                        onChange={e => setMid2Enabled(e.target.checked)}
                                    />
                                    <label className="form-check-label fw-semibold" htmlFor="mid2Check" style={{ fontSize: '0.85rem' }}>
                                        Intermedio 2
                                    </label>
                                </div>
                                <div className="d-flex align-items-center gap-2">
                                    <input
                                        type="color"
                                        className="form-control form-control-color"
                                        value={mid2Color}
                                        onChange={e => setMid2Color(e.target.value)}
                                        disabled={!mid2Enabled}
                                        style={{ width: '50px', height: '40px', opacity: mid2Enabled ? 1 : 0.4 }}
                                    />
                                    <input
                                        type="text"
                                        className="form-control form-control-sm"
                                        value={mid2Color}
                                        onChange={e => setMid2Color(e.target.value)}
                                        disabled={!mid2Enabled}
                                        style={{ width: '80px', fontFamily: 'monospace', opacity: mid2Enabled ? 1 : 0.4 }}
                                        maxLength={7}
                                    />
                                </div>
                            </div>

                            {/* End color */}
                            <div className="col-auto">
                                <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                                    Colore finale
                                </label>
                                <div className="d-flex align-items-center gap-2">
                                    <input
                                        type="color"
                                        className="form-control form-control-color"
                                        value={endColor}
                                        onChange={e => setEndColor(e.target.value)}
                                        style={{ width: '50px', height: '40px' }}
                                    />
                                    <input
                                        type="text"
                                        className="form-control form-control-sm"
                                        value={endColor}
                                        onChange={e => setEndColor(e.target.value)}
                                        style={{ width: '80px', fontFamily: 'monospace' }}
                                        maxLength={7}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Preview */}
                        <div className="mt-3">
                            <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>Anteprima</label>
                            <div
                                style={{
                                    height: '50px',
                                    borderRadius: '8px',
                                    background: buildGradientFromHex(previewColors()),
                                    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                                }}
                            />
                        </div>

                        {/* Name + Save */}
                        <div className="mt-3 d-flex align-items-end gap-3">
                            <div className="flex-grow-1">
                                <label className="form-label fw-semibold" htmlFor="paletteName" style={{ fontSize: '0.85rem' }}>
                                    Nome palette
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    id="paletteName"
                                    placeholder="Es. La mia palette"
                                    value={customName}
                                    onChange={e => setCustomName(e.target.value)}
                                />
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={saveCustomPalette}
                            >
                                <i className="bi bi-save me-1"></i> Salva
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Saved Custom Palettes ── */}
            {customPalettes.length > 0 && (
                <div className="mb-4">
                    <h5 className="text-uppercase text-secondary mb-3" style={{ letterSpacing: '0.05em' }}>
                        Palette personalizzate
                    </h5>
                    <div className="row g-3">
                        {customPalettes.map(cp => (
                            <div key={cp.id} className="col-md-6 col-lg-4">
                                <div className="card border-0 shadow-sm h-100">
                                    <div className="card-body p-3">
                                        <div
                                            style={{
                                                height: '40px',
                                                borderRadius: '8px',
                                                background: buildGradientFromHex(cp.colors),
                                                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                                            }}
                                        />
                                        <div className="mt-2 d-flex align-items-center justify-content-between">
                                            <strong style={{ fontSize: '0.9rem' }}>{cp.name}</strong>
                                            <button
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={() => deleteCustomPalette(cp.id)}
                                                title="Elimina"
                                                style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                                            >
                                                <i className="bi bi-trash"></i>
                                            </button>
                                        </div>
                                        {/* Color swatches */}
                                        <div className="d-flex gap-1 mt-1">
                                            {cp.colors.map((c, i) => (
                                                <div
                                                    key={i}
                                                    style={{
                                                        width: '20px',
                                                        height: '20px',
                                                        borderRadius: '4px',
                                                        backgroundColor: c,
                                                        border: '1px solid rgba(0,0,0,0.15)',
                                                    }}
                                                    title={c}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
