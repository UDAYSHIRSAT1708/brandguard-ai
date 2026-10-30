import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Organisation, IOrganisation } from '../models/Organisation';
import { User, IUser, UserRole } from '../models/User';
import { Invitation, IInvitation, InvitationStatus } from '../models/Invitation';
import { AuthService } from './auth.service';
import { logAuditEvent } from './audit.service';
import { redactEmail } from '../utils/redact';
import { env } from '../config/env';

export class OrganisationService {
  /**
   * Generates a cryptographically secure, single-use invitation token and stores its hash.
   */
  static async createInvitation(params: {
    organisationId: string;
    invitedByUserId: string;
    email: string;
    role: UserRole;
    permissions?: string[];
  }): Promise<{ invitation: IInvitation; inviteToken: string; inviteLink: string }> {
    const normalizedEmail = params.email.trim().toLowerCase();

    if (params.role === 'owner') {
      const err: any = new Error('Cannot invite a user as Owner. Ownership must be transferred explicitly.');
      err.statusCode = 400;
      throw err;
    }

    // 1. Check if user is already an active member of this organisation
    const existingMember = await User.findOne({
      organisationId: params.organisationId,
      email: normalizedEmail,
      active: true,
    });
    if (existingMember) {
      const err: any = new Error(`User with email '${normalizedEmail}' is already an active member of this organisation.`);
      err.statusCode = 409;
      throw err;
    }

    // 2. Prevent duplicate pending, unexpired invitations for the same email in this organisation
    const existingPending = await Invitation.findOne({
      organisationId: params.organisationId,
      email: normalizedEmail,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    });
    if (existingPending) {
      const err: any = new Error(`A pending invitation for '${normalizedEmail}' already exists. You can revoke or resend it.`);
      err.statusCode = 409;
      throw err;
    }

    // 3. Generate 32-byte cryptographic random token & store its SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7-day TTL

    const invitation = await Invitation.create({
      organisationId: params.organisationId,
      email: normalizedEmail,
      role: params.role,
      permissions: params.permissions || [],
      tokenHash,
      invitedBy: params.invitedByUserId,
      status: 'pending',
      expiresAt,
    });

    const inviteLink = `${env.FRONTEND_URL}/invite?token=${rawToken}`;

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.invitedByUserId,
      action: 'INVITATION_CREATED',
      resourceType: 'Invitation',
      resourceId: invitation._id.toString(),
      details: { email: redactEmail(normalizedEmail), role: params.role, expiresAt },
    });

    console.log(`[ORG] Created invitation for '${redactEmail(normalizedEmail)}' with role '${params.role}' in org '${params.organisationId}'`);
    return { invitation, inviteToken: rawToken, inviteLink };
  }

  /**
   * Lists all invitations for an organisation, automatically marking expired ones.
   */
  static async listInvitations(organisationId: string): Promise<IInvitation[]> {
    // Automatically transition expired pending invitations
    await Invitation.updateMany(
      {
        organisationId,
        status: 'pending',
        expiresAt: { $lte: new Date() },
      },
      { $set: { status: 'expired' } }
    );

    return Invitation.find({ organisationId })
      .populate('invitedBy', 'name email')
      .sort({ createdAt: -1 });
  }

  /**
   * Revokes a pending invitation.
   */
  static async revokeInvitation(params: {
    organisationId: string;
    invitationId: string;
    revokedByUserId: string;
  }): Promise<IInvitation> {
    const invite = await Invitation.findOne({
      _id: params.invitationId,
      organisationId: params.organisationId,
    });

    if (!invite) {
      const err: any = new Error('Invitation not found.');
      err.statusCode = 404;
      throw err;
    }

    if (invite.status !== 'pending') {
      const err: any = new Error(`Cannot revoke invitation with status '${invite.status}'.`);
      err.statusCode = 400;
      throw err;
    }

    invite.status = 'revoked';
    await invite.save();

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.revokedByUserId,
      action: 'INVITATION_REVOKED',
      resourceType: 'Invitation',
      resourceId: invite._id.toString(),
      details: { email: redactEmail(invite.email) },
    });

    return invite;
  }

  /**
   * Resends an invitation with a fresh token and resets expiration.
   */
  static async resendInvitation(params: {
    organisationId: string;
    invitationId: string;
    resentByUserId: string;
  }): Promise<{ invitation: IInvitation; inviteToken: string; inviteLink: string }> {
    const invite = await Invitation.findOne({
      _id: params.invitationId,
      organisationId: params.organisationId,
    });

    if (!invite) {
      const err: any = new Error('Invitation not found.');
      err.statusCode = 404;
      throw err;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    invite.tokenHash = tokenHash;
    invite.status = 'pending';
    invite.expiresAt = expiresAt;
    await invite.save();

    const inviteLink = `${env.FRONTEND_URL}/invite?token=${rawToken}`;

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.resentByUserId,
      action: 'INVITATION_RESENT',
      resourceType: 'Invitation',
      resourceId: invite._id.toString(),
      details: { email: redactEmail(invite.email), expiresAt },
    });

    return { invitation: invite, inviteToken: rawToken, inviteLink };
  }

  /**
   * Verifies an invitation token without consuming it.
   */
  static async verifyInvitationToken(rawToken: string): Promise<{
    valid: boolean;
    invitation: {
      id: string;
      email: string;
      role: UserRole;
      organisationName?: string;
      organisationSlug?: string;
      expiresAt: Date;
    };
  }> {
    if (!rawToken || typeof rawToken !== 'string') {
      const err: any = new Error('Invitation token is required.');
      err.statusCode = 400;
      throw err;
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const invite = await Invitation.findOne({ tokenHash });

    if (!invite) {
      const err: any = new Error('Invalid or unrecognised invitation token.');
      err.statusCode = 404;
      throw err;
    }

    if (invite.status !== 'pending') {
      const err: any = new Error(`This invitation has already been ${invite.status}.`);
      err.statusCode = 400;
      throw err;
    }

    if (invite.expiresAt <= new Date()) {
      invite.status = 'expired';
      await invite.save();
      const err: any = new Error('This invitation token has expired. Please request a new invitation.');
      err.statusCode = 400;
      throw err;
    }

    const org = await Organisation.findById(invite.organisationId);

    return {
      valid: true,
      invitation: {
        id: invite._id.toString(),
        email: invite.email,
        role: invite.role,
        organisationName: org?.name,
        organisationSlug: org?.slug,
        expiresAt: invite.expiresAt,
      },
    };
  }

  /**
   * Accepts an invitation. Supports both authenticated existing users and new user registration.
   */
  static async acceptInvitation(params: {
    rawToken: string;
    currentUserId?: string;
    name?: string;
    password?: string;
  }): Promise<{
    user: IUser;
    org: IOrganisation;
    token: string;
    refreshToken: string;
    isNewAccount?: boolean;
  }> {
    if (!params.rawToken || typeof params.rawToken !== 'string') {
      const err: any = new Error('Invitation token is required.');
      err.statusCode = 400;
      throw err;
    }

    const tokenHash = crypto.createHash('sha256').update(params.rawToken).digest('hex');
    const invite = await Invitation.findOne({ tokenHash });

    if (!invite) {
      const err: any = new Error('Invalid invitation token.');
      err.statusCode = 404;
      throw err;
    }

    if (invite.status !== 'pending') {
      const err: any = new Error(`Cannot accept invitation with status '${invite.status}'.`);
      err.statusCode = 400;
      throw err;
    }

    if (invite.expiresAt <= new Date()) {
      invite.status = 'expired';
      await invite.save();
      const err: any = new Error('This invitation has expired.');
      err.statusCode = 400;
      throw err;
    }

    const org = await Organisation.findById(invite.organisationId);
    if (!org) {
      const err: any = new Error('Associated organisation not found.');
      err.statusCode = 404;
      throw err;
    }

    let user: IUser;
    let isNewAccount = false;

    // Flow A: Request by already-authenticated user
    if (params.currentUserId) {
      const authenticatedUser = await User.findById(params.currentUserId);
      if (!authenticatedUser) {
        const err: any = new Error('Authenticated user session not found.');
        err.statusCode = 401;
        throw err;
      }

      if (authenticatedUser.email.toLowerCase() !== invite.email.toLowerCase()) {
        const err: any = new Error(
          `Email mismatch: This invitation was issued for '${invite.email}', but you are signed in as '${authenticatedUser.email}'.`
        );
        err.statusCode = 403;
        err.code = 'EMAIL_MISMATCH';
        throw err;
      }

      // Reassign user to the new organisation with invited role and permissions
      authenticatedUser.organisationId = invite.organisationId;
      authenticatedUser.role = invite.role;
      if (invite.permissions && invite.permissions.length > 0) {
        authenticatedUser.permissions = invite.permissions;
      }
      authenticatedUser.refreshTokenVersion = (authenticatedUser.refreshTokenVersion || 1) + 1;
      await authenticatedUser.save();
      user = authenticatedUser;
    } else {
      // Flow B: Unauthenticated user accepting invitation
      const existingUser = await User.findOne({ email: invite.email.toLowerCase() });

      if (existingUser) {
        // If user already exists, require password verification or tell them to log in
        if (!params.password) {
          const err: any = new Error(
            'An account with this email already exists. Please provide your password or log in first to accept this invitation.'
          );
          err.statusCode = 401;
          err.code = 'EXISTING_USER_LOGIN_REQUIRED';
          throw err;
        }

        if (!existingUser.passwordHash) {
          const err: any = new Error(
            'This account uses Google Sign-In. Please sign in with Google first, then accept the invitation.'
          );
          err.statusCode = 401;
          err.code = 'GOOGLE_AUTH_REQUIRED';
          throw err;
        }

        const isMatch = await bcrypt.compare(params.password, existingUser.passwordHash);
        if (!isMatch) {
          const err: any = new Error('Invalid password for existing user account.');
          err.statusCode = 401;
          throw err;
        }

        existingUser.organisationId = invite.organisationId;
        existingUser.role = invite.role;
        if (invite.permissions && invite.permissions.length > 0) {
          existingUser.permissions = invite.permissions;
        }
        existingUser.refreshTokenVersion = (existingUser.refreshTokenVersion || 1) + 1;
        await existingUser.save();
        user = existingUser;
      } else {
        // Create new user account for this invitation
        if (!params.name || !params.password) {
          const err: any = new Error('Both name and password (minimum 8 characters) are required to accept this invitation.');
          err.statusCode = 400;
          throw err;
        }

        if (params.password.length < 8) {
          const err: any = new Error('Password must be at least 8 characters in length.');
          err.statusCode = 400;
          throw err;
        }

        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(params.password, salt);

        user = await User.create({
          organisationId: invite.organisationId,
          name: params.name.trim(),
          email: invite.email.toLowerCase(),
          passwordHash,
          role: invite.role,
          permissions: invite.permissions || [],
          authProvider: 'local',
          refreshTokenVersion: 1,
          active: true,
        });
        isNewAccount = true;
      }
    }

    // Mark invitation as accepted
    invite.status = 'accepted';
    invite.acceptedAt = new Date();
    invite.acceptedBy = user._id;
    await invite.save();

    const isOwner = Boolean(user.role === 'owner' || (org.ownerId && org.ownerId.toString() === user._id.toString()));
    const token = AuthService.generateToken(user, isOwner);
    const refreshToken = AuthService.generateRefreshToken(user);

    await logAuditEvent({
      organisationId: org._id,
      userId: user._id,
      action: 'INVITATION_ACCEPTED',
      resourceType: 'Invitation',
      resourceId: invite._id.toString(),
      details: { email: redactEmail(user.email), role: user.role, isNewAccount },
    });

    console.log(`[ORG] Invitation accepted by '${redactEmail(user.email)}' with role '${user.role}' in org '${org.slug}'`);
    return { user, org, token, refreshToken, isNewAccount };
  }

  /**
   * Lists all members of an organisation with their computed role and ownership status.
   */
  static async listMembers(organisationId: string): Promise<Array<any>> {
    const org = await Organisation.findById(organisationId);
    if (!org) {
      const err: any = new Error('Organisation not found.');
      err.statusCode = 404;
      throw err;
    }

    const users = await User.find({ organisationId, active: true })
      .select('_id name email role permissions avatarUrl authProvider googleId createdAt updatedAt')
      .sort({ createdAt: 1 });

    return users.map((u) => {
      const isOwner = Boolean(
        u.role === 'owner' || (org.ownerId && org.ownerId.toString() === u._id.toString())
      );
      return {
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        role: isOwner ? 'owner' : u.role,
        permissions: u.permissions || [],
        isOwner,
        avatarUrl: u.avatarUrl,
        authProvider: u.authProvider,
        isGoogleLinked: Boolean(u.googleId),
        createdAt: u.createdAt,
      };
    });
  }

  /**
   * Updates a member's role or permissions with strict hierarchy enforcement.
   */
  static async updateMemberRole(params: {
    organisationId: string;
    actorUserId: string;
    targetUserId: string;
    newRole: UserRole;
    permissions?: string[];
  }): Promise<any> {
    if (params.actorUserId === params.targetUserId) {
      const err: any = new Error('Users cannot modify their own role or permissions.');
      err.statusCode = 400;
      throw err;
    }

    const org = await Organisation.findById(params.organisationId);
    if (!org) {
      const err: any = new Error('Organisation not found.');
      err.statusCode = 404;
      throw err;
    }

    const actor = await User.findOne({ _id: params.actorUserId, organisationId: params.organisationId });
    const target = await User.findOne({ _id: params.targetUserId, organisationId: params.organisationId, active: true });

    if (!actor || !target) {
      const err: any = new Error('Member not found within this organisation.');
      err.statusCode = 404;
      throw err;
    }

    const isActorOwner = Boolean(
      actor.role === 'owner' || (org.ownerId && org.ownerId.toString() === actor._id.toString())
    );
    const isTargetOwner = Boolean(
      target.role === 'owner' || (org.ownerId && org.ownerId.toString() === target._id.toString())
    );

    // Rule 1: The owner cannot be modified via updateMemberRole (must use transfer-ownership)
    if (isTargetOwner) {
      const err: any = new Error('Cannot modify the organization owner. Use ownership transfer.');
      err.statusCode = 403;
      throw err;
    }

    // Rule 2: Cannot set role to 'owner' directly (must use transfer-ownership)
    if (params.newRole === 'owner') {
      const err: any = new Error('Cannot assign the Owner role directly. Use ownership transfer.');
      err.statusCode = 400;
      throw err;
    }

    // Rule 3: Only the Owner can assign the Admin role
    if (params.newRole === 'admin' && !isActorOwner) {
      const err: any = new Error('Only organization owners can assign the administrator role.');
      err.statusCode = 403;
      throw err;
    }

    // Rule 4: Non-owners cannot modify administrators
    if (target.role === 'admin' && !isActorOwner) {
      const err: any = new Error('Administrators cannot modify other administrators.');
      err.statusCode = 403;
      throw err;
    }

    target.role = params.newRole;
    if (params.permissions !== undefined) {
      target.permissions = params.permissions;
    }
    // Invalidate target user's active session token so updated roles take effect
    target.refreshTokenVersion = (target.refreshTokenVersion || 1) + 1;
    await target.save();

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.actorUserId,
      action: 'MEMBER_ROLE_UPDATED',
      resourceType: 'User',
      resourceId: target._id.toString(),
      details: { targetEmail: redactEmail(target.email), newRole: params.newRole },
    });

    console.log(`[ORG] Updated role for '${redactEmail(target.email)}' to '${params.newRole}' by '${redactEmail(actor.email)}'`);
    return {
      id: target._id.toString(),
      name: target.name,
      email: target.email,
      role: target.role,
      permissions: target.permissions || [],
    };
  }

  /**
   * Removes a member from an organisation with last-owner protection.
   */
  static async removeMember(params: {
    organisationId: string;
    actorUserId: string;
    targetUserId: string;
  }): Promise<{ success: boolean; message: string }> {
    if (params.actorUserId === params.targetUserId) {
      const err: any = new Error('Users cannot remove themselves using this endpoint.');
      err.statusCode = 400;
      throw err;
    }

    const org = await Organisation.findById(params.organisationId);
    if (!org) {
      const err: any = new Error('Organisation not found.');
      err.statusCode = 404;
      throw err;
    }

    const actor = await User.findOne({ _id: params.actorUserId, organisationId: params.organisationId });
    const target = await User.findOne({ _id: params.targetUserId, organisationId: params.organisationId, active: true });

    if (!actor || !target) {
      const err: any = new Error('Member not found within this organisation.');
      err.statusCode = 404;
      throw err;
    }

    const isActorOwner = Boolean(
      actor.role === 'owner' || (org.ownerId && org.ownerId.toString() === actor._id.toString())
    );
    const isTargetOwner = Boolean(
      target.role === 'owner' || (org.ownerId && org.ownerId.toString() === target._id.toString())
    );

    // Safeguard: The owner can NEVER be removed
    if (isTargetOwner) {
      const err: any = new Error('Cannot remove the organization owner. Transfer ownership before removing this user.');
      err.statusCode = 403;
      throw err;
    }

    // Safeguard: Non-owners cannot remove administrators
    if (target.role === 'admin' && !isActorOwner) {
      const err: any = new Error('Administrators cannot remove other administrators.');
      err.statusCode = 403;
      throw err;
    }

    target.active = false;
    target.refreshTokenVersion = (target.refreshTokenVersion || 1) + 1;
    await target.save();

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.actorUserId,
      action: 'MEMBER_REMOVED',
      resourceType: 'User',
      resourceId: target._id.toString(),
      details: { targetEmail: redactEmail(target.email) },
    });

    console.log(`[ORG] Member '${redactEmail(target.email)}' deactivated by '${redactEmail(actor.email)}'`);
    return { success: true, message: 'Member successfully removed from organisation.' };
  }

  /**
   * Transfers organisation ownership to another active member with confirmation.
   */
  static async transferOwnership(params: {
    organisationId: string;
    actorUserId: string;
    newOwnerId: string;
    confirmation: string;
  }): Promise<{ success: boolean; message: string; previousOwnerId: string; newOwnerId: string }> {
    if (params.confirmation !== 'CONFIRM_TRANSFER') {
      const err: any = new Error("Explicit confirmation required. Value must be 'CONFIRM_TRANSFER'.");
      err.statusCode = 400;
      throw err;
    }

    const org = await Organisation.findById(params.organisationId);
    if (!org) {
      const err: any = new Error('Organisation not found.');
      err.statusCode = 404;
      throw err;
    }

    const actor = await User.findOne({ _id: params.actorUserId, organisationId: params.organisationId });
    if (!actor) {
      const err: any = new Error('Actor user not found.');
      err.statusCode = 404;
      throw err;
    }

    const isActorOwner = Boolean(
      actor.role === 'owner' || (org.ownerId && org.ownerId.toString() === actor._id.toString())
    );
    if (!isActorOwner) {
      const err: any = new Error('Only the current organization owner can transfer ownership.');
      err.statusCode = 403;
      throw err;
    }

    const newOwner = await User.findOne({
      _id: params.newOwnerId,
      organisationId: params.organisationId,
      active: true,
    });
    if (!newOwner) {
      const err: any = new Error('Designated new owner not found or inactive in this organisation.');
      err.statusCode = 404;
      throw err;
    }

    if (actor._id.toString() === newOwner._id.toString()) {
      const err: any = new Error('New owner must be a different member of the organisation.');
      err.statusCode = 400;
      throw err;
    }

    const previousOwnerId = actor._id.toString();

    // Reassign organisation ownerId
    org.ownerId = newOwner._id;
    await org.save();

    // Update roles
    newOwner.role = 'owner';
    newOwner.refreshTokenVersion = (newOwner.refreshTokenVersion || 1) + 1;
    await newOwner.save();

    actor.role = 'admin';
    actor.refreshTokenVersion = (actor.refreshTokenVersion || 1) + 1;
    await actor.save();

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.actorUserId,
      action: 'ORGANISATION_OWNERSHIP_TRANSFERRED',
      resourceType: 'Organisation',
      resourceId: org._id.toString(),
      details: { previousOwnerId, newOwnerId: newOwner._id.toString() },
    });

    console.log(`[ORG] Ownership transferred from '${redactEmail(actor.email)}' to '${redactEmail(newOwner.email)}'`);
    return {
      success: true,
      message: 'Organisation ownership successfully transferred.',
      previousOwnerId,
      newOwnerId: newOwner._id.toString(),
    };
  }

  /**
   * Retrieves organisation details and settings.
   */
  static async getOrganisationDetails(organisationId: string): Promise<any> {
    const org = await Organisation.findById(organisationId);
    if (!org) {
      const err: any = new Error('Organisation not found.');
      err.statusCode = 404;
      throw err;
    }

    const owner = org.ownerId ? await User.findById(org.ownerId).select('name email') : null;
    const memberCount = await User.countDocuments({ organisationId, active: true });

    return {
      id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      owner: owner ? { id: owner._id.toString(), name: owner.name, email: owner.email } : null,
      memberCount,
      settings: org.settings || {},
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    };
  }

  /**
   * Updates organisation settings.
   */
  static async updateOrganisationSettings(
    organisationId: string,
    updates: { name?: string; settings?: Record<string, any> }
  ): Promise<IOrganisation> {
    const org = await Organisation.findById(organisationId);
    if (!org) {
      const err: any = new Error('Organisation not found.');
      err.statusCode = 404;
      throw err;
    }

    if (updates.name && updates.name.trim()) {
      org.name = updates.name.trim();
    }
    if (updates.settings && typeof updates.settings === 'object') {
      org.settings = { ...org.settings, ...updates.settings };
    }

    await org.save();
    return org;
  }
}
