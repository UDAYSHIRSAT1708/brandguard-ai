import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, IUser, UserRole } from '../models/User';
import { Organisation, IOrganisation } from '../models/Organisation';
import { env } from '../config/env';
import { logAuditEvent } from './audit.service';

export class AuthService {
  static async registerOrgAndAdmin(params: {
    orgName: string;
    orgSlug: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  }): Promise<{ user: IUser; org: IOrganisation; token: string }> {
    const normalizedEmail = params.adminEmail.trim().toLowerCase();
    const normalizedSlug = params.orgSlug.trim().toLowerCase();
    const trimmedOrgName = params.orgName.trim();
    const trimmedAdminName = params.adminName.trim();

    console.log(`[AUTH] Registration attempt: Org '${trimmedOrgName}' (${normalizedSlug}), Admin: '${normalizedEmail}'`);

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
      console.warn(`[AUTH] Registration conflict: User email '${normalizedEmail}' already exists.`);
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
        active: true,
      });
    } catch (createErr) {
      // Compensating action: cleanup created organization if user creation fails
      console.error(`[AUTH] Registration rollback: Cleaning up org '${org._id}' due to user creation failure.`);
      await Organisation.findByIdAndDelete(org._id);
      throw createErr;
    }

    // 6. Generate JWT token
    const token = this.generateToken(user);
    console.log(`[AUTH] Registration successful: Org '${org.name}' (${org.slug}), Admin User: '${user.email}' [${user.role}]`);

    await logAuditEvent({
      organisationId: org._id,
      userId: user._id,
      action: 'ORGANISATION_REGISTERED',
      resourceType: 'Organisation',
      resourceId: org._id.toString(),
      details: { orgName: org.name, adminEmail: user.email },
    });

    return { user, org, token };
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
      active: true,
    });

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.creatorUserId,
      action: 'USER_CREATED',
      resourceType: 'User',
      resourceId: user._id.toString(),
      details: { email: user.email, role: user.role },
    });

    return user;
  }

  static async login(params: {
    email: string;
    password: string;
    organisationSlug?: string;
  }): Promise<{ user: IUser; org: IOrganisation; token: string }> {
    const normalizedEmail = params.email.trim().toLowerCase();
    let query: any = { email: normalizedEmail };
    console.log(`[AUTH] Login attempt for email: '${normalizedEmail}'${params.organisationSlug ? ` (Org Slug: '${params.organisationSlug}')` : ''}`);

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
      console.warn(`[AUTH] Login failed: User account with email '${normalizedEmail}' does not exist.`);
      const err: any = new Error('Invalid email or password credentials.');
      err.statusCode = 401;
      throw err;
    }

    if (!user.active) {
      console.warn(`[AUTH] Login failed: Account for '${normalizedEmail}' is marked inactive.`);
      const err: any = new Error('This user account has been deactivated.');
      err.statusCode = 401;
      throw err;
    }

    const isMatch = await bcrypt.compare(params.password, user.passwordHash);
    if (!isMatch) {
      console.warn(`[AUTH] Login failed: Password mismatch for user '${normalizedEmail}'.`);
      const err: any = new Error('Invalid email or password credentials.');
      err.statusCode = 401;
      throw err;
    }

    const org = await Organisation.findById(user.organisationId);
    if (!org) {
      console.warn(`[AUTH] Login failed: Organisation '${user.organisationId}' not found for user '${normalizedEmail}'.`);
      const err: any = new Error('Associated tenant organisation not found.');
      err.statusCode = 404;
      throw err;
    }

    const token = this.generateToken(user);
    console.log(`[AUTH] Login successful: User '${user.email}' [${user.role}] in Org '${org.name}' (${org.slug})`);

    await logAuditEvent({
      organisationId: user.organisationId,
      userId: user._id,
      action: 'USER_LOGIN',
      resourceType: 'User',
      resourceId: user._id.toString(),
    });

    return { user, org, token };
  }

  static generateToken(user: IUser): string {
    return jwt.sign(
      {
        userId: user._id.toString(),
        organisationId: user.organisationId.toString(),
        role: user.role,
        email: user.email,
      },
      env.JWT_SECRET,
      { expiresIn: '24h' }
    );
  }
}
