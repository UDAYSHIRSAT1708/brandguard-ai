import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { KnowledgeService } from '../services/knowledge.service';
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

// All routes require authentication
router.use(authenticate);

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
