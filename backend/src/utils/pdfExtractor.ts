/**
 * Multi-page PDF text and table extractor with page-number citation preservation.
 * Detects scanned documents lacking extractable text layer.
 */

export interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
  tables: string[];
  wordCount: number;
  isLikelyScanned: boolean;
}

export interface PdfExtractionResult {
  totalPages: number;
  pages: ExtractedPdfPage[];
  fullText: string;
  scannedDetected: boolean;
  warning?: string;
}

export function parsePdfContent(rawInput: string | Buffer): PdfExtractionResult {
  let content = typeof rawInput === 'string' ? rawInput : rawInput.toString('utf-8');

  // If base64 encoded, decode it
  if (/^[A-Za-z0-9+/=\s]{100,}$/.test(content.trim()) && !content.includes('%PDF-')) {
    try {
      content = Buffer.from(content.trim(), 'base64').toString('utf-8');
    } catch {
      // Keep original content if base64 decoding fails
    }
  }

  const pages: ExtractedPdfPage[] = [];

  // Method 1: Check for explicit page separators (e.g. form feed \f, --- Page X ---, or PDF stream markers)
  let rawPages: string[] = [];
  if (content.includes('\f')) {
    rawPages = content.split('\f');
  } else if (/---+\s*Page\s+\d+\s*---+/i.test(content)) {
    rawPages = content.split(/---+\s*Page\s+\d+\s*---+/i).filter((p) => p.trim().length > 0);
  } else if (/\[\[\s*Page\s+\d+\s*\]\]/i.test(content)) {
    rawPages = content.split(/\[\[\s*Page\s+\d+\s*\]\]/i).filter((p) => p.trim().length > 0);
  } else if (content.includes('/Type /Page') || content.includes('/Type/Page')) {
    // PDF object stream parsing
    const streamMatches = content.match(/stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g) || [];
    if (streamMatches.length > 0) {
      rawPages = streamMatches.map((s) => {
        // Extract text inside parentheses in BT ... ET text blocks: (text) Tj or [(text)] TJ
        const textParts: string[] = [];
        const tjMatches = s.match(/\(([^)]*)\)\s*Tj/g) || [];
        for (const m of tjMatches) {
          const val = m.replace(/^[^(]*\(/, '').replace(/\)\s*Tj$/, '');
          textParts.push(val);
        }
        return textParts.length > 0 ? textParts.join(' ') : s.replace(/[^a-zA-Z0-9\s.,;:!?-]/g, ' ');
      });
    }
  }

  // Fallback: If no page delimiters detected, segment into 500-word logical pages
  if (rawPages.length === 0) {
    const words = content.trim().split(/\s+/);
    const pageSize = 450;
    for (let i = 0; i < words.length; i += pageSize) {
      rawPages.push(words.slice(i, i + pageSize).join(' '));
    }
  }

  let scannedPageCount = 0;

  rawPages.forEach((pageContent, idx) => {
    const pageNum = idx + 1;
    const cleanText = pageContent.trim();
    const words = cleanText.split(/\s+/).filter(Boolean);
    const wordCount = cleanText.length === 0 ? 0 : words.length;

    // Detect if page has near-zero extractable text (indicative of scanned raster image)
    const isLikelyScanned = wordCount < 10;
    if (isLikelyScanned) {
      scannedPageCount++;
    }

    // Detect tabular data (lines with tabs or vertical bar dividers)
    const lines = cleanText.split('\n');
    const tableLines = lines.filter((l) => l.includes('\t') || l.includes('|'));
    const tables = tableLines.length >= 2 ? [tableLines.join('\n')] : [];

    pages.push({
      pageNumber: pageNum,
      text: cleanText,
      tables,
      wordCount,
      isLikelyScanned,
    });
  });

  const totalPages = pages.length;
  const scannedDetected = totalPages > 0 && scannedPageCount / totalPages >= 0.5;

  // Build composite formatted text with explicit citation headers
  const fullText = pages
    .map((p) => `[Page ${p.pageNumber}]\n${p.text}`)
    .join('\n\n');

  return {
    totalPages,
    pages,
    fullText,
    scannedDetected,
    warning: scannedDetected
      ? 'Scanned PDF document detected. Text layer is sparse or absent. Please run OCR or upload a text-accessible PDF for full guideline grounding.'
      : undefined,
  };
}
