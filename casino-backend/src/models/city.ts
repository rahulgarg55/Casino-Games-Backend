import mongoose, { Schema, Document } from 'mongoose';

export interface ICity extends Document {
  name: string; // e.g., 'New York', 'Mumbai', 'London'
}

const citySchema: Schema = new Schema({
  name: { type: String, required: true, unique: true },
});

export const City = mongoose.model<ICity>('City', citySchema);
