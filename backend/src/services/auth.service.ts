import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, IUser, UserRole } from '../models/User';
import { Organisation, IOrganisation } from '../models/Organisation';
import { env } from '../config/env';
import { logAuditEvent } from './audit.service';
import { redactEmail } from '../utils/redact';

export class AuthService {
  static async registerOrgAndAdmin(params: {
    orgName: string;
    orgSlug: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  }): Promise<{ user: IUser; org: IOrganisation; token: string; refreshToken: string }> {
    const normalizedEmail = params.adminEmail.trim().toLowerCase();
    const normalizedSlug = params.orgSlug.trim().toLowerCase();
    const trimmedOrgName = params.orgName.trim();
    const trimmedAdminName = params.adminName.trim();

    console.log(`[AUTH] Registration attempt: Org '${trimmedOrgName}' (${normalizedSlug}), Admin: '${redactEmail(normalizedEmail)}'`);

    // 1. Verify slug uniqueness
    const existingOrg = await Organisation.findOne({ slug: normalizedSlug });
    if (existingOrg) {
      console.warn(`[AUTH] Registration conflict: Organisation slug '${normalizedSlug}' is already taken.`);
      const err: any = new Error(`Organisation slug '${params.orgSlug}' is already in use.`);
      err.statusCode = 409;
      throw err;
    }

    // 2. Verify global email uniqueness
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      console.warn(`[AUTH] Registration conflict: User email '${redactEmail(normalizedEmail)}' already exists.`);
      const err: any = new Error(`An account with email '${normalizedEmail}' already exists. Please sign in instead.`);
      err.statusCode = 409;
      throw err;
    }

    // 3. Create organisation
    const org = await Organisation.create({
      name: trimmedOrgName,
      slug: normalizedSlug,
    });

    let user: IUser;
    try {
      // 4. Hash password with bcrypt (12 rounds)
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(params.adminPassword, salt);

      // 5. Create initial administrator user
      user = await User.create({
        organisationId: org._id,
        name: trimmedAdminName,
        email: normalizedEmail,
        passwordHash,
        role: 'admin',
        authProvider: 'local',
        refreshTokenVersion: 1,
        active: true,
      });

      // Bind initial administrator as organization owner
      org.ownerId = user._id;
      await org.save();
    } catch (createErr) {
      // Compensating action: cleanup created organization if user creation fails
      console.error(`[AUTH] Registration rollback: Cleaning up org '${org._id}' due to user creation failure.`);
      await Organisation.findByIdAndDelete(org._id);
      throw createErr;
    }

    // 6. Generate JWT access and refresh tokens
    const token = this.generateToken(user, true);
    const refreshToken = this.generateRefreshToken(user);
    console.log(`[AUTH] Registration successful: Org '${org.name}' (${org.slug}), Admin User: '${redactEmail(user.email)}' [${user.role}]`);

    await logAuditEvent({
      organisationId: org._id,
      userId: user._id,
      action: 'ORGANISATION_REGISTERED',
      resourceType: 'Organisation',
      resourceId: org._id.toString(),
      details: { orgName: org.name, adminEmail: redactEmail(user.email) },
    });

