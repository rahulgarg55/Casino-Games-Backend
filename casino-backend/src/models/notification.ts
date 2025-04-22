import mongoose, { Schema, Document } from 'mongoose';

export enum NotificationType {
  USER_REGISTERED = 'USER_REGISTERED',
  DEPOSIT_MADE = 'DEPOSIT_MADE',
  WITHDRAWAL_REQUESTED = 'WITHDRAWAL_REQUESTED',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',
  PHONE_VERIFIED = 'PHONE_VERIFIED',
  KYC_UPDATE = 'KYC_UPDATE',
  AFFILIATE_COMMISSION = 'AFFILIATE_COMMISSION',
}

export interface INotification extends Document {
  type: NotificationType;
  message: string;
  user_id: mongoose.Types.ObjectId | null;
  metadata?: Record<string, any>;
  created_at: Date;
}

const notificationSchema = new Schema({
  type: {
    type: String,
    enum: Object.values(NotificationType),
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  user_id: {
    type: Schema.Types.ObjectId,
    ref: 'Affiliate',
    default: null,
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

notificationSchema.index({ created_at: -1 });
const Notification = mongoose.model<INotification>(
  'Notification',
  notificationSchema,
);
export default Notification;