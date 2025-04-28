import mongoose, { Schema, Document } from 'mongoose';

export interface ILanguage extends Document {
  name: string;
  shortName: string;
}

const languageSchema: Schema = new Schema({
  name: { type: String, required: true, unique: true },
  shortName: { type: String, required: true, unique: true },
});

export default mongoose.model<ILanguage>('languages', languageSchema);
