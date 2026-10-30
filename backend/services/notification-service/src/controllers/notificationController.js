import * as notificationService from "../services/notificationService.js";
import { createNotificationHandlers } from './notificationHandlers.js';

export const { getNotifications, getUnreadCount, markAsRead, markAllAsRead } = createNotificationHandlers(notificationService);

