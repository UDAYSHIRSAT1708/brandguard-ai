import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ContentService } from '../services/content.service';
import { ReviewOrchestratorService } from '../services/review.service';
import { authenticate } from '../middleware/auth';
import { Content } from '../models/Content';
import { logAuditEvent } from '../services/audit.service';

const router = Router();

const createContentSchema = z.object({
  title: z.string().min(2).max(500),
  contentType: z.enum(['website', 'social', 'email', 'press_release', 'advertisement']).default('website'),
  body: z.string().min(1).max(100000),
});

const updateContentSchema = z.object({
  title: z.string().min(2).max(500).optional(),
  contentType: z.enum(['website', 'social', 'email', 'press_release', 'advertisement']).optional(),
  body: z.string().min(1).max(100000),
});

router.use(authenticate);

// List content for current tenant
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contents = await ContentService.listContent({
      organisationId: req.user!.organisationId,
      status: req.query.status as any,
    });
    res.json({ success: true, data: { contents } });
  } catch (err) {
    next(err);
  }
});

// Create new content draft
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createContentSchema.parse(req.body);
    const result = await ContentService.createContent({
      ...validated,
      organisationId: req.user!.organisationId,
      userId: req.user!.userId,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Get content by ID with full version history
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await ContentService.getContentWithVersions({
      contentId,
      organisationId: req.user!.organisationId,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Update / revise content (creates new version, invalidates prior approvals)
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const validated = updateContentSchema.parse(req.body);
    const result = await ContentService.updateContent({
      ...validated,
      contentId,
      organisationId: req.user!.organisationId,
      userId: req.user!.userId,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Submit content for review
router.post('/:id/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const content = await ContentService.submitForReview({
      contentId,
      organisationId: req.user!.organisationId,
      userId: req.user!.userId,
    });
    res.json({ success: true, data: { content } });
  } catch (err) {
    next(err);
  }
});

// Trigger AI Governance Review
router.post('/:id/review', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { simulateFailover } = req.body;
    const result = await ReviewOrchestratorService.triggerReview({
      contentId,
      organisationId: req.user!.organisationId,
      userId: req.user!.userId,
      simulateFailover: Boolean(simulateFailover),
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Resolve or accept a specific finding with recorded compliance justification
const resolveFindingSchema = z.object({
  resolution: z.enum(['resolved', 'accepted', 'dismissed']),
  resolutionReason: z.string().min(1, 'A justification reason is required to resolve a finding').max(2000),
});

router.patch('/:id/findings/:findingId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const findingId = Array.isArray(req.params.findingId) ? req.params.findingId[0] : req.params.findingId;
    const validated = resolveFindingSchema.parse(req.body);

    const content = await Content.findOne({
      _id: contentId,
      organisationId: req.user!.organisationId,
    });

    if (!content) {
      res.status(404).json({ success: false, error: { message: 'Content item not found' } });
      return;
    }

    let found = false;
    const updatedFindings = (content.findings || []).map((f: any) => {
      const currentId = f.id || (f._id && f._id.toString());
      if (currentId === findingId) {
        found = true;
        return {
          ...f,
          resolution: validated.resolution,
          resolutionReason: validated.resolutionReason,
        };
      }
      return f;
    });

    if (!found) {
      res.status(404).json({ success: false, error: { message: 'Finding not found on this content draft' } });
      return;
    }

    content.findings = updatedFindings;
    content.markModified('findings');
    await content.save();

    await logAuditEvent({
      organisationId: req.user!.organisationId,
      userId: req.user!.userId,
      action: 'FINDING_RESOLVED',
      resourceType: 'Content',
      resourceId: content._id.toString(),
      details: {
        findingId,
        resolution: validated.resolution,
        reason: validated.resolutionReason,
      },
    });

    res.json({ success: true, data: { content } });
  } catch (err) {
    next(err);
  }
});

export default router;
