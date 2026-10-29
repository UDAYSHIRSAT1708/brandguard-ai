import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/auth.service';
import { OAuthService } from '../services/oauth.service';
import { authenticate, authorize } from '../middleware/auth';
import { registerRateLimiter, loginRateLimiter } from '../middleware/rateLimiter';
import { env } from '../config/env';
import { User } from '../models/User';

const router = Router();

// Helper to parse cookies from incoming headers without external cookie-parser dependency
export function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  header.split(';').forEach((part) => {
    const [name, ...rest] = part.trim().split('=');
    if (name) {
      cookies[name] = decodeURIComponent(rest.join('='));
    }
  });
  return cookies;
}

export function getRefreshTokenCookieOptions(): any {
  const isProduction = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

export function setRefreshTokenCookie(res: Response, refreshToken: string) {
  res.cookie('brandguard_refresh_token', refreshToken, getRefreshTokenCookieOptions());
}

export function clearRefreshTokenCookie(res: Response) {
  const isProduction = env.NODE_ENV === 'production';
  res.clearCookie('brandguard_refresh_token', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/auth',
  });
}

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

const oauthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  codeVerifier: z
    .string()
    .min(43, 'PKCE codeVerifier must be at least 43 characters')
    .max(128, 'PKCE codeVerifier must be at most 128 characters'),
  redirectUri: z.string().url('A valid redirect URI is required'),
  state: z.string().min(10, 'OAuth state parameter is required'),
  orgName: z.string().trim().min(2).max(100).optional(),
  orgSlug: z
    .preprocess((val) => (typeof val === 'string' ? val.trim().toLowerCase() : val), z.string().optional())
    .pipe(z.string().min(2).max(50).regex(/^[a-z0-9-]+$/).optional()),
});

const oauthLinkSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  codeVerifier: z
    .string()
    .min(43, 'PKCE codeVerifier must be at least 43 characters')
    .max(128, 'PKCE codeVerifier must be at most 128 characters'),
  redirectUri: z.string().url('A valid redirect URI is required'),
  state: z.string().min(10, 'OAuth state parameter is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required').optional(),
});

// 1. Password Registration
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
    setRefreshTokenCookie(res, result.refreshToken);
    res.status(201).json({
      success: true,
      data: {
        token: result.token,
        refreshToken: result.refreshToken,
        user: {
          id: result.user._id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role,
          authProvider: result.user.authProvider,
          isGoogleLinked: Boolean(result.user.googleId),
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

// 2. Password Login
router.post('/login', loginRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = loginSchema.parse(req.body);
    const result = await AuthService.login(validated);
    setRefreshTokenCookie(res, result.refreshToken);
    res.json({
      success: true,
      data: {
        token: result.token,
        refreshToken: result.refreshToken,
        user: {
          id: result.user._id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role,
          authProvider: result.user.authProvider,
          isGoogleLinked: Boolean(result.user.googleId),
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

// 3. Google OAuth Init — Generates State Token & Auth URL
router.get('/oauth/google/init', (req: Request, res: Response, next: NextFunction) => {
  try {
    const intent = (req.query.intent as 'login' | 'register' | 'link') || 'login';
    const redirectUri = (req.query.redirectUri as string) || undefined;
    const codeChallenge = (req.query.codeChallenge as string) || undefined;

    const authConfig = OAuthService.generateAuthUrl({
      intent,
      redirectUri,
      codeChallenge,
    });

    res.json({
      success: true,
      data: authConfig,
    });
  } catch (err) {
    next(err);
  }
});

// 4. Google OAuth Callback / Exchange (Handles Login and Registration)
router.post('/oauth/google/callback', loginRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = oauthCallbackSchema.parse(req.body);
    const result = await OAuthService.handleGoogleAuthCallback({
      code: validated.code,
      codeVerifier: validated.codeVerifier,
      redirectUri: validated.redirectUri,
      state: validated.state,
      orgName: validated.orgName,
      orgSlug: validated.orgSlug,
    });

    setRefreshTokenCookie(res, result.refreshToken);

    res.status(result.isNewAccount ? 201 : 200).json({
      success: true,
      data: {
        token: result.token,
        refreshToken: result.refreshToken,
        isNewAccount: Boolean(result.isNewAccount),
        user: {
          id: result.user._id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role,
          authProvider: result.user.authProvider,
          isGoogleLinked: Boolean(result.user.googleId),
          avatarUrl: result.user.avatarUrl,
          organisationId: result.org._id,
          organisationName: result.org.name,
          organisationSlug: result.org.slug,
        },
      },
    });
  } catch (err: any) {
    next(err);
  }
});

// 5. Explicitly Link Google Account to Authenticated User
router.post('/oauth/google/link', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = oauthLinkSchema.parse(req.body);
    const result = await OAuthService.linkGoogleAccountToUser({
      userId: req.user!.userId,
      code: validated.code,
      codeVerifier: validated.codeVerifier,
      redirectUri: validated.redirectUri,
      state: validated.state,
    });

    res.json({
      success: true,
      data: {
        message: 'Google identity successfully linked to account.',
        user: {
          id: result.user._id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role,
          authProvider: result.user.authProvider,
          isGoogleLinked: true,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// 6. Explicitly Unlink Google Account
router.post('/oauth/google/unlink', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await OAuthService.unlinkGoogleAccount(req.user!.userId);
    res.json({
      success: true,
      data: {
        message: 'Google identity unlinked successfully.',
        user: {
          id: result.user._id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role,
          authProvider: result.user.authProvider,
          isGoogleLinked: false,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// 7. Session Token Refresh (Supports both JSON payload and HttpOnly cookie)
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const refreshToken = (req.body?.refreshToken || cookies.brandguard_refresh_token || '').trim();

    if (!refreshToken) {
      res.status(401).json({
        success: false,
        error: { message: 'Refresh token is required. Please provide it in request body or cookie.' },
      });
      return;
    }

    const result = await AuthService.rotateRefreshToken(refreshToken);

    setRefreshTokenCookie(res, result.refreshToken);

    res.json({
      success: true,
      data: {
        token: result.token,
        refreshToken: result.refreshToken,
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

// 8. Session Revocation / Logout (Clears cookie and revokes refresh tokens in DB)
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const cookies = parseCookies(req.headers.cookie);
    const candidateRefreshToken = req.body?.refreshToken || cookies.brandguard_refresh_token;

    let targetUserId: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, env.JWT_SECRET) as any;
        if (decoded?.userId) {
          targetUserId = decoded.userId;
        }
      } catch {
        // Ignored
      }
    }
    if (!targetUserId && candidateRefreshToken) {
      try {
        const secret = env.JWT_REFRESH_SECRET || `${env.JWT_SECRET}-refresh`;
        const decoded = jwt.verify(candidateRefreshToken, secret) as any;
        if (decoded?.userId) {
          targetUserId = decoded.userId;
        }
      } catch {
        // Ignored
      }
    }

    if (targetUserId) {
      await AuthService.revokeUserSessions(targetUserId);
    }

    clearRefreshTokenCookie(res);

    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
});

// 9. Current User Profile
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
          authProvider: user.authProvider || 'local',
          isGoogleLinked: Boolean(user.googleId),
          avatarUrl: user.avatarUrl,
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

// 10. List users within the caller's tenant organisation
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
          authProvider: u.authProvider || 'local',
          isGoogleLinked: Boolean(u.googleId),
          active: u.active,
          createdAt: u.createdAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 11. Admin creates or invites a user within their tenant organisation
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
