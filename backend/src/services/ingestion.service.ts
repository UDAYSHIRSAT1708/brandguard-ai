import axios from 'axios';
import { KnowledgeSource, IKnowledgeSource } from '../models/KnowledgeSource';
import { validateUrlForSSRF } from '../utils/ssrfGuard';
import { extractCleanWebContent, extractSitemapUrls } from '../utils/htmlExtractor';
import { parsePdfContent, PdfExtractionResult } from '../utils/pdfExtractor';
import { parseVisualAsset, VisualExtractionResult } from '../utils/visualExtractor';
import { logAuditEvent } from './audit.service';

export class IngestionService {
  /**
   * Safe web page ingestion with SSRF prevention and re-validation on every HTTP redirect.
   */
  static async ingestWebsite(params: {
    organisationId: string;
    userId: string;
    url: string;
    title?: string;
    productScope?: string;
    maxRedirects?: number;
  }): Promise<{
    source: IKnowledgeSource;
    resolvedIp: string;
    extractedTitle: string;
    wordCount: number;
  }> {
    const rawUrl = params.url.trim();

    // 1. Initial SSRF validation
    const initialCheck = await validateUrlForSSRF(rawUrl);
    if (!initialCheck.safe) {
      const err: any = new Error(`SSRF Security Check Failed: ${initialCheck.reason}`);
      err.statusCode = 400;
      err.code = 'SSRF_BLOCKED';
      throw err;
    }

    let currentUrl = rawUrl;
    let redirectCount = 0;
    const maxRedirects = params.maxRedirects || 5;
    let finalHtml = '';
    let lastResolvedIp = initialCheck.resolvedIp || '';

    // 2. Fetch loop with redirect re-validation
    while (redirectCount <= maxRedirects) {
      const response = await axios.get(currentUrl, {
        timeout: 10000,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: {
          'User-Agent': 'BrandGuard-Knowledge-Ingestion/1.0 (+https://brandguard.ai)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      // Handle HTTP redirects (301, 302, 303, 307, 308)
      if (response.status >= 300 && response.status < 400 && response.headers.location) {
        redirectCount++;
        const targetRedirect = new URL(response.headers.location, currentUrl).href;

        // Strict re-validation on the new redirect target
        const redirectCheck = await validateUrlForSSRF(targetRedirect);
        if (!redirectCheck.safe) {
          const err: any = new Error(
            `SSRF Redirect Blocked: Redirect target '${targetRedirect}' failed security validation: ${redirectCheck.reason}`
          );
          err.statusCode = 400;
          err.code = 'SSRF_REDIRECT_BLOCKED';
          throw err;
        }

        currentUrl = targetRedirect;
        lastResolvedIp = redirectCheck.resolvedIp || '';
        continue;
      }

      finalHtml = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      break;
    }

    // 3. Clean content extraction
    const { title: extractedTitle, text: cleanText } = extractCleanWebContent(finalHtml);
    const finalTitle = params.title || extractedTitle || 'Web Knowledge Source';
    const words = cleanText.split(/\s+/).filter(Boolean);

    // 4. Persist knowledge source
    const source = await KnowledgeSource.create({
      organisationId: params.organisationId,
      uploadedBy: params.userId,
      title: finalTitle,
      sourceType: 'guideline',
      content: cleanText,
      productScope: params.productScope || 'Global',
      status: 'approved',
      version: 1,
      metadata: {
        format: 'website',
        sourceUrl: currentUrl,
        resolvedIp: lastResolvedIp,
        wordCount: words.length,
        extractedAt: new Date(),
      },
    });

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.userId,
      action: 'KNOWLEDGE_SOURCE_INGESTED_WEB',
      resourceType: 'KnowledgeSource',
      resourceId: source._id.toString(),
      details: { url: currentUrl, wordCount: words.length, ip: lastResolvedIp },
    });

    console.log(`[INGEST] Ingested web page '${currentUrl}' (${words.length} words) for org '${params.organisationId}'`);
    return {
      source,
      resolvedIp: lastResolvedIp,
      extractedTitle: finalTitle,
      wordCount: words.length,
    };
  }

  /**
   * Ingests multi-page PDF documents preserving page-number citations.
   */
  static async ingestPdf(params: {
    organisationId: string;
    userId: string;
    title: string;
    rawPdfContent: string;
    fileName?: string;
    productScope?: string;
  }): Promise<{
    source: IKnowledgeSource;
    totalPages: number;
    scannedDetected: boolean;
    warning?: string;
  }> {
    const pdfResult = parsePdfContent(params.rawPdfContent);

    const source = await KnowledgeSource.create({
      organisationId: params.organisationId,
      uploadedBy: params.userId,
      title: params.title.trim(),
      sourceType: 'guideline',
      content: pdfResult.fullText,
      productScope: params.productScope || 'Global',
      status: 'approved',
      version: 1,
      metadata: {
        format: 'pdf',
        fileName: params.fileName || 'brand_guidelines.pdf',
        totalPages: pdfResult.totalPages,
        scannedDetected: pdfResult.scannedDetected,
        pages: pdfResult.pages.map((p) => ({
          pageNumber: p.pageNumber,
          wordCount: p.wordCount,
          hasTables: p.tables.length > 0,
        })),
        extractedAt: new Date(),
      },
    });

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.userId,
      action: 'KNOWLEDGE_SOURCE_INGESTED_PDF',
      resourceType: 'KnowledgeSource',
      resourceId: source._id.toString(),
      details: {
        title: source.title,
        totalPages: pdfResult.totalPages,
        scannedDetected: pdfResult.scannedDetected,
      },
    });

