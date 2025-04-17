import mongoose, { Schema, Document } from 'mongoose';

export interface IPromoMaterial extends Document {
  type: 'banner' | 'logo' | 'video';
  url: string;
  dimensions?: string;
  trackingLink?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PromoMaterialSchema: Schema = new Schema(
  {
    type: {
      type: String,
      enum: ['banner', 'logo', 'video'],
      required: true,
    },
    url: { type: String, required: true },
    dimensions: { type: String },
    trackingLink: { type: String },
  },
  { timestamps: true },
);

PromoMaterialSchema.index({ type: 1 });

export default mongoose.model<IPromoMaterial>(
  'PromoMaterial',
  PromoMaterialSchema,
);
