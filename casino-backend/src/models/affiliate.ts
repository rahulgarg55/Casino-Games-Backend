import mongoose, { Schema, Document } from 'mongoose';
import { STATUS } from '../constants';

export interface IAffiliate extends Document {
  firstname: string;
  lastname: string;
  email: string;
  phonenumber?: string;
  country: string;
  password?: string;
  referralCode: string;
  promotionMethod?: string[];
  hearAboutUs: string;
  status: number;
  verification_token?: string;
  verification_token_expires?: Date;
  marketingEmailsOptIn?: boolean;
  referral_code?: string;
  reset_password_token?: string;
  reset_password_expires?: Date;
  totalClicks?: number;
  totalSignups?: number;
  totalEarnings?: number;
  paidEarnings?: number;
  commissionRate?: number;
  notificationPreferences?: {
    newReferral?: boolean;
    payoutProcessed?: boolean;
    campaignUpdates?: boolean;
  };
}

const AffiliateSchema: Schema = new Schema(
  {
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phonenumber: { type: String },
    country: { type: String, required: true },
    password: { type: String },
    referralCode: { type: String, required: true, unique: true },
    promotionMethod: { type: [String] },
    hearAboutUs: { type: String, required: true },
    status: {
      type: Number,
      enum: [STATUS.INACTIVE, STATUS.ACTIVE, STATUS.BANNED],
      default: STATUS.INACTIVE,
    },
    verification_token: { type: String },
    verification_token_expires: { type: Date },
    marketingEmailsOptIn: { type: Boolean, default: false },
    reset_password_token: { type: String },
    reset_password_expires: { type: Date },
    totalClicks: { type: Number, default: 0 },
    totalSignups: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    paidEarnings: { type: Number, default: 0 },
    commissionRate: { type: Number, default: 10 },
    notificationPreferences: {
      newReferral: { type: Boolean, default: true },
      payoutProcessed: { type: Boolean, default: true },
      campaignUpdates: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

AffiliateSchema.index({ referralCode: 1 }, { unique: true });

export const Affiliate = mongoose.model<IAffiliate>(
  'Affiliate',
  AffiliateSchema,
);