    console.log(`[INGEST] Ingested PDF '${source.title}' (${pdfResult.totalPages} pages) for org '${params.organisationId}'`);
    return {
      source,
      totalPages: pdfResult.totalPages,
      scannedDetected: pdfResult.scannedDetected,
      warning: pdfResult.warning,
    };
  }

  /**
   * Ingests visual assets & brand style guides with OCR and color palette extraction.
   */
  static async ingestVisualAsset(params: {
    organisationId: string;
    userId: string;
    title: string;
    imageText?: string;
    colors?: string[];
    typography?: string;
    notes?: string;
    fileName?: string;
    productScope?: string;
  }): Promise<{
    source: IKnowledgeSource;
    palette: any[];
    ocrText: string;
  }> {
    const visual = parseVisualAsset({
      imageText: params.imageText,
      colors: params.colors,
      typography: params.typography,
      notes: params.notes,
    });

    const source = await KnowledgeSource.create({
      organisationId: params.organisationId,
      uploadedBy: params.userId,
      title: params.title.trim(),
      sourceType: 'guideline',
      content: visual.formattedContent,
      productScope: params.productScope || 'Global',
      status: 'approved',
      version: 1,
      metadata: {
        format: 'image',
        fileName: params.fileName || 'brand_style_asset.png',
        ocrText: visual.ocrText,
        ocrConfidence: visual.ocrConfidence,
        palette: visual.palette,
        extractedAt: new Date(),
      },
    });

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.userId,
      action: 'KNOWLEDGE_SOURCE_INGESTED_IMAGE',
      resourceType: 'KnowledgeSource',
      resourceId: source._id.toString(),
      details: {
        title: source.title,
        paletteCount: visual.palette.length,
        hasOcr: visual.ocrText.length > 0,
      },
    });

    console.log(`[INGEST] Ingested visual asset '${source.title}' (${visual.palette.length} colors) for org '${params.organisationId}'`);
    return {
      source,
      palette: visual.palette,
      ocrText: visual.ocrText,
    };
  }

  /**
   * Ingests structured rules: voice & tone, prohibited words/alternatives, disclaimers, competitor rules.
   */
  static async ingestStructuredRule(params: {
    organisationId: string;
    userId: string;
    title: string;
    ruleCategory: 'voice_and_tone' | 'prohibited_phrase' | 'disclaimer' | 'competitor_rule' | 'claim_verification';
    ruleData: Record<string, any>;
    productScope?: string;
  }): Promise<IKnowledgeSource> {
    let formattedText = '';
    let sourceType: any = 'guideline';

    if (params.ruleCategory === 'voice_and_tone') {
      const toneAttributes = params.ruleData.toneAttributes || ['Formal', 'Empathetic'];
      const avoid = params.ruleData.avoidStyles || ['Passive Voice', 'Superlatives without evidence'];
      formattedText = `[Voice & Tone Rule]\nApproved Tone Attributes: ${toneAttributes.join(', ')}\nRestricted Writing Styles: ${avoid.join(', ')}`;
    } else if (params.ruleCategory === 'prohibited_phrase') {
      sourceType = 'prohibited_phrase';
      const prohibited = params.ruleData.prohibitedPhrases || [];
      const alts = params.ruleData.alternatives || {};
      const lines = prohibited.map(
        (p: string) => `  - Prohibited: "${p}" -> Approved Replacement: "${alts[p] || 'Approved neutral phrasing'}"`
      );
      formattedText = `[Prohibited Words & Mandatory Replacements]\n${lines.join('\n')}`;
    } else if (params.ruleCategory === 'disclaimer') {
      sourceType = 'disclaimer';
      const requiredDisclaimer = params.ruleData.requiredDisclaimer || '';
      const marketScope = params.ruleData.marketScope || 'All Markets';
      formattedText = `[Mandatory Disclaimer - ${marketScope}]\nRequired Text:\n"${requiredDisclaimer}"`;
    } else if (params.ruleCategory === 'competitor_rule') {
      const prohibitedCompetitors = params.ruleData.prohibitedCompetitors || [];
      formattedText = `[Competitor Mention Policy]\nProhibited Direct Mentions: ${prohibitedCompetitors.join(', ')}\nPolicy: Never make disparaging comparative claims. Use objective neutral metrics only.`;
    } else if (params.ruleCategory === 'claim_verification') {
      sourceType = 'claim';
      formattedText = `[Claim Verification Policy]\nRules:\n1. All statistical metrics (e.g. percentages, benchmark improvements) MUST cite a verified data source.\n2. Never promise 100% guarantees or unverified performance claims.`;
    }

    const source = await KnowledgeSource.create({
      organisationId: params.organisationId,
      uploadedBy: params.userId,
      title: params.title.trim(),
      sourceType,
      content: formattedText,
      productScope: params.productScope || 'Global',
      status: 'approved',
      version: 1,
      metadata: {
        format: 'rule',
        ruleCategory: params.ruleCategory,
        ruleData: params.ruleData,
        extractedAt: new Date(),
      },
    });

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.userId,
      action: 'KNOWLEDGE_SOURCE_INGESTED_RULE',
      resourceType: 'KnowledgeSource',
      resourceId: source._id.toString(),
      details: { title: source.title, category: params.ruleCategory },
    });

    return source;
  }
}
