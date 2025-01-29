import mongoose, { Schema, Document } from 'mongoose';

export interface IPlayer extends Document {
  username: string;
  fullname: string;
  patronymic: string;
  photo?: string;
  dob?: Date;
  gender?: mongoose.Types.ObjectId;
  email: string;
  password_hash: string;
  registration_date?: Date;
  last_login?: Date;
  status?: number;
  is_verified?: number;
  is_2fa?: number;
  currency?: mongoose.Types.ObjectId;
  language?: mongoose.Types.ObjectId;
  country?: mongoose.Types.ObjectId;
  city?: mongoose.Types.ObjectId;
  role_id: mongoose.Types.ObjectId;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * @typedef {Object} Player
 * @property {string} username - The unique username of the player. Must be between 3 and 30 characters.
 * @property {string} fullname - The full name of the player. This field is required and will be trimmed.
 * @property {string} patronymic - The patronymic of the player. This field is required and will be trimmed.
 * @property {string} [photo] - The URL of the player's photo. Must be a valid URL format.
 * @property {Date} [dob] - The date of birth of the player. Cannot be a future date.
 * @property {Schema.Types.ObjectId} [gender] - The gender of the player, referenced from the Gender collection.
 * @property {string} email - The unique email address of the player. Must be a valid email format.
 * @property {string} [password_hash] - The hashed password of the player.
 * @property {Date} [registration_date] - The registration date of the player. Defaults to the current date.
 * @property {Date} [last_login] - The last login date of the player.
 * @property {number} [status=1] - The status of the player. Can be 1 (active), 0 (inactive).
 * @property {number} [is_verified=0] - Indicates if the player's email is verified. 1 for true, 0 for false.
 * @property {number} [is_2fa=0] - Indicates if the player has two-factor authentication enabled. 1 for true, 0 for false.
 * @property {Schema.Types.ObjectId} [currency] - The currency of the player, referenced from the Currency collection.
 * @property {Schema.Types.ObjectId} [language] - The language of the player, referenced from the Language collection.
 * @property {Schema.Types.ObjectId} [country] - The country of the player, referenced from the Country collection.
 * @property {Schema.Types.ObjectId} [city] - The city of the player, referenced from the City collection.
 * @property {Schema.Types.ObjectId} role_id - The role of the player, referenced from the Role collection. This field is required.
 * @property {Date} created_at - The date when the player record was created.
 * @property {Date} updated_at - The date when the player record was last updated.
 */
const playerSchema: Schema = new Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters']
  },
  fullname: { 
    type: String, 
    required: true,
    trim: true
  },
  patronymic: { 
    type: String, 
    required: true,
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
    type: Schema.Types.ObjectId, 
    ref: 'Gender' 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    validate: {
      validator: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: 'Invalid email format'
    }
  },
  password_hash: { 
    type: String, 
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
    enum: [0, 1], // 0 = inactive, 1 = active
    default: 1 
  },
  is_verified: { 
    type: Number, 
    enum: [0, 1], // 0 = unverified, 1 = verified
    default: 0 
  },
  is_2fa: { 
    type: Number, 
    enum: [0, 1], // 0 = disabled, 1 = enabled
    default: 0 
  },
  currency: { 
    type: Schema.Types.ObjectId, 
    ref: 'Currency' 
  },
  language: { 
    type: Schema.Types.ObjectId, 
    ref: 'Language' 
  },
  country: { 
    type: Schema.Types.ObjectId, 
    ref: 'Country' 
  },
  city: { 
    type: Schema.Types.ObjectId, 
    ref: 'City' 
  },
  role_id: { 
    type: Schema.Types.ObjectId, 
    ref: 'Role', 
    required: true 
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