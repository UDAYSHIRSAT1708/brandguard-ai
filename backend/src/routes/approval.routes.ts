import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApprovalService } from '../services/approval.service';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

const decisionSchema = z.object({
  versionNumber: z.number().int().positive(),
  reason: z.string().max(2000).optional(),
});

router.use(authenticate);

// Get pending approval queue (Reviewers and Admins)
router.get('/queue', authorize(['reviewer', 'admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await ApprovalService.getPendingApprovals(req.user!.organisationId);
    res.json({ success: true, data: { items } });
  } catch (err) {
    next(err);
  }
});

// Approve exact content version
router.post('/:id/approve', authorize(['reviewer', 'admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const validated = decisionSchema.parse(req.body);
    const decision = await ApprovalService.recordDecision({
      contentId,
      organisationId: req.user!.organisationId,
      reviewerId: req.user!.userId,
      reviewerRole: req.user!.role,
      versionNumber: validated.versionNumber,
      decision: 'approved',
      reason: validated.reason,
    });
    res.json({ success: true, data: { decision } });
  } catch (err) {
    next(err);
  }
});

// Reject content version
router.post('/:id/reject', authorize(['reviewer', 'admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const validated = decisionSchema.parse(req.body);
    const decision = await ApprovalService.recordDecision({
      contentId,
      organisationId: req.user!.organisationId,
      reviewerId: req.user!.userId,
      reviewerRole: req.user!.role,
      versionNumber: validated.versionNumber,
      decision: 'rejected',
      reason: validated.reason,
    });
    res.json({ success: true, data: { decision } });
  } catch (err) {
    next(err);
  }
});

// Request changes from creator
router.post('/:id/request-changes', authorize(['reviewer', 'admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const validated = decisionSchema.parse(req.body);
    const decision = await ApprovalService.recordDecision({
      contentId,
      organisationId: req.user!.organisationId,
      reviewerId: req.user!.userId,
      reviewerRole: req.user!.role,
      versionNumber: validated.versionNumber,
      decision: 'changes_requested',
      reason: validated.reason,
    });
    res.json({ success: true, data: { decision } });
  } catch (err) {
    next(err);
  }
});

export default router;
