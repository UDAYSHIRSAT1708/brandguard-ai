import mongoose from 'mongoose';
import { Content, IContent, ContentType, ContentStatus } from '../models/Content';
import { ContentVersion, IContentVersion } from '../models/ContentVersion';
import { logAuditEvent } from './audit.service';

export class ContentService {
  static async createContent(params: {
    organisationId: string;
    userId: string;
    title: string;
    contentType: ContentType;
    body: string;
  }): Promise<{ content: IContent; version: IContentVersion }> {
    const orgId = new mongoose.Types.ObjectId(params.organisationId);
    const userId = new mongoose.Types.ObjectId(params.userId);

    // 1. Create content document
    const content = await Content.create({
      organisationId: orgId,
      creatorId: userId,
      title: params.title,
      contentType: params.contentType,
      status: 'DRAFT',
      currentVersion: 1,
      body: params.body,
    });

    // 2. Create immutable Version 1 record
    const version = await ContentVersion.create({
      contentId: content._id,
      organisationId: orgId,
      versionNumber: 1,
      body: params.body,
      submittedBy: userId,
    });

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.userId,
      action: 'CONTENT_CREATED',
      resourceType: 'Content',
      resourceId: content._id.toString(),
      details: { title: content.title, version: 1 },
    });

    return { content, version };
  }

  static async updateContent(params: {
    contentId: string;
    organisationId: string;
    userId: string;
    title?: string;
    contentType?: ContentType;
    body: string;
  }): Promise<{ content: IContent; version: IContentVersion }> {
    const orgId = new mongoose.Types.ObjectId(params.organisationId);
    const userId = new mongoose.Types.ObjectId(params.userId);

    const content = await Content.findOne({
      _id: new mongoose.Types.ObjectId(params.contentId),
      organisationId: orgId,
    });

    if (!content) {
      throw new Error('Content not found or access denied.');
    }

    // Creating new version revision
    const nextVersionNumber = content.currentVersion + 1;

    // Notice: If content was previously APPROVED, updating the body invalidates prior approval!
    content.currentVersion = nextVersionNumber;
    content.body = params.body;
    content.status = 'DRAFT'; // Invalidate prior approval
    if (params.title) content.title = params.title;
    if (params.contentType) content.contentType = params.contentType;
    await content.save();

    // Create immutable version record
    const version = await ContentVersion.create({
      contentId: content._id,
      organisationId: orgId,
      versionNumber: nextVersionNumber,
      body: params.body,
      submittedBy: userId,
    });

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.userId,
      action: 'CONTENT_VERSION_CREATED',
      resourceType: 'Content',
      resourceId: content._id.toString(),
      details: {
        title: content.title,
        version: nextVersionNumber,
        invalidatedPriorApproval: true,
      },
    });

    return { content, version };
  }

  static async submitForReview(params: {
    contentId: string;
    organisationId: string;
    userId: string;
  }): Promise<IContent> {
    const content = await Content.findOne({
      _id: new mongoose.Types.ObjectId(params.contentId),
      organisationId: new mongoose.Types.ObjectId(params.organisationId),
    });

    if (!content) {
      throw new Error('Content not found or access denied.');
    }

    content.status = 'PENDING_APPROVAL';
    await content.save();

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.userId,
      action: 'CONTENT_SUBMITTED_FOR_APPROVAL',
      resourceType: 'Content',
      resourceId: content._id.toString(),
      details: { version: content.currentVersion },
    });

    return content;
  }

  static async listContent(params: {
    organisationId: string;
    status?: ContentStatus;
  }): Promise<IContent[]> {
    const query: any = {
      organisationId: new mongoose.Types.ObjectId(params.organisationId),
    };
    if (params.status) {
      query.status = params.status;
    }
    return Content.find(query).sort({ updatedAt: -1 });
  }

  static async getContentWithVersions(params: {
    contentId: string;
    organisationId: string;
  }): Promise<{ content: IContent; versions: IContentVersion[] }> {
    const orgId = new mongoose.Types.ObjectId(params.organisationId);
    const contentId = new mongoose.Types.ObjectId(params.contentId);

    const content = await Content.findOne({ _id: contentId, organisationId: orgId });
    if (!content) {
      throw new Error('Content not found or access denied.');
    }

    const versions = await ContentVersion.find({ contentId, organisationId: orgId }).sort({ versionNumber: -1 });

    return { content, versions };
  }
}
