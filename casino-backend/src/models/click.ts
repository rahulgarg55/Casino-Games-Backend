import mongoose, { Schema, Document } from 'mongoose';

export interface IClick extends Document {
  affiliateId: mongoose.Types.ObjectId;
  trackingId: string;
  ipAddress?: string;
  userAgent?: string;
  referrer?: string;
  createdAt: Date;
}

const ClickSchema: Schema = new Schema(
  {
    affiliateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Affiliate',
      required: true,
    },
    trackingId: { type: String, required: true },
    ipAddress: { type: String },
    userAgent: { type: String },
    referrer: { type: String },
  },
  { timestamps: { createdAt: 'createdAt' } },
);

ClickSchema.index({ affiliateId: 1, createdAt: -1 });
ClickSchema.index({ trackingId: 1 });

export default mongoose.model<IClick>('Click', ClickSchema);
