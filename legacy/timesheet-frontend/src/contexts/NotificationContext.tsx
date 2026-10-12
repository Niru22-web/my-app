import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import API, { API_BASE_URL } from '../api';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';

export interface Notification {
  id: string;
  title?: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  userId?: string;
  relatedId?: string;
  actionUrl?: string;
  module?: string;
  priority?: string;
  isArchived?: boolean;
  isPinned?: boolean;
  isStarred?: boolean;
  snoozedUntil?: string | null;
  metadata?: any;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  filter: string;
  isLoading: boolean;
}

type NotificationAction =
  | { type: 'ADD_NOTIFICATION'; payload: Notification }
  | { type: 'MARK_AS_READ'; payload: string }
  | { type: 'MARK_ALL_AS_READ' }
  | { type: 'SET_FILTER'; payload: string }
  | { type: 'SET_NOTIFICATIONS'; payload: Notification[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'REMOVE_NOTIFICATION'; payload: string }
  | { type: 'UPDATE_NOTIFICATION'; payload: { id: string; updates: Partial<Notification> } };

const initialState: NotificationState = {
  notifications: [],
  unreadCount: 0,
  filter: 'all',
  isLoading: false,
};

const notificationReducer = (state: NotificationState, action: NotificationAction): NotificationState => {
  switch (action.type) {
    case 'ADD_NOTIFICATION': {
      const newNotifications = [action.payload, ...state.notifications];
      const newUnreadCount = newNotifications.filter(n => !n.isRead && !n.isArchived).length;
      return {
        ...state,
        notifications: newNotifications,
        unreadCount: newUnreadCount,
      };
    }
    
    case 'MARK_AS_READ': {
      const updatedNotifications = state.notifications.map(n =>
        n.id === action.payload ? { ...n, isRead: true } : n
      );
      const newUnreadCount = updatedNotifications.filter(n => !n.isRead && !n.isArchived).length;
      return {
        ...state,
        notifications: updatedNotifications,
        unreadCount: newUnreadCount,
      };
    }
    
    case 'MARK_ALL_AS_READ': {
      const allReadNotifications = state.notifications.map(n => ({ ...n, isRead: true }));
      return {
        ...state,
        notifications: allReadNotifications,
        unreadCount: 0,
      };
    }
    
    case 'REMOVE_NOTIFICATION': {
      const filteredNotifications = state.notifications.filter(n => n.id !== action.payload);
      const newUnreadCountAfterRemoval = filteredNotifications.filter(n => !n.isRead && !n.isArchived).length;
      return {
        ...state,
        notifications: filteredNotifications,
        unreadCount: newUnreadCountAfterRemoval,
      };
    }
    
    case 'SET_FILTER':
      return { ...state, filter: action.payload };
    
    case 'SET_NOTIFICATIONS': {
      const fetchedUnreadCount = action.payload.filter(n => !n.isRead && !n.isArchived).length;
      return {
        ...state,
        notifications: action.payload,
        unreadCount: fetchedUnreadCount,
      };
    }
    
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'UPDATE_NOTIFICATION': {
      const updatedNotifications = state.notifications.map(n =>
        n.id === action.payload.id ? { ...n, ...action.payload.updates } : n
      );
      const newUnreadCount = updatedNotifications.filter(n => !n.isRead && !n.isArchived).length;
      return {
        ...state,
        notifications: updatedNotifications,
        unreadCount: newUnreadCount,
      };
    }
    
    default:
      return state;
  }
};

interface NotificationContextType {
  state: NotificationState;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) => void;
  markAsRead: (id: string) => void;
  markAsUnread: (id: string) => void;
  markAllAsRead: () => void;
  setFilter: (filter: string) => void;
  fetchNotifications: (showArchived?: boolean) => void;
  playNotificationSound: () => void;
  removeNotification: (id: string) => void;
  updateNotification: (id: string, updates: Partial<Notification>) => Promise<void>;
  toggleArchive: (id: string, isArchived: boolean) => Promise<void>;
  togglePin: (id: string, isPinned: boolean) => Promise<void>;
  toggleStar: (id: string, isStarred: boolean) => Promise<void>;
  snooze: (id: string, snoozedUntil: string | null) => Promise<void>;
  bulkDeleteNotifications: (ids: string[]) => Promise<void>;
  bulkMarkNotificationsAsRead: (ids: string[]) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(notificationReducer, initialState);
  const toast = useToast();
  const { isAuthenticated } = useAuth();

  const playNotificationSound = () => {
    try {
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.3;
      audio.play().catch(() => {
        // Fallback: silent fail
      });
    } catch (error) {
      console.log('Audio not supported:', error);
    }
  };

  const addNotification = (notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) => {
    const newNotification: Notification = {
      ...notification,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      isRead: false,
    };
    
    dispatch({ type: 'ADD_NOTIFICATION', payload: newNotification });
    playNotificationSound();
    
    // Show toast based on notification type
    switch (notification.type) {
      case 'timesheet_submission':
        toast.info(notification.message, {
          label: 'Review',
          onClick: () => {
            if (notification.actionUrl) window.location.href = notification.actionUrl;
          }
        });
        break;
      case 'timesheet_approved':
        toast.success(notification.message);
        break;
      case 'timesheet_rejected':
        toast.error(notification.message);
        break;
      default:
        toast.info(notification.message);
    }
  };

  const updateNotification = async (id: string, updates: Partial<Notification>) => {
    dispatch({ type: 'UPDATE_NOTIFICATION', payload: { id, updates } });
    try {
      await API.patch(`/notifications/${id}`, updates);
    } catch (error) {
      console.error('Failed to update notification state on server:', error);
    }
  };

  const markAsRead = async (id: string) => {
    await updateNotification(id, { isRead: true });
  };

  const markAsUnread = async (id: string) => {
    await updateNotification(id, { isRead: false });
  };

  const toggleArchive = async (id: string, isArchived: boolean) => {
    await updateNotification(id, { isArchived });
  };

  const togglePin = async (id: string, isPinned: boolean) => {
    await updateNotification(id, { isPinned });
  };

  const toggleStar = async (id: string, isStarred: boolean) => {
    await updateNotification(id, { isStarred });
  };

  const snooze = async (id: string, snoozedUntil: string | null) => {
    await updateNotification(id, { snoozedUntil });
  };

  const markAllAsRead = async () => {
    dispatch({ type: 'MARK_ALL_AS_READ' });
    try {
      await API.patch('/notifications/read-all');
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  const setFilter = (filter: string) => {
    dispatch({ type: 'SET_FILTER', payload: filter });
  };

  const removeNotification = async (id: string) => {
    dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
    try {
      await API.delete(`/notifications/${id}`);
    } catch (error) {
      console.error('Failed to remove notification:', error);
    }
  };

  const fetchNotifications = async (showArchived = false) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const response = await API.get(`/notifications?archived=${showArchived ? 'all' : 'false'}`);
      if (response.data.success) {
        dispatch({ type: 'SET_NOTIFICATIONS', payload: response.data.data });
      }
    } catch (error: any) {
      console.warn('⚠️ Could not fetch notifications (Server may be down):', error.message);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // Fetch notifications on mount - only if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
    }
  }, [isAuthenticated]);

  // Setup Polling fallback (refresh counts/feed every 30 seconds)
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      fetchNotifications();
    }, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Setup Socket.io for Real-Time Updates
  useEffect(() => {
    if (!isAuthenticated) return;

    console.log('📡 Initializing Socket.io connection to:', API_BASE_URL);
    
    const socket: Socket = io(API_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 20000,
      secure: true,
      rejectUnauthorized: false
    });

    socket.on('connect', () => {
      console.log('✅ Connected to Notification Socket:', socket.id);
      
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const userObj = JSON.parse(userStr);
          if (userObj.id) {
            socket.emit('join_user_room', userObj.id);
            console.log('👤 Joined socket room for user:', userObj.id);
          }
        } catch (e) {
          console.error('❌ Failed to parse user for socket room:', e);
        }
      }
    });

    socket.on('connect_error', (error) => {
      console.warn('❌ Socket Connection Error:', error.message);
    });

    socket.on('reconnect_attempt', (attempt) => {
      console.log(`🔄 Socket Reconnection Attempt #${attempt}`);
    });

    socket.on('new_notification', (notification) => {
      dispatch({ type: 'ADD_NOTIFICATION', payload: notification });
      playNotificationSound();
      toast.info(notification.title || 'New Notification', {
        label: 'View',
        onClick: () => {
          if (notification.actionUrl) window.location.href = notification.actionUrl;
        }
      });
    });

    socket.on('attendance_updated', () => {
      window.dispatchEvent(new CustomEvent('attendance-updated'));
    });

    socket.on('workforce_pulse_updated', () => {
      window.dispatchEvent(new CustomEvent('attendance-updated'));
    });

    return () => {
      socket.disconnect();
    };
  }, [isAuthenticated]);

  const bulkDeleteNotifications = async (ids: string[]) => {
    // Optimistically remove from state
    ids.forEach(id => {
      dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
    });
    try {
      await API.post('/notifications/bulk-delete', { ids });
    } catch (error) {
      console.error('Failed to bulk delete notifications:', error);
    }
  };

  const bulkMarkNotificationsAsRead = async (ids: string[]) => {
    // Optimistically mark as read in state
    ids.forEach(id => {
      dispatch({ type: 'UPDATE_NOTIFICATION', payload: { id, updates: { isRead: true } } });
    });
    try {
      await API.post('/notifications/bulk-update', { ids, isRead: true });
    } catch (error) {
      console.error('Failed to bulk mark notifications as read:', error);
    }
  };

  const value: NotificationContextType = {
    state,
    addNotification,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    setFilter,
    fetchNotifications,
    playNotificationSound,
    removeNotification,
    updateNotification,
    toggleArchive,
    togglePin,
    toggleStar,
    snooze,
    bulkDeleteNotifications,
    bulkMarkNotificationsAsRead,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
