import request from 'supertest';
import app from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { Organisation } from '../src/models/Organisation';
import { User } from '../src/models/User';
import { Invitation } from '../src/models/Invitation';
import { AuditEvent } from '../src/models/AuditEvent';
import { AuthService } from '../src/services/auth.service';

describe('Phase 3: Organisation Management, Email Invitations & Granular RBAC', () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    await Organisation.deleteMany({});
    await User.deleteMany({});
    await Invitation.deleteMany({});
    await AuditEvent.deleteMany({});
  });

  afterAll(async () => {
    await disconnectDB();
  });

  // Helper to register an organisation and return owner credentials
  async function setupTestTenant(slug = 'acme-corp', orgName = 'Acme Corporation') {
    const regRes = await AuthService.registerOrgAndAdmin({
      orgName,
      orgSlug: slug,
      adminName: 'Owner Sarah',
      adminEmail: `owner@${slug}.com`,
      adminPassword: 'Password123!',
    });

    return {
      org: regRes.org,
      owner: regRes.user,
      ownerToken: regRes.token,
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Organisation Details & Settings
  // ---------------------------------------------------------------------------
  describe('Organisation Details & Settings', () => {
    it('allows an authenticated member to view organisation details and owner info', async () => {
      const { ownerToken, org, owner } = await setupTestTenant('details-corp', 'Details Corp');

      const res = await request(app)
        .get('/api/organisations/current')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Details Corp');
      expect(res.body.data.slug).toBe('details-corp');
      expect(res.body.data.memberCount).toBe(1);
      expect(res.body.data.owner.email).toBe(owner.email);
    });

    it('allows an authorized user to update organisation name and settings', async () => {
      const { ownerToken } = await setupTestTenant('settings-corp', 'Settings Corp');

      const res = await request(app)
        .patch('/api/organisations/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Settings Corp Global',
          settings: { allowPublicSubmissions: false, strictReviews: true },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Settings Corp Global');
      expect(res.body.data.settings.strictReviews).toBe(true);
    });

    it('rejects unauthenticated requests to organisation settings', async () => {
      const res = await request(app).get('/api/organisations/current');
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Email-Based Invitations
  // ---------------------------------------------------------------------------
  describe('Email-Based Invitations', () => {
    it('creates a time-limited single-use invitation token with pre-assigned role', async () => {
      const { ownerToken, org } = await setupTestTenant('invite-corp', 'Invite Corp');

      const res = await request(app)
        .post('/api/organisations/invitations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: 'editor.alice@invite-corp.com',
          role: 'editor',
          permissions: ['content:create', 'content:edit'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.inviteToken).toBeDefined();
      expect(res.body.data.inviteLink).toContain('/invite?token=');
      expect(res.body.data.invitation.email).toBe('editor.alice@invite-corp.com');
      expect(res.body.data.invitation.role).toBe('editor');
      expect(res.body.data.invitation.status).toBe('pending');

      // Verify token hash is stored rather than raw token
      const stored = await Invitation.findById(res.body.data.invitation._id);
      expect(stored?.tokenHash).toBeDefined();
      expect(stored?.tokenHash).not.toBe(res.body.data.inviteToken);
    });

    it('prevents duplicate pending invitations for the same email', async () => {
      const { ownerToken } = await setupTestTenant('dup-invite', 'Dup Invite Org');

      await request(app)
        .post('/api/organisations/invitations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: 'duplicate@test.com',
          role: 'reviewer',
        });

      const secondRes = await request(app)
        .post('/api/organisations/invitations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: 'duplicate@test.com',
          role: 'editor',
        });

      expect(secondRes.status).toBe(409);
      expect(secondRes.body.error.message).toContain('already exists');
    });

    it('prevents inviting someone with the Owner role directly', async () => {
      const { ownerToken } = await setupTestTenant('owner-invite', 'Owner Invite Org');

      const res = await request(app)
        .post('/api/organisations/invitations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: 'fakeowner@test.com',
          role: 'owner',
        });

      expect(res.status).toBe(400);
    });

    it('allows verifying an invitation token without consuming it', async () => {
      const { ownerToken } = await setupTestTenant('verify-org', 'Verify Org');

      const inviteRes = await request(app)
        .post('/api/organisations/invitations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: 'candidate@verify.com',
          role: 'brand_manager',
        });

      const token = inviteRes.body.data.inviteToken;

      const verifyRes = await request(app)
        .get('/api/organisations/invitations/verify')
        .query({ token });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.valid).toBe(true);
      expect(verifyRes.body.data.invitation.email).toBe('candidate@verify.com');
      expect(verifyRes.body.data.invitation.role).toBe('brand_manager');
      expect(verifyRes.body.data.invitation.organisationName).toBe('Verify Org');
    });

    it('allows revoking and resending an invitation', async () => {
      const { ownerToken } = await setupTestTenant('revoke-org', 'Revoke Org');

      const createRes = await request(app)
        .post('/api/organisations/invitations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: 'revokeme@test.com',
          role: 'editor',
        });

      const inviteId = createRes.body.data.invitation._id;

      // Revoke
      const revokeRes = await request(app)
        .delete(`/api/organisations/invitations/${inviteId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.data.invitation.status).toBe('revoked');

      // Resend
      const resendRes = await request(app)
        .post(`/api/organisations/invitations/${inviteId}/resend`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(resendRes.status).toBe(200);
      expect(resendRes.body.data.invitation.status).toBe('pending');
      expect(resendRes.body.data.inviteToken).toBeDefined();
    });

    it('allows a new user to accept an invitation and register into the organization', async () => {
      const { ownerToken, org } = await setupTestTenant('accept-new', 'Accept New Org');

      const createRes = await request(app)
        .post('/api/organisations/invitations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: 'newuser@accept-new.com',
          role: 'editor',
        });

      const token = createRes.body.data.inviteToken;

      const acceptRes = await request(app)
        .post('/api/organisations/invitations/accept')
        .send({
          token,
          name: 'New Bob',
          password: 'Password1234!',
        });

      expect(acceptRes.status).toBe(201);
      expect(acceptRes.body.success).toBe(true);
      expect(acceptRes.body.data.isNewAccount).toBe(true);
      expect(acceptRes.body.data.user.email).toBe('newuser@accept-new.com');
      expect(acceptRes.body.data.user.role).toBe('editor');
      expect(acceptRes.body.data.user.organisationId).toBe(org._id.toString());

      // Attempting to accept a second time should fail (single-use)
      const secondAccept = await request(app)
        .post('/api/organisations/invitations/accept')
        .send({
          token,
          name: 'New Bob',
          password: 'Password1234!',
        });

      expect(secondAccept.status).toBe(400);
    });

    it('enforces email matching when an authenticated user accepts an invitation', async () => {
      const { ownerToken } = await setupTestTenant('mismatch-org', 'Mismatch Org');

      // Create an invitation for bob@test.com
      const createRes = await request(app)
        .post('/api/organisations/invitations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: 'bob@test.com',
          role: 'reviewer',
        });

      const token = createRes.body.data.inviteToken;

      // Create a different user (charlie@test.com)
      const { ownerToken: charlieToken } = await setupTestTenant('charlie-org', 'Charlie Org');

      // Charlie tries to accept Bob's invitation
      const acceptRes = await request(app)
        .post('/api/organisations/invitations/accept')
        .set('Authorization', `Bearer ${charlieToken}`)
        .send({ token });

      expect(acceptRes.status).toBe(403);
      expect(acceptRes.body.error.code).toBe('EMAIL_MISMATCH');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Member Management & Role Hierarchy Enforcement
  // ---------------------------------------------------------------------------
  describe('Member Management & Role Hierarchy Enforcement', () => {
    it('lists all members with their computed role and ownership flag', async () => {
      const { ownerToken, org, owner } = await setupTestTenant('members-org', 'Members Org');

      // Add another user
      await AuthService.createUserInOrg({
        organisationId: org._id.toString(),
        name: 'Member Dan',
        email: 'dan@members.com',
        password: 'Password123!',
        role: 'reviewer',
        creatorUserId: owner._id.toString(),
      });

      const res = await request(app)
        .get('/api/organisations/members')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.members).toHaveLength(2);

      const ownerMember = res.body.data.members.find((m: any) => m.email === owner.email);
      const regularMember = res.body.data.members.find((m: any) => m.email === 'dan@members.com');

      expect(ownerMember.isOwner).toBe(true);
      expect(regularMember.isOwner).toBe(false);
      expect(regularMember.role).toBe('reviewer');
    });

    it('enforces role hierarchy: owner can assign admin, but non-owners cannot assign admin', async () => {
      const { ownerToken, org, owner } = await setupTestTenant('hierarchy-org', 'Hierarchy Org');

      // Create an admin user and an editor user
      const adminUser = await AuthService.createUserInOrg({
        organisationId: org._id.toString(),
        name: 'Admin Dave',
        email: 'admin.dave@hierarchy.com',
        password: 'Password123!',
        role: 'admin',
        creatorUserId: owner._id.toString(),
      });

      const editorUser = await AuthService.createUserInOrg({
        organisationId: org._id.toString(),
        name: 'Editor Eve',
        email: 'editor.eve@hierarchy.com',
        password: 'Password123!',
        role: 'editor',
        creatorUserId: owner._id.toString(),
      });

      const adminLogin = await AuthService.login({
        email: 'admin.dave@hierarchy.com',
        password: 'Password123!',
      });
      const adminToken = adminLogin.token;

      // 1. Non-owner (Admin Dave) tries to promote Editor Eve to Admin -> Must be rejected (403)
      const adminPromoteRes = await request(app)
        .patch(`/api/organisations/members/${editorUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'admin' });

      expect(adminPromoteRes.status).toBe(403);
      expect(adminPromoteRes.body.error.message).toContain('Only organization owners can assign');

      // 2. Owner promotes Editor Eve to Admin -> Succeeds (200)
      const ownerPromoteRes = await request(app)
        .patch(`/api/organisations/members/${editorUser._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'admin' });

      expect(ownerPromoteRes.status).toBe(200);
      expect(ownerPromoteRes.body.data.member.role).toBe('admin');
    });

    it('protects the organisation owner: cannot remove or demote the owner', async () => {
      const { ownerToken, org, owner } = await setupTestTenant('owner-protect', 'Owner Protect Org');

      const adminUser = await AuthService.createUserInOrg({
        organisationId: org._id.toString(),
        name: 'Admin Arthur',
        email: 'arthur@protect.com',
        password: 'Password123!',
        role: 'admin',
        creatorUserId: owner._id.toString(),
      });

      const adminLogin = await AuthService.login({
        email: 'arthur@protect.com',
        password: 'Password123!',
      });
      const adminToken = adminLogin.token;

      // Admin tries to remove owner -> Rejected (403)
      const removeOwnerRes = await request(app)
        .delete(`/api/organisations/members/${owner._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(removeOwnerRes.status).toBe(403);
      expect(removeOwnerRes.body.error.message).toContain('Cannot remove the organization owner');

      // Admin tries to demote owner -> Rejected (403)
      const demoteOwnerRes = await request(app)
        .patch(`/api/organisations/members/${owner._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'reviewer' });

      expect(demoteOwnerRes.status).toBe(403);
      expect(demoteOwnerRes.body.error.message).toContain('Cannot modify the organization owner');
    });

    it('prevents users from modifying their own roles', async () => {
      const { ownerToken, owner } = await setupTestTenant('self-mod', 'Self Mod Org');

      const res = await request(app)
        .patch(`/api/organisations/members/${owner._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'editor' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('cannot modify their own role');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Ownership Transfer
  // ---------------------------------------------------------------------------
  describe('Ownership Transfer', () => {
    it('allows current owner to transfer ownership with confirmation', async () => {
      const { ownerToken, org, owner } = await setupTestTenant('transfer-corp', 'Transfer Corp');

      const successor = await AuthService.createUserInOrg({
        organisationId: org._id.toString(),
        name: 'Successor Sam',
        email: 'sam@transfer.com',
        password: 'Password123!',
        role: 'admin',
        creatorUserId: owner._id.toString(),
      });

      const transferRes = await request(app)
        .post('/api/organisations/transfer-ownership')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          newOwnerId: successor._id.toString(),
          confirmation: 'CONFIRM_TRANSFER',
        });

      expect(transferRes.status).toBe(200);
      expect(transferRes.body.success).toBe(true);

      // Verify organisation ownerId updated in DB
      const updatedOrg = await Organisation.findById(org._id);
      expect(updatedOrg?.ownerId?.toString()).toBe(successor._id.toString());

      // Verify member roles updated
      const updatedSuccessor = await User.findById(successor._id);
      expect(updatedSuccessor?.role).toBe('owner');

      const updatedPrevious = await User.findById(owner._id);
      expect(updatedPrevious?.role).toBe('admin');
    });

    it('rejects transfer without explicit CONFIRM_TRANSFER string', async () => {
      const { ownerToken, org, owner } = await setupTestTenant('no-confirm', 'No Confirm Org');

      const successor = await AuthService.createUserInOrg({
        organisationId: org._id.toString(),
        name: 'Successor Sam',
        email: 'sam2@transfer.com',
        password: 'Password123!',
        role: 'admin',
        creatorUserId: owner._id.toString(),
      });

      const res = await request(app)
        .post('/api/organisations/transfer-ownership')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          newOwnerId: successor._id.toString(),
          confirmation: 'WRONG',
        });

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Tenant Isolation
  // ---------------------------------------------------------------------------
  describe('Tenant Isolation Safeguards', () => {
    it('guarantees tenant isolation: members of Org A cannot see or modify members of Org B', async () => {
      const tenantA = await setupTestTenant('tenant-a', 'Tenant A');
      const tenantB = await setupTestTenant('tenant-b', 'Tenant B');

      // Tenant A tries to list Tenant B's members (scoped to token's org)
      const listRes = await request(app)
        .get('/api/organisations/members')
        .set('Authorization', `Bearer ${tenantA.ownerToken}`);

      expect(listRes.status).toBe(200);
      const emails = listRes.body.data.members.map((m: any) => m.email);
      expect(emails).toContain(tenantA.owner.email);
      expect(emails).not.toContain(tenantB.owner.email);

      // Tenant A tries to delete Tenant B's owner
      const deleteRes = await request(app)
        .delete(`/api/organisations/members/${tenantB.owner._id}`)
        .set('Authorization', `Bearer ${tenantA.ownerToken}`);

      expect(deleteRes.status).toBe(404); // Scoped to tenant A, so B's user is not found
    });
  });
});
