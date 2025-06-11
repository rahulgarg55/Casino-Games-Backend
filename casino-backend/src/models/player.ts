import mongoose, { Schema, Document } from 'mongoose';
import { TWO_FA, STATUS, VERIFICATION } from '../constants';

export interface IPlayer extends Document {
  username?: string;
  fullname?: string;
  patronymic?: string;
  photo?: string;
  dob?: Date;
  gender?: string;
  email?: string;
  phone_number?: string;
  password_hash: string;
  registration_date?: Date;
  last_login?: Date;
  status?: number;
  is_verified?: number;
  is_2fa?: number;
  currency: number;
  language?: string;
  country?: string;
  city?: string;
  role_id: number;
  reset_password_token?: string;
  reset_password_expires?: Date;
  verification_token?: string;
  verification_token_expires?: Date;
  sms_code?: string;
  sms_code_expires?: Date;
  payment_methods?: mongoose.Types.ObjectId[];
  created_at?: Date;
  updated_at?: Date;
  refreshToken?: string;
  profile_picture?: string;
  stripeCustomerId?: string;
  stripeConnectedAccountId?: string;
  balance?: number;
  balance_updated_at?: Date;
  is_2fa_enabled: number;
  two_factor_secret?: string;
  two_factor_expires?: Date;
  two_factor_method?: 'email' | 'phone';
  cookieConsent?: string;
  country_code?: string;
  email_verified?: boolean;
  phone_verified?: boolean;
  referredBy?: mongoose.Types.ObjectId;
  referredByName?: string;
  sumsub_id?: string;
  sumsub_status?: 'not_started' | 'in_review' | 'approved_sumsub' | 'rejected_sumsub' | null;
  sumsub_notes?: string | null;
  admin_status?: 'approved' | 'pending' | 'rejected' | null;
  admin_notes?: string | null;
  sumsub_verification_date?: Date;
  sumsub_details?: {
    documents?: string[];
    nextSteps?: string[];
  };
  new_email?: string;
  full_phone_number?: string;
}

const playerSchema: Schema = new Schema(
  {
    username: {
      type: String,
      unique: true,
      sparse: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
    },
    fullname: { type: String, trim: true },
    patronymic: { type: String, trim: true },
    photo: {
      type: String,
      validate: {
        validator: (v: string) => /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/.test(v),
        message: 'Invalid URL format for photo',
      },
    },
    dob: {
      type: Date,
      validate: {
        validator: (date: Date) => date < new Date(),
        message: 'Date of birth cannot be in the future',
      },
    },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    email: {
      type: String,
      unique: true,
      sparse: true,
      validate: {
        validator: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'Invalid email format',
      },
    },
    phone_number: {
      type: String,
      unique: true,
      sparse: true,
      validate: {
        validator: function (v: string | null | undefined): boolean {
          return v === null || v === undefined || /^\+?[1-9]\d{1,14}$/.test(v);
        },
        message: 'Invalid phone number format',
      },
    },
    country_code: { type: String, default: '+1' },
    password_hash: { type: String, required: true },
    registration_date: { type: Date, default: Date.now },
    last_login: { type: Date },
    status: {
      type: Number,
      enum: [STATUS.INACTIVE, STATUS.ACTIVE],
      default: STATUS.ACTIVE,
    },
    is_verified: {
      type: Number,
      enum: [VERIFICATION.UNVERIFIED, VERIFICATION.VERIFIED],
      default: VERIFICATION.UNVERIFIED,
    },
    email_verified: { type: Boolean, default: false },
    phone_verified: { type: Boolean, default: false },
    is_2fa: {
      type: Number,
      enum: [TWO_FA.DISABLED, TWO_FA.ENABLED],
      default: TWO_FA.DISABLED,
    },
    currency: {
      type: Number,
      required: true,
      enum: [0, 1, 2],
      default: 0,
    },
    language: { type: String, default: 'en' },
    country: { type: String, ref: 'Country' },
    city: { type: String, ref: 'City' },
    role_id: {
      type: Number,
      default: 0,
      enum: [0, 1, 2],
    },
    reset_password_token: { type: String },
    reset_password_expires: { type: Date },
    verification_token: { type: String },
    verification_token_expires: { type: Date },
    sms_code: { type: String, select: false },
    sms_code_expires: { type: Date, select: false },
    payment_methods: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod' }],
    refreshToken: { type: String },
    profile_picture: { type: String },
    stripeCustomerId: { type: String, unique: true, sparse: true },
    stripeConnectedAccountId: { type: String, sparse: true },
    balance: { type: Number, default: 0, min: 0 },
    balance_updated_at: { type: Date, default: Date.now },
    is_2fa_enabled: {
      type: Number,
      enum: [TWO_FA.DISABLED, TWO_FA.ENABLED],
      default: TWO_FA.DISABLED,
    },
    two_factor_secret: { type: String, select: false },
    two_factor_expires: { type: Date, select: false },
    two_factor_method: {
      type: String,
      enum: ['email', 'phone'],
      default: 'email',
    },
    cookieConsent: {
      type: String,
      enum: ['accepted', 'rejected', 'pending'],
      default: 'pending',
    },
    referredBy: { type: Schema.Types.ObjectId, ref: 'Affiliate', default: null },
    referredByName: { type: String, default: null },
    sumsub_id: { type: String, default: null },
    sumsub_status: {
      type: String,
      enum: ['not_started', 'in_review', 'approved_sumsub', 'rejected_sumsub', null],
      default: 'not_started',
    },
    sumsub_notes: { type: String, default: null },
    admin_status: {
      type: String,
      enum: ['approved', 'pending', 'rejected', null],
      default: null,
    },
    admin_notes: { type: String, default: null },
    sumsub_verification_date: { type: Date, default: null },
    sumsub_details: {
      documents: [{ type: String }],
      nextSteps: [{ type: String }],
    },
    new_email: {
      type: String,
      validate: {
        validator: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'Invalid email format',
      },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.password_hash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

playerSchema.virtual('full_phone_number').get(function () {
  return this.country_code && this.phone_number
    ? `${this.country_code}${this.phone_number}`
    : null;
});

export default mongoose.model<IPlayer>('Player', playerSchema);