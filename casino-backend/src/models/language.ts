import mongoose, { Schema, Document } from 'mongoose';

export interface ILanguage extends Document {
  name: string; // e.g., 'English', 'Spanish', 'French'
}

const languageSchema: Schema = new Schema({
  name: { type: String, required: true, unique: true },
});

export default mongoose.model<ILanguage>('Language', languageSchema);
