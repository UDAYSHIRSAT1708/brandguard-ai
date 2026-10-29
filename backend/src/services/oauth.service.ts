import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User, IUser } from '../models/User';
import { Organisation, IOrganisation } from '../models/Organisation';
import { OAuthNonce } from '../models/OAuthNonce';
import { logAuditEvent } from './audit.service';
import { redactEmail } from '../utils/redact';
import { AuthService } from './auth.service';

export interface OAuthStatePayload {
  nonce: string;
  intent: 'login' | 'register' | 'link';
  redirectUri: string;
  codeChallenge?: string;
  createdAt: number;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
}

export class OAuthService {
  public static oauth2ClientOverride: OAuth2Client | null = null;

  private static getOAuthClient(redirectUri?: string): OAuth2Client {
    if (this.oauth2ClientOverride) {
      return this.oauth2ClientOverride;
    }
    return new OAuth2Client({
      clientId: env.GOOGLE_CLIENT_ID || 'mock-google-client-id',
      clientSecret: env.GOOGLE_CLIENT_SECRET || 'mock-google-client-secret',
      redirectUri: redirectUri || env.GOOGLE_REDIRECT_URI || `${env.FRONTEND_URL}/auth/callback`,
    });
  }

  static generateStateToken(params?: {
    intent?: 'login' | 'register' | 'link';
    redirectUri?: string;
    codeChallenge?: string;
  }): string {
    const nonce = crypto.randomBytes(24).toString('hex');
    const payload: OAuthStatePayload = {
      nonce,
      intent: params?.intent || 'login',
      redirectUri: params?.redirectUri || env.GOOGLE_REDIRECT_URI || `${env.FRONTEND_URL}/auth/callback`,
      codeChallenge: params?.codeChallenge,
      createdAt: Date.now(),
    };
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
  }

  /**
   * Validates OAuth state token and enforces atomic distributed nonce replay protection
   * using MongoDB TTL unique index.
   */
  static async validateStateToken(stateToken: string): Promise<OAuthStatePayload> {
    if (!stateToken || typeof stateToken !== 'string') {
      const err: any = new Error('OAuth state parameter is missing.');
      err.statusCode = 400;
      throw err;
    }

    let decoded: OAuthStatePayload;
    try {
      decoded = jwt.verify(stateToken, env.JWT_SECRET) as OAuthStatePayload;
    } catch (err: any) {
      const error: any = new Error(`Invalid or expired OAuth state parameter: ${err.message}`);
      error.statusCode = 400;
      throw error;
    }

    if (!decoded || !decoded.nonce) {
      const err: any = new Error('Malformed OAuth state parameter (missing nonce).');
      err.statusCode = 400;
      throw err;
    }

    // Atomic Distributed Serverless Nonce Replay Check via MongoDB
    try {
      await OAuthNonce.create({ nonce: decoded.nonce });
    } catch (err: any) {
      // E11000 duplicate key error means this nonce was already consumed (either concurrently or previously)
      if (
        err.code === 11000 ||
        err.name === 'MongoServerError' ||
        (err.message && err.message.includes('E11000'))
      ) {
        console.warn(`[AUTH OAUTH] OAuth state replay detected for nonce: ${decoded.nonce.slice(0, 8)}...`);
        const replayErr: any = new Error('OAuth state has already been consumed (replay detected).');
        replayErr.statusCode = 400;
        throw replayErr;
      }
      throw err;
    }

    return decoded;
  }

