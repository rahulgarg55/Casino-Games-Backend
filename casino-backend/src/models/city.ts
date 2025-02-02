import mongoose, { Schema, Document } from 'mongoose';

export interface ICity extends Document {
    name: string;
    code: number; // Unique code for each city
  }
  
  const citySchema: Schema = new Schema({
    name: { type: String, required: true },
    code: { type: Number, required: true, unique: true }
  });
  
  export const City = mongoose.model<ICity>('City', citySchema);