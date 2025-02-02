// models/gender.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IGender extends Document {
  name: string;
  code: number; // 0 = Male, 1 = Female, 2 = Transgender
}

const genderSchema: Schema = new Schema({
  name: { type: String, required: true },
  code: { type: Number, required: true, unique: true }
});

export default mongoose.model<IGender>('Gender', genderSchema);