    return { user, org, token, refreshToken };
  }

  static async createUserInOrg(params: {
    organisationId: string;
    name: string;
    email: string;
    password: string;
    role: UserRole;
    creatorUserId: string;
  }): Promise<IUser> {
    const normalizedEmail = params.email.trim().toLowerCase();
    const trimmedName = params.name.trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      console.warn(`[AUTH] Create user conflict: Email '${redactEmail(normalizedEmail)}' already exists.`);
      const err: any = new Error(`User with email '${normalizedEmail}' already exists.`);
      err.statusCode = 409;
      throw err;
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(params.password, salt);

    const user = await User.create({
      organisationId: params.organisationId,
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
      role: params.role,
      authProvider: 'local',
      refreshTokenVersion: 1,
      active: true,
    });

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.creatorUserId,
      action: 'USER_CREATED',
      resourceType: 'User',
      resourceId: user._id.toString(),
      details: { email: redactEmail(user.email), role: user.role },
    });

    return user;
  }

  static async login(params: {
    email: string;
    password: string;
    organisationSlug?: string;
  }): Promise<{ user: IUser; org: IOrganisation; token: string; refreshToken: string }> {
    const normalizedEmail = params.email.trim().toLowerCase();
    let query: any = { email: normalizedEmail };
    console.log(`[AUTH] Login attempt for email: '${redactEmail(normalizedEmail)}'${params.organisationSlug ? ` (Org Slug: '${params.organisationSlug}')` : ''}`);

    if (params.organisationSlug) {
      const org = await Organisation.findOne({ slug: params.organisationSlug.trim().toLowerCase() });
      if (!org) {
        console.warn(`[AUTH] Login failed: Specified organisation slug '${params.organisationSlug}' not found.`);
        const err: any = new Error('Organisation not found.');
        err.statusCode = 404;
        throw err;
      }
      query.organisationId = org._id;
    }

    const user = await User.findOne(query);
    if (!user) {
      console.warn(`[AUTH] Login failed: User account with email '${redactEmail(normalizedEmail)}' does not exist.`);
      const err: any = new Error('Invalid email or password credentials.');
      err.statusCode = 401;
      throw err;
    }

    if (!user.active) {
      console.warn(`[AUTH] Login failed: Account for '${redactEmail(normalizedEmail)}' is marked inactive.`);
      const err: any = new Error('This user account has been deactivated.');
      err.statusCode = 401;
      throw err;
    }

    // Google OAuth account check (no passwordHash exists)
    if (!user.passwordHash) {
      console.warn(`[AUTH] Login failed: User '${redactEmail(normalizedEmail)}' registered with Google OAuth and has no password configured.`);
      const err: any = new Error('This account was created using Google Sign-In. Please sign in with Google.');
      err.statusCode = 401;
      throw err;
    }

    const isMatch = await bcrypt.compare(params.password, user.passwordHash);
    if (!isMatch) {
      console.warn(`[AUTH] Login failed: Password mismatch for user '${redactEmail(normalizedEmail)}'.`);
      const err: any = new Error('Invalid email or password credentials.');
      err.statusCode = 401;
      throw err;
    }

    const org = await Organisation.findById(user.organisationId);
    if (!org) {
      console.warn(`[AUTH] Login failed: Organisation '${user.organisationId}' not found for user '${redactEmail(normalizedEmail)}'.`);
      const err: any = new Error('Associated tenant organisation not found.');
      err.statusCode = 404;
      throw err;
    }

    const isOwner = Boolean(user.role === 'owner' || (org.ownerId && org.ownerId.toString() === user._id.toString()));
    const token = this.generateToken(user, isOwner);
    const refreshToken = this.generateRefreshToken(user);
    console.log(`[AUTH] Login successful: User '${redactEmail(user.email)}' [${user.role}] in Org '${org.name}' (${org.slug})`);

    await logAuditEvent({
      organisationId: user.organisationId,
      userId: user._id,
      action: 'USER_LOGIN',
      resourceType: 'User',
      resourceId: user._id.toString(),
    });

    return { user, org, token, refreshToken };
  }

  static generateToken(user: IUser, isOwner?: boolean): string {
    return jwt.sign(
      {
        userId: user._id.toString(),
        organisationId: user.organisationId.toString(),
        role: user.role,
        email: user.email,
        permissions: user.permissions || [],
        isOwner: Boolean(isOwner || user.role === 'owner'),
      },
      env.JWT_SECRET,
      { expiresIn: (env.JWT_EXPIRES_IN || '24h') as any }
    );
  }

  static generateRefreshToken(user: IUser): string {
    const secret = env.JWT_REFRESH_SECRET || `${env.JWT_SECRET}-refresh`;
    return jwt.sign(
      {
        userId: user._id.toString(),
        tokenVersion: user.refreshTokenVersion || 1,
      },
      secret,
      { expiresIn: (env.JWT_REFRESH_EXPIRES_IN || '7d') as any }
    );
  }

  static async rotateRefreshToken(refreshToken: string): Promise<{
    token: string;
    refreshToken: string;
    user: IUser;
    org: IOrganisation;
  }> {
    const secret = env.JWT_REFRESH_SECRET || `${env.JWT_SECRET}-refresh`;
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, secret);
    } catch {
      const err: any = new Error('Invalid or expired refresh token. Please sign in again.');
      err.statusCode = 401;
      throw err;
    }

    if (!decoded.userId || typeof decoded.tokenVersion !== 'number') {
      const err: any = new Error('Malformed refresh token payload.');
      err.statusCode = 401;
      throw err;
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.active) {
      const err: any = new Error('User account not found or deactivated.');
      err.statusCode = 401;
      throw err;
    }

    const org = await Organisation.findById(user.organisationId);
    if (!org) {
      const err: any = new Error('Associated tenant organisation not found.');
      err.statusCode = 404;
      throw err;
    }

    const now = new Date();
    const graceExpiry = new Date(now.getTime() + 15 * 1000); // 15s window for concurrent tab requests

    // Case A: Atomic Primary Rotation (current active version matches tokenVersion)
    const rotatedUser = await User.findOneAndUpdate(
      {
        _id: decoded.userId,
        refreshTokenVersion: decoded.tokenVersion,
      },
      {
        $set: {
          previousRefreshTokenVersion: decoded.tokenVersion,
          previousVersionExpiresAt: graceExpiry,
        },
        $inc: { refreshTokenVersion: 1 },
      },
      { new: true }
    );

    if (rotatedUser) {
      const isOwner = Boolean(rotatedUser.role === 'owner' || (org.ownerId && org.ownerId.toString() === rotatedUser._id.toString()));
      const newToken = this.generateToken(rotatedUser, isOwner);
      const newRefreshToken = this.generateRefreshToken(rotatedUser);
      return { token: newToken, refreshToken: newRefreshToken, user: rotatedUser, org };
    }

    // Case B: Concurrent Multi-Tab In-Flight Request (matches immediately superseded version within 15s window)
    const reloadedUser = await User.findById(decoded.userId);
    if (
      reloadedUser &&
      reloadedUser.previousRefreshTokenVersion === decoded.tokenVersion &&
      reloadedUser.previousVersionExpiresAt &&
      reloadedUser.previousVersionExpiresAt > now
    ) {
      console.log(
        `[AUTH] Concurrent refresh flight window match for user '${redactEmail(reloadedUser.email)}' (re-issuing active version ${reloadedUser.refreshTokenVersion}).`
      );
      const isOwner = Boolean(reloadedUser.role === 'owner' || (org.ownerId && org.ownerId.toString() === reloadedUser._id.toString()));
      const synchronizedToken = this.generateToken(reloadedUser, isOwner);
      const synchronizedRefreshToken = this.generateRefreshToken(reloadedUser);
      return {
        token: synchronizedToken,
        refreshToken: synchronizedRefreshToken,
        user: reloadedUser,
        org,
      };
    }

    // Case C: Token Theft / Replay / Expired superseded token
    console.warn(
      `[AUTH SECURITY] Refresh token replay / theft detected for user '${redactEmail(user.email)}'! ` +
        `Presented version: ${decoded.tokenVersion}, Active version: ${user.refreshTokenVersion}. ` +
        `Revoking all user sessions.`
    );

    // Revoke all active sessions immediately
    await User.findByIdAndUpdate(decoded.userId, {
      $inc: { refreshTokenVersion: 5 },
      $unset: { previousRefreshTokenVersion: 1, previousVersionExpiresAt: 1 },
    });

    const err: any = new Error('Refresh token compromise or replay detected. All sessions revoked.');
    err.statusCode = 401;
    throw err;
  }

  static async revokeUserSessions(userId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, {
      $inc: { refreshTokenVersion: 1 },
      $unset: { previousRefreshTokenVersion: 1, previousVersionExpiresAt: 1 },
    });
    console.log(`[AUTH] Revoked all active sessions for userId: ${userId}`);
  }
}
