import mongoose, { Schema, Document } from 'mongoose';

export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type JobMode = 'sync' | 'async';

export interface IReviewJobError {
  message: string;
  code?: string;
  retryable: boolean;
  statusCode?: number;
  timestamp: Date;
}

export interface IReviewJobResult {
  reviewId: string;
  provider: string;
  model: string;
  latencyMs: number;
  retry_count?: number;
  findingsCount: number;
  recommendationsCount: number;
  isDemoMode: boolean;
}

export interface IReviewJob extends Document {
  organisationId: mongoose.Types.ObjectId;
  contentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  versionNumber: number;
  status: JobStatus;
  mode: JobMode;
  simulateFailover: boolean;
  idempotencyKey?: string;
  attemptCount: number;
  maxAttempts: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  error?: IReviewJobError | null;
  result?: IReviewJobResult | null;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewJobSchema = new Schema<IReviewJob>(
  {
    organisationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organisation',
      required: true,
      index: true,
    },
    contentId: {
      type: Schema.Types.ObjectId,
      ref: 'Content',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    versionNumber: {
      type: Number,
      required: true,
      default: 1,
    },
    status: {
      type: String,
      enum: ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
      default: 'QUEUED',
      required: true,
      index: true,
    },
    mode: {
      type: String,
      enum: ['sync', 'async'],
      default: 'sync',
      required: true,
    },
    simulateFailover: {
      type: Boolean,
      default: false,
    },
    idempotencyKey: {
      type: String,
      trim: true,
    },
    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
      min: 1,
    },
    leaseOwner: {
      type: String,
      default: null,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    error: {
      type: Schema.Types.Mixed,
      default: null,
    },
    result: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// 1. Fast lookup for active job on a specific content item
ReviewJobSchema.index({ organisationId: 1, contentId: 1, status: 1 });

// 2. Idempotency uniqueness per tenant (partial filter ensures null/missing keys don't collide)
ReviewJobSchema.index(
  { organisationId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

// 3. Serverless crash recovery index: finds running jobs whose leases expired
ReviewJobSchema.index({ status: 1, leaseExpiresAt: 1 });

// 4. Content history query index
ReviewJobSchema.index({ organisationId: 1, createdAt: -1 });

export const ReviewJob =
  (mongoose.models.ReviewJob as mongoose.Model<IReviewJob>) ||
  mongoose.model<IReviewJob>('ReviewJob', ReviewJobSchema);
