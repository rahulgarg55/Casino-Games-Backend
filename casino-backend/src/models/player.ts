import mongoose, { Schema, Document } from 'mongoose';

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
  currency: number; // 0 = USD, 1 = INR, 2 = Pound
  language?: string;
  country?: string;
  city?: string;
  role_id: number; // 0 = User, 1 = Admin, 2 = Game Provider
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
}

const playerSchema: Schema = new Schema(
  {
    username: {
      type: String,
      unique: true,
      sparse: true, // Only index documents that contain the username field
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
    },
    fullname: {
      type: String,
      trim: true,
    },
    patronymic: {
      type: String,
      trim: true,
    },
    photo: {
      type: String,
      validate: {
        validator: (v: string) =>
          /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/.test(v),
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
    gender: {
      type: String,
      ref: 'Gender',
    },
    email: {
      type: String,
      unique: true,
      sparse: true, // Only index documents that contain the email field
      validate: {
        validator: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'Invalid email format',
      },
    },
    phone_number: {
      type: String,
      unique: true,
      sparse: true, // Only index documents that contain the phone_number field
      validate: {
        validator: (v: string) => /^\+?[1-9]\d{1,14}$/.test(v),
        message: 'Invalid phone number format',
      },
    },
    password_hash: {
      type: String,
      required: true,
    },
    registration_date: {
      type: Date,
      default: Date.now,
    },
    last_login: {
      type: Date,
    },
    status: {
      type: Number,
      enum: [0, 1], // 0 = inactive, 1 = active
      default: 1,
    },
    is_verified: {
      type: Number,
      enum: [0, 1], // 0 = unverified, 1 = verified
      default: 0,
    },
    is_2fa: {
      type: Number,
      enum: [0, 1], // 0 = disabled, 1 = enabled
      default: 0,
    },
    currency: {
      type: Number,
      required: true,
      enum: [0, 1, 2], // 0 = USD, 1 = INR, 2 = Pound
    },
    language: {
      type: String,
      ref: 'Language',
    },
    country: {
      type: String,
      ref: 'Country',
    },
    city: {
      type: String,
      ref: 'City',
    },
    role_id: {
      type: Number,
      default: 0, // Default to User
      enum: [0, 1, 2], // 0 = User, 1 = Admin, 2 = Game Provider
    },
    reset_password_token: {
      type: String,
      default: null,
    },
    reset_password_expires: {
      type: Date,
      default: null,
    },
    verification_token: {
      type: String,
      default: null,
    },
    verification_token_expires: {
      type: Date,
      default: null,
    },
    sms_code: {
      type: String,
      select: false,
    },
    sms_code_expires: {
      type: Date,
      select: false,
    },
    payment_methods: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PaymentMethod',
      },
    ],
    refreshToken: {
      type: String,
      default: null,
    },
    profile_picture:{
      type: String,
      default: null,
    }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.password_hash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export default mongoose.model<IPlayer>('Player', playerSchema);
