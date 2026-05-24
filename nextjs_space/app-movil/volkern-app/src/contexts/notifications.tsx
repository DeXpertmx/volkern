import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { notificationsService } from '../services/notifications';

// ─── Context ──────────────────────────────────────────────────────────────────
interface NotificationsContextValue {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  decrementUnread: () => void;
  resetUnread: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  unreadCount: 0,
  refreshUnreadCount: async () => {},
  decrementUnread: () => {},
  resetUnread: () => {},
});

export function useNotificationsCount() {
  return useContext(NotificationsContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const count = await notificationsService.getUnreadCount();
      setUnreadCount(count);
    } catch {
      // Silently fail
    }
  }, []);

  const decrementUnread = useCallback(() => {
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const resetUnread = useCallback(() => {
    setUnreadCount(0);
  }, []);

  // Refresh on mount — badge visible desde el inicio de la app
  useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  return (
    <NotificationsContext.Provider
      value={{ unreadCount, refreshUnreadCount, decrementUnread, resetUnread }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
