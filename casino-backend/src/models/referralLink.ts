import mongoose, { Schema, Document } from 'mongoose';

export interface IReferralLink extends Document {
  affiliateId: mongoose.Types.ObjectId;
  trackingId: string;
  campaignName: string;
  destinationUrl: string;
  clicks: number;
  signups: number;
  conversions: number;
  createdAt: Date;
  updatedAt: Date;
}

const ReferralLinkSchema: Schema = new Schema(
  {
    affiliateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Affiliate',
      required: true,
    },
    trackingId: { type: String, required: true, unique: true },
    campaignName: { type: String, required: true },
    destinationUrl: { type: String, required: true },
    clicks: { type: Number, default: 0 },
    signups: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
  },
  { timestamps: true },
);

ReferralLinkSchema.index({ trackingId: 1 }, { unique: true });
ReferralLinkSchema.index({ affiliateId: 1 });

export default mongoose.model<IReferralLink>(
  'ReferralLink',
  ReferralLinkSchema,
);
