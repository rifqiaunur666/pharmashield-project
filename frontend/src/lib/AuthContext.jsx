/**
 * src/lib/AuthContext.jsx
 * PharmaShield — Global Authentication & Profile Context (Zero-Delay & Instant Hydration).
 */
'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  fetchCurrentUser,
  loginUser,
  registerUser,
  clearAuthSession,
  getStoredUser,
  getAuthToken,
  updateMedicalProfile as apiUpdateMedicalProfile,
} from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initialize auth immediately from localStorage on client mount (0ms delay)
  useEffect(() => {
    try {
      const stored = getStoredUser();
      const token = getAuthToken();
      if (stored && token) {
        setUser(stored);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }

    // Silent background token revalidation (never blocks the UI)
    const token = getAuthToken();
    if (token) {
      fetchCurrentUser()
        .then((freshUser) => {
          if (freshUser) {
            setUser(freshUser);
          }
        })
        .catch(() => {});
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const token = getAuthToken();
      if (!token) {
        setUser(null);
        return null;
      }
      const current = await fetchCurrentUser();
      if (current) {
        setUser(current);
      }
      return current;
    } catch {
      return getStoredUser();
    }
  }, []);

  const login = async (email, password) => {
    const loggedInUser = await loginUser({ email, password });
    setUser(loggedInUser);
    setLoading(false);
    return loggedInUser;
  };

  const register = async ({ fullName, email, password, confirmPassword, autoLogin = false }) => {
    const res = await registerUser({ fullName, email, password, confirmPassword, autoLogin });
    if (autoLogin && res?.user) {
      setUser(res.user);
      setLoading(false);
    }
    return res;
  };

  const logout = () => {
    clearAuthSession();
    setUser(null);
    setLoading(false);
  };

  const saveMedicalProfile = async (profileData) => {
    const updatedProfile = await apiUpdateMedicalProfile(profileData);
    setUser((prev) => (prev ? { ...prev, medical_profile: updatedProfile } : null));
    return updatedProfile;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: Boolean(user),
        login,
        register,
        logout,
        refreshUser,
        saveMedicalProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
