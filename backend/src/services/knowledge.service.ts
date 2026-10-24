import mongoose from 'mongoose';
import { KnowledgeSource, IKnowledgeSource, SourceType, SourceStatus } from '../models/KnowledgeSource';
import { logAuditEvent } from './audit.service';

export class KnowledgeService {
  static async createSource(params: {
    organisationId: string;
    userId: string;
    title: string;
    sourceType: SourceType;
    content: string;
    productScope?: string;
    campaignScope?: string;
    status?: SourceStatus;
  }): Promise<IKnowledgeSource> {
    const source = await KnowledgeSource.create({
      organisationId: new mongoose.Types.ObjectId(params.organisationId),
      uploadedBy: new mongoose.Types.ObjectId(params.userId),
      title: params.title,
      sourceType: params.sourceType,
      content: params.content,
      productScope: params.productScope || 'Global',
      campaignScope: params.campaignScope || null,
      status: params.status || 'draft',
      version: 1,
    });

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.userId,
      action: 'KNOWLEDGE_SOURCE_CREATED',
      resourceType: 'KnowledgeSource',
      resourceId: source._id.toString(),
      details: { title: source.title, type: source.sourceType, status: source.status },
    });

    return source;
  }

  static async getSources(params: {
    organisationId: string;
    status?: SourceStatus;
    sourceType?: SourceType;
    search?: string;
  }): Promise<IKnowledgeSource[]> {
    const query: any = {
      organisationId: new mongoose.Types.ObjectId(params.organisationId),
    };

    if (params.status) {
      query.status = params.status;
    }
    if (params.sourceType) {
      query.sourceType = params.sourceType;
    }
    if (params.search && params.search.trim()) {
      query.$text = { $search: params.search.trim() };
    }

    return KnowledgeSource.find(query).sort({ createdAt: -1 });
  }

  static async getApprovedSourcesForTenant(organisationId: string): Promise<IKnowledgeSource[]> {
    const now = new Date();
    return KnowledgeSource.find({
      organisationId: new mongoose.Types.ObjectId(organisationId),
      status: 'approved',
      effectiveDate: { $lte: now },
      $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }],
    });
  }

  static async approveSource(params: {
    sourceId: string;
    organisationId: string;
    userId: string;
  }): Promise<IKnowledgeSource> {
    const source = await KnowledgeSource.findOne({
      _id: new mongoose.Types.ObjectId(params.sourceId),
      organisationId: new mongoose.Types.ObjectId(params.organisationId),
    });

    if (!source) {
      throw new Error('Knowledge source not found or access denied.');
    }

    source.status = 'approved';
    source.approvedBy = new mongoose.Types.ObjectId(params.userId);
    source.approvedAt = new Date();
    await source.save();

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.userId,
      action: 'KNOWLEDGE_SOURCE_APPROVED',
      resourceType: 'KnowledgeSource',
      resourceId: source._id.toString(),
      details: { title: source.title },
    });

    return source;
  }

  static async archiveSource(params: {
    sourceId: string;
    organisationId: string;
    userId: string;
  }): Promise<IKnowledgeSource> {
    const source = await KnowledgeSource.findOne({
      _id: new mongoose.Types.ObjectId(params.sourceId),
      organisationId: new mongoose.Types.ObjectId(params.organisationId),
    });

    if (!source) {
      throw new Error('Knowledge source not found or access denied.');
    }

    source.status = 'archived';
    await source.save();

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.userId,
      action: 'KNOWLEDGE_SOURCE_ARCHIVED',
      resourceType: 'KnowledgeSource',
      resourceId: source._id.toString(),
      details: { title: source.title },
    });

    return source;
  }
}
