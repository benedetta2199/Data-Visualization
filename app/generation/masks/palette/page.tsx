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
import styles from './page.module.css';

// Tipi SAM
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

// Sistema di tolleranza avanzato
interface ToleranceSettings {
    hueTolerance: number;      // 0-30 gradi
    satTolerance: number;      // 0-1 (0-100%)
    lightTolerance: number;    // 0-1 (0-100%)
    featherAmount: number;     // 0-1: 0 = taglio netto, 1 = sfumatura graduale
    usePerceptual: boolean;    // Usa distanza percettiva invece di HSL lineare
    adaptiveWeights: boolean;  // Adatta i pesi automaticamente
}

interface PaletteSetting {
    paletteName: string;
    hueShift: number;           // -180 to 180
    satShift: number;           // -100 to 100
    lightShift: number;         // -100 to 100
    selectiveMode: boolean;
    selectedDominantIdx: number;
    selectiveHue: number;       // 0-360
    selectiveSat: number;       // 0-100
    selectiveLight: number;     // 0-100
    palettePosition: number;    // 0.0-1.0
    paletteHue: number;         // 0-360
    paletteSat: number;         // 0-100
    paletteLight: number;       // 0-100
    paletteOpacity: number;     // 0-100
    selectiveRange: number;     // Legacy, mantenuto per compatibilità
    tolerance: ToleranceSettings; // Nuovo sistema di tolleranza
}

const DEFAULT_TOLERANCE: ToleranceSettings = {
    hueTolerance: 15,
    satTolerance: 0.3,
    lightTolerance: 0.3,
    featherAmount: 0,
    usePerceptual: false,
    adaptiveWeights: false
};

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
    paletteOpacity: 50,
    selectiveRange: 100,
    tolerance: { ...DEFAULT_TOLERANCE }
};

// Worker per elaborazione immagini
const createColorWorker = () => {
    const workerCode = `
        // Calcolo distanza percettiva CIE76 semplificata
        function perceptualDistance(rgb1, rgb2) {
            const [r1, g1, b1] = rgb1.map(v => v / 255);
            const [r2, g2, b2] = rgb2.map(v => v / 255);
            
            // Pesi basati sulla sensibilità umana
            const dr = (r1 - r2) * 0.3;
            const dg = (g1 - g2) * 0.6;
            const db = (b1 - b2) * 0.1;
            
            return Math.sqrt(dr*dr + dg*dg + db*db);
        }
        
        // Calcolo similarità HSL con feathering
        function calculateSimilarity(pixelHsl, targetHsl, tolerance, featherAmount) {
            const [h1, s1, l1] = pixelHsl;
            const [h2, s2, l2] = targetHsl;
            
            // Differenza hue con wrap-around
            let hueDiff = Math.abs(h1 - h2);
            if (hueDiff > 180) hueDiff = 360 - hueDiff;
            hueDiff = hueDiff / 180;
            
            // Differenze saturazione e luminosità
            const satDiff = Math.abs(s1 - s2);
            const lightDiff = Math.abs(l1 - l2);
            
            // Similarità per canale
            const hueSim = Math.max(0, 1 - (hueDiff / (tolerance.hueTolerance / 180)));
            const satSim = Math.max(0, 1 - (satDiff / tolerance.satTolerance));
            const lightSim = Math.max(0, 1 - (lightDiff / tolerance.lightTolerance));
            
            // Similarità complessiva (media geometrica)
            let similarity = Math.pow(hueSim * satSim * lightSim, 1/3);
            
            // Applica feathering se richiesto
            if (featherAmount > 0) {
                similarity = Math.pow(similarity, 1 + featherAmount * 2);
            }
            
            return similarity;
        }
        
        // Helper rgbToHsl
        function rgbToHsl(r, g, b) {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            let h, s, l = (max + min) / 2;
            
            if (max === min) {
                h = s = 0;
            } else {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    case b: h = (r - g) / d + 4; break;
                }
                h /= 6;
            }
            return [h * 360, s, l];
        }
        
        // Elaborazione maschera
        self.onmessage = function(e) {
            const { 
                imageData, 
                targetColor, 
                tolerance, 
                featherAmount, 
                usePerceptual,
                maskBitmap,
                maskId 
            } = e.data;
            
            const width = imageData.width;
            const height = imageData.height;
            const pixels = new Uint8ClampedArray(imageData.data);
            const result = new Uint8Array(width * height);
            
            const targetRgb = targetColor;
            const targetHsl = rgbToHsl(targetRgb[0], targetRgb[1], targetRgb[2]);
            
            for (let i = 0; i < maskBitmap.length; i++) {
                if (maskBitmap[i] === 0) continue;
                
                const idx = i * 4;
                const pixelRgb = [pixels[idx], pixels[idx+1], pixels[idx+2]];
                
                let similarity;
                if (usePerceptual) {
                    const distance = perceptualDistance(pixelRgb, targetRgb);
                    similarity = Math.max(0, 1 - distance);
                } else {
                    const pixelHsl = rgbToHsl(pixelRgb[0], pixelRgb[1], pixelRgb[2]);
                    similarity = calculateSimilarity(pixelHsl, targetHsl, tolerance, featherAmount);
                }
                
                result[i] = Math.round(similarity * 255);
            }
            
            self.postMessage({ maskId, result: result.buffer }, [result.buffer]);
        };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
};

// Componente per preview tolleranza
const TolerancePreview = ({
    maskId,
    tolerance,
    targetColor,
    imageUrl,
    maskBase64,
    compact = false
}: {
    maskId: number;
    tolerance: ToleranceSettings;
    targetColor: [number, number, number];
    imageUrl: string;
    maskBase64: string;
    compact?: boolean;
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            canvas.width = compact ? 60 : img.width;
            canvas.height = compact ? 120 : img.height;

            // Disegna immagine ridimensionata se in modalità compatta
            if (compact) {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            } else {
                ctx.drawImage(img, 0, 0);
            }

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            // Carica maschera
            const maskImg = new Image();
            maskImg.crossOrigin = 'anonymous';
            maskImg.onload = () => {
                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = canvas.width;
                maskCanvas.height = canvas.height;
                const maskCtx = maskCanvas.getContext('2d')!;
                if (compact) {
                    maskCtx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
                } else {
                    maskCtx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
                }
                const maskData = maskCtx.getImageData(0, 0, canvas.width, canvas.height);

                const targetHsl = rgbToHsl(targetColor[0], targetColor[1], targetColor[2]);

                // Applica preview
                for (let i = 0; i < maskData.data.length; i += 4) {
                    if (maskData.data[i + 3] === 0) continue;

                    const r = imageData.data[i];
                    const g = imageData.data[i + 1];
                    const b = imageData.data[i + 2];

                    const pixelHsl = rgbToHsl(r, g, b);

                    // Calcola similarità
                    let hueDiff = Math.abs(pixelHsl[0] - targetHsl[0]);
                    if (hueDiff > 180) hueDiff = 360 - hueDiff;
                    hueDiff = hueDiff / 180;

                    const satDiff = Math.abs(pixelHsl[1] - targetHsl[1]);
                    const lightDiff = Math.abs(pixelHsl[2] - targetHsl[2]);

                    const hueSim = Math.max(0, 1 - (hueDiff / (tolerance.hueTolerance / 180)));
                    const satSim = Math.max(0, 1 - (satDiff / tolerance.satTolerance));
                    const lightSim = Math.max(0, 1 - (lightDiff / tolerance.lightTolerance));

                    let similarity = Math.pow(hueSim * satSim * lightSim, 1 / 3);

                    if (tolerance.featherAmount > 0) {
                        similarity = Math.pow(similarity, 1 + tolerance.featherAmount * 2);
                    }

                    // Colora in base alla similarità
                    if (similarity > 0.5) {
                        // Verde per selezionato
                        imageData.data[i] = imageData.data[i] * 0.3 + 100;
                        imageData.data[i + 1] = imageData.data[i + 1] * 0.3 + 200;
                        imageData.data[i + 2] = imageData.data[i + 2] * 0.3 + 100;
                    } else if (similarity > 0.2) {
                        // Giallo per transizione
                        imageData.data[i] = imageData.data[i] * 0.5 + 200;
                        imageData.data[i + 1] = imageData.data[i + 1] * 0.5 + 200;
                        imageData.data[i + 2] = imageData.data[i + 2] * 0.5 + 100;
                    }
                }

                ctx.putImageData(imageData, 0, 0);
            };
            maskImg.src = `data:image/png;base64,${maskBase64}`;
        };
        img.src = imageUrl;
    }, [tolerance, targetColor, imageUrl, maskBase64, compact]);

    if (compact) {
        return (
            <div className="position-relative">
                <canvas
                    ref={canvasRef}
                    className={styles.toleranceCanvasCompact}
                />
            </div>
        );
    }

    return (
        <div className="mt-2 position-relative">
            <canvas
                ref={canvasRef}
                className={styles.toleranceCanvas}
            />
            <div className="d-flex gap-2 mt-1 small">
                <span><span className={styles.legendDotSelected}>●</span> Selezionato</span>
                <span><span className={styles.legendDotTransition}>●</span> Transizione</span>
                <span><span className={styles.legendDotExcluded}>●</span> Escluso</span>
            </div>
        </div>
    );
};

// Componente per ruota di tolleranza interattiva
const ToleranceWheel = ({
    value,
    onChange,
    size = 60
}: {
    value: number;
    onChange: (value: number) => void;
    size?: number;
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Pulisci canvas
        ctx.clearRect(0, 0, size, size);

        // Disegna ruota cromatica
        const center = size / 2;
        const radius = size * 0.4;

        for (let i = 0; i < 360; i++) {
            const angle = (i * Math.PI) / 180;
            const x = center + radius * Math.cos(angle);
            const y = center + radius * Math.sin(angle);

            ctx.beginPath();
            ctx.arc(x, y, size * 0.05, 0, 2 * Math.PI);
            ctx.fillStyle = `hsl(${i}, 100%, 50%)`;
            ctx.fill();
        }

        // Disegna cerchio di riferimento
        ctx.beginPath();
        ctx.arc(center, center, radius * 0.8, 0, 2 * Math.PI);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Disegna arco di tolleranza
        const startAngle = -Math.PI / 2 - (value * Math.PI) / 180;
        const endAngle = -Math.PI / 2 + (value * Math.PI) / 180;

        ctx.beginPath();
        ctx.arc(center, center, radius * 0.9, startAngle, endAngle);
        ctx.strokeStyle = '#0d6efd';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Valore al centro
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(value)}°`, center, center);
    }, [value, size]);

    return (
        <div className="position-relative" style={{ width: size, height: size }}>
            <canvas
                ref={canvasRef}
                width={size}
                height={size}
                className={styles.toleranceWheelCanvas}
            />
            <input
                type="range"
                min="0"
                max="30"
                step="1"
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value))}
                className={`position-absolute w-100 h-100 opacity-0 ${styles.toleranceWheelInput}`}
            />
        </div>
    );
};

