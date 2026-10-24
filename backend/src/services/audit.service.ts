import mongoose from 'mongoose';
import { AuditEvent } from '../models/AuditEvent';

export async function logAuditEvent(params: {
  organisationId: string | mongoose.Types.ObjectId;
  userId: string | mongoose.Types.ObjectId;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, any>;
  ipAddress?: string;
}): Promise<void> {
  try {
    await AuditEvent.create({
      organisationId: new mongoose.Types.ObjectId(params.organisationId),
      userId: new mongoose.Types.ObjectId(params.userId),
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      details: params.details || {},
      ipAddress: params.ipAddress,
    });
  } catch (err: any) {
    console.error('Failed to log audit event:', err.message);
  }
}
