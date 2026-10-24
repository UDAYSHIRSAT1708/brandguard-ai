import mongoose, { Schema, Document } from 'mongoose';

export interface IOrganisation extends Document {
  name: string;
  slug: string;
  settings: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const OrganisationSchema = new Schema<IOrganisation>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    settings: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Organisation = mongoose.model<IOrganisation>('Organisation', OrganisationSchema);
