import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorizePermission } from '../middleware/auth';
import { OrganisationService } from '../services/organisation.service';
import { UserRole } from '../models/User';

const router = Router();

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'brand_manager', 'editor', 'reviewer', 'viewer', 'creator']),
  permissions: z.array(z.string()).optional(),
});

const updateMemberSchema = z.object({
  role: z.enum(['admin', 'brand_manager', 'editor', 'reviewer', 'viewer', 'creator']),
  permissions: z.array(z.string()).optional(),
});

const transferOwnershipSchema = z.object({
  newOwnerId: z.string().min(1),
  confirmation: z.literal('CONFIRM_TRANSFER'),
});

const updateOrgSchema = z.object({
  name: z.string().min(2).optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

const acceptInviteSchema = z.object({
  token: z.string().min(10),
  name: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
});

// 1. Current Organisation Details
router.get('/current', authenticate, authorizePermission('org:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const details = await OrganisationService.getOrganisationDetails(req.user!.organisationId);
    res.json({ success: true, data: details });
  } catch (err) {
    next(err);
  }
});

// 2. Update Organisation Settings
router.patch('/current', authenticate, authorizePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = updateOrgSchema.parse(req.body);
    const updated = await OrganisationService.updateOrganisationSettings(req.user!.organisationId, validated);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// 3. List Organisation Members
router.get('/members', authenticate, authorizePermission('org:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const members = await OrganisationService.listMembers(req.user!.organisationId);
    res.json({ success: true, data: { members } });
  } catch (err) {
    next(err);
  }
});

// 4. Update Member Role & Permissions
router.patch('/members/:userId', authenticate, authorizePermission('org:manage_members'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = updateMemberSchema.parse(req.body);
    const updated = await OrganisationService.updateMemberRole({
      organisationId: req.user!.organisationId,
      actorUserId: req.user!.userId,
      targetUserId: String(req.params.userId),
      newRole: validated.role as UserRole,
      permissions: validated.permissions,
    });
    res.json({ success: true, data: { member: updated } });
  } catch (err) {
    next(err);
  }
});

// 5. Remove Member
router.delete('/members/:userId', authenticate, authorizePermission('org:manage_members'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await OrganisationService.removeMember({
      organisationId: req.user!.organisationId,
      actorUserId: req.user!.userId,
      targetUserId: String(req.params.userId),
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 6. Transfer Organisation Ownership
router.post('/transfer-ownership', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = transferOwnershipSchema.parse(req.body);
    const result = await OrganisationService.transferOwnership({
      organisationId: req.user!.organisationId,
      actorUserId: req.user!.userId,
      newOwnerId: validated.newOwnerId,
      confirmation: validated.confirmation,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 7. Create Invitation
router.post('/invitations', authenticate, authorizePermission('org:manage_members'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createInviteSchema.parse(req.body);
    const result = await OrganisationService.createInvitation({
      organisationId: req.user!.organisationId,
      invitedByUserId: req.user!.userId,
      email: validated.email,
      role: validated.role as UserRole,
      permissions: validated.permissions,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// 8. List Pending / Historical Invitations
router.get('/invitations', authenticate, authorizePermission('org:manage_members'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invitations = await OrganisationService.listInvitations(req.user!.organisationId);
    res.json({ success: true, data: { invitations } });
  } catch (err) {
    next(err);
  }
});

// 9. Revoke Invitation
router.delete('/invitations/:id', authenticate, authorizePermission('org:manage_members'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await OrganisationService.revokeInvitation({
      organisationId: req.user!.organisationId,
      invitationId: String(req.params.id),
      revokedByUserId: req.user!.userId,
    });
    res.json({ success: true, data: { invitation: result } });
  } catch (err) {
    next(err);
  }
});

// 10. Resend Invitation
router.post('/invitations/:id/resend', authenticate, authorizePermission('org:manage_members'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await OrganisationService.resendInvitation({
      organisationId: req.user!.organisationId,
      invitationId: String(req.params.id),
      resentByUserId: req.user!.userId,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// 11. Verify Invitation Token (Public inspection)
router.get('/invitations/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.query.token as string;
    const result = await OrganisationService.verifyInvitationToken(token);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// 12. Accept Invitation (Can be authenticated or unauthenticated registration)
router.post('/invitations/accept', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = acceptInviteSchema.parse(req.body);

    // Optional Bearer token check for already logged-in users
    let currentUserId: string | undefined = undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded: any = authenticate; // just verify if valid token exists
        const jwt = await import('jsonwebtoken');
        const env = (await import('../config/env')).env;
        const payload: any = jwt.default.verify(authHeader.split(' ')[1], env.JWT_SECRET);
        currentUserId = payload.userId;
      } catch {
        // Ignored if expired or invalid; proceed as unauthenticated
      }
    }

    const result = await OrganisationService.acceptInvitation({
      rawToken: validated.token,
      currentUserId,
      name: validated.name,
      password: validated.password,
    });

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

export default router;
