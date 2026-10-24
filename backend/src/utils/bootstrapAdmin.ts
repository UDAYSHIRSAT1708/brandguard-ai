import { connectDB, disconnectDB } from '../config/db';
import { Organisation } from '../models/Organisation';
import { User } from '../models/User';
import { AuthService } from '../services/auth.service';

/**
 * Production First-Administrator Bootstrap Utility
 * 
 * Safely provisions the initial root organization and administrator account
 * without deleting existing collections or inserting fictional demo data.
 * 
 * Usage:
 *   BOOTSTRAP_ORG_NAME="Acme Corp" \
 *   BOOTSTRAP_ORG_SLUG="acme-corp" \
 *   BOOTSTRAP_ADMIN_NAME="Alice Smith" \
 *   BOOTSTRAP_ADMIN_EMAIL="alice@acme.com" \
 *   BOOTSTRAP_ADMIN_PASSWORD="StrongSecurePassword123!" \
 *   npm run bootstrap:admin
 */
export async function bootstrapAdmin() {
  console.log('🛡️ BrandGuard AI — First Administrator Bootstrap');
  console.log('----------------------------------------------------');

  const orgName = (process.env.BOOTSTRAP_ORG_NAME || '').trim();
  const orgSlug = (process.env.BOOTSTRAP_ORG_SLUG || '').trim().toLowerCase();
  const adminName = (process.env.BOOTSTRAP_ADMIN_NAME || '').trim();
  const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';

  // 1. Validation
  if (!orgName || !orgSlug || !adminName || !adminEmail || !adminPassword) {
    console.error('❌ Error: Missing required bootstrap environment variables.');
    console.error('Required:');
    console.error('  - BOOTSTRAP_ORG_NAME: Full organization title');
    console.error('  - BOOTSTRAP_ORG_SLUG: URL slug (alphanumeric and hyphens only)');
    console.error('  - BOOTSTRAP_ADMIN_NAME: Administrator full name');
    console.error('  - BOOTSTRAP_ADMIN_EMAIL: Administrator work email address');
    console.error('  - BOOTSTRAP_ADMIN_PASSWORD: Strong password (minimum 12 characters)');
    process.exit(1);
  }

  if (adminPassword.length < 12) {
    console.error('❌ Error: BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters long.');
    process.exit(1);
  }

  const forbiddenPlaceholders = ['demoadmin2026!', 'admin123', 'password', 'changeme', 'admin'];
  if (forbiddenPlaceholders.includes(adminPassword.toLowerCase())) {
    console.error('❌ Error: The provided password is a common or demo password and is forbidden in production.');
    process.exit(1);
  }

  if (!/^[a-z0-9-]+$/.test(orgSlug)) {
    console.error('❌ Error: BOOTSTRAP_ORG_SLUG must contain only lowercase alphanumeric characters and hyphens.');
    process.exit(1);
  }

  try {
    await connectDB();

    // 2. Lock check: Prevent duplicate bootstrap if admin already exists
    const existingOrg = await Organisation.findOne({ slug: orgSlug });
    if (existingOrg) {
      console.error(`❌ Error: An organisation with slug "${orgSlug}" already exists in the database.`);
      process.exit(1);
    }

    const existingUser = await User.findOne({ email: adminEmail });
    if (existingUser) {
      console.error(`❌ Error: A user with email "${adminEmail}" already exists in the database.`);
      process.exit(1);
    }

    // Check if system already has an admin user and FORCE_BOOTSTRAP is not set
    const totalAdmins = await User.countDocuments({ role: 'admin' });
    if (totalAdmins > 0 && process.env.FORCE_BOOTSTRAP !== 'true') {
      console.warn('⚠️ Warning: An administrator account already exists in the database.');
      console.warn('To prevent unauthorized privilege provisioning, the initial bootstrap is locked.');
      console.warn('Use an existing administrator account to invite additional users via the UI/API,');
      console.warn('or set FORCE_BOOTSTRAP=true if creating a second isolated tenant organisation.');
      process.exit(1);
    }

    // 3. Provision root organisation and root admin
    const { user } = await AuthService.registerOrgAndAdmin({
      orgName,
      orgSlug,
      adminName,
      adminEmail,
      adminPassword,
    });

    console.log('----------------------------------------------------');
    console.log('✅ Production Bootstrap Succeeded:');
    console.log(`   Organisation: ${orgName} (Slug: ${orgSlug})`);
    console.log(`   Admin User:   ${user.name} (${user.email})`);
    console.log(`   Role:         ${user.role}`);
    console.log('----------------------------------------------------');
    console.log('🔒 Security Notice: Initial bootstrap is complete. Unset BOOTSTRAP_* environment variables.');
  } catch (err: any) {
    console.error('❌ Fatal error during administrator bootstrap:', err.message);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

// Execute if run directly from CLI
if (require.main === module) {
  bootstrapAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
