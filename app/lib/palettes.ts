export interface PaletteDefinition {
    name: string;
    category: string;
    colors: [number, number, number][];
}

export interface CustomPalette {
    id: string;
    name: string;
    colors: string[]; // hex strings
    createdAt: number;
}

export const LOCAL_STORAGE_KEY = 'scientific_custom_palettes';

export const SCIENTIFIC_PALETTES: PaletteDefinition[] = [
    // ── Perceptually uniform (matplotlib) ──
    {
        name: 'viridis',
        category: 'Sequenziale',
        colors: [
            [68, 1, 84], [72, 36, 117], [65, 68, 135], [53, 95, 141],
            [42, 120, 142], [33, 145, 140], [34, 168, 132], [68, 191, 112],
            [122, 209, 81], [189, 223, 38], [253, 231, 37],
        ],
    },
    {
        name: 'magma',
        category: 'Sequenziale',
        colors: [
            [0, 0, 4], [16, 12, 52], [46, 16, 101], [84, 15, 122],
            [122, 24, 124], [158, 44, 111], [193, 69, 90], [222, 104, 66],
            [244, 148, 48], [253, 199, 76], [252, 253, 191],
        ],
    },
    {
        name: 'inferno',
        category: 'Sequenziale',
        colors: [
            [0, 0, 4], [14, 11, 53], [48, 9, 104], [87, 16, 110],
            [122, 26, 105], [157, 40, 89], [191, 58, 63], [221, 84, 34],
            [243, 121, 4], [249, 172, 10], [252, 255, 164],
        ],
    },
    {
        name: 'plasma',
        category: 'Sequenziale',
        colors: [
            [13, 8, 135], [67, 3, 168], [106, 0, 168], [143, 13, 164],
            [176, 42, 143], [202, 70, 120], [224, 100, 97], [241, 130, 76],
            [252, 166, 54], [252, 206, 37], [240, 249, 33],
        ],
    },
    {
        name: 'cividis',
        category: 'Sequenziale',
        colors: [
            [0, 32, 77], [0, 42, 102], [29, 56, 110], [61, 68, 107],
            [85, 82, 105], [107, 97, 104], [130, 113, 100], [155, 131, 87],
            [181, 150, 68], [210, 172, 39], [234, 197, 39],
        ],
    },
    {
        name: 'turbo',
        category: 'Sequenziale',
        colors: [
            [48, 18, 59], [70, 68, 179], [62, 123, 244], [34, 174, 228],
            [29, 214, 177], [83, 239, 112], [161, 249, 56], [219, 237, 21],
            [251, 200, 11], [252, 141, 9], [227, 75, 3], [164, 23, 2],
        ],
    },
    // ── Classic ──
    {
        name: 'jet',
        category: 'Classica',
        colors: [
            [0, 0, 127], [0, 0, 255], [0, 127, 255], [0, 255, 255],
            [127, 255, 127], [255, 255, 0], [255, 127, 0], [255, 0, 0],
            [127, 0, 0],
        ],
    },
    // ── Divergenti ──
    {
        name: 'coolwarm',
        category: 'Divergente',
        colors: [
            [59, 76, 192], [98, 130, 234], [141, 176, 254], [184, 208, 249],
            [221, 221, 221], [245, 196, 173], [244, 154, 123], [222, 96, 77],
            [180, 4, 38],
        ],
    },
    {
        name: 'spectral',
        category: 'Divergente',
        colors: [
            [158, 1, 66], [213, 62, 79], [244, 109, 67], [253, 174, 97],
            [254, 224, 139], [255, 255, 191], [230, 245, 152], [171, 221, 164],
            [102, 194, 165], [50, 136, 189], [94, 79, 162],
        ],
    },
    {
        name: 'RdYlGn',
        category: 'Divergente',
        colors: [
            [165, 0, 38], [215, 48, 39], [244, 109, 67], [253, 174, 97],
            [254, 224, 139], [255, 255, 191], [217, 239, 139], [166, 217, 106],
            [102, 189, 99], [26, 152, 80], [0, 104, 55],
        ],
    },
    {
        name: 'RdYlBu',
        category: 'Divergente',
        colors: [
            [165, 0, 38], [215, 48, 39], [244, 109, 67], [253, 174, 97],
            [254, 224, 144], [255, 255, 191], [224, 243, 248], [171, 217, 233],
            [116, 173, 209], [69, 117, 180], [49, 54, 149],
        ],
    },
    {
        name: 'PuOr',
        category: 'Divergente',
        colors: [
            [127, 59, 8], [179, 88, 6], [224, 130, 20], [253, 184, 99],
            [254, 224, 182], [247, 247, 247], [216, 218, 235], [178, 171, 210],
            [128, 115, 172], [84, 39, 136], [45, 0, 75],
        ],
    },
    // ── Scientifiche (Crameri) ──
    {
        name: 'batlow',
        category: 'Crameri',
        colors: [
            [1, 13, 95], [18, 39, 98], [36, 58, 90], [55, 73, 80],
            [77, 86, 68], [102, 97, 55], [131, 106, 44], [163, 113, 40],
            [196, 121, 50], [225, 139, 80], [244, 168, 127], [250, 205, 176],
            [254, 244, 229],
        ],
    },
    {
        name: 'roma',
        category: 'Crameri',
        colors: [
            [126, 30, 1], [163, 63, 17], [198, 104, 47], [226, 151, 91],
            [244, 199, 145], [254, 243, 207], [203, 237, 232], [144, 213, 218],
            [83, 176, 195], [35, 130, 167], [11, 82, 133],
        ],
    },
    {
        name: 'oslo',
        category: 'Crameri',
        colors: [
            [1, 1, 1], [13, 24, 37], [25, 46, 71], [37, 70, 107],
            [52, 96, 140], [72, 124, 168], [104, 153, 189], [146, 183, 208],
            [192, 212, 228], [230, 237, 243], [255, 255, 255],
        ],
    },
    {
        name: 'hawaii',
        category: 'Crameri',
        colors: [
            [105, 0, 110], [109, 28, 108], [110, 52, 102], [108, 73, 93],
            [103, 93, 81], [98, 113, 65], [90, 134, 47], [80, 157, 30],
            [83, 180, 27], [112, 202, 51], [164, 222, 101], [219, 241, 170],
        ],
    },
    {
        name: 'lajolla',
        category: 'Crameri',
        colors: [
            [255, 255, 204], [252, 233, 166], [248, 202, 118], [244, 168, 73],
            [232, 132, 40], [207, 97, 22], [175, 67, 14], [140, 44, 10],
            [102, 28, 8], [60, 15, 4], [26, 2, 1],
        ],
    },
];

