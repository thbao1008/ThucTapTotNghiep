// Pure HTTP boundary: no database/environment imports. Production supplies the
// existing user-scoped service; tests can inject a repository without opening PG.
export const MAX_NOTIFICATION_LIMIT = 100;
export const MAX_NOTIFICATION_OFFSET = 1_000_000;

class NotificationRequestError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function positiveInteger(value) {
  if ((typeof value !== 'number' && typeof value !== 'string')
    || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) return null;
  return Number(value);
}

function actorId(req) {
  const id = positiveInteger(req.user?.id ?? req.user?.userId);
  if (!id) throw new NotificationRequestError('Authentication required', 401);
  return id;
}

export function parseNotificationQuery(query = {}) {
  const page = query.page === undefined ? 1 : positiveInteger(query.page);
  const limit = query.limit === undefined ? 20 : positiveInteger(query.limit);
  if (!page || !limit || limit > MAX_NOTIFICATION_LIMIT) {
    throw new NotificationRequestError('Invalid notification pagination');
  }
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset) || offset > MAX_NOTIFICATION_OFFSET) {
    throw new NotificationRequestError('Invalid notification pagination');
  }
  const unread = query.unreadOnly;
  if (unread !== undefined && unread !== 'true' && unread !== 'false') {
    throw new NotificationRequestError('Invalid unreadOnly filter');
  }
  return { page, limit, unreadOnly: unread === 'true' };
}

export function createNotificationHandlers(service, { logger = console } = {}) {
  const handle = (operation, work) => async (req, res) => {
    try { return await work(req, res, actorId(req)); }
    catch (error) {
      if (error instanceof NotificationRequestError) {
        return res.status(error.status).json({ message: error.message,
          ...(error.status === 401 ? { requiresLogin: true } : {}) });
      }
      // SQL/provider diagnostics may contain private data; expose/log neither.
      logger?.error?.(`Notification ${operation} failed`);
      return res.status(500).json({ message: 'Server error' });
    }
  };
  return {
    getNotifications: handle('list', async (req, res, userId) => {
      const options = parseNotificationQuery(req.query);
      const notifications = await service.getNotifications(userId, options);
      if (!Array.isArray(notifications)) throw new Error('Invalid notification list');
      return res.json({ notifications });
    }),
    getUnreadCount: handle('count', async (_req, res, userId) => {
      const count = await service.getUnreadCount(userId);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid unread count');
      return res.json({ count });
    }),
    markAsRead: handle('read', async (req, res, userId) => {
      const id = positiveInteger(req.params?.id);
      if (!id) throw new NotificationRequestError('Invalid notification id');
      const notification = await service.markAsRead(id, userId);
      if (!notification) return res.status(404).json({ message: 'Notification not found' });
      if (positiveInteger(notification.id) !== id
        || (notification.user_id !== undefined && positiveInteger(notification.user_id) !== userId)) {
        throw new Error('Invalid notification identity');
      }
      return res.json({ notification });
    }),
    markAllAsRead: handle('read-all', async (_req, res, userId) => {
      const notifications = await service.markAllAsRead(userId);
      if (!Array.isArray(notifications)) throw new Error('Invalid notification list');
      return res.json({ count: notifications.length });
    })
  };
}