// Sistema di apprendimento tolleranza
class ToleranceLearningSystem {
    private corrections: Array<{
        targetColor: [number, number, number];
        tolerance: ToleranceSettings;
        success: boolean;
        timestamp: number;
    }> = [];

    addCorrection(color: [number, number, number], tolerance: ToleranceSettings, success: boolean) {
        this.corrections.push({
            targetColor: color,
            tolerance: { ...tolerance },
            success,
            timestamp: Date.now()
        });

        // Mantieni solo ultime 100 correzioni
        if (this.corrections.length > 100) {
            this.corrections.shift();
        }
    }

    suggestTolerance(targetColor: [number, number, number]): ToleranceSettings | null {
        if (this.corrections.length < 5) return null;

        // Trova casi simili (colori vicini)
        const similarCases = this.corrections.filter(c => {
            const dist = this.colorDistance(c.targetColor, targetColor);
            return dist < 0.2; // Soglia di similarità
        });

        if (similarCases.length === 0) return null;

        // Media pesata dei casi di successo
        const successful = similarCases.filter(c => c.success);
        if (successful.length === 0) return null;

        const avgTolerance: ToleranceSettings = {
            hueTolerance: 0,
            satTolerance: 0,
            lightTolerance: 0,
            featherAmount: 0,
            usePerceptual: false,
            adaptiveWeights: false
        };

        successful.forEach(c => {
            avgTolerance.hueTolerance += c.tolerance.hueTolerance;
            avgTolerance.satTolerance += c.tolerance.satTolerance;
            avgTolerance.lightTolerance += c.tolerance.lightTolerance;
            avgTolerance.featherAmount += c.tolerance.featherAmount;
        });

        const count = successful.length;
        return {
            hueTolerance: avgTolerance.hueTolerance / count,
            satTolerance: avgTolerance.satTolerance / count,
            lightTolerance: avgTolerance.lightTolerance / count,
            featherAmount: avgTolerance.featherAmount / count,
            usePerceptual: false,
            adaptiveWeights: false
        };
    }

    private colorDistance(c1: [number, number, number], c2: [number, number, number]): number {
        const [r1, g1, b1] = c1;
        const [r2, g2, b2] = c2;
        return Math.sqrt(
            Math.pow(r1 - r2, 2) +
            Math.pow(g1 - g2, 2) +
            Math.pow(b1 - b2, 2)
        ) / Math.sqrt(3 * 255 * 255);
    }
}

// Preset di tolleranza
const TOLERANCE_PRESETS = [
    {
        name: "🎯 Esatto",
        tolerance: {
            hueTolerance: 5,
            satTolerance: 0.1,
            lightTolerance: 0.1,
            featherAmount: 0,
            usePerceptual: false,
            adaptiveWeights: false
        }
    },
    {
        name: "🎨 Materiale",
        tolerance: {
            hueTolerance: 15,
            satTolerance: 0.3,
            lightTolerance: 0.3,
            featherAmount: 0.3,
            usePerceptual: true,
            adaptiveWeights: false
        }
    },
    {
        name: "🌈 Ampio",
        tolerance: {
            hueTolerance: 30,
            satTolerance: 0.6,
            lightTolerance: 0.6,
            featherAmount: 0.6,
            usePerceptual: true,
            adaptiveWeights: true
        }
    },
    {
        name: "🔄 Solo hue",
        tolerance: {
            hueTolerance: 20,
            satTolerance: 1.0,
            lightTolerance: 1.0,
            featherAmount: 0,
            usePerceptual: false,
            adaptiveWeights: false
        }
    }
];

// Funzioni di utilità morfologiche
function gaussianBlur3x3(src: Uint8Array, w: number, h: number): Float32Array {
    const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    const kSum = 16;
    const dst = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let sum = 0;
            let ki = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const sx = Math.min(w - 1, Math.max(0, x + kx));
                    const sy = Math.min(h - 1, Math.max(0, y + ky));
                    sum += src[sy * w + sx] * kernel[ki];
                    ki++;
                }
            }
            dst[y * w + x] = sum / kSum;
        }
    }
    return dst;
}

function threshold(src: Float32Array, t: number): Uint8Array {
    const dst = new Uint8Array(src.length);
    for (let i = 0; i < src.length; i++) dst[i] = src[i] >= t ? 1 : 0;
    return dst;
}

function dilate3x3(src: Uint8Array, w: number, h: number): Uint8Array {
    const dst = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let found = false;
            for (let ky = -1; ky <= 1 && !found; ky++) {
                for (let kx = -1; kx <= 1 && !found; kx++) {
                    const sx = x + kx, sy = y + ky;
                    if (sx >= 0 && sx < w && sy >= 0 && sy < h && src[sy * w + sx] === 1) found = true;
                }
            }
            dst[y * w + x] = found ? 1 : 0;
        }
    }
    return dst;
}

