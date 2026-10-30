import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserRole } from '../models/User';

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  owner: [
    'guidelines:read', 'guidelines:write', 'guidelines:delete',
    'content:read', 'content:create', 'content:edit', 'content:submit', 'content:approve', 'content:delete',
    'review:trigger', 'review:view',
    'org:read', 'org:manage_members', 'org:manage_settings', 'org:delete',
    'audit:read',
  ],
  admin: [
    'guidelines:read', 'guidelines:write', 'guidelines:delete',
    'content:read', 'content:create', 'content:edit', 'content:submit', 'content:approve', 'content:delete',
    'review:trigger', 'review:view',
    'org:read', 'org:manage_members', 'org:manage_settings',
    'audit:read',
  ],
  brand_manager: [
    'guidelines:read', 'guidelines:write', 'guidelines:delete',
    'content:read', 'content:approve',
    'review:trigger', 'review:view',
    'org:read',
    'audit:read',
  ],
  editor: [
    'guidelines:read',
    'content:read', 'content:create', 'content:edit', 'content:submit',
    'review:trigger', 'review:view',
    'org:read',
  ],
  creator: [
    'guidelines:read',
    'content:read', 'content:create', 'content:edit', 'content:submit',
    'review:trigger', 'review:view',
    'org:read',
  ],
  reviewer: [
    'guidelines:read',
    'content:read', 'content:approve',
    'review:view',
    'org:read',
    'audit:read',
  ],
  viewer: [
    'guidelines:read',
    'content:read',
    'review:view',
    'org:read',
    'audit:read',
  ],
};

export interface UserPayload {
  userId: string;
  organisationId: string;
  role: UserRole;
  email: string;
  permissions?: string[];
  isOwner?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { message: 'Authentication required. No Bearer token provided.' },
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as UserPayload;
    req.user = decoded;
    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      error: { message: 'Invalid or expired authentication token.' },
    });
    return;
  }
}

export function authorize(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { message: 'Unauthorized. User session not found.' },
      });
      return;
    }

    const userRole = req.user.role;

    // Owner role or flag inherently satisfies any authorized role
    if (userRole === 'owner' || req.user.isOwner) {
      return next();
    }

    // Role inheritance & aliases
    const effectiveRoles: UserRole[] = [userRole];
    if (userRole === 'creator') effectiveRoles.push('editor');
    if (userRole === 'editor') effectiveRoles.push('creator');
    if (userRole === 'admin') {
      effectiveRoles.push('brand_manager', 'editor', 'creator', 'reviewer', 'viewer');
    }

    const hasAccess = allowedRoles.some((r) => effectiveRoles.includes(r));
    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: {
          message: `Access denied. Role '${userRole}' lacks permission for this action.`,
        },
      });
      return;
    }

    next();
  };
}

export function authorizePermission(requiredPermission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { message: 'Unauthorized. User session not found.' },
      });
      return;
    }

    const userRole = req.user.role;
    if (userRole === 'owner' || req.user.isOwner) {
      return next();
    }

    const userPerms = req.user.permissions || [];
    const defaultPerms = DEFAULT_ROLE_PERMISSIONS[userRole] || [];
    const allPerms = new Set([...defaultPerms, ...userPerms]);

    if (allPerms.has(requiredPermission) || allPerms.has('*')) {
      return next();
    }

    res.status(403).json({
      success: false,
      error: {
        message: `Access denied. Missing required permission: '${requiredPermission}'.`,
      },
    });
  };
}
