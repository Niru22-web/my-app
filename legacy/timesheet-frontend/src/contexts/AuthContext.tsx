/* @refresh reload */
/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import API from '../api';
import { useToast } from './ToastContext';

interface User {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  role: string;
  position?: string;
  department?: string;
  employeeId?: string;
  designation?: string;
  officeEmail?: string;
  profileImage?: string;
  updatedAt?: string;
  profile?: {
    profileImage?: string;
    [key: string]: unknown;
  };
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
  isAuthenticated: boolean;
  loading: boolean;
  refreshToken: () => Promise<boolean>; // 🔥 Add token refresh capability
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const toast = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing auth token and user data on mount
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (token && userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Error parsing user data:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  // Inactivity timeout: auto log out after 15 minutes of inactivity
  useEffect(() => {
    if (!isAuthenticated) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      // 15 minutes = 15 * 60 * 1000
      timeoutId = setTimeout(() => {
        toast.error('Session expired due to inactivity. Please log in again.');
        logout();
      }, 15 * 60 * 1000);
    };

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

    resetTimer();

    activityEvents.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [isAuthenticated, toast]);

  const refreshToken = async (): Promise<boolean> => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return false;

      const response = await API.post('/auth/refresh', { token });
      
      if (response.data.token && response.data.user) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        setUser(response.data.user);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Token refresh failed:', error);
      logout();
      return false;
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    // Validate input before sending request
    if (!email || !password) {
      toast.error('❌ Email and password are required');
      return false;
    }

    if (!email.includes('@') || email.length < 5) {
      toast.error('❌ Please enter a valid email address');
      return false;
    }

    if (password.length < 6) {
      toast.error('❌ Password must be at least 6 characters long');
      return false;
    }

    try {
      const normalizedEmail = email.trim().toLowerCase();
      console.log('🔐 Login request payload:', { email: normalizedEmail, password: '***' });
      
      const response = await API.post('/auth/login', {
        email: normalizedEmail,
        password: password
      });

      console.log('🔐 Login response:', response.data);

      if (response.data.token && response.data.user) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        setUser(response.data.user);
        setIsAuthenticated(true);
        return true;
      } else {
        console.error('Login failed:', response.data);
        // Show more specific error message from backend
        const errorMessage = response.data?.message || response.data?.error || 'Login failed. Please check your credentials.';
        toast.error(`❌ ${errorMessage}`);
        return false;
      }
    } catch (error: unknown) {
      console.error('Login error:', error);
      
      const err = error as { 
        response?: { status: number; data?: { message?: string } }; 
        code?: string; 
        message?: string;
      };
      
      // Handle different error types
      if (err.response) {
        const status = err.response.status;
        const backendMessage = err.response.data?.message;
        
        if (status === 401) {
          toast.error(`❌ ${backendMessage || 'Invalid credentials. Please try again.'}`);
        } else if (status === 403) {
          toast.error(`🚫 ${backendMessage || 'Access denied. Your account may be inactive.'}`);
        } else if (status === 400) {
          toast.error(`⚠️ ${backendMessage || 'Invalid request. Please check your details.'}`);
        } else if (status >= 500) {
          toast.error('🔥 Server error. Please try again later.');
        } else {
          toast.error(`❌ Login failed (${status}): ${backendMessage || err.message}`);
        }
      } else if (err.code === 'ERR_NETWORK' || err.message?.includes('ERR_CONNECTION_REFUSED')) {
        toast.error('🌐 Network error. Please check if the backend is running.');
      } else if (err.message?.includes('timeout')) {
        toast.error('⏱️ Request timed out. Please try again.');
      } else {
        toast.error(`❌ Login failed: ${err.message || 'Unknown error'}`);
      }
      
      return false;
    }
  };

  const updateUser = (data: Partial<User>) => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...data };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setIsAuthenticated(false);
  };

  const register = async (name: string, email: string, password: string): Promise<boolean> => {
    try {
      const response = await API.post('/auth/register', {
        name,
        email,
        password
      });

      if (response.data.token && response.data.user) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        setUser(response.data.user);
        setIsAuthenticated(true);
        return true;
      } else {
        console.error('Registration failed:', response.data);
        const errorMessage = response.data?.error || 'Registration failed. Please try again.';
        toast.error(`❌ ${errorMessage}`);
        return false;
      }
    } catch (error: unknown) {
      console.error('Registration error:', error);
      const err = error as { message?: string };
      toast.error(`❌ Registration failed: ${err.message || 'Unknown error'}`);
      return false;
    }
  };

  const value: AuthContextType = {
    user,
    login,
    register,
    logout,
    updateUser,
    isAuthenticated,
    loading,
    refreshToken // 🔥 Export refresh function
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
