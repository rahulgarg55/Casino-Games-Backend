import mongoose, { Schema, Document } from 'mongoose';

export interface ICountry extends Document {
  name: string; // e.g., 'USA', 'India', 'UK'
}

const countrySchema: Schema = new Schema({
  name: { type: String, required: true, unique: true },
});

export const Country = mongoose.model<ICountry>('Country', countrySchema);
