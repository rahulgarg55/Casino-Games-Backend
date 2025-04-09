import mongoose, { Schema, Document } from 'mongoose';

// Define the interface for TypeScript
export interface IAffiliate extends Document {
  firstname: string;
  lastname: string;
  email: string;
  phonenumber?: string;
  country: string;
  password?: string;
  referralCode?: string;
  promotionMethod?: { type: string[] }; 
  hearAboutUs: string;
  status: number;
  verification_token?: string;
  verification_token_expires?: Date;
  marketingEmailsOptIn?: boolean;
  referral_code?: string;
}

// Define the Mongoose schema
const AffiliateSchema: Schema = new Schema({
  firstname: { type: String, required: true },
  lastname: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phonenumber: { type: String },
  country: { type: String, required: true },
  password: { type: String },
  referralCode: { type: String },
  promotionMethod: { type: [String] }, 
  hearAboutUs: { type: String, required: true },
  status: { type: Number, default:0 },     //  ACTIVE: 1,INACTIVE: 0, BANNED:2
  verification_token: {
    type: String,
  },
  verification_token_expires: {
    type: Date,
  },
  marketingEmailsOptIn: { type: Boolean, default: false }, 
  referral_code: { type: String },
}, { timestamps: true });

// Export the model
export const Affiliate = mongoose.model<IAffiliate>('AffiliateUser', AffiliateSchema);
