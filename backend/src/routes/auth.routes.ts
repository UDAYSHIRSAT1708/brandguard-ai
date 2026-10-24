import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';
import { authenticate, authorize } from '../middleware/auth';
import { registerRateLimiter, loginRateLimiter } from '../middleware/rateLimiter';
import { env } from '../config/env';
import { User } from '../models/User';

const router = Router();

const registerSchema = z.object({
  orgName: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(100),
  orgSlug: z
    .preprocess((val) => (typeof val === 'string' ? val.trim().toLowerCase() : val), z.string())
    .pipe(z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase alphanumeric characters and hyphens')),
  adminName: z.string().trim().min(2, 'Administrator name must be at least 2 characters').max(100),
  adminEmail: z
    .preprocess((val) => (typeof val === 'string' ? val.trim().toLowerCase() : val), z.string())
    .pipe(z.string().email('Valid email address required').max(255)),
  adminPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  email: z
    .preprocess((val) => (typeof val === 'string' ? val.trim().toLowerCase() : val), z.string())
    .pipe(z.string().email('Valid email address required').max(255)),
  password: z.string().min(1, 'Password is required').max(128),
  organisationSlug: z
    .preprocess((val) => (typeof val === 'string' ? val.trim().toLowerCase() : val), z.string().max(50).optional())
    .optional(),
});

router.post('/register', registerRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!env.ALLOW_PUBLIC_REGISTRATION) {
      res.status(403).json({
        success: false,
        error: { message: 'Public organization self-registration is disabled on this server. Contact your system administrator.' },
      });
      return;
    }

    const validated = registerSchema.parse(req.body);
    const result = await AuthService.registerOrgAndAdmin(validated);
    res.status(201).json({
      success: true,
      data: {
        token: result.token,
        user: {
          id: result.user._id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role,
          organisationId: result.org._id,
          organisationName: result.org.name,
          organisationSlug: result.org.slug,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', loginRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = loginSchema.parse(req.body);
    const result = await AuthService.login(validated);
    res.json({
      success: true,
      data: {
        token: result.token,
        user: {
          id: result.user._id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role,
          organisationId: result.org._id,
          organisationName: result.org.name,
          organisationSlug: result.org.slug,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.userId)
      .select('-passwordHash')
      .populate('organisationId', 'name slug');

    if (!user) {
      res.status(404).json({ success: false, error: { message: 'User not found' } });
      return;
    }

    const orgObj: any = user.organisationId;
    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          organisationId: orgObj?._id || orgObj || user.organisationId,
          organisationName: orgObj?.name || 'Default Organisation',
          organisationSlug: orgObj?.slug || 'default',
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// List users within the caller's tenant organisation
router.get('/users', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await User.find({ organisationId: req.user!.organisationId })
      .select('-passwordHash')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        users: users.map((u) => ({
          id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          active: u.active,
          createdAt: u.createdAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Admin creates or invites a user within their tenant organisation
router.post('/users', authenticate, authorize(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const createUserSchema = z.object({
      name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
      email: z
        .preprocess((val) => (typeof val === 'string' ? val.trim().toLowerCase() : val), z.string())
        .pipe(z.string().email('Valid email address required').max(255)),
      password: z.string().min(8, 'Password must be at least 8 characters').max(128),
      role: z.enum(['admin', 'creator', 'reviewer']).default('creator'),
    });

    const validated = createUserSchema.parse(req.body);
    const user = await AuthService.createUserInOrg({
      organisationId: req.user!.organisationId,
      name: validated.name,
      email: validated.email,
      password: validated.password,
      role: validated.role,
      creatorUserId: req.user!.userId,
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          organisationId: user.organisationId,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
