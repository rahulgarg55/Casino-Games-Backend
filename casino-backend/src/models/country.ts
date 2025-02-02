import mongoose, { Schema, Document } from 'mongoose';

export interface ICountry extends Document {
    name: string;
    code: number; // Unique code for each country
  }
  
  const countrySchema: Schema = new Schema({
    name: { type: String, required: true },
    code: { type: Number, required: true, unique: true }
  });
  
  export const Country = mongoose.model<ICountry>('Country', countrySchema);