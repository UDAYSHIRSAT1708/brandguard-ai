import request from 'supertest';
import app from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { KnowledgeSource } from '../src/models/KnowledgeSource';
import { Organisation } from '../src/models/Organisation';
import { User } from '../src/models/User';
import { AuthService } from '../src/services/auth.service';
import { isPrivateOrBlockedIP, validateUrlForSSRF } from '../src/utils/ssrfGuard';
import { parsePdfContent } from '../src/utils/pdfExtractor';
import { parseVisualAsset, findClosestColorName } from '../src/utils/visualExtractor';

describe('Phase 4: Brand Knowledge Guard, Multi-Format Ingestion & Grounding', () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    await KnowledgeSource.deleteMany({});
    await Organisation.deleteMany({});
    await User.deleteMany({});
  });

  afterAll(async () => {
    await disconnectDB();
  });

  async function setupTenant(slug = 'ingest-corp') {
    const regRes = await AuthService.registerOrgAndAdmin({
      orgName: 'Ingestion Corp',
      orgSlug: slug,
      adminName: 'Admin Sarah',
      adminEmail: `admin@${slug}.com`,
      adminPassword: 'Password123!',
    });
    return {
      org: regRes.org,
      admin: regRes.user,
      adminToken: regRes.token,
    };
  }

  // ---------------------------------------------------------------------------
  // 1. SSRF Guard Unit Tests
  // ---------------------------------------------------------------------------
  describe('SSRF Guard Unit Verification', () => {
    it('identifies private, loopback, and metadata IP addresses', () => {
      // Loopback
      expect(isPrivateOrBlockedIP('127.0.0.1')).toBe(true);
      expect(isPrivateOrBlockedIP('127.0.1.1')).toBe(true);
      expect(isPrivateOrBlockedIP('::1')).toBe(true);

      // Cloud Metadata Endpoints (AWS/GCP/Azure)
      expect(isPrivateOrBlockedIP('169.254.169.254')).toBe(true);
      expect(isPrivateOrBlockedIP('169.254.1.1')).toBe(true);

      // RFC 1918 Private Ranges
      expect(isPrivateOrBlockedIP('10.0.0.1')).toBe(true);
      expect(isPrivateOrBlockedIP('10.254.0.1')).toBe(true);
      expect(isPrivateOrBlockedIP('172.16.0.1')).toBe(true);
      expect(isPrivateOrBlockedIP('172.31.255.255')).toBe(true);
      expect(isPrivateOrBlockedIP('192.168.1.1')).toBe(true);

      // Public Safe IPs
      expect(isPrivateOrBlockedIP('8.8.8.8')).toBe(false);
      expect(isPrivateOrBlockedIP('1.1.1.1')).toBe(false);
      expect(isPrivateOrBlockedIP('93.184.216.34')).toBe(false);
    });

    it('rejects unsafe protocols and localhost hostnames in validateUrlForSSRF', async () => {
      // Unsafe protocols
      const fileRes = await validateUrlForSSRF('file:///etc/passwd');
      expect(fileRes.safe).toBe(false);

      const ftpRes = await validateUrlForSSRF('ftp://10.0.0.1/resource');
      expect(ftpRes.safe).toBe(false);

      // Blacklisted hostnames
      const localRes = await validateUrlForSSRF('http://localhost:5000/api');
      expect(localRes.safe).toBe(false);

      const metaRes = await validateUrlForSSRF('http://169.254.169.254/latest/meta-data/');
      expect(metaRes.safe).toBe(false);

      const gcpMetaRes = await validateUrlForSSRF('http://metadata.google.internal/computeMetadata/v1/');
      expect(gcpMetaRes.safe).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Multi-Format Ingestion: Website with SSRF Protection
  // ---------------------------------------------------------------------------
  describe('Website Ingestion API', () => {
    it('blocks SSRF attempts to internal endpoints via POST /api/knowledge/ingest/website', async () => {
      const { adminToken } = await setupTenant('ssrf-test');

      const res = await request(app)
        .post('/api/knowledge/ingest/website')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: 'http://169.254.169.254/latest/meta-data/',
          title: 'Cloud Metadata Attempt',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SSRF_BLOCKED');
    });

    it('blocks SSRF attempts to localhost and private subnets', async () => {
      const { adminToken } = await setupTenant('local-ssrf');

      const res = await request(app)
        .post('/api/knowledge/ingest/website')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: 'http://127.0.0.1:8080/admin',
          title: 'Localhost Attempt',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SSRF_BLOCKED');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Multi-Format Ingestion: PDF Extraction
  // ---------------------------------------------------------------------------
  describe('PDF Ingestion API & Page Citation Preservation', () => {
    it('extracts multi-page text with explicit page citation markers', async () => {
      const { adminToken, org } = await setupTenant('pdf-test');

      const samplePdfText = `
--- Page 1 ---
Acme Global Brand Standards 2026.
Our primary editorial mission is clarity and empirical accuracy.

--- Page 2 ---
Prohibited Claims and Guarantees:
Never guarantee 100% uptime or zero defect rates.
Claims must reference verified performance benchmarks.

--- Page 3 ---
Approved Metrics Table:
Metric\tValue\tSource
Speedup\t2.5x\tSysBench 2026
Latency\t12ms\tCloudflare Analytics
`;

      const res = await request(app)
        .post('/api/knowledge/ingest/pdf')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Acme Brand Standards 2026 PDF',
          content: samplePdfText,
          fileName: 'brand_standards_2026.pdf',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalPages).toBe(3);
      expect(res.body.data.scannedDetected).toBe(false);

      // Verify content is formatted with page citations
      const createdSource = await KnowledgeSource.findById(res.body.data.source._id);
      expect(createdSource?.content).toContain('[Page 1]');
      expect(createdSource?.content).toContain('[Page 2]');
      expect(createdSource?.content).toContain('[Page 3]');
      expect(createdSource?.metadata.fileName).toBe('brand_standards_2026.pdf');
      expect(createdSource?.metadata.pages).toHaveLength(3);
    });

    it('detects scanned PDFs lacking text layers and provides warning', async () => {
      const { adminToken } = await setupTenant('scanned-pdf');

      // Sparse empty pages indicative of scanned raster images without OCR
      const scannedContent = `
--- Page 1 ---


--- Page 2 ---
.
--- Page 3 ---

`;

      const res = await request(app)
        .post('/api/knowledge/ingest/pdf')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Scanned Style Guide Scan',
          content: scannedContent,
          fileName: 'scanned_scan.pdf',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.scannedDetected).toBe(true);
      expect(res.body.data.warning).toContain('Scanned PDF document detected');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Multi-Format Ingestion: Visual Assets & Palette Extraction
  // ---------------------------------------------------------------------------
  describe('Visual Asset Ingestion API & Color Palette Analysis', () => {
    it('extracts color palette, assigns names, and extracts OCR slogans', async () => {
      const { adminToken } = await setupTenant('visual-test');

      const res = await request(app)
        .post('/api/knowledge/ingest/image')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Brand Visual Assets & Palette 2026',
          imageText: 'BrandGuard: Trust Through Verification',
          colors: ['#0F52BA', '#FFD700', '#10B981'],
          typography: 'Primary Sans: Inter; Mono: JetBrains Mono',
          notes: 'Do not use sapphire blue on dark backgrounds without minimum 4.5:1 contrast.',
          fileName: 'brand_palette_guide.png',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.palette).toHaveLength(3);

      const colorNames = res.body.data.palette.map((c: any) => c.name);
      expect(colorNames).toContain('Sapphire Blue');
      expect(colorNames).toContain('Golden Yellow');
      expect(colorNames).toContain('Forest Green');

      expect(res.body.data.ocrText).toBe('BrandGuard: Trust Through Verification');

      const created = await KnowledgeSource.findById(res.body.data.source._id);
      expect(created?.content).toContain('OCR Extracted Text & Slogans');
      expect(created?.content).toContain('#0F52BA: Sapphire Blue');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Multi-Format Ingestion: Structured Rules
  // ---------------------------------------------------------------------------
  describe('Structured Rules Ingestion API', () => {
    it('ingests prohibited phrases with mandatory replacement rules', async () => {
      const { adminToken } = await setupTenant('rules-test');

      const res = await request(app)
        .post('/api/knowledge/ingest/rule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Prohibited Phrasing Policy',
          ruleCategory: 'prohibited_phrase',
          ruleData: {
            prohibitedPhrases: ['100% guarantee', 'cheap solution'],
            alternatives: {
              '100% guarantee': 'engineered for high reliability',
              'cheap solution': 'cost-effective enterprise offering',
            },
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.source.sourceType).toBe('prohibited_phrase');
      expect(res.body.data.source.content).toContain('Prohibited: "100% guarantee"');
      expect(res.body.data.source.content).toContain('Approved Replacement: "engineered for high reliability"');
    });

    it('ingests mandatory legal disclaimers', async () => {
      const { adminToken } = await setupTenant('disclaimer-test');

      const res = await request(app)
        .post('/api/knowledge/ingest/rule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Financial Disclaimer EU Market',
          ruleCategory: 'disclaimer',
          ruleData: {
            marketScope: 'European Union',
            requiredDisclaimer: 'Past performance does not guarantee future results. Capital at risk.',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.source.sourceType).toBe('disclaimer');
      expect(res.body.data.source.content).toContain('Mandatory Disclaimer - European Union');
      expect(res.body.data.source.content).toContain('Past performance does not guarantee future results');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Tenant Isolation
  // ---------------------------------------------------------------------------
  describe('Tenant Knowledge Isolation', () => {
    it('strictly isolates knowledge sources between different organizations', async () => {
      const tenantA = await setupTenant('org-a-iso');
      const tenantB = await setupTenant('org-b-iso');

      // Ingest into Org A
      await request(app)
        .post('/api/knowledge/ingest/pdf')
        .set('Authorization', `Bearer ${tenantA.adminToken}`)
        .send({
          title: 'Secret Org A Confidential Guidelines',
          content: '[Page 1] Highly proprietary secrets of Org A.',
          fileName: 'secret_a.pdf',
        });

      // Org B lists knowledge sources
      const listRes = await request(app)
        .get('/api/knowledge')
        .set('Authorization', `Bearer ${tenantB.adminToken}`);

      expect(listRes.status).toBe(200);
      const titles = listRes.body.data.sources.map((s: any) => s.title);
      expect(titles).not.toContain('Secret Org A Confidential Guidelines');
    });
  });
});