function erode3x3(src: Uint8Array, w: number, h: number): Uint8Array {
    const dst = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let all = true;
            for (let ky = -1; ky <= 1 && all; ky++) {
                for (let kx = -1; kx <= 1 && all; kx++) {
                    const sx = x + kx, sy = y + ky;
                    if (sx < 0 || sx >= w || sy < 0 || sy >= h || src[sy * w + sx] === 0) all = false;
                }
            }
            dst[y * w + x] = all ? 1 : 0;
        }
    }
    return dst;
}

function removeSmallRegions(src: Uint8Array, w: number, h: number, minSize: number): Uint8Array {
    const labels = new Int32Array(w * h);
    labels.fill(-1);
    let label = 0;
    const sizes: number[] = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (src[i] === 0 || labels[i] >= 0) continue;
            const queue = [i];
            labels[i] = label;
            let count = 0;
            while (queue.length > 0) {
                const ci = queue.pop()!;
                count++;
                const cx = ci % w, cy = (ci - cx) / w;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                        const ni = ny * w + nx;
                        if (src[ni] === 1 && labels[ni] < 0) {
                            labels[ni] = label;
                            queue.push(ni);
                        }
                    }
                }
            }
            sizes.push(count);
            label++;
        }
    }
    const dst = new Uint8Array(w * h);
    for (let i = 0; i < dst.length; i++) {
        if (labels[i] >= 0 && sizes[labels[i]] >= minSize) dst[i] = 1;
    }
    return dst;
}

function refineBinaryMask(src: Uint8Array, w: number, h: number): Uint8Array {
    const blurred = gaussianBlur3x3(src, w, h);
    let binary = threshold(blurred, 0.45);
    binary = dilate3x3(binary, w, h);
    binary = erode3x3(binary, w, h);
    const minArea = Math.max(4, Math.round(w * h * 0.001));
    binary = removeSmallRegions(binary, w, h, minArea);
    const blurred2 = gaussianBlur3x3(binary, w, h);
    return threshold(blurred2, 0.5);
}

// Componente per la preview dinamica della maschera
const MaskPreview = ({
    mask,
    imageUrl,
    settings,
    dominantColors,
    activeTab
}: {
    mask: SAMMask;
    imageUrl: string;
    settings: PaletteSetting;
    dominantColors: [number, number, number][];
    activeTab: 'mask' | 'selective';
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [imageDimensions, setImageDimensions] = useState({ width: 1, height: 1 });
    const [containerSize, setContainerSize] = useState({ width: 120, height: 60 });

    // Carica l'immagine originale per ottenere le dimensioni reali
    useEffect(() => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            setImageDimensions({
                width: img.width,
                height: img.height
            });
        };
        img.src = imageUrl;
    }, [imageUrl]);

    // Osserva le dimensioni del container
    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setContainerSize({ width, height });
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Disegna la preview
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || imageDimensions.width === 1) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Calcola le dimensioni mantenendo le proporzioni dell'immagine
        const containerAspectRatio = containerSize.width / containerSize.height;
        const imageAspectRatio = imageDimensions.width / imageDimensions.height;

        let drawWidth, drawHeight;

        if (imageAspectRatio > containerAspectRatio) {
            // L'immagine è più larga rispetto al container
            drawWidth = containerSize.width;
            drawHeight = containerSize.width / imageAspectRatio;
        } else {
            // L'immagine è più alta rispetto al container
            drawHeight = containerSize.height;
            drawWidth = containerSize.height * imageAspectRatio;
        }

        // Imposta le dimensioni effettive del canvas (pixel reali)
        canvas.width = Math.round(drawWidth);
        canvas.height = Math.round(drawHeight);

        // Imposta le dimensioni CSS
        canvas.style.width = '100%';
        canvas.style.height = 'auto';

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            // Disegna l'immagine di base
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Carica la maschera
            const maskImg = new Image();
            maskImg.crossOrigin = 'anonymous';
            maskImg.onload = () => {
                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = canvas.width;
                maskCanvas.height = canvas.height;
                const maskCtx = maskCanvas.getContext('2d')!;
                maskCtx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
                const maskData = maskCtx.getImageData(0, 0, canvas.width, canvas.height);

                // Se siamo in modalità selettiva e c'è un colore selezionato
                if (activeTab === 'selective' && settings.selectiveMode && dominantColors.length > settings.selectedDominantIdx) {
                    const targetColor = dominantColors[settings.selectedDominantIdx];
                    const targetHsl = rgbToHsl(targetColor[0], targetColor[1], targetColor[2]);

                    // Ottieni i dati dell'immagine per calcolare i colori
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                    // Crea un nuovo ImageData per l'overlay
                    const overlayData = ctx.createImageData(canvas.width, canvas.height);

                    // Copia l'immagine originale
                    for (let i = 0; i < overlayData.data.length; i++) {
                        overlayData.data[i] = imageData.data[i];
                    }

                    // Applica overlay basato sulla similarità
                    for (let i = 0; i < maskData.data.length; i += 4) {
                        if (maskData.data[i + 3] === 0) continue;

                        const pixelIndex = i / 4;
                        const x = pixelIndex % canvas.width;
                        const y = Math.floor(pixelIndex / canvas.width);

                        const r = imageData.data[i];
                        const g = imageData.data[i + 1];
                        const b = imageData.data[i + 2];

                        const pixelHsl = rgbToHsl(r, g, b);

                        // Calcola similarità
                        let hueDiff = Math.abs(pixelHsl[0] - targetHsl[0]);
                        if (hueDiff > 180) hueDiff = 360 - hueDiff;
                        hueDiff = hueDiff / 180;

                        const satDiff = Math.abs(pixelHsl[1] - targetHsl[1]);
                        const lightDiff = Math.abs(pixelHsl[2] - targetHsl[2]);

                        const hueSim = Math.max(0, 1 - (hueDiff / (settings.tolerance.hueTolerance / 180)));
                        const satSim = Math.max(0, 1 - (satDiff / settings.tolerance.satTolerance));
                        const lightSim = Math.max(0, 1 - (lightDiff / settings.tolerance.lightTolerance));

                        let similarity = Math.pow(hueSim * satSim * lightSim, 1 / 3);

                        if (settings.tolerance.featherAmount > 0) {
                            similarity = Math.pow(similarity, 1 + settings.tolerance.featherAmount * 2);
                        }

                        // Applica overlay colorato in base alla similarità
                        if (similarity > 0.5) {
                            // Area selezionabile (verde con trasparenza)
                            overlayData.data[i] = overlayData.data[i] * 0.3 + 100;
                            overlayData.data[i + 1] = overlayData.data[i + 1] * 0.3 + 200;
                            overlayData.data[i + 2] = overlayData.data[i + 2] * 0.3 + 100;
                        } else if (similarity > 0.2) {
                            // Area di transizione (gialla con trasparenza)
                            overlayData.data[i] = overlayData.data[i] * 0.5 + 200;
                            overlayData.data[i + 1] = overlayData.data[i + 1] * 0.5 + 200;
                            overlayData.data[i + 2] = overlayData.data[i + 2] * 0.5 + 100;
                        }
                    }

                    ctx.putImageData(overlayData, 0, 0);
                } else {
                    // Modalità normale: evidenzia tutta l'area della maschera con overlay colorato
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                    for (let i = 0; i < maskData.data.length; i += 4) {
                        if (maskData.data[i + 3] > 0) {
                            // Applica overlay del colore della maschera
                            imageData.data[i] = imageData.data[i] * 0.5 + mask.color[0] * 0.5;
                            imageData.data[i + 1] = imageData.data[i + 1] * 0.5 + mask.color[1] * 0.5;
                            imageData.data[i + 2] = imageData.data[i + 2] * 0.5 + mask.color[2] * 0.5;
                        }
                    }

                    ctx.putImageData(imageData, 0, 0);
                }
            };
            maskImg.src = `data:image/png;base64,${mask.mask_base64}`;
        };
        img.src = imageUrl;
    }, [mask, imageUrl, settings, dominantColors, activeTab, imageDimensions, containerSize]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100%',
                minHeight: '80px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f0f0f0',
                borderRadius: '4px',
                marginBottom: '8px'
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    border: `2px solid rgb(${mask.color.join(',')})`,
                    borderRadius: '4px',
                    display: 'block'
                }}
            />
        </div>
    );
};

