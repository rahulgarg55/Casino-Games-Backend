import mongoose, { Schema, Document } from 'mongoose';
import {GENDER, LANGUAGE, COUNTRY, CITY,TWO_FA,VERIFICATION,STATUS} from "../constants";
export interface IPlayer extends Document {
  username?: string;
  fullname?: string;
  patronymic?: string;
  photo?: string;
  dob?: Date;
  gender?: number;
  email?: string;
  phone_number?: string;
  password_hash: string;
  registration_date?: Date;
  last_login?: Date;
  status?: number;
  is_verified?: number;
  is_2fa?: number;
  currency: number; // 0 = USD, 1 = INR, 2 = Pound
  language?: number;
  country?: number;
  city?: number;
  role_id: number; // 0 = User, 1 = Admin, 2 = Game Provider
  reset_password_token?: string;
  reset_password_expires?: Date;
  created_at?: Date;
  updated_at?: Date;
}

const playerSchema: Schema = new Schema({
  username: { 
    type: String, 
    unique: true,
    sparse: true, // Only index documents that contain the username field
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters']
  },
  fullname: { 
    type: String, 
    trim: true
  },
  patronymic: { 
    type: String, 
    trim: true
  },
  photo: { 
    type: String,
    validate: {
      validator: (v: string) => /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/.test(v),
      message: 'Invalid URL format for photo'
    }
  },
  dob: { 
    type: Date,
    validate: {
      validator: (date: Date) => date < new Date(),
      message: 'Date of birth cannot be in the future'
    }
  },
  gender: { 
    type: Number, 
    enum: [GENDER.MALE, GENDER.FEMALE, GENDER.TRANSGENDER],
    default: GENDER.MALE
  },
  email: { 
    type: String, 
    unique: true,
    sparse: true, // Only index documents that contain the email field
    validate: {
      validator: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: 'Invalid email format'
    }
  },
  phone_number: {
    type: String,
    unique: true,
    sparse: true, // Only index documents that contain the phone_number field
    validate: {
      validator: (v: string) => /^\+?[1-9]\d{1,14}$/.test(v),
      message: 'Invalid phone number format'
    }
  },
  password_hash: { 
    type: String, 
    required: true
  },
  registration_date: { 
    type: Date, 
    default: Date.now 
  },
  last_login: { 
    type: Date 
  },
  status: { 
    type: Number, 
    enum: [STATUS.INACTIVE, STATUS.ACTIVE],
    default: STATUS.ACTIVE 
  },
  is_verified: { 
    type: Number, 
    enum: [VERIFICATION.UNVERIFIED, VERIFICATION.VERIFIED],
    default: VERIFICATION.UNVERIFIED 
  },
  is_2fa: { 
    type: Number, 
    enum: [TWO_FA.DISABLED, TWO_FA.ENABLED],
    default: TWO_FA.DISABLED 
  },
  currency: { 
    type: Number, 
    required: true,
    enum: [0, 1, 2] // 0 = USD, 1 = INR, 2 = Pound
  },
  language: { 
    type: Number, 
    enum: [LANGUAGE.ENGLISH, LANGUAGE.SPANISH, LANGUAGE.FRENCH],
    default: LANGUAGE.ENGLISH
  },
  country: { 
    type: Number, 
    enum: [COUNTRY.USA, COUNTRY.INDIA, COUNTRY.UK],
    default: COUNTRY.USA
  },
  city: { 
    type: Number, 
    enum: [CITY.NEW_YORK, CITY.MUMBAI, CITY.LONDON],
    default: CITY.NEW_YORK
  },
  role_id: { 
    type: Number, 
    default: 0, // Default to User
    enum: [0, 1, 2] // 0 = User, 1 = Admin, 2 = Game Provider
  },
  reset_password_token: {
    type: String,
    default: null
  },
  reset_password_expires: {
    type: Date,
    default: null
  }
}, {
  timestamps: { 
    createdAt: 'created_at', 
    updatedAt: 'updated_at' 
  },
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret.password_hash;
      delete ret.__v;
      return ret;
    }
  }
});

export default mongoose.model<IPlayer>('Player', playerSchema);