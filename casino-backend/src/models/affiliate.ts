import mongoose, { Schema, Document, HydratedDocument } from 'mongoose';
import bcrypt from 'bcrypt';
import { STATUS } from '../constants';

export interface IAffiliate extends Document {
  _id: mongoose.Types.ObjectId;
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
  pendingEarnings?: number;
  paidEarnings?: number;
  commissionRate?: number;
  role_id: number; // 0 = User, 1 = Admin, 2 = Affiliate
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
    pendingEarnings: { type: Number, default: 0 },
    paidEarnings: { type: Number, default: 2 },
    commissionRate: { type: Number, default: 10 },
    role_id: {
      type: Number,
      default: 2, // Default to Affiliate
      enum: [0, 1, 2], // 0 = User, 1 = Admin, 2 = Affiliate
    },
    notificationPreferences: {
      newReferral: { type: Boolean, default: true },
      payoutProcessed: { type: Boolean, default: true },
      campaignUpdates: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

// AffiliateSchema.index({ referralCode: 1 }, { unique: true });

// // Hash password before saving
// AffiliateSchema.pre('save', async function (this: HydratedDocument<IAffiliate>, next) {
//   if (this.isModified('password') && this.password) {
//     this.password = await bcrypt.hash(this.password, 12);
//   }
//   next();
// });

export const Affiliate = mongoose.model<IAffiliate>(
  'Affiliate',
  AffiliateSchema,
);
