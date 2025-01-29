import mongoose, { Schema, Document } from 'mongoose';

export interface IRole extends Document {
  name: string;
  description?: string;
  is_deleted?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Mongoose schema for the Role model.
 * 
 * This schema defines the structure of the Role documents in the MongoDB collection.
 * 
 * Properties:
 * - `name` (String): The name of the role. It is required, unique, trimmed, and must be between 2 and 50 characters.
 * - `description` (String): A description of the role. It can be up to 255 characters.
 * - `is_deleted` (Boolean): A flag indicating whether the role is deleted. Defaults to `false`.
 * 
 * Options:
 * - `timestamps`: Automatically manages `created_at` and `updated_at` fields.
 * - `toJSON`: Customizes the JSON output by removing the `__v` and `is_deleted` fields.
 */
const roleSchema: Schema = new Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true,
    minlength: [2, 'Role name must be at least 2 characters'],
    maxlength: [50, 'Role name cannot exceed 50 characters'],
    trim: true
  },
  description: {
    type: String,
    maxlength: [255, 'Description cannot exceed 255 characters']
  },
  is_deleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { 
    createdAt: 'created_at', 
    updatedAt: 'updated_at' 
  },
  toJSON: {
    transform: (doc, ret) => {
      delete ret.__v;
      delete ret.is_deleted;
      return ret;
    }
  }
});

// Soft delete middleware
roleSchema.pre(/^find/, function(this: mongoose.Query<any, any> & { options: { withDeleted?: boolean } }, next) {
  if (!this.options.withDeleted) {
    this.where({ is_deleted: false });
  }
  next();
});

export default mongoose.model<IRole>('Role', roleSchema);