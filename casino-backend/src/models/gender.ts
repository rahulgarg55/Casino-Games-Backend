import mongoose, { Schema, Document } from 'mongoose';

export interface IGender extends Document {
  name: string; // e.g., 'Male', 'Female', 'Transgender'
}

const genderSchema: Schema = new Schema({
  name: { type: String, required: true, unique: true },
});

export default mongoose.model<IGender>('Gender', genderSchema);
