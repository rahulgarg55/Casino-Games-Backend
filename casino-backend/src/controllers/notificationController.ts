import { Request, Response } from 'express';
import Notification from '../models/notification';
import mongoose from 'mongoose';

interface CustomRequest extends Request {
  user?: {
    id: string;
    role: number;
  };
}

export const markNotificationRead = async (req: CustomRequest, res: Response) => {
  await Notification.updateOne(
    { _id: req.params.notificationId, user_id: req.user?.id },
    { $set: { isUnRead: false } }
  );
  res.json({ success: true });
};

export const markNotificationUnread = async (req: CustomRequest, res: Response) => {
  await Notification.updateOne(
    { _id: req.params.notificationId, user_id: req.user?.id },
    { $set: { isUnRead: true } }
  );
  res.json({ success: true });
};

export const markBulkNotificationsRead = async (req: CustomRequest, res: Response) => {
  const { notificationIds } = req.body;
  await Notification.updateMany(
    { _id: { $in: notificationIds }, user_id: req.user?.id },
    { $set: { isUnRead: false } }
  );
  res.json({ success: true });
};

export const markBulkNotificationsUnread = async (req: CustomRequest, res: Response) => {
  const { notificationIds } = req.body;
  await Notification.updateMany(
    { _id: { $in: notificationIds }, user_id: req.user?.id },
    { $set: { isUnRead: true } }
  );
  res.json({ success: true });
};

export const bulkDeleteNotifications = async (req: CustomRequest, res: Response) => {
  const { notificationIds } = req.body;
  await Notification.deleteMany({ _id: { $in: notificationIds }, user_id: req.user?.id });
  res.json({ success: true });
};

export const getNotifications = async (req: CustomRequest, res: Response) => {
  const { page = 1, limit = 10, type } = req.query;
  const filter: any = { user_id: req.user?.id };
  if (type && type !== 'all') filter.type = type;
  const notifications = await Notification.find(filter)
    .sort({ created_at: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit));
  const total = await Notification.countDocuments(filter);
  res.json({
    success: true,
    data: {
      notifications,
      pagination: {
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
    },
  });
};

export const getNotificationDetails = async (req: CustomRequest, res: Response) => {
  const notification = await Notification.findOne({ _id: req.params.notificationId, user_id: req.user?.id });
  if (!notification) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: notification });
};

export const markAllNotificationsRead = async (req: CustomRequest, res: Response) => {
  await Notification.updateMany({ user_id: req.user?.id }, { $set: { isUnRead: false } });
  res.json({ success: true });
}; 