  static generateAuthUrl(params: {
    redirectUri?: string;
    state?: string;
    codeChallenge?: string;
    intent?: 'login' | 'register' | 'link';
  }): { authUrl: string; state: string; clientId: string } {
    const state =
      params.state ||
      this.generateStateToken({
        intent: params.intent,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
      });
    const redirect = params.redirectUri || env.GOOGLE_REDIRECT_URI || `${env.FRONTEND_URL}/auth/callback`;

    const client = this.getOAuthClient(redirect);
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      state,
      code_challenge: params.codeChallenge,
      code_challenge_method: params.codeChallenge ? CodeChallengeMethod.S256 : undefined,
      prompt: 'select_account',
    });

    return {
      authUrl,
      state,
      clientId: env.GOOGLE_CLIENT_ID,
    };
  }

  static async exchangeCodeForGoogleProfile(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<GoogleProfile> {
    const client = this.getOAuthClient(params.redirectUri);

    try {
      // Exchange authorization code for tokens with PKCE code_verifier
      const tokenResponse = await client.getToken({
        code: params.code,
        codeVerifier: params.codeVerifier,
      });

      const { id_token } = tokenResponse.tokens;
      if (!id_token) {
        throw new Error('Google did not return an id_token in the token response.');
      }

      return await this.verifyIdToken(id_token, client);
    } catch (err: any) {
      console.warn('[AUTH OAUTH] Google code exchange failed:', err.message);
      const error: any = new Error(`Google authorization code exchange failed: ${err.message}`);
      error.statusCode = 401;
      throw error;
    }
  }

  static async verifyIdToken(idToken: string, customClient?: OAuth2Client): Promise<GoogleProfile> {
    const client = customClient || this.getOAuthClient();

    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID || undefined,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new Error('Empty payload returned from Google ID token.');
      }

      // Check required claims: issuer, email_verified, expiration
      const issuer = payload.iss;
      if (issuer !== 'accounts.google.com' && issuer !== 'https://accounts.google.com') {
        throw new Error(`Untrusted token issuer: ${issuer}`);
      }

      if (!payload.email_verified) {
        throw new Error('Google account email has not been verified by Google.');
      }

      if (!payload.sub || !payload.email) {
        throw new Error('Required identity claims (sub, email) missing from Google token.');
      }

      return {
        googleId: payload.sub,
        email: payload.email.trim().toLowerCase(),
        name: payload.name || payload.email,
        picture: payload.picture,
        emailVerified: Boolean(payload.email_verified),
      };
    } catch (err: any) {
      console.warn('[AUTH OAUTH] Google ID token verification failed:', err.message);
      const error: any = new Error(`Google identity token verification failed: ${err.message}`);
      error.statusCode = 401;
      throw error;
    }
  }

  static async handleGoogleAuthCallback(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    state: string;
    orgName?: string;
    orgSlug?: string;
    currentUserId?: string;
  }): Promise<{
    user: IUser;
    org: IOrganisation;
    token: string;
    refreshToken: string;
    isNewAccount?: boolean;
    isLinked?: boolean;
  }> {
    // 1. Mandatory state parameter validation
    if (!params.state || typeof params.state !== 'string') {
      const err: any = new Error('OAuth state parameter is required.');
      err.statusCode = 400;
      throw err;
    }
    const statePayload = await this.validateStateToken(params.state);

    // 2. Mandatory code and PKCE codeVerifier validation
    if (!params.code || typeof params.code !== 'string') {
      const err: any = new Error('Authorization code is required.');
      err.statusCode = 400;
      throw err;
    }
    if (!params.codeVerifier || typeof params.codeVerifier !== 'string') {
      const err: any = new Error('PKCE codeVerifier is required.');
      err.statusCode = 400;
      throw err;
    }
    if (params.codeVerifier.length < 43 || params.codeVerifier.length > 128) {
      const err: any = new Error('PKCE codeVerifier must be between 43 and 128 characters.');
      err.statusCode = 400;
      throw err;
    }

    // 3. Cryptographic binding check: if state was issued with codeChallenge, assert codeVerifier matches it
    if (statePayload.codeChallenge) {
      const derivedChallenge = crypto
        .createHash('sha256')
        .update(params.codeVerifier)
        .digest('base64url');
      if (derivedChallenge !== statePayload.codeChallenge) {
        console.warn('[AUTH OAUTH] PKCE verifier mismatch against state-bound challenge.');
        const err: any = new Error('PKCE codeVerifier does not match the challenge bound to this OAuth state.');
        err.statusCode = 400;
        throw err;
      }
    }

    // 4. Exchange code for Google profile
    let profile: GoogleProfile;
    try {
      profile = await this.exchangeCodeForGoogleProfile({
        code: params.code,
        codeVerifier: params.codeVerifier,
        redirectUri: params.redirectUri,
      });
    } catch (err: any) {
      if (!err.statusCode) err.statusCode = 401;
      throw err;
    }

    const normalizedEmail = profile.email;
    console.log(`[AUTH OAUTH] Processing Google OAuth for: ${redactEmail(normalizedEmail)} (sub: ${profile.googleId})`);

    // 5. Check if user already exists with this googleId
    const existingGoogleUser = await User.findOne({ googleId: profile.googleId });
    if (existingGoogleUser) {
      if (!existingGoogleUser.active) {
        console.warn(`[AUTH OAUTH] Deactivated user attempted login: ${redactEmail(normalizedEmail)}`);
        const err: any = new Error('This user account has been deactivated.');
        err.statusCode = 401;
        throw err;
      }

      const org = await Organisation.findById(existingGoogleUser.organisationId);
      if (!org) {
        const err: any = new Error('Associated tenant organisation not found.');
        err.statusCode = 404;
        throw err;
      }

      const token = AuthService.generateToken(existingGoogleUser);
      const refreshToken = AuthService.generateRefreshToken(existingGoogleUser);

      await logAuditEvent({
        organisationId: existingGoogleUser.organisationId,
        userId: existingGoogleUser._id,
        action: 'USER_LOGIN_GOOGLE',
        resourceType: 'User',
        resourceId: existingGoogleUser._id.toString(),
      });

      console.log(`[AUTH OAUTH] Login successful: User '${redactEmail(existingGoogleUser.email)}' [${existingGoogleUser.role}] in Org '${org.name}'`);
      return { user: existingGoogleUser, org, token, refreshToken };
    }

    // 6. Check if a user with this email exists (without matching googleId)
    const existingEmailUser = await User.findOne({ email: normalizedEmail });
    if (existingEmailUser) {
      // Safe Account Linking Policy:
      // If the request was triggered by an already authenticated user, link it!
      if (params.currentUserId && existingEmailUser._id.toString() === params.currentUserId) {
        existingEmailUser.googleId = profile.googleId;
        if (profile.picture && !existingEmailUser.avatarUrl) {
          existingEmailUser.avatarUrl = profile.picture;
        }
        await existingEmailUser.save();

        const org = await Organisation.findById(existingEmailUser.organisationId);
        if (!org) throw new Error('Associated organisation not found');

        const token = AuthService.generateToken(existingEmailUser);
        const refreshToken = AuthService.generateRefreshToken(existingEmailUser);

        await logAuditEvent({
          organisationId: existingEmailUser.organisationId,
          userId: existingEmailUser._id,
          action: 'OAUTH_ACCOUNT_LINKED',
          resourceType: 'User',
          resourceId: existingEmailUser._id.toString(),
          details: { provider: 'google', email: redactEmail(normalizedEmail) },
        });

        console.log(`[AUTH OAUTH] Linked Google account for user: ${redactEmail(normalizedEmail)}`);
        return { user: existingEmailUser, org, token, refreshToken, isLinked: true };
      }

      // If user is NOT authenticated, DO NOT automatically merge accounts solely because emails match!
      console.warn(`[AUTH OAUTH] Unlinked existing account found for email: ${redactEmail(normalizedEmail)}. Blocking automatic merge.`);
      const err: any = new Error(
        'An account with this email address already exists with password authentication. Please sign in with your email and password first, then link Google Sign-In under Settings.'
      );
      err.code = 'ACCOUNT_EXISTS_PASSWORD';
      err.statusCode = 409;
      throw err;
    }

    // 7. User does not exist at all in BrandGuard
    // Only permit registration if explicit organisation details are supplied AND public registration is enabled
    if (params.orgName && params.orgSlug) {
      if (!env.ALLOW_PUBLIC_REGISTRATION) {
        const err: any = new Error('Public organization self-registration is disabled on this server. Contact your system administrator.');
        err.statusCode = 403;
        throw err;
      }

      const normalizedSlug = params.orgSlug.trim().toLowerCase();
      const existingOrg = await Organisation.findOne({ slug: normalizedSlug });
      if (existingOrg) {
        const err: any = new Error(`Organisation slug '${params.orgSlug}' is already in use.`);
        err.statusCode = 409;
        throw err;
      }

      // Create new organisation
      const org = await Organisation.create({
        name: params.orgName.trim(),
        slug: normalizedSlug,
      });

      // Create initial administrator user
      const newUser = await User.create({
        organisationId: org._id,
        name: profile.name,
        email: normalizedEmail,
        googleId: profile.googleId,
        authProvider: 'google',
        avatarUrl: profile.picture || undefined,
        role: 'admin',
        active: true,
      });

      const token = AuthService.generateToken(newUser);
      const refreshToken = AuthService.generateRefreshToken(newUser);

      await logAuditEvent({
        organisationId: org._id,
        userId: newUser._id,
        action: 'ORGANISATION_REGISTERED_OAUTH',
        resourceType: 'Organisation',
        resourceId: org._id.toString(),
        details: { orgName: org.name, provider: 'google' },
      });

      console.log(`[AUTH OAUTH] Registered new organisation '${org.name}' with Google admin: ${redactEmail(newUser.email)}`);
      return { user: newUser, org, token, refreshToken, isNewAccount: true };
    }

    // New user with no existing account and no registration payload -> Do not grant access
    console.warn(`[AUTH OAUTH] Unknown Google user attempted sign in without an invitation or registration: ${redactEmail(normalizedEmail)}`);
    const err: any = new Error(
      'No BrandGuard account is associated with this Google identity. Please contact your organization administrator for an invitation, or register a new organization.'
    );
    err.code = 'NO_ACCOUNT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  static async linkGoogleAccountToUser(params: {
    userId: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
    state: string;
  }): Promise<{ user: IUser }> {
    // 1. Mandatory state validation
    if (!params.state || typeof params.state !== 'string') {
      const err: any = new Error('OAuth state parameter is required.');
      err.statusCode = 400;
      throw err;
    }
    const statePayload = await this.validateStateToken(params.state);

    // 2. Mandatory PKCE validation
    if (!params.code || !params.codeVerifier) {
      const err: any = new Error('Both authorization code and PKCE codeVerifier are required.');
      err.statusCode = 400;
      throw err;
    }

    if (statePayload.codeChallenge) {
      const derivedChallenge = crypto
        .createHash('sha256')
        .update(params.codeVerifier)
        .digest('base64url');
      if (derivedChallenge !== statePayload.codeChallenge) {
        const err: any = new Error('PKCE codeVerifier does not match the challenge bound to this OAuth state.');
        err.statusCode = 400;
        throw err;
      }
    }

    // 3. User verification
    const user = await User.findById(params.userId);
    if (!user) {
      const err: any = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }

    // 4. Exchange code for Google profile
    const profile = await this.exchangeCodeForGoogleProfile({
      code: params.code,
      codeVerifier: params.codeVerifier,
      redirectUri: params.redirectUri,
    });

    // 5. Strict Email Policy: The Google account email MUST match the user's BrandGuard account email
    if (profile.email.toLowerCase() !== user.email.toLowerCase()) {
      console.warn(
        `[AUTH OAUTH] Account linking email mismatch: Google '${redactEmail(profile.email)}' vs BrandGuard '${redactEmail(user.email)}'`
      );
      const err: any = new Error(
        `The Google account email (${redactEmail(profile.email)}) does not match your BrandGuard account email (${redactEmail(user.email)}). Account linking requires matching verified email addresses.`
      );
      err.statusCode = 400;
      throw err;
    }

    if (!profile.emailVerified) {
      const err: any = new Error('Google account email has not been verified by Google.');
      err.statusCode = 400;
      throw err;
    }

    // 6. Check if this googleId is already linked to ANOTHER user
    const conflictUser = await User.findOne({ googleId: profile.googleId });
    if (conflictUser && conflictUser._id.toString() !== params.userId) {
      const err: any = new Error('This Google account is already linked to another BrandGuard user.');
      err.statusCode = 409;
      throw err;
    }

    user.googleId = profile.googleId;
    if (profile.picture && !user.avatarUrl) {
      user.avatarUrl = profile.picture;
    }
    await user.save();

    await logAuditEvent({
      organisationId: user.organisationId,
      userId: user._id,
      action: 'OAUTH_ACCOUNT_LINKED',
      resourceType: 'User',
      resourceId: user._id.toString(),
      details: { provider: 'google', email: redactEmail(profile.email) },
    });

    console.log(`[AUTH OAUTH] Google account linked successfully for user: ${redactEmail(user.email)}`);
    return { user };
  }

  static async unlinkGoogleAccount(userId: string): Promise<{ user: IUser }> {
    const user = await User.findById(userId);
    if (!user) {
      const err: any = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }

    // Guardrail: if user has no passwordHash, unlinking Google would lock them out completely
    if (!user.passwordHash) {
      const err: any = new Error(
        'You cannot disconnect Google Sign-In because no password is set on this account. Set a password first before unlinking.'
      );
      err.statusCode = 400;
      throw err;
    }

    user.googleId = undefined;
    if (user.authProvider === 'google') {
      user.authProvider = 'local';
    }
    await user.save();

    await logAuditEvent({
      organisationId: user.organisationId,
      userId: user._id,
      action: 'OAUTH_ACCOUNT_UNLINKED',
      resourceType: 'User',
      resourceId: user._id.toString(),
      details: { provider: 'google' },
    });

    console.log(`[AUTH OAUTH] Google account unlinked for user: ${redactEmail(user.email)}`);
    return { user };
  }
}
