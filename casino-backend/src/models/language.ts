import mongoose, { Schema, Document } from 'mongoose';

export interface ILanguage extends Document {
  name: string;
  code: number; // Unique code for each language
}

const languageSchema: Schema = new Schema({
  name: { type: String, required: true },
  code: { type: Number, required: true, unique: true }
});

export default mongoose.model<ILanguage>('Language', languageSchema);
