import Notification from '../models/notification';
import { logger } from '../utils/logger';

// Curried notification sender factory
export const createNotificationSender = (type: string) => async (userIds: string[], message: string, data?: any) => {
  const notificationPromises = userIds.map(async (userId) => {
    try {
      const notification = new Notification({
        user_id: userId,
        type,
        message,
        data,
        is_read: false
      });
      
      await notification.save();
      logger.info(`Notification sent to user ${userId}`, { type, message });
      return { userId, success: true };
    } catch (error) {
      logger.error(`Failed to send notification to user ${userId}`, { error });
      return { userId, success: false, error };
    }
  });

  return await Promise.all(notificationPromises);
};

// Specific notification senders using currying
export const sendEmailNotification = createNotificationSender('email');
export const sendSMSNotification = createNotificationSender('sms');
export const sendPushNotification = createNotificationSender('push');
export const sendSystemNotification = createNotificationSender('system');

// Batch notification processing with Promise.all
export const sendBatchNotifications = async (notifications: Array<{
  userId: string;
  type: string;
  message: string;
  data?: any;
}>) => {
  const notificationPromises = notifications.map(async (notification) => {
    const sender = createNotificationSender(notification.type);
    return await sender([notification.userId], notification.message, notification.data);
  });

  return await Promise.all(notificationPromises);
}; 