// Helper: Hex string to RGB
export function hexToRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Helper: RGB to HSL
export const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
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
export const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
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

    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
};

// Helper: Shift Hue
export const shiftHue = (r: number, g: number, b: number, degree: number): [number, number, number] => {
    if (degree === 0) return [r, g, b];
    const [h, s, l] = rgbToHsl(r, g, b);
    return hslToRgb(h + degree, s, l);
};

// Helper: Shift Hue, Saturation and Lightness
export const shiftHSL = (
    r: number, g: number, b: number,
    hDeg: number, sDelta: number, lDelta: number
): [number, number, number] => {
    if (hDeg === 0 && sDelta === 0 && lDelta === 0) return [r, g, b];
    const [h, s, l] = rgbToHsl(r, g, b);
    return hslToRgb(
        h + hDeg,
        Math.max(0, Math.min(1, s + sDelta)),
        Math.max(0, Math.min(1, l + lDelta))
    );
};

// Interpolate colors to create a LUT of `steps` size
export function interpolateColors(colors: [number, number, number][], steps: number = 256): [number, number, number][] {
    const lut: [number, number, number][] = [];
    const numStops = colors.length;

    for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1); // 0 to 1
        // Find which two stops we are between
        const scaledT = t * (numStops - 1);
        const index = Math.floor(scaledT);
        const fraction = scaledT - index;

        if (index >= numStops - 1) {
            lut.push(colors[numStops - 1]);
        } else {
            const c1 = colors[index];
            const c2 = colors[index + 1];
            lut.push([
                Math.round(c1[0] + (c2[0] - c1[0]) * fraction),
                Math.round(c1[1] + (c2[1] - c1[1]) * fraction),
                Math.round(c1[2] + (c2[2] - c1[2]) * fraction),
            ]);
        }
    }
    return lut;
}

