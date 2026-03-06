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

export default function MasksEditorPage() {
    const router = useRouter();

    // Mask state
    const [samMasks, setSamMasks] = useState<SAMMask[]>([]);
    const [selectedMaskIds, setSelectedMaskIds] = useState<Set<number>>(new Set());
    const [initialMasks, setInitialMasks] = useState<SAMMask[]>([]);
    const [masksHistory, setMasksHistory] = useState<SAMMask[][]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    // Lasso Tool state
    const [isLassoMode, setIsLassoMode] = useState(false);
    const [isDrawingLasso, setIsDrawingLasso] = useState(false);
    const [lassoPoints, setLassoPoints] = useState<{ x: number, y: number }[]>([]);

    // CSV Mapping state
    const [csvColumns, setCsvColumns] = useState<string[]>([]);
    const [csvData, setCsvData] = useState<string[][]>([]);
    const [csvMappingCol, setCsvMappingCol] = useState<string>('');
    const [csvMin, setCsvMin] = useState<number>(0);
    const [csvMax, setCsvMax] = useState<number>(100);

    // Image state
    const [imageUrl, setImageUrl] = useState<string>('');
    const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

    // Refs
    const imageRef = useRef<HTMLImageElement | null>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const lassoCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // Load data from sessionStorage on mount
    useEffect(() => {
        try {
            const masksJson = sessionStorage.getItem('sam_masks');
            const imgUrl = sessionStorage.getItem('sam_image_url');

            // Load CSV state if present
            const loadedColsStr = sessionStorage.getItem('csv_columns');
            const loadedDataStr = sessionStorage.getItem('csv_data');
            let initialMappingCol = sessionStorage.getItem('csv_mapping_col') || '';

            if (loadedColsStr && loadedDataStr) {
                const cols = JSON.parse(loadedColsStr);
                const data = JSON.parse(loadedDataStr);
                setCsvColumns(cols);
                setCsvData(data);

                if (!initialMappingCol && cols.length > 0) {
                    initialMappingCol = cols[0];
                }

                if (initialMappingCol) {
                    setCsvMappingCol(initialMappingCol);
                    updateCsvMinMax(initialMappingCol, cols, data);
                }
            }

            if (!masksJson || !imgUrl) {
                router.push('/generation');
                return;
            }

            const rawMasks: SAMMask[] = JSON.parse(masksJson);
            // Ensure all masks have a name
            const masks = rawMasks.map(m => ({
                ...m,
                name: m.name || `Maschera #${m.mask_id + 1}`
            }));
            setSamMasks(masks);
            setInitialMasks(masks);
            setImageUrl(imgUrl);
            setStatusMessage(`${masks.length} maschere trovate`);
        } catch {
            router.push('/generation');
        }
    }, [router]);

    // Draw selected masks on overlay canvas
    const drawMaskOverlays = useCallback(async () => {
        const overlayCanvas = overlayCanvasRef.current;
        const img = imageRef.current;
        if (!overlayCanvas || !img) return;

        const ctx = overlayCanvas.getContext('2d');
        if (!ctx) return;

        overlayCanvas.width = img.clientWidth;
        overlayCanvas.height = img.clientHeight;
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        if (selectedMaskIds.size === 0) return;

        const loadMaskImage = (mask: SAMMask): Promise<void> => {
            return new Promise((resolve) => {
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

                        for (let i = 0; i < data.length; i += 4) {
                            if (data[i + 3] > 0) {
                                data[i] = mask.color[0];
                                data[i + 1] = mask.color[1];
                                data[i + 2] = mask.color[2];
                                data[i + 3] = 150;
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
        };

        const selectedMasks = samMasks.filter(m => selectedMaskIds.has(m.mask_id));
        for (const mask of selectedMasks) {
            await loadMaskImage(mask);
        }
    }, [selectedMaskIds, samMasks]);

    // Redraw overlays when selection changes
    useEffect(() => {
        if (samMasks.length > 0) {
            drawMaskOverlays();
        }
    }, [selectedMaskIds, samMasks, drawMaskOverlays]);

    // Toggle mask selection
    const toggleMaskSelection = (maskId: number) => {
        setSelectedMaskIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(maskId)) {
                newSet.delete(maskId);
            } else {
                newSet.add(maskId);
            }
            return newSet;
        });
    };

    const selectAllMasks = () => {
        setSelectedMaskIds(new Set(samMasks.map(m => m.mask_id)));
    };

    const deselectAllMasks = () => {
        setSelectedMaskIds(new Set());
    };

    // Reset to initial segmentation
    const resetMasks = () => {
        if (initialMasks.length === 0) return;
        setSamMasks(initialMasks);
        setSelectedMaskIds(new Set());
        setMasksHistory([]);
        setStatusMessage(`🔄 Ripristinato alle ${initialMasks.length} maschere originali`);
    };

    // Undo last action
    const undoLastAction = () => {
        if (masksHistory.length === 0) return;
        const previousMasks = masksHistory[masksHistory.length - 1];
        setMasksHistory(prev => prev.slice(0, -1));
        setSamMasks(previousMasks);
        setSelectedMaskIds(new Set());
        setStatusMessage(`↩️ Annullata ultima azione. Maschere: ${previousMasks.length}`);
    };

    // --- Lasso Logic ---
    const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = lassoCanvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    };

    const drawLassoPath = (points: { x: number, y: number }[]) => {
        const canvas = lassoCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (points.length === 0) return;

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }

        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        if (points.length > 2) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
            ctx.fill();
        }
    };

    const handleLassoPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isLassoMode) return;
        e.preventDefault();
        const coords = getCoordinates(e);
        if (coords) {
            setIsDrawingLasso(true);
            setLassoPoints([coords]);
            drawLassoPath([coords]);
        }
    };

    const handleLassoPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isLassoMode || !isDrawingLasso) return;
        e.preventDefault();
        const coords = getCoordinates(e);
        if (coords) {
            const newPoints = [...lassoPoints, coords];
            setLassoPoints(newPoints);
            drawLassoPath(newPoints);
        }
    };

    const handleLassoPointerUp = async (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isLassoMode || !isDrawingLasso) return;
        setIsDrawingLasso(false);
        const coords = getCoordinates(e);
        let finalPoints = lassoPoints;
        if (coords) {
            finalPoints = [...lassoPoints, coords];
            setLassoPoints(finalPoints);
        }

        if (finalPoints.length > 2) {
            await createMaskFromLasso(finalPoints);
        }

        setLassoPoints([]);
        const canvas = lassoCanvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        setIsLassoMode(false);
    };

    const createMaskFromLasso = async (points: { x: number, y: number }[]) => {
        const img = imageRef.current;
        if (!img) return;

        setIsLoading(true);
        try {
            setMasksHistory(prev => [...prev, samMasks]);

            const canvas = document.createElement('canvas');
            // Create the mask at the natural image resolution to match SAM backend masks
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const scaleX = img.naturalWidth / img.clientWidth;
            const scaleY = img.naturalHeight / img.clientHeight;

            ctx.beginPath();
            ctx.moveTo(points[0].x * scaleX, points[0].y * scaleY);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x * scaleX, points[i].y * scaleY);
            }
            ctx.closePath();

            ctx.fillStyle = '#ffffff';
            ctx.fill();

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            let area = 0;
            let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;

            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] > 0 && data[i] > 0) { // check alpha and white
                    area++;
                    const idx = i / 4;
                    const x = idx % canvas.width;
                    const y = Math.floor(idx / canvas.width);

                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }

            if (area === 0) {
                setIsLoading(false);
                return;
            }

            const base64 = canvas.toDataURL('image/png').split(',')[1];

            const randomColor: [number, number, number] = [
                Math.floor(Math.random() * 255),
                Math.floor(Math.random() * 255),
                Math.floor(Math.random() * 255)
            ];

            const newMaskId = Math.max(...samMasks.map(m => m.mask_id), 0) + 1;

            const newMask: SAMMask = {
                mask_id: newMaskId,
                name: `Maschera Lazo #${newMaskId}`,
                mask_base64: base64,
                score: 1.0,
                area: area,
                coverage_percent: (area / (canvas.width * canvas.height)) * 100,
                color: randomColor,
                bbox: [minX, minY, maxX - minX, maxY - minY]
            };

            const updatedMasks = [...samMasks, newMask];
            setSamMasks(updatedMasks);
            setSelectedMaskIds(new Set([newMask.mask_id]));
            setStatusMessage(`✅ Creata nuova maschera Lazo. Totale: ${updatedMasks.length}`);
        } catch (error) {
            console.error('Errore creazione maschera Lazo:', error);
            alert('Errore durante la creazione della maschera Lazo');
        } finally {
            setIsLoading(false);
        }
    };
    // -------------------

    // Union of selected masks (client-side)
    const combineMasks = async () => {
        if (selectedMaskIds.size < 2) {
            alert('Seleziona almeno 2 maschere da unire');
            return;
        }

        setIsLoading(true);
        try {
            setMasksHistory(prev => [...prev, samMasks]);

            const selectedMasksArray = samMasks.filter(m => selectedMaskIds.has(m.mask_id));
            if (selectedMasksArray.length < 2) {
                setIsLoading(false);
                return;
            }

            // Find mask with smallest ID — combined mask inherits its ID, color, and name
            const minMask = selectedMasksArray.reduce((min, m) => m.mask_id < min.mask_id ? m : min);

            const canvas = document.createElement('canvas');
            const firstImg = new Image();
            await new Promise<void>((resolve, reject) => {
                firstImg.onload = () => resolve();
                firstImg.onerror = () => reject(new Error('Errore caricamento'));
                firstImg.src = `data:image/png;base64,${selectedMasksArray[0].mask_base64}`;
            });

            canvas.width = firstImg.width;
            canvas.height = firstImg.height;
            const ctx = canvas.getContext('2d')!;
            const unionMask = new Uint8Array(canvas.width * canvas.height);

            for (const mask of selectedMasksArray) {
                const img = new Image();
                await new Promise<void>((resolve) => {
                    img.onload = () => resolve();
                    img.src = `data:image/png;base64,${mask.mask_base64}`;
                });

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                for (let i = 0; i < imageData.data.length; i += 4) {
                    if (imageData.data[i + 3] > 0) {
                        unionMask[i / 4] = 1;
                    }
                }
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const finalImageData = ctx.createImageData(canvas.width, canvas.height);
            let area = 0;
            for (let i = 0; i < unionMask.length; i++) {
                if (unionMask[i] === 1) {
                    area++;
                    const idx = i * 4;
                    finalImageData.data[idx] = minMask.color[0];
                    finalImageData.data[idx + 1] = minMask.color[1];
                    finalImageData.data[idx + 2] = minMask.color[2];
                    finalImageData.data[idx + 3] = 180;
                }
            }

            ctx.putImageData(finalImageData, 0, 0);
            const combinedBase64 = canvas.toDataURL('image/png').split(',')[1];

            const newMask: SAMMask = {
                mask_id: minMask.mask_id,
                name: minMask.name || `Maschera #${minMask.mask_id + 1}`,
                mask_base64: combinedBase64,
                score: 1.0,
                area: area,
                coverage_percent: (area / (canvas.width * canvas.height)) * 100,
                color: minMask.color,
                bbox: [0, 0, canvas.width, canvas.height]
            };

            const remainingMasks = samMasks.filter(m => !selectedMaskIds.has(m.mask_id));
            const updatedMasks = [...remainingMasks, newMask];
            updatedMasks.sort((a, b) => a.mask_id - b.mask_id);

            setSamMasks(updatedMasks);
            setSelectedMaskIds(new Set());
            setStatusMessage(`✅ Unite ${selectedMasksArray.length} maschere → Maschera #${minMask.mask_id + 1}. Totale: ${updatedMasks.length}`);

        } catch (error) {
            console.error('Errore unione maschere:', error);
            alert('Errore durante l\'unione delle maschere');
        } finally {
            setIsLoading(false);
        }
    };

    // Go back to generation page
    const goBack = () => {
        router.push('/generation');
    };

    // Go to edit page
    const goToEdit = () => {
        sessionStorage.setItem('sam_masks_edit', JSON.stringify(samMasks));
        sessionStorage.setItem('sam_image_url_edit', imageUrl);
        router.push('/generation/masks/edit');
    };

    // Calculate and save CSV Min/Max when column changes
    const updateCsvMinMax = (mappingCol: string, columns: string[] = csvColumns, data: string[][] = csvData) => {
        const colIdx = columns.indexOf(mappingCol);
        if (colIdx >= 0 && data.length > 0) {
            const numericValues = data
                .map(row => {
                    const val = row[colIdx];
                    return val ? parseFloat(val.replace(',', '.')) : NaN;
                })
                .filter(v => !isNaN(v));

            const min = numericValues.length > 0 ? Math.min(...numericValues) : 0;
            const max = numericValues.length > 0 ? Math.max(...numericValues) : 100;

            setCsvMin(min);
            setCsvMax(max);
            sessionStorage.setItem('csv_mapping_min', String(min));
            sessionStorage.setItem('csv_mapping_max', String(max));
        }
    };

    const handleCsvColumnChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newCol = e.target.value;
        setCsvMappingCol(newCol);
        sessionStorage.setItem('csv_mapping_col', newCol);
        updateCsvMinMax(newCol);
    };

    if (!imageUrl) {
        return (
            <div className="container mt-5 text-center">
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Caricamento...</span>
                </div>
                <p className="mt-3">Caricamento dati segmentazione...</p>
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
                    <h4 className="mb-0">🎭 Editor Maschere SAM</h4>
                </div>

                {statusMessage && (
                    <span className="badge bg-info fs-6">{statusMessage}</span>
                )}
            </div>

            {/* Two-column layout */}
            <div className="row px-3" style={{ height: 'calc(100vh - 100px)' }}>
                {/* Left column — Image with overlay (col-5) */}
                <div className="col-5 d-flex flex-column">
                    <div className="card h-100">
                        <div className="card-header bg-dark text-white py-2">
                            <strong>📷 Immagine Originale</strong>
                            {selectedMaskIds.size > 0 && (
                                <span className="badge bg-success ms-2">
                                    {selectedMaskIds.size} selezionate
                                </span>
                            )}
                        </div>
                        <div
                            className="card-body d-flex align-items-start justify-content-center p-2"
                            style={{ overflow: 'auto', backgroundColor: '#1a1a1a' }}
                        >
                            <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', maxHeight: '100%' }}>
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
                                    onLoad={(e) => {
                                        const img = e.target as HTMLImageElement;
                                        setImageDimensions({
                                            width: img.naturalWidth,
                                            height: img.naturalHeight
                                        });
                                        if (overlayCanvasRef.current) {
                                            overlayCanvasRef.current.width = img.clientWidth;
                                            overlayCanvasRef.current.height = img.clientHeight;
                                        }
                                        if (lassoCanvasRef.current) {
                                            lassoCanvasRef.current.width = img.clientWidth;
                                            lassoCanvasRef.current.height = img.clientHeight;
                                        }
                                    }}
                                />
                                {/* Overlay canvas */}
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
                                {/* Lasso path canvas */}
                                <canvas
                                    ref={lassoCanvasRef}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: '100%',
                                        cursor: isLassoMode ? 'crosshair' : 'default',
                                        pointerEvents: isLassoMode ? 'auto' : 'none',
                                        opacity: isLassoMode ? 1 : 0
                                    }}
                                    onPointerDown={handleLassoPointerDown}
                                    onPointerMove={handleLassoPointerMove}
                                    onPointerUp={handleLassoPointerUp}
                                    onPointerLeave={handleLassoPointerUp}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right column — Controls + Mask grid (col-7) */}
                <div className="col-7 d-flex flex-column">
                    {/* Pulsante Avanti spostato sopra CSV Mapping e reso più evidente */}
                    <div className="d-flex justify-content-end mb-2">
                        <button className="btn btn-success" onClick={goToEdit}>
                            Avanti →
                        </button>
                    </div>

                    {/* CSV Mapping Selector - Stile rinnovato */}
                    <div className="card mb-2 border-0 shadow-sm">
                        <div className="card-body py-2 px-3" style={{ backgroundColor: '#f8f9fa' }}>
                            <div className="d-flex flex-wrap align-items-center gap-3">
                                <div className="d-flex align-items-center w-75">
                                    <span className="me-2 text-secondary w-50" style={{ fontSize: '0.9rem' }}>
                                        <i className="bi bi-table me-1"></i>Colonna di riferimento:
                                    </span>
                                    <select
                                        className="form-select form-select-sm border-primary"
                                        style={{ minWidth: '180px', backgroundColor: 'white' }}
                                        value={csvMappingCol || ''}
                                        onChange={handleCsvColumnChange}
                                        disabled={csvColumns.length === 0}
                                    >
                                        <option value="">-- Seleziona colonna --</option>
                                        {csvColumns.map(col => (
                                            <option key={col} value={col}>{col}</option>
                                        ))}
                                    </select>
                                </div>

                                {csvMappingCol && csvColumns.length > 0 && (
                                    <div className="d-flex gap-3">
                                        <span className="badge bg-light text-dark px-3 py-2">
                                            <span className="text-muted me-1">Min:</span>
                                            <strong>{csvMin.toFixed(2)}</strong>
                                        </span>
                                        <span className="badge bg-light text-dark px-3 py-2">
                                            <span className="text-muted me-1">Max:</span>
                                            <strong>{csvMax.toFixed(2)}</strong>
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="card h-100" style={{ flex: '1 1 auto', overflow: 'hidden' }}>
                        <div className="card-header bg-success text-white py-2 d-flex align-items-center justify-content-between">
                            <strong>🎭 Maschere ({samMasks.length})</strong>
                        </div>
                        <div className="card-body d-flex flex-column p-3" style={{ overflow: 'hidden' }}>
                            {/* Controls toolbar */}
                            <div className="d-flex gap-2 mb-3 flex-wrap align-items-center"
                                style={{
                                    padding: '10px',
                                    backgroundColor: '#f0f0f0',
                                    borderRadius: '8px',
                                    flexShrink: 0
                                }}
                            >
                                <button className="btn btn-outline-primary btn-sm" onClick={selectAllMasks}>
                                    Seleziona Tutte
                                </button>
                                <button className="btn btn-outline-secondary btn-sm" onClick={deselectAllMasks}>
                                    Deseleziona Tutte
                                </button>

                                <div className="vr mx-1"></div>

                                <button
                                    className={`btn btn-sm ${isLassoMode ? 'btn-danger' : 'btn-outline-primary'}`}
                                    onClick={() => {
                                        setIsLassoMode(!isLassoMode);
                                        if (isLassoMode && isDrawingLasso) {
                                            setIsDrawingLasso(false);
                                            setLassoPoints([]);
                                            const canvas = lassoCanvasRef.current;
                                            if (canvas) {
                                                const ctx = canvas.getContext('2d');
                                                if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
                                            }
                                        }
                                    }}
                                >
                                    {isLassoMode ? '❌ Annulla Lazo' : '✏️ Lazo'}
                                </button>

                                <div className="vr mx-1"></div>

                                <button
                                    className="btn btn-warning btn-sm"
                                    onClick={combineMasks}
                                    disabled={selectedMaskIds.size < 2 || isLoading}
                                >
                                    {isLoading ? (
                                        <span className="spinner-border spinner-border-sm me-1"></span>
                                    ) : null}
                                    🔗 Unisci ({selectedMaskIds.size})
                                </button>

                                <div className="vr mx-1"></div>

                                <button
                                    className="btn btn-outline-warning btn-sm"
                                    onClick={undoLastAction}
                                    disabled={masksHistory.length === 0}
                                >
                                    ↩️ Annulla ({masksHistory.length})
                                </button>
                                <button
                                    className="btn btn-outline-secondary btn-sm"
                                    onClick={resetMasks}
                                    disabled={initialMasks.length === 0 || samMasks === initialMasks}
                                >
                                    🔄 Reset
                                </button>

                                <span className="ms-auto badge bg-primary">
                                    {selectedMaskIds.size} / {samMasks.length}
                                </span>
                            </div>

                            {/* Scrollable mask grid */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                                gap: '8px',
                                overflowY: 'auto',
                                flex: '1 1 auto',
                                height: 0,
                                padding: '8px',
                                backgroundColor: '#f8f9fa',
                                borderRadius: '8px'
                            }}>
                                {samMasks.map((mask) => (
                                    <div
                                        key={mask.mask_id}
                                        onClick={() => toggleMaskSelection(mask.mask_id)}
                                        style={{
                                            padding: '8px',
                                            backgroundColor: selectedMaskIds.has(mask.mask_id) ? '#d4edda' : 'white',
                                            border: selectedMaskIds.has(mask.mask_id)
                                                ? '3px solid #28a745'
                                                : '1px solid #ddd',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '50%',
                                                backgroundColor: `rgb(${mask.color[0]}, ${mask.color[1]}, ${mask.color[2]})`,
                                                flexShrink: 0
                                            }} />
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
                                                    {mask.name || `#${mask.mask_id + 1}`}
                                                </div>
                                                <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                                                    {mask.coverage_percent.toFixed(1)}% · {mask.area.toLocaleString()} px
                                                </small>
                                            </div>
                                        </div>
                                        <img
                                            src={`data:image/png;base64,${mask.mask_base64}`}
                                            alt={`Mask ${mask.mask_id}`}
                                            style={{
                                                width: '100%',
                                                height: '50px',
                                                objectFit: 'contain',
                                                marginTop: '6px',
                                                borderRadius: '4px',
                                                backgroundColor: '#eee'
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}