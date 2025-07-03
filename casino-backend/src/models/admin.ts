import mongoose, { Schema, Document } from 'mongoose';

export interface IAdmin extends Document {
  username: string;
  fullname: string;
  email: string;
  password_hash: string;
  status?: string;
  role_id: number;
  created_at?: Date;
  updated_at?: Date;
}

const adminSchema: Schema = new Schema(
  {
    username: { type: String, required: true, unique: true, minlength: 3, maxlength: 30 },
    fullname: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'Invalid email format',
      },
    },
    password_hash: { type: String, required: true, select: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    role_id: { type: Number, default: 1, enum: [1, 2] }, // 1 = Admin, 2 = SuperAdmin (example)
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

export default mongoose.model<IAdmin>('Admin', adminSchema); 