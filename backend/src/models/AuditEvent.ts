import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditEvent extends Document {
  organisationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, any>;
  ipAddress?: string;
  createdAt: Date;
}

const AuditEventSchema = new Schema<IAuditEvent>(
  {
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, required: true },
    details: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Append-only audit events, indexed by tenant and timestamp
AuditEventSchema.index({ organisationId: 1, createdAt: -1 });

export const AuditEvent = mongoose.model<IAuditEvent>('AuditEvent', AuditEventSchema);
