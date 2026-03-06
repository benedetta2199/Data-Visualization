'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    SCIENTIFIC_PALETTES,
    CustomPalette,
    LOCAL_STORAGE_KEY,
    interpolateColors,
    buildGradientCSS,
    buildGradientFromHex,
    extractDominantColors,
    paletteContainsAnyDominantColor,
    rgbToHsl,
    hslToRgb,
    shiftHSL,
} from '@/app/lib/palettes';

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
    colorization: boolean;        // toggle Colorazione
    paletteName: string;          // selected palette name
    selectedValue: number;        // single value from CSV mapping range

    // Nuovi slider per il blend HSL
    hueBlend: number;             // 0-1: 0 = tonalità originale, 1 = tonalità palette
    satBlend: number;             // 0-1: 0 = saturazione originale, 1 = saturazione palette
    lightBlend: number;           // 0-1: 0 = luminosità originale, 1 = luminosità palette

    // Nuovo slider per sfumatura bordi
    edgeFeather: number;           // 0-1: 0 = nessuna sfumatura, 1 = massima sfumatura
}

export default function MasksEditPage() {
    const router = useRouter();

    // Mask data
    const [masks, setMasks] = useState<SAMMask[]>([]);
    const [editSettings, setEditSettings] = useState<Map<number, MaskEditSettings>>(new Map());

    // Image
    const [imageUrl, setImageUrl] = useState<string>('');
    const [showOverlays, setShowOverlays] = useState(true);
    const [imageLoaded, setImageLoaded] = useState(false);

    // CSV mapping range (global, from sessionStorage)
    const [csvMin, setCsvMin] = useState<number>(0);
    const [csvMax, setCsvMax] = useState<number>(100);
    const [hasCsvData, setHasCsvData] = useState(false);

    // CSV pixel values for each pixel in the image
    const [pixelValues, setPixelValues] = useState<number[] | null>(null);

    // Dominant colors per mask (for palette suggestions)
    const [dominantColorsMap, setDominantColorsMap] = useState<Map<number, [number, number, number][]>>(new Map());

    // Custom palettes from localStorage
    const [customPalettes, setCustomPalettes] = useState<CustomPalette[]>([]);

    // Add-palette modal state
    const [showPaletteModal, setShowPaletteModal] = useState(false);
    const [modalForMaskId, setModalForMaskId] = useState<number | null>(null);
    const [newPalName, setNewPalName] = useState('');
    const [newPalStart, setNewPalStart] = useState('#0000ff');
    const [newPalMid, setNewPalMid] = useState('#ffffff');
    const [newPalEnd, setNewPalEnd] = useState('#ff0000');

    // Per-mask custom dropdown open state
    const [openPaletteDropdown, setOpenPaletteDropdown] = useState<number | null>(null);

    // Stato per la selezione maschera con click
    const [selectionMode, setSelectionMode] = useState<boolean>(false);
    const [selectedMaskId, setSelectedMaskId] = useState<number | null>(null);
    const [isSelecting, setIsSelecting] = useState<boolean>(false);

    // Refs
    const imageRef = useRef<HTMLImageElement | null>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        if (openPaletteDropdown === null) return;
        const handler = () => setOpenPaletteDropdown(null);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [openPaletteDropdown]);

    // Load custom palettes from localStorage
    useEffect(() => {
        try {
            const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (raw) setCustomPalettes(JSON.parse(raw));
        } catch { /* ignore */ }
    }, []);

    // Load data from sessionStorage
    useEffect(() => {
        try {
            const masksJson = sessionStorage.getItem('sam_masks_edit');
            const imgUrl = sessionStorage.getItem('sam_image_url_edit');

            if (!masksJson || !imgUrl) {
                router.push('/generation/masks');
                return;
            }

            // Load CSV pixel values
            const csvValuesStr = sessionStorage.getItem('csv_pixel_values');
            if (csvValuesStr) {
                try {
                    const values = JSON.parse(csvValuesStr);
                    setPixelValues(values);
                    console.log('Caricati valori pixel:', values.length);
                } catch (e) {
                    console.error('Errore nel parsing dei valori pixel:', e);
                }
            }

            // Load CSV mapping range
            let minStr = sessionStorage.getItem('csv_mapping_min');
            let maxStr = sessionStorage.getItem('csv_mapping_max');

            // Fallback: compute from raw CSV data if dedicated keys are missing
            const csvColsJson = sessionStorage.getItem('csv_columns');
            const csvDataJson = sessionStorage.getItem('csv_data');
            const csvMappingCol = sessionStorage.getItem('csv_mapping_col');
            const csvRefCol = sessionStorage.getItem('csv_reference_col');

            let cols: string[] = [];
            let rows: string[][] = [];

            if (csvColsJson && csvDataJson) {
                try {
                    cols = JSON.parse(csvColsJson);
                    rows = JSON.parse(csvDataJson);
                } catch { }
            }

            if ((minStr === null || maxStr === null)) {
                if (cols.length > 0 && rows.length > 0 && csvMappingCol) {
                    try {
                        const colIdx = cols.indexOf(csvMappingCol);
                        if (colIdx >= 0) {
                            const numericValues = rows
                                .map(row => parseFloat((row[colIdx] || '').replace(',', '.')))
                                .filter(v => !isNaN(v));
                            if (numericValues.length > 0) {
                                minStr = String(Math.min(...numericValues));
                                maxStr = String(Math.max(...numericValues));
                                sessionStorage.setItem('csv_mapping_min', minStr);
                                sessionStorage.setItem('csv_mapping_max', maxStr);
                            }
                        }
                    } catch {
                    }
                }
            }

            if (minStr !== null && maxStr !== null) {
                const min = parseFloat(minStr);
                const max = parseFloat(maxStr);
                if (!isNaN(min) && !isNaN(max)) {
                    setCsvMin(min);
                    setCsvMax(max);
                    setHasCsvData(true);
                }
            }

            const loadedMasks: SAMMask[] = JSON.parse(masksJson);
            setMasks(loadedMasks);
            setImageUrl(imgUrl);

            // Initialize edit settings for each mask
            const mn = parseFloat(minStr || '0');
            const mx = parseFloat(maxStr || '100');
            const settings = new Map<number, MaskEditSettings>();
            const midVal = (isNaN(mn) ? 0 : mn) + ((isNaN(mx) ? 100 : mx) - (isNaN(mn) ? 0 : mn)) / 2;

            loadedMasks.forEach(m => {
                let initialValue = midVal;

                // Lookup value from CSV for this specific mask
                if (cols.length > 0 && rows.length > 0 && csvRefCol && csvMappingCol) {
                    const refIdx = cols.indexOf(csvRefCol);
                    const mapIdx = cols.indexOf(csvMappingCol);

                    if (refIdx >= 0 && mapIdx >= 0) {
                        for (const row of rows) {
                            const refVal = row[refIdx] ? row[refIdx].trim() : '';
                            const maskName = m.name || `Maschera #${m.mask_id + 1}`;
                            const idStr = (m.mask_id).toString();
                            const idPlusOneStr = (m.mask_id + 1).toString();

                            if (
                                refVal === maskName ||
                                refVal === idStr ||
                                refVal === idPlusOneStr ||
                                maskName.includes(` ${refVal}`) ||
                                maskName.includes(`#${refVal}`) ||
                                refVal === `Maschera ${idPlusOneStr}` ||
                                refVal === `Maschera #${idPlusOneStr}`
                            ) {
                                const valStr = row[mapIdx];
                                const val = parseFloat((valStr || '').replace(',', '.'));
                                if (!isNaN(val)) {
                                    initialValue = val;
                                }
                                break;
                            }
                        }
                    }
                }

                settings.set(m.mask_id, {
                    name: m.name || `Maschera #${m.mask_id + 1}`,
                    color: [...m.color] as [number, number, number],
                    colorization: false,
                    paletteName: 'Nessuna palette',
                    selectedValue: initialValue,
                    // Nuovi slider con valore iniziale 0.8
                    hueBlend: 0.8,
                    satBlend: 0.8,
                    lightBlend: 0.8,
                    // Nuovo slider sfumatura bordi iniziale 0
                    edgeFeather: 0,
                });
            });
            setEditSettings(settings);
        } catch (error) {
            console.error('Errore nel caricamento:', error);
            router.push('/generation/masks');
        }
    }, [router]);

    // Extract dominant colors for each mask once image is loaded
    const extractAllDominantColors = useCallback(() => {
        const img = imageRef.current;
        if (!img || masks.length === 0 || !imageLoaded) return;

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const dcMap = new Map<number, [number, number, number][]>();

        masks.forEach(mask => {
            const maskImg = new Image();
            maskImg.onload = () => {
                const mc = document.createElement('canvas');
                mc.width = canvas.width;
                mc.height = canvas.height;
                const mctx = mc.getContext('2d');
                if (!mctx) return;
                mctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
                const maskData = mctx.getImageData(0, 0, canvas.width, canvas.height);
                const bitmap = new Uint8Array(canvas.width * canvas.height);
                for (let i = 0; i < maskData.data.length; i += 4) {
                    bitmap[i / 4] = maskData.data[i + 3] > 0 ? 1 : 0;
                }
                const dc = extractDominantColors(imageData, bitmap, 3);
                dcMap.set(mask.mask_id, dc);
                if (dcMap.size === masks.length) {
                    setDominantColorsMap(new Map(dcMap));
                }
            };
            maskImg.src = `data:image/png;base64,${mask.mask_base64}`;
        });
    }, [masks, imageLoaded]);

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
    const updateSetting = (maskId: number, updates: Partial<MaskEditSettings>) => {
        setEditSettings(prev => {
            const newMap = new Map(prev);
            const current = newMap.get(maskId);
            if (current) {
                newMap.set(maskId, { ...current, ...updates });
            }
            return newMap;
        });
    };

    // Build palette options for a given mask
    const getPaletteOptions = (maskId: number) => {
        const dominantColors = dominantColorsMap.get(maskId) || [];
        const matchingScientific = SCIENTIFIC_PALETTES.filter(p =>
            dominantColors.length > 0 && paletteContainsAnyDominantColor(p.colors, dominantColors, 50)
        );
        return { matchingScientific, dominantColors };
    };

    // Get the gradient CSS for a palette name
    const getGradientForPalette = (paletteName: string): string => {
        if (paletteName === 'Nessuna palette') {
            return 'linear-gradient(to right, #cccccc, #999999)';
        }
        const sci = SCIENTIFIC_PALETTES.find(p => p.name === paletteName);
        if (sci) return buildGradientCSS(sci.colors);
        const cust = customPalettes.find(p => p.name === paletteName);
        if (cust) return buildGradientFromHex(cust.colors);
        return 'linear-gradient(to right, #333, #ccc)';
    };

    // Save a new custom palette
    const saveNewPalette = () => {
        if (!newPalName.trim()) return;
        const palette: CustomPalette = {
            id: Date.now().toString(),
            name: newPalName.trim(),
            colors: [newPalStart, newPalMid, newPalEnd],
            createdAt: Date.now()
        };
        const updated = [...customPalettes, palette];
        setCustomPalettes(updated);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

        if (modalForMaskId !== null) {
            updateSetting(modalForMaskId, { paletteName: palette.name });
        }
        setShowPaletteModal(false);
        setNewPalName('');
    };

    // Funzione per caricare l'immagine della maschera
    const loadMaskImage = (base64: string, width: number, height: number): Promise<ImageData | null> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(null);
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                resolve(ctx.getImageData(0, 0, width, height));
            };
            img.onerror = () => resolve(null);
            img.src = `data:image/png;base64,${base64}`;
        });
    };

    // Funzione per calcolare la distanza dal bordo della maschera (all'esterno)
    const calculateEdgeDistance = (
        maskData: ImageData,
        x: number,
        y: number,
        width: number,
        height: number
    ): number => {
        if (x < 0 || x >= width || y < 0 || y >= height) return Infinity;

        // Se il pixel è DENTRO la maschera, la distanza "esterna" è 0
        const idx = y * width + x;
        if ((maskData.data[idx * 4 + 3] || 0) > 0) return 0;

        // Cerca il pixel della maschera più vicino (distanza verso l'interno)
        let minDist = Infinity;
        const searchRadius = 15; // Raggio di sfumatura espanso in fuori

        for (let dy = -searchRadius; dy <= searchRadius; dy++) {
            for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

                const nIdx = ny * width + nx;
                // Se il pixel vicino appartiene alla maschera, calcoliamo la distanza
                if ((maskData.data[nIdx * 4 + 3] || 0) > 0) {
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    minDist = Math.min(minDist, dist);
                }
            }
        }

        return minDist;
    };

    // Funzione per blendare due colori in HSL
    const blendColorsHSL = (
        originalRgb: [number, number, number],
        paletteRgb: [number, number, number],
        hueBlend: number,
        satBlend: number,
        lightBlend: number
    ): [number, number, number] => {
        // Converti entrambi i colori in HSL
        const [h1, s1, l1] = rgbToHsl(originalRgb[0], originalRgb[1], originalRgb[2]);
        const [h2, s2, l2] = rgbToHsl(paletteRgb[0], paletteRgb[1], paletteRgb[2]);

        // Calcola le differenze
        let hDiff = h2 - h1;
        // Gestisci il wrap-around per la tonalità (0-360)
        if (hDiff > 180) hDiff -= 360;
        if (hDiff < -180) hDiff += 360;

        const sDiff = s2 - s1;
        const lDiff = l2 - l1;

        // Applica i blend factor
        const hFinal = (h1 + hDiff * hueBlend + 360) % 360;
        const sFinal = Math.max(0, Math.min(1, s1 + sDiff * satBlend));
        const lFinal = Math.max(0, Math.min(1, l1 + lDiff * lightBlend));

        // Converti di nuovo in RGB
        return hslToRgb(hFinal, sFinal, lFinal);
    };

    // Gestione click sul canvas per selezionare maschera
    const handleCanvasClick = useCallback(async (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!selectionMode || !selectedMaskId || !overlayCanvasRef.current || !imageRef.current) return;

        const canvas = overlayCanvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top) * scaleY);

        if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;

        setIsSelecting(true);

        try {
            const mask = masks.find(m => m.mask_id === selectedMaskId);
            if (!mask) return;

            const maskImageData = await loadMaskImage(mask.mask_base64, canvas.width, canvas.height);
            if (!maskImageData) return;

            const idx = y * canvas.width + x;
            if (maskImageData.data[idx * 4 + 3] > 0) {
                // Trovato pixel nella maschera selezionata
                console.log(`Maschera ${selectedMaskId} selezionata al pixel (${x}, ${y})`);
                // Qui puoi aggiungere feedback visivo se necessario
            }
        } catch (error) {
            console.error('Errore nella selezione:', error);
        } finally {
            setIsSelecting(false);
            setSelectionMode(false);
        }
    }, [selectionMode, selectedMaskId, masks]);

    // Draw mask overlays with current edit settings
    const drawMaskOverlays = useCallback(async () => {
        const resultCanvas = overlayCanvasRef.current;
        const img = imageRef.current;

        if (!resultCanvas || !img || masks.length === 0 || !imageLoaded) return;
        if (img.naturalWidth === 0 || img.naturalHeight === 0) return;

        const resultCtx = resultCanvas.getContext('2d');
        if (!resultCtx) return;

        // Creazione di un offscreen canvas per il double buffering (evita il flickering)
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = img.naturalWidth;
        offscreenCanvas.height = img.naturalHeight;
        const ctx = offscreenCanvas.getContext('2d');
        if (!ctx) return;

        // Step 1: Draw the original image sull'offscreen canvas
        ctx.drawImage(img, 0, 0, offscreenCanvas.width, offscreenCanvas.height);

        if (showOverlays) {
            console.log('Disegno maschere...', masks.length);

            // Step 2: Process each mask
            for (const mask of masks) {
                const settings = editSettings.get(mask.mask_id);
                if (!settings) continue;

                // Se colorizzazione non attiva, salta questa maschera
                if (!settings.colorization) continue;

                // Se la palette è "Nessuna palette", salta questa maschera
                if (settings.paletteName === 'Nessuna palette') continue;

                console.log('Processo maschera', mask.mask_id, 'con palette', settings.paletteName);

                try {
                    // Carica l'immagine della maschera (usa le dimensioni dell'offscreen)
                    const maskImageData = await loadMaskImage(mask.mask_base64, offscreenCanvas.width, offscreenCanvas.height);

                    if (!maskImageData) continue;

                    // Prepara la LUT (Look-Up Table) per la palette
                    const palDef = SCIENTIFIC_PALETTES.find(p => p.name === settings.paletteName);
                    const custDef = customPalettes.find(p => p.name === settings.paletteName);
                    let lut: [number, number, number][];

                    if (palDef) {
                        lut = interpolateColors(palDef.colors, 256);
                    } else if (custDef) {
                        const rgbColors = custDef.colors.map(c => hexToRgb(c));
                        lut = interpolateColors(rgbColors, 256);
                    } else {
                        // Fallback: usa la palette con i colori della maschera
                        lut = interpolateColors([
                            settings.color,
                            settings.color,
                            settings.color
                        ], 256);
                    }

                    const rangeSpan = csvMax - csvMin || 1;

                    // Ottieni i dati dell'immagine corrente dall'offscreen canvas
                    const currentImageData = ctx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);

                    // Prima passata: Identifica l'area d'azione della colorazione basata sulla maschera 
                    // (inclusi i pixel sfumati all'esterno, se feathering > 0)
                    const actionArea = new Uint8Array(offscreenCanvas.width * offscreenCanvas.height);

                    // Ottieni il bounding box per ottimizzare
                    const [minX, minY, boxW, boxH] = mask.bbox;
                    const bMaxX = minX + boxW;
                    const bMaxY = minY + boxH;

                    const featherPixels = settings.edgeFeather > 0 ? 15 * (settings.edgeFeather + 0.1) : 0;

                    const scanMinY = Math.max(0, minY - featherPixels);
                    const scanMaxY = Math.min(offscreenCanvas.height, bMaxY + featherPixels);
                    const scanMinX = Math.max(0, minX - featherPixels);
                    const scanMaxX = Math.min(offscreenCanvas.width, bMaxX + featherPixels);

                    let pixelsModificati = 0;

                    for (let y = scanMinY; y < scanMaxY; y++) {
                        for (let x = scanMinX; x < scanMaxX; x++) {
                            const pixelIdx = Math.floor(y) * offscreenCanvas.width + Math.floor(x);
                            const i = pixelIdx * 4;

                            const isInsideMask = maskImageData.data[i + 3] > 0;

                            let alpha = 0.0;

                            if (isInsideMask) {
                                // Dentro la maschera è tutto opaco (alpha da colorazione pieno)
                                alpha = 1.0;
                            } else if (settings.edgeFeather > 0) {
                                // Fuori dalla maschera: calcola la sfumatura in base alla distanza
                                const edgeDist = calculateEdgeDistance(maskImageData, x, y, offscreenCanvas.width, offscreenCanvas.height);
                                const maxDist = 15; // Distanza massima della sfumatura

                                if (edgeDist <= maxDist) {
                                    // Calcola feather all'esterno: 1 al bordo, va verso 0 man mano che mi allontano
                                    const featherFactor = 1 - (edgeDist / (maxDist * (settings.edgeFeather + 0.1)));
                                    alpha = Math.max(0, Math.min(1, featherFactor));
                                }
                            }

                            if (alpha > 0) {
                                let pixelValue: number;

                                // Usa il valore associato alla maschera intera
                                pixelValue = settings.selectedValue;

                                // Fallback (vecchia logica per DeepLab)
                                if (pixelValues && pixelValues[pixelIdx] !== undefined) {
                                    pixelValue = pixelValues[pixelIdx];
                                }

                                // Calcola il colore della palette in base al valore del pixel
                                const t = (pixelValue - csvMin) / rangeSpan;
                                const lutIdx = Math.max(0, Math.min(255, Math.round(t * 255)));
                                const paletteColor = lut[lutIdx];

                                // Ottieni il colore originale del pixel
                                const originalColor: [number, number, number] = [
                                    currentImageData.data[i],
                                    currentImageData.data[i + 1],
                                    currentImageData.data[i + 2]
                                ];

                                // Applica il blend HSL con i fattori scelti dall'utente
                                const blendedColor = blendColorsHSL(
                                    originalColor,
                                    paletteColor,
                                    settings.hueBlend,
                                    settings.satBlend,
                                    settings.lightBlend
                                );

                                // Applica il colore con l'alpha calcolato per la maschera (o sfumato in fuori)
                                if (alpha >= 1.0) {
                                    currentImageData.data[i] = blendedColor[0];
                                    currentImageData.data[i + 1] = blendedColor[1];
                                    currentImageData.data[i + 2] = blendedColor[2];
                                } else {
                                    // Sfuma col fondo preesistente (originale dell'immagine)
                                    currentImageData.data[i] = Math.round(originalColor[0] * (1 - alpha) + blendedColor[0] * alpha);
                                    currentImageData.data[i + 1] = Math.round(originalColor[1] * (1 - alpha) + blendedColor[1] * alpha);
                                    currentImageData.data[i + 2] = Math.round(originalColor[2] * (1 - alpha) + blendedColor[2] * alpha);
                                }
                                currentImageData.data[i + 3] = 255; // Opaco finale sull'immagine

                                pixelsModificati++;
                            }
                        }
                    }

                    console.log(`Maschera ${mask.mask_id}: modificati ${pixelsModificati} pixel`);

                    // Disegna l'immagine modificata sull'offscreen canvas
                    ctx.putImageData(currentImageData, 0, 0);

                } catch (error) {
                    console.error('Errore nel processare la maschera', mask.mask_id, error);
                }
            }
        }

        // Finalmente, copia il contenuto dell'offscreen canvas nel canvas visibile
        resultCanvas.width = img.naturalWidth;
        resultCanvas.height = img.naturalHeight;
        resultCtx.drawImage(offscreenCanvas, 0, 0);

    }, [masks, editSettings, customPalettes, csvMin, csvMax, showOverlays, pixelValues, imageLoaded]);

    // Redraw when settings change
    useEffect(() => {
        if (masks.length > 0 && imageLoaded) {
            const timer = setTimeout(() => {
                drawMaskOverlays();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [editSettings, showOverlays, pixelValues, imageLoaded, masks.length, drawMaskOverlays]);

    // Save and go to palette page
    const goToNextStep = () => {
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

        const colorizationSettings: Record<number, {
            colorization: boolean;
            paletteName: string;
            selectedValue: number;
            hueBlend: number;
            satBlend: number;
            lightBlend: number;
            edgeFeather: number;
        }> = {};

        editSettings.forEach((s, id) => {
            colorizationSettings[id] = {
                colorization: s.colorization,
                paletteName: s.paletteName,
                selectedValue: s.selectedValue,
                hueBlend: s.hueBlend,
                satBlend: s.satBlend,
                lightBlend: s.lightBlend,
                edgeFeather: s.edgeFeather,
            };
        });
        sessionStorage.setItem('colorization_settings', JSON.stringify(colorizationSettings));

        sessionStorage.setItem('sam_masks_palette', JSON.stringify(updatedMasks));
        sessionStorage.setItem('sam_image_url_palette', imageUrl);
        router.push('/generation/masks/palette');
    };

    // Go back without saving
    const goBackWithoutSaving = () => {
        router.push('/generation/masks');
    };

    // Attiva modalità selezione per una maschera
    const activateSelectionMode = (maskId: number) => {
        setSelectedMaskId(maskId);
        setSelectionMode(true);
        // Disattiva dopo 5 secondi per evitare che rimanga attiva inavvertitamente
        setTimeout(() => {
            setSelectionMode(false);
            setSelectedMaskId(null);
        }, 5000);
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
                {/* Left column — Image with overlay */}
                <div className="col-5 d-flex flex-column">
                    <div className="card h-100">
                        <div className="card-header bg-dark text-white py-2 d-flex align-items-center justify-content-between">
                            <div>
                                <strong>📷 Anteprima</strong>
                                <small className="ms-2 text-light">Le modifiche si aggiornano in tempo reale</small>
                            </div>
                            <button
                                className={`btn btn-sm ${showOverlays ? 'btn-outline-light' : 'btn-warning'}`}
                                onClick={() => setShowOverlays(!showOverlays)}
                                title={showOverlays ? 'Nascondi maschere' : 'Mostra maschere'}
                            >
                                {showOverlays ? '👁️ Maschere ON' : '👁️‍🗨️ Maschere OFF'}
                            </button>
                        </div>
                        <div
                            className="card-body d-flex align-items-start justify-content-center p-2"
                            style={{ overflow: 'auto', backgroundColor: '#1a1a1a' }}
                        >
                            <div
                                ref={containerRef}
                                style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', maxHeight: '100%' }}
                            >
                                {/* Hidden image source for drawing */}
                                <img
                                    ref={imageRef}
                                    src={imageUrl}
                                    alt="Immagine originale"
                                    style={{ display: 'none' }}
                                    crossOrigin="anonymous"
                                    onLoad={() => {
                                        console.log('Immagine caricata');
                                        setImageLoaded(true);
                                        drawMaskOverlays();
                                        extractAllDominantColors();
                                    }}
                                />
                                {/* Result canvas: image + mask overlays composited */}
                                <canvas
                                    ref={overlayCanvasRef}
                                    onClick={handleCanvasClick}
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: '100%',
                                        display: 'block',
                                        borderRadius: '4px',
                                        boxShadow: '0 0 10px rgba(0,0,0,0.5)',
                                        cursor: selectionMode ? 'crosshair' : 'default',
                                    }}
                                />
                                {selectionMode && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '10px',
                                        left: '10px',
                                        backgroundColor: 'rgba(0,123,255,0.9)',
                                        color: 'white',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        fontSize: '0.8rem',
                                        fontWeight: 'bold',
                                        zIndex: 10,
                                        pointerEvents: 'none'
                                    }}>
                                        ⚡ Clicca sull'immagine per selezionare la maschera
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right column — Mask edit list */}
                <div className="col-7 d-flex flex-column">
                    <div className="card h-100 d-flex flex-column">
                        <div className="card-header bg-primary text-white py-2 flex-shrink-0">
                            <strong>🎨 Proprietà Maschere ({masks.length})</strong>
                        </div>
                        <div className="card-body p-0 flex-grow-1" style={{ overflowY: 'auto', height: 0 }}>
                            {masks.map((mask) => {
                                const settings = editSettings.get(mask.mask_id);
                                if (!settings) return null;

                                const { matchingScientific } = getPaletteOptions(mask.mask_id);

                                return (
                                    <div
                                        key={mask.mask_id}
                                        className="border-bottom p-3"
                                        style={{ backgroundColor: '#fafafa' }}
                                    >
                                        {/* Row 1: preview + name + color + Colorazione toggle + Select button */}
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
                                                    onChange={(e) => updateSetting(mask.mask_id, { name: e.target.value })}
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
                                                    onChange={(e) => updateSetting(mask.mask_id, { color: hexToRgb(e.target.value) })}
                                                    style={{
                                                        width: '40px',
                                                        height: '34px',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        borderRadius: '4px'
                                                    }}
                                                />
                                            </div>

                                            {/* Colorazione toggle */}
                                            <div style={{ flexShrink: 0, textAlign: 'center', minWidth: '110px' }}>
                                                <label className="form-label mb-1 d-block" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                                                    Colorazione
                                                </label>
                                                <div className="form-check form-switch d-flex align-items-center justify-content-center gap-1">
                                                    <input
                                                        className="form-check-input"
                                                        type="checkbox"
                                                        role="switch"
                                                        id={`colorization-${mask.mask_id}`}
                                                        checked={settings.colorization}
                                                        onChange={(e) => {
                                                            updateSetting(mask.mask_id, { colorization: e.target.checked });
                                                            setTimeout(() => drawMaskOverlays(), 10);
                                                        }}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                    <label
                                                        className="form-check-label"
                                                        htmlFor={`colorization-${mask.mask_id}`}
                                                        style={{ fontSize: '0.75rem', cursor: 'pointer' }}
                                                    >
                                                        {settings.colorization ? 'Attiva' : 'Off'}
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Bottone Seleziona - visibile solo se colorizzazione attiva */}
                                            {settings.colorization && (
                                                <div style={{ flexShrink: 0 }}>
                                                    <button
                                                        className={`btn btn-sm ${selectionMode && selectedMaskId === mask.mask_id ? 'btn-success' : 'btn-outline-primary'}`}
                                                        onClick={() => activateSelectionMode(mask.mask_id)}
                                                        disabled={isSelecting}
                                                        title="Clicca per selezionare questa maschera direttamente sull'immagine"
                                                    >
                                                        {selectionMode && selectedMaskId === mask.mask_id ? '⚡ Seleziona...' : '🔍 Seleziona'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Row 2: Colorization options (visible only when toggle is active) */}
                                        {settings.colorization && (
                                            <div className="mt-3 p-3 rounded" style={{ backgroundColor: '#f0f4ff', border: '1px solid #c5d2e8' }}>
                                                <div className="row g-3">
                                                    {/* Palette selector */}
                                                    <div className="col-md-6">
                                                        <label className="form-label mb-1 fw-semibold" style={{ fontSize: '0.8rem' }}>
                                                            🎨 Palette
                                                        </label>
                                                        <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                                                            <button
                                                                type="button"
                                                                className="btn btn-sm btn-outline-secondary w-100 d-flex align-items-center gap-2"
                                                                onClick={() => {
                                                                    setOpenPaletteDropdown(openPaletteDropdown === mask.mask_id ? null : mask.mask_id);
                                                                }}
                                                                style={{ textAlign: 'left', padding: '4px 8px' }}
                                                            >
                                                                <div
                                                                    style={{
                                                                        width: '50px',
                                                                        height: '14px',
                                                                        borderRadius: '3px',
                                                                        background: getGradientForPalette(settings.paletteName),
                                                                        border: '1px solid #ccc',
                                                                        flexShrink: 0,
                                                                    }}
                                                                />
                                                                <span style={{ fontSize: '0.8rem', flex: 1 }}>{settings.paletteName}</span>
                                                                <span style={{ fontSize: '0.6rem' }}>▼</span>
                                                            </button>

                                                            {/* Dropdown menu */}
                                                            {openPaletteDropdown === mask.mask_id && (
                                                                <div
                                                                    style={{
                                                                        position: 'absolute',
                                                                        top: '100%',
                                                                        left: 0,
                                                                        right: 0,
                                                                        zIndex: 1050,
                                                                        backgroundColor: 'white',
                                                                        border: '1px solid #ccc',
                                                                        borderRadius: '6px',
                                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                                                        maxHeight: '280px',
                                                                        overflowY: 'auto',
                                                                        marginTop: '2px',
                                                                    }}
                                                                >
                                                                    {/* Nessuna palette - opzione disabilitata quando il selettore è attivo */}
                                                                    <div
                                                                        className="d-flex align-items-center gap-2 px-2 py-1"
                                                                        style={{
                                                                            cursor: 'default',
                                                                            backgroundColor: settings.paletteName === 'Nessuna palette' ? '#e8f0fe' : undefined,
                                                                            fontSize: '0.8rem',
                                                                            opacity: 0.5
                                                                        }}
                                                                        onClick={() => {
                                                                            // Non fa nulla - opzione disabilitata quando il selettore è attivo
                                                                            setOpenPaletteDropdown(null);
                                                                        }}
                                                                    >
                                                                        <div style={{ width: '50px', height: '12px', borderRadius: '2px', background: getGradientForPalette('Nessuna palette'), border: '1px solid #ddd', flexShrink: 0 }} />
                                                                        <span>Nessuna palette (selettore attivo)</span>
                                                                    </div>

                                                                    {/* Matching palettes */}
                                                                    {matchingScientific.length > 0 && (
                                                                        <>
                                                                            <div className="px-2 py-1" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#666', backgroundColor: '#f5f5f5' }}>🔍 Colori dominanti</div>
                                                                            {matchingScientific.map(p => (
                                                                                <div
                                                                                    key={`match-${p.name}`}
                                                                                    className="d-flex align-items-center gap-2 px-2 py-1"
                                                                                    style={{ cursor: 'pointer', backgroundColor: settings.paletteName === p.name ? '#e8f0fe' : undefined, fontSize: '0.8rem' }}
                                                                                    onClick={() => {
                                                                                        updateSetting(mask.mask_id, { paletteName: p.name });
                                                                                        setOpenPaletteDropdown(null);
                                                                                        setTimeout(() => drawMaskOverlays(), 10);
                                                                                    }}
                                                                                >
                                                                                    <div style={{ width: '50px', height: '12px', borderRadius: '2px', background: buildGradientCSS(p.colors), border: '1px solid #ddd', flexShrink: 0 }} />
                                                                                    <span>⭐ {p.name}</span>
                                                                                </div>
                                                                            ))}
                                                                        </>
                                                                    )}

                                                                    {/* Scientific palettes by category */}
                                                                    {Array.from(new Set(SCIENTIFIC_PALETTES.map(p => p.category))).map(cat => (
                                                                        <div key={cat}>
                                                                            <div className="px-2 py-1" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#666', backgroundColor: '#f5f5f5' }}>{cat}</div>
                                                                            {SCIENTIFIC_PALETTES.filter(p => p.category === cat).map(p => (
                                                                                <div
                                                                                    key={p.name}
                                                                                    className="d-flex align-items-center gap-2 px-2 py-1"
                                                                                    style={{ cursor: 'pointer', backgroundColor: settings.paletteName === p.name ? '#e8f0fe' : undefined, fontSize: '0.8rem' }}
                                                                                    onClick={() => {
                                                                                        updateSetting(mask.mask_id, { paletteName: p.name });
                                                                                        setOpenPaletteDropdown(null);
                                                                                        setTimeout(() => drawMaskOverlays(), 10);
                                                                                    }}
                                                                                >
                                                                                    <div style={{ width: '50px', height: '12px', borderRadius: '2px', background: buildGradientCSS(p.colors), border: '1px solid #ddd', flexShrink: 0 }} />
                                                                                    <span>{p.name}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ))}

                                                                    {/* Custom palettes */}
                                                                    {customPalettes.length > 0 && (
                                                                        <>
                                                                            <div className="px-2 py-1" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#666', backgroundColor: '#f5f5f5' }}>📦 Personalizzate</div>
                                                                            {customPalettes.map(p => (
                                                                                <div
                                                                                    key={p.id}
                                                                                    className="d-flex align-items-center gap-2 px-2 py-1"
                                                                                    style={{ cursor: 'pointer', backgroundColor: settings.paletteName === p.name ? '#e8f0fe' : undefined, fontSize: '0.8rem' }}
                                                                                    onClick={() => {
                                                                                        updateSetting(mask.mask_id, { paletteName: p.name });
                                                                                        setOpenPaletteDropdown(null);
                                                                                        setTimeout(() => drawMaskOverlays(), 10);
                                                                                    }}
                                                                                >
                                                                                    <div style={{ width: '50px', height: '12px', borderRadius: '2px', background: buildGradientFromHex(p.colors), border: '1px solid #ddd', flexShrink: 0 }} />
                                                                                    <span>{p.name}</span>
                                                                                </div>
                                                                            ))}
                                                                        </>
                                                                    )}

                                                                    {/* Add palette option */}
                                                                    <div
                                                                        className="d-flex align-items-center gap-2 px-2 py-1 border-top"
                                                                        style={{ cursor: 'pointer', fontSize: '0.8rem', color: '#0d6efd' }}
                                                                        onClick={() => {
                                                                            setModalForMaskId(mask.mask_id);
                                                                            setShowPaletteModal(true);
                                                                            setOpenPaletteDropdown(null);
                                                                        }}
                                                                    >
                                                                        <span>➕ Aggiungi palette...</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Value slider */}
                                                    <div className="col-md-6">
                                                        <label className="form-label mb-1 fw-semibold" style={{ fontSize: '0.8rem' }}>
                                                            📊 Valore {hasCsvData ? '(con dati CSV)' : '(no CSV)'}
                                                        </label>

                                                        <div style={{ position: 'relative', marginBottom: '6px' }}>
                                                            <div
                                                                className="rounded"
                                                                style={{
                                                                    height: '14px',
                                                                    background: getGradientForPalette(settings.paletteName),
                                                                    border: '1px solid #ccc',
                                                                }}
                                                            />
                                                            <input
                                                                type="range"
                                                                min={csvMin}
                                                                max={csvMax}
                                                                step={(csvMax - csvMin) / 200 || 0.01}
                                                                value={settings.selectedValue}
                                                                onChange={(e) => {
                                                                    updateSetting(mask.mask_id, { selectedValue: parseFloat(e.target.value) });
                                                                    setTimeout(() => drawMaskOverlays(), 10);
                                                                }}
                                                                className="form-range"
                                                                style={{
                                                                    position: 'absolute',
                                                                    top: 0,
                                                                    left: 0,
                                                                    width: '100%',
                                                                    height: '14px',
                                                                    margin: 0,
                                                                    opacity: 0.6,
                                                                    cursor: 'pointer',
                                                                }}
                                                            />
                                                        </div>

                                                        <div className="d-flex align-items-center justify-content-between">
                                                            <span style={{ fontSize: '0.7rem', color: '#888' }}>{csvMin.toFixed(1)}</span>
                                                            <div className="d-flex align-items-center gap-1">
                                                                <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>Valore:</span>
                                                                <input
                                                                    type="number"
                                                                    className="form-control form-control-sm"
                                                                    value={Number(settings.selectedValue.toFixed(2))}
                                                                    min={csvMin}
                                                                    max={csvMax}
                                                                    step={(csvMax - csvMin) / 100 || 0.01}
                                                                    onChange={(e) => {
                                                                        const val = parseFloat(e.target.value);
                                                                        if (!isNaN(val)) {
                                                                            updateSetting(mask.mask_id, { selectedValue: Math.max(csvMin, Math.min(csvMax, val)) });
                                                                            setTimeout(() => drawMaskOverlays(), 10);
                                                                        }
                                                                    }}
                                                                    style={{ width: '80px', fontSize: '0.75rem' }}
                                                                />
                                                            </div>
                                                            <span style={{ fontSize: '0.7rem', color: '#888' }}>{csvMax.toFixed(1)}</span>
                                                        </div>

                                                        {pixelValues && (
                                                            <div className="mt-1 text-success small">
                                                                ✓ Usando {pixelValues.length} valori CSV per pixel
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Nuovi slider HSL */}
                                                <div className="row g-3 mt-2">
                                                    <div className="col-12">
                                                        <label className="form-label fw-semibold" style={{ fontSize: '0.8rem' }}>
                                                            🎚️ Miscelazione HSL
                                                        </label>
                                                    </div>

                                                    <div className="col-md-4">
                                                        <div className="d-flex justify-content-between">
                                                            <label className="form-label small text-muted mb-0">Tonalità</label>
                                                            <span className="small fw-bold">{Math.round(settings.hueBlend * 100)}%</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            className="form-range"
                                                            min="0"
                                                            max="1"
                                                            step="0.01"
                                                            value={settings.hueBlend}
                                                            onChange={(e) => {
                                                                updateSetting(mask.mask_id, { hueBlend: parseFloat(e.target.value) });
                                                                setTimeout(() => drawMaskOverlays(), 10);
                                                            }}
                                                        />
                                                        <div className="d-flex justify-content-between small text-muted">
                                                            <span>Originale</span>
                                                            <span>Palette</span>
                                                        </div>
                                                    </div>

                                                    <div className="col-md-4">
                                                        <div className="d-flex justify-content-between">
                                                            <label className="form-label small text-muted mb-0">Saturazione</label>
                                                            <span className="small fw-bold">{Math.round(settings.satBlend * 100)}%</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            className="form-range"
                                                            min="0"
                                                            max="1"
                                                            step="0.01"
                                                            value={settings.satBlend}
                                                            onChange={(e) => {
                                                                updateSetting(mask.mask_id, { satBlend: parseFloat(e.target.value) });
                                                                setTimeout(() => drawMaskOverlays(), 10);
                                                            }}
                                                        />
                                                        <div className="d-flex justify-content-between small text-muted">
                                                            <span>Originale</span>
                                                            <span>Palette</span>
                                                        </div>
                                                    </div>

                                                    <div className="col-md-4">
                                                        <div className="d-flex justify-content-between">
                                                            <label className="form-label small text-muted mb-0">Luminosità</label>
                                                            <span className="small fw-bold">{Math.round(settings.lightBlend * 100)}%</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            className="form-range"
                                                            min="0"
                                                            max="1"
                                                            step="0.01"
                                                            value={settings.lightBlend}
                                                            onChange={(e) => {
                                                                updateSetting(mask.mask_id, { lightBlend: parseFloat(e.target.value) });
                                                                setTimeout(() => drawMaskOverlays(), 10);
                                                            }}
                                                        />
                                                        <div className="d-flex justify-content-between small text-muted">
                                                            <span>Originale</span>
                                                            <span>Palette</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Nuovo slider Sfuma bordi */}
                                                <div className="row g-3 mt-2">
                                                    <div className="col-12">
                                                        <label className="form-label fw-semibold" style={{ fontSize: '0.8rem' }}>
                                                            🌫️ Sfuma bordi
                                                        </label>
                                                    </div>
                                                    <div className="col-12">
                                                        <div className="d-flex justify-content-between">
                                                            <span className="small text-muted">Nessuna sfumatura</span>
                                                            <span className="small fw-bold">{Math.round(settings.edgeFeather * 100)}%</span>
                                                            <span className="small text-muted">Massima sfumatura</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            className="form-range"
                                                            min="0"
                                                            max="1"
                                                            step="0.01"
                                                            value={settings.edgeFeather}
                                                            onChange={(e) => {
                                                                updateSetting(mask.mask_id, { edgeFeather: parseFloat(e.target.value) });
                                                                setTimeout(() => drawMaskOverlays(), 10);
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Add Palette Modal */}
            {showPaletteModal && (
                <>
                    <div className="modal-backdrop fade show" />
                    <div className="modal d-block fade show" tabIndex={-1}>
                        <div className="modal-dialog modal-dialog-centered">
                            <div className="modal-content">
                                <div className="modal-header">
                                    <h5 className="modal-title">➕ Nuova Palette</h5>
                                    <button type="button" className="btn-close" onClick={() => setShowPaletteModal(false)} />
                                </div>
                                <div className="modal-body">
                                    <div className="mb-3">
                                        <label className="form-label fw-semibold">Nome palette</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={newPalName}
                                            onChange={e => setNewPalName(e.target.value)}
                                            placeholder="Es. La mia palette"
                                        />
                                    </div>
                                    <div className="row g-3 mb-3">
                                        <div className="col-4 text-center">
                                            <label className="form-label small">Inizio</label>
                                            <input type="color" className="form-control form-control-color mx-auto" value={newPalStart} onChange={e => setNewPalStart(e.target.value)} />
                                        </div>
                                        <div className="col-4 text-center">
                                            <label className="form-label small">Centro</label>
                                            <input type="color" className="form-control form-control-color mx-auto" value={newPalMid} onChange={e => setNewPalMid(e.target.value)} />
                                        </div>
                                        <div className="col-4 text-center">
                                            <label className="form-label small">Fine</label>
                                            <input type="color" className="form-control form-control-color mx-auto" value={newPalEnd} onChange={e => setNewPalEnd(e.target.value)} />
                                        </div>
                                    </div>
                                    <div
                                        className="rounded"
                                        style={{
                                            height: '30px',
                                            background: `linear-gradient(to right, ${newPalStart}, ${newPalMid}, ${newPalEnd})`,
                                            border: '1px solid #ccc'
                                        }}
                                    />
                                </div>
                                <div className="modal-footer">
                                    <button className="btn btn-secondary" onClick={() => setShowPaletteModal(false)}>Annulla</button>
                                    <button className="btn btn-primary" onClick={saveNewPalette} disabled={!newPalName.trim()}>
                                        💾 Salva Palette
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            <style jsx>{`
                input[type="range"].form-range {
                    pointer-events: none;
                }
                input[type="range"].form-range::-webkit-slider-thumb {
                    pointer-events: auto;
                    cursor: pointer;
                }
                input[type="range"].form-range::-moz-range-thumb {
                    pointer-events: auto;
                    cursor: pointer;
                }
            `}</style>
        </div>
    );
}