export default function MasksPalettePage() {
    const router = useRouter();
    const learningSystem = useRef(new ToleranceLearningSystem());

    const [masks, setMasks] = useState<SAMMask[]>([]);
    const [imageUrl, setImageUrl] = useState<string>('');
    const [paletteSettings, setPaletteSettings] = useState<Map<number, PaletteSetting>>(new Map());
    const [customPalettes, setCustomPalettes] = useState<CustomPalette[]>([]);
    const [openDropdown, setOpenDropdown] = useState<number | null>(null);
    const [maskDominantColors, setMaskDominantColors] = useState<Map<number, [number, number, number][]>>(new Map());
    const [analyzingColors, setAnalyzingColors] = useState(false);
    const [eyedropperMaskId, setEyedropperMaskId] = useState<number | null>(null);
    const [refiningMaskId, setRefiningMaskId] = useState<number | null>(null);
    const [showToleranceAdvanced, setShowToleranceAdvanced] = useState<number | null>(null);
    const [suggestedTolerance, setSuggestedTolerance] = useState<ToleranceSettings | null>(null);
    const [activeTab, setActiveTab] = useState<{ [key: number]: 'mask' | 'selective' }>({});

    const colorWorker = useRef<Worker | null>(null);

    const previousSettingsRef = useRef<Map<number, PaletteSetting>>(new Map());
    const [refinedSelectiveMaps, setRefinedSelectiveMaps] = useState<Map<number, Uint8Array>>(new Map());

    const imageRef = useRef<HTMLImageElement | null>(null);
    const resultCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const dropdownContainerRef = useRef<HTMLDivElement | null>(null);

    const lutCache = useRef<Map<string, [number, number, number][]>>(new Map());

    // Inizializza worker
    useEffect(() => {
        colorWorker.current = createColorWorker();

        colorWorker.current.onmessage = (e) => {
            const { maskId, result } = e.data;
            const resultArray = new Uint8Array(result);
            setRefinedSelectiveMaps(prev => {
                const n = new Map(prev);
                n.set(maskId, resultArray);
                return n;
            });
        };

        return () => {
            colorWorker.current?.terminate();
        };
    }, []);

    // Chiudi dropdown su click esterno
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownContainerRef.current && !dropdownContainerRef.current.contains(e.target as Node)) {
                setOpenDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Carica dati
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

            const settings = new Map<number, PaletteSetting>();
            loadedMasks.forEach(m => {
                settings.set(m.mask_id, { ...DEFAULT_SETTING });
            });
            setPaletteSettings(settings);

            const customData = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (customData) {
                setCustomPalettes(JSON.parse(customData));
            }
        } catch {
            router.push('/generation/masks/edit');
        }
    }, [router]);

    // Helper: Get LUT
    const getLUT = useCallback((name: string): [number, number, number][] | null => {
        if (name === 'Originale') return null;
        if (lutCache.current.has(name)) return lutCache.current.get(name)!;

        let colors: [number, number, number][] | null = null;

        const scientific = SCIENTIFIC_PALETTES.find(p => p.name === name);
        if (scientific) {
            colors = scientific.colors;
        } else {
            const custom = customPalettes.find(p => p.name === name);
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

    // Analizza colori dominanti
    const analyzeDominantColors = useCallback(async () => {
        const img = imageRef.current;
        if (!img || img.naturalWidth === 0 || masks.length === 0) return;

        setAnalyzingColors(true);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.naturalWidth;
        tempCanvas.height = img.naturalHeight;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) { setAnalyzingColors(false); return; }
        tempCtx.drawImage(img, 0, 0);
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

        const dominantMap = new Map<number, [number, number, number][]>();

        for (const mask of masks) {
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
                const colors = extractDominantColors(imageData, maskBitmap, 5);
                dominantMap.set(mask.mask_id, colors);
            } else {
                dominantMap.set(mask.mask_id, []);
            }
        }

        setMaskDominantColors(dominantMap);
        setAnalyzingColors(false);
    }, [masks]);

    // Calcola similarità colore
    const calculateColorSimilarity = useCallback((
        pixelHsl: [number, number, number],
        targetHsl: [number, number, number],
        tolerance: ToleranceSettings
    ): number => {
        const [h1, s1, l1] = pixelHsl;
        const [h2, s2, l2] = targetHsl;

        let hueDiff = Math.abs(h1 - h2);
        if (hueDiff > 180) hueDiff = 360 - hueDiff;
        hueDiff = hueDiff / 180;

        const satDiff = Math.abs(s1 - s2);
        const lightDiff = Math.abs(l1 - l2);

        const hueSim = Math.max(0, 1 - (hueDiff / (tolerance.hueTolerance / 180)));
        const satSim = Math.max(0, 1 - (satDiff / tolerance.satTolerance));
        const lightSim = Math.max(0, 1 - (lightDiff / tolerance.lightTolerance));

        let similarity = Math.pow(hueSim * satSim * lightSim, 1 / 3);

        if (tolerance.featherAmount > 0) {
            similarity = Math.pow(similarity, 1 + tolerance.featherAmount * 2);
        }

        return similarity;
    }, []);

    // Disegna risultato
    const drawResult = useCallback(async () => {
        const canvas = resultCanvasRef.current;
        const img = imageRef.current;
        if (!canvas || !img) return;
        if (img.naturalWidth === 0 || img.naturalHeight === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Ottieni i dati originali dell'immagine
        const originalData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Crea un buffer per i dati cumulativi
        const cumulativeData = ctx.createImageData(canvas.width, canvas.height);
        cumulativeData.data.set(originalData.data);

        // Ordina le maschere per ID o per un ordine specifico (es. per area)
        const sortedMasks = [...masks].sort((a, b) => {
            // Puoi personalizzare l'ordine qui. Esempio: prima le maschere più piccole
            return a.area - b.area; // o b.area - a.area per ordine inverso
        });

        // Applica le maschere in sequenza
        for (const mask of sortedMasks) {
            const setting = paletteSettings.get(mask.mask_id) || DEFAULT_SETTING;
            const hasPalette = setting.paletteName !== 'Originale';
            const lut = hasPalette ? getLUT(setting.paletteName) : null;
            if (hasPalette && !lut) continue;

            const hasNonSelectiveShift = setting.hueShift !== 0 || setting.satShift !== 0 || setting.lightShift !== 0;
            if (!hasPalette && !hasNonSelectiveShift && !setting.selectiveMode) continue;
            if (hasPalette && setting.paletteOpacity === 0) continue;

            // Carica la maschera binaria
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
            const targetRgb = hasPalette ? hslToRgb(setting.paletteHue, setting.paletteSat / 100, setting.paletteLight / 100) : null;
            const refinedSel = refinedSelectiveMaps.get(mask.mask_id);

            if (setting.selectiveMode && dominant.length > setting.selectedDominantIdx) {
                const dc = dominant[setting.selectedDominantIdx];

                if (hasPalette && targetRgb) {
                    // Selective + Palette
                    for (let i = 0; i < maskBitmap.length; i++) {
                        if (maskBitmap[i] === 1) {
                            const idx = i * 4;
                            // Usa cumulativeData invece di originalData
                            const r = cumulativeData.data[idx];
                            const g = cumulativeData.data[idx + 1];
                            const b = cumulativeData.data[idx + 2];

                            let blendAmount = opacity;

                            if (refinedSel) {
                                blendAmount *= refinedSel[i] / 255;
                            } else {
                                const pixelHsl = rgbToHsl(r, g, b);
                                const [targetH, targetS, targetL] = rgbToHsl(dc[0], dc[1], dc[2]);
                                const similarity = calculateColorSimilarity(
                                    pixelHsl,
                                    [targetH, targetS, targetL],
                                    setting.tolerance
                                );
                                blendAmount *= similarity;
                            }

                            cumulativeData.data[idx] = Math.round(r + (targetRgb[0] - r) * blendAmount);
                            cumulativeData.data[idx + 1] = Math.round(g + (targetRgb[1] - g) * blendAmount);
                            cumulativeData.data[idx + 2] = Math.round(b + (targetRgb[2] - b) * blendAmount);
                        }
                    }
                } else {
                    // Selective + No Palette
                    const [targetH, targetS, targetL] = [setting.selectiveHue, setting.selectiveSat / 100, setting.selectiveLight / 100];
                    const [origH, origS, origL] = rgbToHsl(dc[0], dc[1], dc[2]);
                    const hDelta = targetH - origH;
                    const sDelta = targetS - origS;
                    const lDelta = targetL - origL;

                    for (let i = 0; i < maskBitmap.length; i++) {
                        if (maskBitmap[i] === 1) {
                            const idx = i * 4;
                            // Usa cumulativeData invece di originalData
                            const r = cumulativeData.data[idx];
                            const g = cumulativeData.data[idx + 1];
                            const b = cumulativeData.data[idx + 2];

                            let apply = false;
                            let strength = 1;

                            if (refinedSel) {
                                apply = refinedSel[i] > 0;
                                strength = refinedSel[i] / 255;
                            } else {
                                const pixelHsl = rgbToHsl(r, g, b);
                                const similarity = calculateColorSimilarity(
                                    pixelHsl,
                                    [origH, origS, origL],
                                    setting.tolerance
                                );
                                apply = similarity > 0.1;
                                strength = similarity;
                            }

                            if (apply) {
                                const fc = shiftHSL(r, g, b, hDelta * strength, sDelta * strength, lDelta * strength);
                                cumulativeData.data[idx] = fc[0];
                                cumulativeData.data[idx + 1] = fc[1];
                                cumulativeData.data[idx + 2] = fc[2];
                            }
                        }
                    }
                }
            } else {
                // Non-selective mode
                if (hasPalette && targetRgb) {
                    for (let i = 0; i < maskBitmap.length; i++) {
                        if (maskBitmap[i] === 1) {
                            const idx = i * 4;
                            // Usa cumulativeData invece di originalData
                            const r = cumulativeData.data[idx];
                            const g = cumulativeData.data[idx + 1];
                            const b = cumulativeData.data[idx + 2];

                            cumulativeData.data[idx] = Math.round(r + (targetRgb[0] - r) * opacity);
                            cumulativeData.data[idx + 1] = Math.round(g + (targetRgb[1] - g) * opacity);
                            cumulativeData.data[idx + 2] = Math.round(b + (targetRgb[2] - b) * opacity);
                        }
                    }
                } else {
                    const hDelta = setting.hueShift;
                    const sDelta = setting.satShift / 100;
                    const lDelta = setting.lightShift / 100;

                    if (hDelta !== 0 || sDelta !== 0 || lDelta !== 0) {
                        for (let i = 0; i < maskBitmap.length; i++) {
                            if (maskBitmap[i] === 1) {
                                const idx = i * 4;
                                // Usa cumulativeData invece di originalData
                                const r = cumulativeData.data[idx];
                                const g = cumulativeData.data[idx + 1];
                                const b = cumulativeData.data[idx + 2];

                                const fc = shiftHSL(r, g, b, hDelta, sDelta, lDelta);
                                cumulativeData.data[idx] = fc[0];
                                cumulativeData.data[idx + 1] = fc[1];
                                cumulativeData.data[idx + 2] = fc[2];
                            }
                        }
                    }
                }
            }
        }

        ctx.putImageData(cumulativeData, 0, 0);

    }, [masks, paletteSettings, getLUT, maskDominantColors, refinedSelectiveMaps, calculateColorSimilarity]);

    // Re-draw on changes
    useEffect(() => {
        if (masks.length > 0 && imageRef.current) {
            const t = setTimeout(() => drawResult(), 50);
            return () => clearTimeout(t);
        }
    }, [masks, paletteSettings, drawResult]);

    // Update handlers
    const setPalette = (maskId: number, paletteName: string) => {
        setPaletteSettings(prev => {
            const newMap = new Map(prev);
            const current = newMap.get(maskId) || { ...DEFAULT_SETTING };
            previousSettingsRef.current.set(maskId, { ...current });
            newMap.set(maskId, { ...current, paletteName });
            return newMap;
        });
        setRefinedSelectiveMaps(prev => { const n = new Map(prev); n.delete(maskId); return n; });
        setOpenDropdown(null);
    };

    const updateMaskSetting = (maskId: number, updates: Partial<PaletteSetting>) => {
        setPaletteSettings(prev => {
            const newMap = new Map(prev);
            const current = newMap.get(maskId) || { ...DEFAULT_SETTING };
            previousSettingsRef.current.set(maskId, { ...current });
            newMap.set(maskId, { ...current, ...updates });
            return newMap;
        });
    };

    const undoMaskSetting = (maskId: number) => {
        const prev = previousSettingsRef.current.get(maskId);
        if (!prev) return;
        setPaletteSettings(s => {
            const newMap = new Map(s);
            newMap.set(maskId, { ...prev });
            return newMap;
        });
    };

    // Raffina maschera
    const refineMask = async (maskId: number) => {
        const mask = masks.find(m => m.mask_id === maskId);
        const img = imageRef.current;
        if (!mask || !img || img.naturalWidth === 0) return;
        setRefiningMaskId(maskId);
        try {
            const w = img.naturalWidth, h = img.naturalHeight;
            const alpha = await new Promise<Uint8Array | null>((resolve) => {
                const mi = new Image();
                mi.crossOrigin = 'Anonymous';
                mi.onload = () => {
                    const c = document.createElement('canvas'); c.width = w; c.height = h;
                    const cx = c.getContext('2d'); if (!cx) { resolve(null); return; }
                    cx.drawImage(mi, 0, 0, w, h);
                    const d = cx.getImageData(0, 0, w, h);
                    const a = new Uint8Array(w * h);
                    for (let i = 0; i < d.data.length; i += 4) a[i / 4] = d.data[i + 3] > 0 ? 1 : 0;
                    resolve(a);
                };
                mi.onerror = () => resolve(null);
                mi.src = `data:image/png;base64,${mask.mask_base64}`;
            });
            if (!alpha) { setRefiningMaskId(null); return; }
            const refined = refineBinaryMask(alpha, w, h);
            const outCanvas = document.createElement('canvas'); outCanvas.width = w; outCanvas.height = h;
            const outCtx = outCanvas.getContext('2d')!;
            const outData = outCtx.createImageData(w, h);
            for (let i = 0; i < refined.length; i++) {
                const idx = i * 4;
                if (refined[i] === 1) {
                    outData.data[idx] = mask.color[0];
                    outData.data[idx + 1] = mask.color[1];
                    outData.data[idx + 2] = mask.color[2];
                    outData.data[idx + 3] = 128;
                } else {
                    outData.data[idx + 3] = 0;
                }
            }
            outCtx.putImageData(outData, 0, 0);
            const newBase64 = outCanvas.toDataURL('image/png').replace('data:image/png;base64,', '');
            setMasks(prev => prev.map(m => m.mask_id === maskId ? { ...m, mask_base64: newBase64 } : m));
        } finally {
            setRefiningMaskId(null);
        }
    };

    // Applica preset tolleranza
    const applyTolerancePreset = (maskId: number, preset: typeof TOLERANCE_PRESETS[0]) => {
        updateMaskSetting(maskId, {
            tolerance: { ...preset.tolerance }
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
                                        objectFit: 'contain',
                                        cursor: eyedropperMaskId !== null ? 'crosshair' : 'default'
                                    }}
                                    onClick={(e) => {
                                        if (eyedropperMaskId === null) return;
                                        const canvas = resultCanvasRef.current;
                                        if (!canvas) return;
                                        const rect = canvas.getBoundingClientRect();
                                        const scaleX = canvas.width / rect.width;
                                        const scaleY = canvas.height / rect.height;
                                        const x = Math.round((e.clientX - rect.left) * scaleX);
                                        const y = Math.round((e.clientY - rect.top) * scaleY);
                                        const ctx = canvas.getContext('2d');
                                        if (!ctx) return;
                                        const pixel = ctx.getImageData(x, y, 1, 1).data;
                                        const pickedColor: [number, number, number] = [pixel[0], pixel[1], pixel[2]];
                                        const maskId = eyedropperMaskId;
                                        setEyedropperMaskId(null);

                                        setMaskDominantColors(prev => {
                                            const next = new Map(prev);
                                            const existing = next.get(maskId) || [];
                                            next.set(maskId, [...existing, pickedColor]);
                                            return next;
                                        });

                                        const setting = paletteSettings.get(maskId) || DEFAULT_SETTING;
                                        const currentDom = maskDominantColors.get(maskId) || [];
                                        const newIdx = currentDom.length;

                                        const suggested = learningSystem.current.suggestTolerance(pickedColor);

                                        if (suggested) {
                                            setSuggestedTolerance(suggested);
                                        }

                                        const hasPal = setting.paletteName !== 'Originale';
                                        if (hasPal) {
                                            const palLut = getLUT(setting.paletteName);
                                            if (palLut) {
                                                const pos = findClosestLUTPosition(palLut, pickedColor);
                                                const lutColor = palLut[Math.round(pos * (palLut.length - 1))];
                                                const [h, s, l] = rgbToHsl(lutColor[0], lutColor[1], lutColor[2]);
                                                updateMaskSetting(maskId, {
                                                    selectedDominantIdx: newIdx,
                                                    palettePosition: pos,
                                                    paletteHue: Math.round(h),
                                                    paletteSat: Math.round(s * 100),
                                                    paletteLight: Math.round(l * 100),
                                                    tolerance: suggested || setting.tolerance
                                                });
                                            } else {
                                                updateMaskSetting(maskId, {
                                                    selectedDominantIdx: newIdx,
                                                    tolerance: suggested || setting.tolerance
                                                });
                                            }
                                        } else {
                                            const [dh, ds, dl] = rgbToHsl(pickedColor[0], pickedColor[1], pickedColor[2]);
                                            updateMaskSetting(maskId, {
                                                selectedDominantIdx: newIdx,
                                                selectiveHue: Math.round(dh),
                                                selectiveSat: Math.round(ds * 100),
                                                selectiveLight: Math.round(dl * 100),
                                                tolerance: suggested || setting.tolerance
                                            });
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Controls Column */}
                <div className="col-7 d-flex flex-column">
                    <div className="card h-100 d-flex flex-column">
                        <div className="card-header bg-primary text-white py-2 flex-shrink-0 d-flex justify-content-between align-items-center">
                            <strong>🛠️ Configurazione Maschere ({masks.length})</strong>
                            {suggestedTolerance && (
                                <button
                                    className="btn btn-sm btn-light"
                                    onClick={() => {
                                        if (openDropdown) {
                                            updateMaskSetting(openDropdown, { tolerance: suggestedTolerance });
                                            setSuggestedTolerance(null);
                                        }
                                    }}
                                >
                                    💡 Applica tolleranza suggerita
                                </button>
                            )}
                        </div>

                        <div className="card-body p-0 flex-grow-1" ref={dropdownContainerRef} style={{ overflowY: 'auto', height: 0 }}>
                            {masks.map((mask) => {
                                const setting = paletteSettings.get(mask.mask_id) || { ...DEFAULT_SETTING };
                                const dominant = maskDominantColors.get(mask.mask_id) || [];
                                const currentTab = activeTab[mask.mask_id] || 'mask';
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
                                    <div key={mask.mask_id} className="border-bottom p-3 pb-5">
                                        <div className="row">
                                            {/* Colonna 1: Sempre invariata - Nome, Preview Dinamica, Reset/Annulla affiancati, Affina Maschera */}
                                            <div className="col-3">
                                                <div className="text-center" style={{ height: '200px' }}> {/* Altezza fissa per il container */}
                                                    <div className="fw-bold mb-2">{mask.name}</div>

                                                    {/* Preview dinamica */}
                                                    <MaskPreview
                                                        mask={mask}
                                                        imageUrl={imageUrl}
                                                        settings={setting}
                                                        dominantColors={dominant}
                                                        activeTab={currentTab}
                                                    />

                                                    {/* Reset e Annulla affiancati */}
                                                    <div className="d-flex gap-1 mb-2">
                                                        <button
                                                            className="btn btn-outline-secondary btn-sm flex-grow-1"
                                                            title="Ripristina valori originali"
                                                            onClick={() => {
                                                                updateMaskSetting(mask.mask_id, {
                                                                    hueShift: 0, satShift: 0, lightShift: 0,
                                                                    selectiveMode: false, selectedDominantIdx: 0,
                                                                    selectiveHue: 0, selectiveSat: 50, selectiveLight: 50,
                                                                    palettePosition: 0.5, paletteHue: 0, paletteSat: 0, paletteLight: 50,
                                                                    paletteOpacity: 100, paletteName: 'Originale',
                                                                    tolerance: { ...DEFAULT_TOLERANCE }
                                                                });
                                                                setRefinedSelectiveMaps(prev => { const n = new Map(prev); n.delete(mask.mask_id); return n; });
                                                            }}
                                                        >
                                                            🔄 Reset
                                                        </button>

                                                        <button
                                                            className="btn btn-outline-warning btn-sm flex-grow-1"
                                                            title="Annulla l'ultima modifica"
                                                            disabled={!previousSettingsRef.current.has(mask.mask_id)}
                                                            onClick={() => undoMaskSetting(mask.mask_id)}
                                                        >
                                                            ↩ Annulla
                                                        </button>
                                                    </div>

                                                    {/* Affina Maschera */}
                                                    <button
                                                        className="btn btn-outline-info btn-sm w-100"
                                                        title="Smussa i contorni e uniforma l'area della maschera"
                                                        disabled={refiningMaskId === mask.mask_id}
                                                        onClick={() => refineMask(mask.mask_id)}
                                                    >
                                                        {refiningMaskId === mask.mask_id ? '⏳ ...' : 'Affina Maschera'}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Colonna 2: Navigation Tabs e Contenuto */}
                                            <div className="col-9">
                                                {/* Navigation Tabs per questa maschera */}
                                                <ul className="nav nav-tabs mb-3">
                                                    <li className="nav-item">
                                                        <button
                                                            className={`nav-link ${currentTab === 'mask' ? 'active' : ''}`}
                                                            onClick={() => {
                                                                setActiveTab(prev => ({ ...prev, [mask.mask_id]: 'mask' }));
                                                                // Quando si torna al tab maschera, disattiva la modalità selettiva
                                                                updateMaskSetting(mask.mask_id, { selectiveMode: false });
                                                            }}
                                                        >
                                                            Modifica maschera
                                                        </button>
                                                    </li>
                                                    <li className="nav-item">
                                                        <button
                                                            className={`nav-link ${currentTab === 'selective' ? 'active' : ''}`}
                                                            onClick={() => {
                                                                setActiveTab(prev => ({ ...prev, [mask.mask_id]: 'selective' }));
                                                                // Attiva automaticamente la modalità selettiva quando si clicca sul tab
                                                                updateMaskSetting(mask.mask_id, { selectiveMode: true });
                                                            }}
                                                        >
                                                            Modifica selettiva colori
                                                        </button>
                                                    </li>
                                                </ul>

                                                {/* Contenuto in base al tab attivo */}
                                                {currentTab === 'mask' ? (
                                                    /* Tab Modifica maschera - Selective Mode OFF */
                                                    <>
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

                                                        {/* HSL Controls per Modifica maschera */}
                                                        <div className="mt-2">
                                                            {(() => {
                                                                const hasPalette = setting.paletteName !== 'Originale';

                                                                if (hasPalette) {
                                                                    const paletteGradient = currentPaletteObj?.gradient || '';
                                                                    const posPercent = Math.round(setting.palettePosition * 100);
                                                                    const currentLut = getLUT(setting.paletteName);
                                                                    const badgeInputStyle: React.CSSProperties = {
                                                                        width: '52px', fontSize: '0.75rem', fontWeight: 700,
                                                                        textAlign: 'center' as const, backgroundColor: '#6c757d', color: '#fff',
                                                                        border: 'none', borderRadius: '0.375rem',
                                                                        padding: '0.25em 0.4em', lineHeight: 1, outline: 'none',
                                                                        MozAppearance: 'textfield'
                                                                    };
                                                                    return (
                                                                        <>
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

                                                                const badgeInputStyle: React.CSSProperties = {
                                                                    width: '52px', fontSize: '0.75rem', fontWeight: 700,
                                                                    textAlign: 'center' as const, backgroundColor: '#6c757d', color: '#fff',
                                                                    border: 'none', borderRadius: '0.375rem',
                                                                    padding: '0.25em 0.4em', lineHeight: 1, outline: 'none',
                                                                    MozAppearance: 'textfield'
                                                                };
                                                                const hueGradient = 'linear-gradient(to right, hsl(0,80%,50%), hsl(60,80%,50%), hsl(120,80%,50%), hsl(180,80%,50%), hsl(240,80%,50%), hsl(300,80%,50%), hsl(360,80%,50%))';

                                                                return (
                                                                    <>
                                                                        <div className="mb-1">
                                                                            <div className="d-flex justify-content-between">
                                                                                <label className="form-label small text-muted mb-0">Tonalità</label>
                                                                                <input type="number" style={badgeInputStyle}
                                                                                    min={-180} max={180} value={setting.hueShift}
                                                                                    onChange={(e) => {
                                                                                        const v = Math.max(-180, Math.min(180, parseInt(e.target.value) || 0));
                                                                                        updateMaskSetting(mask.mask_id, { hueShift: v });
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
                                                                                    min="-180" max="180" step="5" value={setting.hueShift}
                                                                                    onChange={(e) => updateMaskSetting(mask.mask_id, { hueShift: parseInt(e.target.value) })}
                                                                                />
                                                                            </div>
                                                                        </div>

                                                                        <div className="mb-1">
                                                                            <div className="d-flex justify-content-between">
                                                                                <label className="form-label small text-muted mb-0">Saturazione</label>
                                                                                <input type="number" style={badgeInputStyle}
                                                                                    min={-100} max={100} value={setting.satShift}
                                                                                    onChange={(e) => {
                                                                                        const v = Math.max(-100, Math.min(100, parseInt(e.target.value) || 0));
                                                                                        updateMaskSetting(mask.mask_id, { satShift: v });
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                            <input type="range" className="form-range"
                                                                                min="-100" max="100" step="5" value={setting.satShift}
                                                                                onChange={(e) => updateMaskSetting(mask.mask_id, { satShift: parseInt(e.target.value) })}
                                                                            />
                                                                        </div>

                                                                        <div className="mb-1">
                                                                            <div className="d-flex justify-content-between">
                                                                                <label className="form-label small text-muted mb-0">Luminosità</label>
                                                                                <input type="number" style={badgeInputStyle}
                                                                                    min={-100} max={100} value={setting.lightShift}
                                                                                    onChange={(e) => {
                                                                                        const v = Math.max(-100, Math.min(100, parseInt(e.target.value) || 0));
                                                                                        updateMaskSetting(mask.mask_id, { lightShift: v });
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                            <input type="range" className="form-range"
                                                                                min="-100" max="100" step="5" value={setting.lightShift}
                                                                                onChange={(e) => updateMaskSetting(mask.mask_id, { lightShift: parseInt(e.target.value) })}
                                                                            />
                                                                        </div>
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    </>
                                                ) : (
                                                    /* Tab Modifica selettiva colori - Selective Mode ON */
                                                    <>
                                                        <div className="row">
                                                            {/* Palette Select */}
                                                            <div className="col-6 mb-2">
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
                                                            {/* Colori selezionati e color picker */}
                                                            {dominant.length > 0 && (
                                                                <div className="col-6 mb-3">
                                                                    <label className="form-label small text-muted mb-1">Colori selezionati</label>
                                                                    <div className="d-flex gap-1 align-items-center flex-wrap">
                                                                        {dominant.map((c, i) => (
                                                                            <div
                                                                                key={i}
                                                                                title={`rgb(${c[0]},${c[1]},${c[2]})`}
                                                                                style={{
                                                                                    width: '24px',
                                                                                    height: '24px',
                                                                                    borderRadius: '4px',
                                                                                    backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})`,
                                                                                    border: setting.selectedDominantIdx === i ? '2px solid #0d6efd' : '1px solid rgba(0,0,0,0.2)',
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
                                                                        ))}

                                                                        {/* Color picker 🎯 affiancato ai colori */}
                                                                        <button
                                                                            className={`btn btn-sm p-0 ${eyedropperMaskId === mask.mask_id ? 'ring-pulse' : ''}`}
                                                                            title="Seleziona colore dall'immagine"
                                                                            style={{
                                                                                width: '24px',
                                                                                height: '24px',
                                                                                borderRadius: '4px',
                                                                                border: eyedropperMaskId === mask.mask_id
                                                                                    ? '2px solid #0d6efd'
                                                                                    : '1px dashed rgba(0,0,0,0.3)',
                                                                                backgroundColor: eyedropperMaskId === mask.mask_id ? '#e7f1ff' : '#f8f9fa'
                                                                            }}
                                                                            onClick={() => setEyedropperMaskId(eyedropperMaskId === mask.mask_id ? null : mask.mask_id)}
                                                                        >
                                                                            🎯
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* HSL Controls per Modifica selettiva colori */}
                                                        <div className="mt-2">
                                                            {(() => {
                                                                const hasPalette = setting.paletteName !== 'Originale';

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

                                                                const hueGradient = 'linear-gradient(to right, hsl(0,80%,50%), hsl(60,80%,50%), hsl(120,80%,50%), hsl(180,80%,50%), hsl(240,80%,50%), hsl(300,80%,50%), hsl(360,80%,50%))';

                                                                return (
                                                                    <>
                                                                        <div className="mb-1">
                                                                            <div className="d-flex justify-content-between">
                                                                                <label className="form-label small text-muted mb-0">Tonalità</label>
                                                                                <input type="number" style={badgeInputStyle}
                                                                                    min={0} max={360} value={setting.selectiveHue}
                                                                                    onChange={(e) => {
                                                                                        const v = Math.max(0, Math.min(360, parseInt(e.target.value) || 0));
                                                                                        updateMaskSetting(mask.mask_id, { selectiveHue: v });
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
                                                                                    min="0" max="360" step="5" value={setting.selectiveHue}
                                                                                    onChange={(e) => updateMaskSetting(mask.mask_id, { selectiveHue: parseInt(e.target.value) })}
                                                                                />
                                                                            </div>
                                                                        </div>

                                                                        <div className="mb-1">
                                                                            <div className="d-flex justify-content-between">
                                                                                <label className="form-label small text-muted mb-0">Saturazione</label>
                                                                                <input type="number" style={badgeInputStyle}
                                                                                    min={0} max={100} value={setting.selectiveSat}
                                                                                    onChange={(e) => {
                                                                                        const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                                                                                        updateMaskSetting(mask.mask_id, { selectiveSat: v });
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                            <input type="range" className="form-range"
                                                                                min="0" max="100" step="5" value={setting.selectiveSat}
                                                                                onChange={(e) => updateMaskSetting(mask.mask_id, { selectiveSat: parseInt(e.target.value) })}
                                                                            />
                                                                        </div>

                                                                        <div className="mb-1">
                                                                            <div className="d-flex justify-content-between">
                                                                                <label className="form-label small text-muted mb-0">Luminosità</label>
                                                                                <input type="number" style={badgeInputStyle}
                                                                                    min={0} max={100} value={setting.selectiveLight}
                                                                                    onChange={(e) => {
                                                                                        const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                                                                                        updateMaskSetting(mask.mask_id, { selectiveLight: v });
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                            <input type="range" className="form-range"
                                                                                min="0" max="100" step="5" value={setting.selectiveLight}
                                                                                onChange={(e) => updateMaskSetting(mask.mask_id, { selectiveLight: parseInt(e.target.value) })}
                                                                            />
                                                                        </div>
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>

                                                        {/* Preset tolleranza */}
                                                        <div className="mb-2">
                                                            <label className="form-label small text-muted mb-1">Preset tolleranza</label>
                                                            <div className="d-flex gap-1 flex-wrap">
                                                                {TOLERANCE_PRESETS.map(preset => (
                                                                    <button
                                                                        key={preset.name}
                                                                        className="btn btn-outline-secondary btn-sm"
                                                                        onClick={() => applyTolerancePreset(mask.mask_id, preset)}
                                                                        style={{ fontSize: '0.7rem' }}
                                                                    >
                                                                        {preset.name}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Tolleranza avanzata */}
                                                        <div className="mb-2">
                                                            <div
                                                                className="d-flex align-items-center justify-content-between p-2 bg-light rounded cursor-pointer"
                                                                onClick={() => setShowToleranceAdvanced(prev => prev === mask.mask_id ? null : mask.mask_id)}
                                                                style={{ cursor: 'pointer' }}
                                                            >
                                                                <span className="fw-bold small">⚙️ Tolleranza avanzata</span>
                                                                <span className="text-muted">
                                                                    {showToleranceAdvanced === mask.mask_id ? '▼' : '▶'}
                                                                </span>
                                                            </div>

                                                            {showToleranceAdvanced === mask.mask_id && (
                                                                <div className="tolerance-controls mt-2 p-3 bg-light rounded">
                                                                    <div className="d-flex align-items-center gap-3 mb-2">
                                                                        <ToleranceWheel
                                                                            value={setting.tolerance.hueTolerance}
                                                                            onChange={(v) => updateMaskSetting(mask.mask_id, {
                                                                                tolerance: { ...setting.tolerance, hueTolerance: v }
                                                                            })}
                                                                        />
                                                                        <div className="flex-grow-1">
                                                                            <label className="form-label small mb-0">Tonalità ({setting.tolerance.hueTolerance}°)</label>
                                                                            <input
                                                                                type="range"
                                                                                className="form-range"
                                                                                min="0"
                                                                                max="30"
                                                                                step="1"
                                                                                value={setting.tolerance.hueTolerance}
                                                                                onChange={(e) => updateMaskSetting(mask.mask_id, {
                                                                                    tolerance: {
                                                                                        ...setting.tolerance,
                                                                                        hueTolerance: parseInt(e.target.value)
                                                                                    }
                                                                                })}
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    <div className="mb-2">
                                                                        <label className="form-label small mb-0">
                                                                            Saturazione ({Math.round(setting.tolerance.satTolerance * 100)}%)
                                                                        </label>
                                                                        <input
                                                                            type="range"
                                                                            className="form-range"
                                                                            min="0"
                                                                            max="100"
                                                                            step="5"
                                                                            value={setting.tolerance.satTolerance * 100}
                                                                            onChange={(e) => updateMaskSetting(mask.mask_id, {
                                                                                tolerance: {
                                                                                    ...setting.tolerance,
                                                                                    satTolerance: parseInt(e.target.value) / 100
                                                                                }
                                                                            })}
                                                                        />
                                                                    </div>

                                                                    <div className="mb-2">
                                                                        <label className="form-label small mb-0">
                                                                            Luminosità ({Math.round(setting.tolerance.lightTolerance * 100)}%)
                                                                        </label>
                                                                        <input
                                                                            type="range"
                                                                            className="form-range"
                                                                            min="0"
                                                                            max="100"
                                                                            step="5"
                                                                            value={setting.tolerance.lightTolerance * 100}
                                                                            onChange={(e) => updateMaskSetting(mask.mask_id, {
                                                                                tolerance: {
                                                                                    ...setting.tolerance,
                                                                                    lightTolerance: parseInt(e.target.value) / 100
                                                                                }
                                                                            })}
                                                                        />
                                                                    </div>

                                                                    <div className="mb-2">
                                                                        <label className="form-label small mb-0">
                                                                            Sfumatura bordo ({Math.round(setting.tolerance.featherAmount * 100)}%)
                                                                        </label>
                                                                        <input
                                                                            type="range"
                                                                            className="form-range"
                                                                            min="0"
                                                                            max="100"
                                                                            step="10"
                                                                            value={setting.tolerance.featherAmount * 100}
                                                                            onChange={(e) => updateMaskSetting(mask.mask_id, {
                                                                                tolerance: {
                                                                                    ...setting.tolerance,
                                                                                    featherAmount: parseInt(e.target.value) / 100
                                                                                }
                                                                            })}
                                                                        />
                                                                    </div>

                                                                    <div className="form-check form-switch mb-2">
                                                                        <input
                                                                            className="form-check-input"
                                                                            type="checkbox"
                                                                            id={`perceptual-${mask.mask_id}`}
                                                                            checked={setting.tolerance.usePerceptual}
                                                                            onChange={(e) => updateMaskSetting(mask.mask_id, {
                                                                                tolerance: {
                                                                                    ...setting.tolerance,
                                                                                    usePerceptual: e.target.checked
                                                                                }
                                                                            })}
                                                                        />
                                                                        <label className="form-check-label small" htmlFor={`perceptual-${mask.mask_id}`}>
                                                                            Usa distanza percettiva (più accurata)
                                                                        </label>
                                                                    </div>

                                                                    <div className="form-check form-switch">
                                                                        <input
                                                                            className="form-check-input"
                                                                            type="checkbox"
                                                                            id={`adaptive-${mask.mask_id}`}
                                                                            checked={setting.tolerance.adaptiveWeights}
                                                                            onChange={(e) => updateMaskSetting(mask.mask_id, {
                                                                                tolerance: {
                                                                                    ...setting.tolerance,
                                                                                    adaptiveWeights: e.target.checked
                                                                                }
                                                                            })}
                                                                        />
                                                                        <label className="form-check-label small" htmlFor={`adaptive-${mask.mask_id}`}>
                                                                            Pesi adattivi (basati sulla distribuzione)
                                                                        </label>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </>
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

            <style jsx>{`
                .ring-pulse {
                    animation: pulse 1.5s infinite;
                }
                @keyframes pulse {
                    0% {
                        box-shadow: 0 0 0 0 rgba(13,110,253,0.7);
                    }
                    70% {
                        box-shadow: 0 0 0 6px rgba(13,110,253,0);
                    }
                    100% {
                        box-shadow: 0 0 0 0 rgba(13,110,253,0);
                    }
                }
            `}</style>
        </div>
    );
}