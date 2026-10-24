import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AuditEvent } from '../models/AuditEvent';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// View audit log (Admins and Reviewers)
router.get('/', authorize(['admin', 'reviewer']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const events = await AuditEvent.find({
      organisationId: new mongoose.Types.ObjectId(req.user!.organisationId),
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('userId', 'name email role');

    res.json({ success: true, data: { events } });
  } catch (err) {
    next(err);
  }
});

export default router;
