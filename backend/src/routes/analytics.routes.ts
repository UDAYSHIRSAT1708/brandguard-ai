import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Content } from '../models/Content';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = new mongoose.Types.ObjectId(req.user!.organisationId);

    // 1. Fetch all tenant content
    const contents = await Content.find({ organisationId: orgId });

    const totalReviews = contents.length;
    const pendingApprovals = contents.filter(
      (c) => c.status === 'PENDING_APPROVAL' || c.status === 'SUBMITTED'
    ).length;
    const approvedCount = contents.filter((c) => c.status === 'APPROVED').length;
    const revisionCount = contents.filter((c) => c.status === 'NEEDS_REVISION' || c.currentVersion > 1).length;

    const revisionRate = totalReviews > 0 ? Math.round((revisionCount / totalReviews) * 100) : 0;

    // 2. Aggregate findings by severity and category from stored records
    const findingsBySeverity = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    const categoryCounts: Record<string, number> = {};

    for (const c of contents) {
      for (const f of c.findings || []) {
        const sev = (f.severity || 'info').toLowerCase() as keyof typeof findingsBySeverity;
        if (findingsBySeverity[sev] !== undefined) {
          findingsBySeverity[sev]++;
        }

        const cat = f.category || 'other';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      }
    }

    const mostFrequentCategories = Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        totalReviews,
        pendingApprovals,
        approvedCount,
        revisionRate,
        findingsBySeverity,
        mostFrequentCategories,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
