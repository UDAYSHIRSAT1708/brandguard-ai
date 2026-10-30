/**
 * Visual Asset & Color Palette Extractor for Brand Style Guides.
 * Analyzes dominant brand colors, hex codes, typography rules, and OCR slogans.
 */

export interface ColorSwatch {
  hex: string;
  name: string;
  percentage?: number;
}

export interface VisualExtractionResult {
  ocrText: string;
  ocrConfidence: number;
  palette: ColorSwatch[];
  formattedContent: string;
}

// Named reference colors for brand palette matching
const KNOWN_COLORS: Array<{ hex: string; name: string; r: number; g: number; b: number }> = [
  { hex: '#000000', name: 'Black', r: 0, g: 0, b: 0 },
  { hex: '#FFFFFF', name: 'White', r: 255, g: 255, b: 255 },
  { hex: '#0F52BA', name: 'Sapphire Blue', r: 15, g: 82, b: 186 },
  { hex: '#1E3A8A', name: 'Navy Blue', r: 30, g: 58, b: 138 },
  { hex: '#2563EB', name: 'Royal Blue', r: 37, g: 99, b: 235 },
  { hex: '#059669', name: 'Emerald Green', r: 5, g: 150, b: 105 },
  { hex: '#10B981', name: 'Forest Green', r: 16, g: 185, b: 129 },
  { hex: '#DC2626', name: 'Crimson Red', r: 220, g: 38, b: 38 },
  { hex: '#EF4444', name: 'Scarlet Red', r: 239, g: 68, b: 68 },
  { hex: '#F59E0B', name: 'Amber Gold', r: 245, g: 158, b: 11 },
  { hex: '#FFD700', name: 'Golden Yellow', r: 255, g: 215, b: 0 },
  { hex: '#7C3AED', name: 'Violet Purple', r: 124, g: 58, b: 237 },
  { hex: '#4B5563', name: 'Slate Gray', r: 75, g: 85, b: 99 },
  { hex: '#9CA3AF', name: 'Neutral Gray', r: 156, g: 163, b: 175 },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function findClosestColorName(hex: string): string {
  try {
    const { r, g, b } = hexToRgb(hex);
    let minDistance = Infinity;
    let closestName = 'Custom Color';

    for (const c of KNOWN_COLORS) {
      // Euclidean distance in RGB space
      const dist = Math.sqrt(
        Math.pow(r - c.r, 2) + Math.pow(g - c.g, 2) + Math.pow(b - c.b, 2)
      );
      if (dist < minDistance) {
        minDistance = dist;
        closestName = c.name;
      }
    }
    return closestName;
  } catch {
    return 'Custom Color';
  }
}

export function parseVisualAsset(params: {
  imageText?: string;
  colors?: string[];
  typography?: string;
  notes?: string;
}): VisualExtractionResult {
  const ocrText = (params.imageText || '').trim();
  const ocrConfidence = ocrText.length > 0 ? 0.95 : 0.0;

  // Process color swatches
  const palette: ColorSwatch[] = [];
  const inputColors = params.colors || [];

  inputColors.forEach((rawHex) => {
    let cleanHex = rawHex.trim();
    if (!cleanHex.startsWith('#')) cleanHex = `#${cleanHex}`;
    if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(cleanHex)) {
      palette.push({
        hex: cleanHex.toUpperCase(),
        name: findClosestColorName(cleanHex),
      });
    }
  });

  // Construct structured brand guideline document
  const contentParts: string[] = ['[Brand Visual Asset & Style Guide]'];

  if (ocrText) {
    contentParts.push(`OCR Extracted Text & Slogans:\n"${ocrText}"`);
  }

  if (palette.length > 0) {
    const paletteLines = palette.map((p) => `  - ${p.hex}: ${p.name}`).join('\n');
    contentParts.push(`Approved Color Palette:\n${paletteLines}`);
  }

  if (params.typography) {
    contentParts.push(`Typography Specifications:\n${params.typography.trim()}`);
  }

  if (params.notes) {
    contentParts.push(`Usage Guidelines & Placement Rules:\n${params.notes.trim()}`);
  }

  return {
    ocrText,
    ocrConfidence,
    palette,
    formattedContent: contentParts.join('\n\n'),
  };
}
