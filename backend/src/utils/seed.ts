import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../config/db';
import { env } from '../config/env';
import { Organisation } from '../models/Organisation';
import { User, UserRole } from '../models/User';
import { KnowledgeSource } from '../models/KnowledgeSource';
import { Content } from '../models/Content';
import { ContentVersion } from '../models/ContentVersion';
import { AuditEvent } from '../models/AuditEvent';

/**
 * Safe, Idempotent Development Demo Seeding Script
 * 
 * STRICTLY FOR LOCAL DEVELOPMENT AND DEMONSTRATION.
 * NON-DESTRUCTIVE: Never wipes customer data or deletes existing collections.
 * Idempotently creates or syncs the 3 demo role accounts and baseline brand knowledge.
 */
export async function seedDatabase() {
  if (process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production') {
    console.error('❌ FATAL: Demo seed script is strictly prohibited from running in production mode!');
    console.error('To bootstrap a genuine production administrator, run: npm run bootstrap:admin');
    throw new Error('Demo seeding prohibited in production.');
  }

  console.log('🌱 Syncing Non-Production BrandGuard AI Demo Environment (Safe & Idempotent)...');
  await connectDB();

  // 1. Safe Find-or-Create Demo Organisation
  let org = await Organisation.findOne({ slug: 'acme-global' });
  if (!org) {
    org = await Organisation.create({
      name: 'Acme Global Corporation',
      slug: 'acme-global',
    });
    console.log('  ✅ Created Demo Organisation: Acme Global Corporation (acme-global)');
  } else {
    console.log('  ℹ️ Demo Organisation already exists: Acme Global Corporation');
  }

  // 2. Safe Find-or-Update Demo Users (3 Roles)
  const demoUsers: Array<{
    name: string;
    email: string;
    password: string;
    role: UserRole;
  }> = [
    {
      name: 'Sarah Chen (Admin)',
      email: 'admin@acme-demo.com',
      password: 'DemoAdmin2026!',
      role: 'admin',
    },
    {
      name: 'Alex Rivera (Content Creator)',
      email: 'creator@acme-demo.com',
      password: 'DemoCreator2026!',
      role: 'creator',
    },
    {
      name: 'Marcus Vance (Brand Reviewer)',
      email: 'reviewer@acme-demo.com',
      password: 'DemoReviewer2026!',
      role: 'reviewer',
    },
  ];

  const userInstances: Record<string, any> = {};

  for (const u of demoUsers) {
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(u.password, salt);

    let existing = await User.findOne({ email: u.email.toLowerCase() });
    if (!existing) {
      existing = await User.create({
        organisationId: org._id,
        name: u.name,
        email: u.email.toLowerCase(),
        passwordHash,
        role: u.role,
        active: true,
      });
      console.log(`  ✅ Created Demo User: ${u.email} [${u.role}]`);
    } else {
      // Sync password hash and role to guarantee valid credentials
      existing.passwordHash = passwordHash;
      existing.role = u.role;
      existing.active = true;
      existing.organisationId = org._id;
      await existing.save();
      console.log(`  ℹ️ Synced Demo User credentials: ${u.email} [${u.role}]`);
    }
    userInstances[u.role] = existing;
  }

  // 3. Safe Populate Approved Knowledge Guidelines
  const sourcesData = [
    {
      title: 'Prohibition of Absolute Guarantees',
      sourceType: 'guideline' as const,
      status: 'approved' as const,
      content: 'Absolute performance guarantees are strictly prohibited across all marketing and product copy. All claims must be verifiable by documented benchmark tests.',
      productScope: 'Global',
    },
    {
      title: 'Q3 Independent Accuracy Benchmark',
      sourceType: 'fact' as const,
      status: 'approved' as const,
      content: 'Product accuracy was 94% in Test A under documented test conditions (Q3 2026).',
      productScope: 'Core Platform',
    },
    {
      title: 'Customer Satisfaction Score',
      sourceType: 'fact' as const,
      status: 'approved' as const,
      content: 'Customer satisfaction rating is 4.7/5.0 based on 2,500 survey responses (Q2 2026).',
      productScope: 'Global',
    },
    {
      title: 'Prohibited Absolutes & Hyperbole',
      sourceType: 'prohibited_phrase' as const,
      status: 'approved' as const,
      content: '100% guaranteed, never fails, zero defects, flawless execution',
      productScope: 'Global',
    },
    {
      title: 'Formal Client Terminology Standard',
      sourceType: 'terminology' as const,
      status: 'approved' as const,
      content: 'In formal communications, the preferred terminology is "clients" rather than "customers".',
      productScope: 'Global',
    },
    {
      title: 'Mandatory Performance Disclaimer',
      sourceType: 'disclaimer' as const,
      status: 'approved' as const,
      content: 'All performance figures are based on controlled test conditions and may vary depending on network topology.',
      productScope: 'Global',
    },
  ];

  let sourcesAdded = 0;
  for (const src of sourcesData) {
    const existing = await KnowledgeSource.findOne({
      organisationId: org._id,
      title: src.title,
    });
    if (!existing) {
      await KnowledgeSource.create({
        ...src,
        organisationId: org._id,
        uploadedBy: userInstances.admin._id,
        approvedBy: userInstances.admin._id,
        version: 1,
      });
      sourcesAdded++;
    }
  }
  console.log(`  ✅ Knowledge Guidelines: ${sourcesAdded} added, ${sourcesData.length - sourcesAdded} already up to date.`);

  // 4. Safe Populate Initial Content Drafts (Website & Emails)
  const sampleContents = [
    {
      title: 'Enterprise Q4 Cloud Infrastructure Announcement',
      contentType: 'website' as const,
      body: 'BrandGuard AI guarantees 100% accuracy for every customer. It never fails.',
      status: 'NEEDS_REVISION' as const,
    },
    {
      title: 'Q4 Product Launch Announcement Email',
      contentType: 'email' as const,
      body: 'Subject: Introducing NextGen Enterprise AI - 100% Guaranteed Reliability!\n\nDear Client,\nWe are thrilled to announce our revolutionary next-generation AI governance platform. Our patented architecture guarantees zero downtime and 100% error-free compliance for all enterprise workloads. Upgrade today to experience flawless editorial operations.',
      status: 'DRAFT' as const,
    },
    {
      title: 'Customer Onboarding & Security Welcome Email',
      contentType: 'email' as const,
      body: 'Subject: Welcome to BrandGuard AI - Your Security & Onboarding Guide\n\nDear Customer,\nWelcome aboard! We are excited to partner with your team. Our platform ensures your published communications adhere strictly to all SEC, FINRA, and corporate voice standards. Please review our knowledge centre to configure your baseline brand rules and begin your first automated pre-flight review.',
      status: 'DRAFT' as const,
    },
  ];

  let contentsAdded = 0;
  for (const c of sampleContents) {
    const existing = await Content.findOne({
      organisationId: org._id,
      title: c.title,
    });
    if (!existing) {
      const created = await Content.create({
        organisationId: org._id,
        title: c.title,
        contentType: c.contentType,
        body: c.body,
        status: c.status,
        currentVersion: 1,
        creatorId: userInstances.creator._id,
        findings: [],
      });

      await ContentVersion.create({
        contentId: created._id,
        organisationId: org._id,
        versionNumber: 1,
        body: created.body,
        submittedBy: userInstances.creator._id,
        metadata: {
          title: created.title,
          contentType: created.contentType,
          changeDescription: 'Initial draft composition',
        },
      });
      contentsAdded++;
    }
  }
  console.log(`  ✅ Content Drafts: ${contentsAdded} added, ${sampleContents.length - contentsAdded} already up to date.`);

  // 5. Audit Log Entry
  await AuditEvent.create({
    organisationId: org._id,
    userId: userInstances.admin._id,
    action: 'TENANT_REGISTERED',
    resourceType: 'Organisation',
    resourceId: org._id.toString(),
    details: { name: org.name, slug: org.slug, action: 'SAFE_DEMO_SYNC' },
    ipAddress: '127.0.0.1',
  });

  console.log('✅ Safe Demo Seeding Completed Successfully.');
}

if (require.main === module) {
  seedDatabase()
    .then(async () => {
      await disconnectDB();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Seed error:', err.message);
      await disconnectDB();
      process.exit(1);
    });
}
