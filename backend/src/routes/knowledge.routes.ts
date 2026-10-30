import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { KnowledgeService } from '../services/knowledge.service';
import { IngestionService } from '../services/ingestion.service';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

const createSourceSchema = z.object({
  title: z.string().min(2).max(300),
  sourceType: z.enum(['guideline', 'fact', 'claim', 'terminology', 'disclaimer', 'prohibited_phrase', 'campaign']),
  content: z.string().min(3).max(50000),
  productScope: z.string().max(100).optional(),
  campaignScope: z.string().max(100).optional(),
  status: z.enum(['draft', 'pending_review', 'approved']).optional(),
});

const ingestWebsiteSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  productScope: z.string().optional(),
});

const ingestPdfSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  fileName: z.string().optional(),
  productScope: z.string().optional(),
});

const ingestVisualSchema = z.object({
  title: z.string().min(1),
  imageText: z.string().optional(),
  colors: z.array(z.string()).optional(),
  typography: z.string().optional(),
  notes: z.string().optional(),
  fileName: z.string().optional(),
  productScope: z.string().optional(),
});

const ingestRuleSchema = z.object({
  title: z.string().min(1),
  ruleCategory: z.enum(['voice_and_tone', 'prohibited_phrase', 'disclaimer', 'competitor_rule', 'claim_verification']),
  ruleData: z.record(z.string(), z.any()),
  productScope: z.string().optional(),
});

// All routes require authentication
router.use(authenticate);

// 1. Ingest from Website with SSRF Protection
router.post('/ingest/website', authorize(['admin', 'brand_manager', 'editor']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = ingestWebsiteSchema.parse(req.body);
    const result = await IngestionService.ingestWebsite({
      organisationId: req.user!.organisationId,
      userId: req.user!.userId,
      url: validated.url,
      title: validated.title,
      productScope: validated.productScope,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// 2. Ingest Multi-Page PDF with Page Citation Preservation
router.post('/ingest/pdf', authorize(['admin', 'brand_manager', 'editor']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = ingestPdfSchema.parse(req.body);
    const result = await IngestionService.ingestPdf({
      organisationId: req.user!.organisationId,
      userId: req.user!.userId,
      title: validated.title,
      rawPdfContent: validated.content,
      fileName: validated.fileName,
      productScope: validated.productScope,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// 3. Ingest Visual Asset & Style Guide with Palette & OCR Extraction
router.post('/ingest/image', authorize(['admin', 'brand_manager', 'editor']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = ingestVisualSchema.parse(req.body);
    const result = await IngestionService.ingestVisualAsset({
      organisationId: req.user!.organisationId,
      userId: req.user!.userId,
      title: validated.title,
      imageText: validated.imageText,
      colors: validated.colors,
      typography: validated.typography,
      notes: validated.notes,
      fileName: validated.fileName,
      productScope: validated.productScope,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// 4. Ingest Structured Rule (Voice/Tone, Prohibited Phrases, Disclaimers, Competitors, Claims)
router.post('/ingest/rule', authorize(['admin', 'brand_manager', 'editor']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = ingestRuleSchema.parse(req.body);
    const result = await IngestionService.ingestStructuredRule({
      organisationId: req.user!.organisationId,
      userId: req.user!.userId,
      title: validated.title,
      ruleCategory: validated.ruleCategory,
      ruleData: validated.ruleData,
      productScope: validated.productScope,
    });
    res.status(201).json({ success: true, data: { source: result } });
  } catch (err) {
    next(err);
  }
});

// List knowledge sources for tenant
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, sourceType, search } = req.query;
    const sources = await KnowledgeService.getSources({
      organisationId: req.user!.organisationId,
      status: status as any,
      sourceType: sourceType as any,
      search: search as string,
    });
    res.json({ success: true, data: { sources } });
  } catch (err) {
    next(err);
  }
});

// Create knowledge source (Admin or Reviewer can create)
router.post('/', authorize(['admin', 'reviewer']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createSourceSchema.parse(req.body);
    const source = await KnowledgeService.createSource({
      ...validated,
      organisationId: req.user!.organisationId,
      userId: req.user!.userId,
      // Admins can create approved directly; reviewers create pending_review
      status: req.user!.role === 'admin' ? (validated.status || 'approved') : 'pending_review',
    });
    res.status(201).json({ success: true, data: { source } });
  } catch (err) {
    next(err);
  }
});

// Approve knowledge source (Admins only)
router.post('/:id/approve', authorize(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const source = await KnowledgeService.approveSource({
      sourceId: Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
      organisationId: req.user!.organisationId,
      userId: req.user!.userId,
    });
    res.json({ success: true, data: { source } });
  } catch (err) {
    next(err);
  }
});

// Archive knowledge source (Admins only)
router.post('/:id/archive', authorize(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const source = await KnowledgeService.archiveSource({
      sourceId: Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
      organisationId: req.user!.organisationId,
      userId: req.user!.userId,
    });
    res.json({ success: true, data: { source } });
  } catch (err) {
    next(err);
  }
});

export default router;