// Build CSS gradient string
export function buildGradientCSS(colors: [number, number, number][]): string {
    const stops = colors.map((c, i) => {
        const pct = (i / (colors.length - 1)) * 100;
        return `rgb(${c[0]},${c[1]},${c[2]}) ${pct.toFixed(1)}%`;
    });
    return `linear-gradient(to right, ${stops.join(', ')})`;
}

export function buildGradientFromHex(hexColors: string[]): string {
    return buildGradientCSS(hexColors.map(hexToRgb));
}

// ── Dominant color extraction utilities ──

/**
 * Check if an RGB color is "chromatic" (not white, black, gray, or heavily desaturated).
 * Filters colors like #faf5f6, #7d807d, #202021, pure white/black.
 */
export function isChromatic(r: number, g: number, b: number): boolean {
    const [, s, l] = rgbToHsl(r, g, b);
    // Reject if saturation is too low (grays, near-grays)
    if (s < 0.15) return false;
    // Reject if luminosity is too extreme (near-black or near-white)
    if (l < 0.10 || l > 0.90) return false;
    return true;
}

/**
 * Euclidean distance between two RGB colors.
 */
export function colorDistance(
    c1: [number, number, number],
    c2: [number, number, number]
): number {
    const dr = c1[0] - c2[0];
    const dg = c1[1] - c2[1];
    const db = c1[2] - c2[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Extracts the dominant colors from an image based on a mask.
 * 
 * The function analyzes pixels that are marked in the mask and have saturation > 15%,
 * then identifies the most frequent hue bands and calculates the average color for each.
 * 
 * @param imageData - The image data containing RGBA pixel values
 * @param maskBitmap - Uint8Array mask where 1 indicates pixels to consider, 0 to ignore
 * @param count - Number of dominant colors to extract (default: 3)
 * @returns An array of RGB color values [r, g, b] for each dominant color
 */
export function extractDominantColors(
    imageData: ImageData,
    maskBitmap: Uint8Array,
    count: number = 3
): [number, number, number][] {
    const { data, width, height } = imageData;
    const totalPixels = width * height;

    // STEP 1: Collect all chromatic pixels with S > 0.15
    const allHslSamples: [number, number, number][] = []; // [h, s, l]

    for (let i = 0; i < totalPixels; i++) {
        // Skip pixels not in mask
        if (maskBitmap[i] !== 1) continue;

        // Get RGB values
        const idx = i * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Convert to HSL
        const [h, s, l] = rgbToHsl(r, g, b);

        // Filter by saturation > 15% to exclude grayish colors
        if (s > 0.15) {
            allHslSamples.push([h, s, l]);
        }
    }

    // Return empty array if no valid pixels found
    if (allHslSamples.length === 0) return [];

    // STEP 2: If more than 5000 pixels, sample down to ~5000 for performance
    let hslSamples: [number, number, number][] = allHslSamples;

    if (allHslSamples.length > 5000) {
        const step = Math.floor(allHslSamples.length / 5000);
        hslSamples = [];
        for (let i = 0; i < allHslSamples.length; i += step) {
            hslSamples.push(allHslSamples[i]);
            if (hslSamples.length >= 5000) break;
        }
    }

    // ── Step 3: Find the top N hue bands (30° buckets → 12 bands) ──
    const hueBandSize = 30; // degrees
    const hueBands = new Map<number, number>(); // bandIndex → count

    // Count pixels in each hue band
    for (const [h] of hslSamples) {
        const band = Math.floor(h / hueBandSize) % 12;
        hueBands.set(band, (hueBands.get(band) || 0) + 1);
    }

    // Sort hue bands by frequency and take top 'count' bands
    const topHueBands = Array.from(hueBands.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(([band]) => band);

    // ── Step 4: For each top hue band, calculate the average color ──
    const result: [number, number, number][] = [];

    for (const hueBand of topHueBands) {
        // Calculate the range for this hue band
        const bandMin = hueBand * hueBandSize;
        const bandMax = bandMin + hueBandSize;

        // Collect all samples belonging to this hue band
        const bandSamples = hslSamples.filter(([h]) => {
            return h >= bandMin && h < bandMax;
        });

        if (bandSamples.length === 0) continue;

        // Calculate average H, S, L for this band
        let sumH = 0, sumS = 0, sumL = 0;

        for (const [h, s, l] of bandSamples) {
            sumH += h;
            sumS += s;
            sumL += l;
        }

        const avgH = sumH / bandSamples.length;
        const avgS = sumS / bandSamples.length;
        const avgL = sumL / bandSamples.length;

        // Convert average HSL back to RGB and add to result
        result.push(hslToRgb(avgH, avgS, avgL));
    }

    return result;
}

/**
 * Check if a palette contains at least one color that matches any of the dominant colors.
 * For each dominant color, it checks if the palette contains that exact color
 * or a color within a threshold in RGB cube space.
 *
 * @param paletteColors - The raw palette stop colors (RGB tuples)
 * @param dominantColors - Dominant colors extracted from the mask (RGB tuples)
 * @param rgbThreshold - Maximum RGB distance to consider a color "similar" (default: 30)
 * @returns true if the palette contains a match for ANY dominant color, false otherwise
 */
export function paletteContainsAnyDominantColor(
    paletteColors: [number, number, number][],
    dominantColors: [number, number, number][],
    rgbThreshold: number = 30
): boolean {
    if (paletteColors.length === 0 || dominantColors.length === 0) return false;

    // Interpolate palette to 64 evenly-spaced colors for thorough comparison
    const interpolated = interpolateColors(paletteColors, 64);

    // Check EACH dominant color
    for (const dominant of dominantColors) {
        // Check if THIS dominant color is present in the palette
        for (const paletteColor of interpolated) {
            // Calculate RGB Euclidean distance
            const dr = Math.abs(paletteColor[0] - dominant[0]);
            const dg = Math.abs(paletteColor[1] - dominant[1]);
            const db = Math.abs(paletteColor[2] - dominant[2]);

            // If it's exactly the same color or within threshold
            if (dr <= rgbThreshold && dg <= rgbThreshold && db <= rgbThreshold) {
                return true; // Trovata una corrispondenza, restituisci true immediatamente
            }
        }
    }

    // Se nessun colore dominante ha trovato corrispondenza
    return false;
}

/**
 * Finds the position (0.0–1.0) in a LUT that best matches a given RGB color.
 * Uses Euclidean distance in RGB space.
 *
 * @param lut - The look-up table (typically 256 entries)
 * @param targetColor - The RGB color to find
 * @returns Normalized position (0.0–1.0) of the closest match
 */
export function findClosestLUTPosition(
    lut: [number, number, number][],
    targetColor: [number, number, number]
): number {
    if (lut.length === 0) return 0.5;

    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < lut.length; i++) {
        const dr = lut[i][0] - targetColor[0];
        const dg = lut[i][1] - targetColor[1];
        const db = lut[i][2] - targetColor[2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
        }
    }

    return bestIdx / (lut.length - 1);
}