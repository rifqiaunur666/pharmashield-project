/**
 * src/lib/AuthContext.jsx
 * PharmaShield — Global Authentication & Profile Context.
 * Instant hydration: reads localStorage synchronously on first render,
 * then validates the token async in the background (no loading flash).
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
  setAuthToken,
  setStoredUser,
  updateMedicalProfile as apiUpdateMedicalProfile,
} from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Instant hydration — read localStorage right away (synchronous)
  const [user, setUser] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('pharmashield_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  // loading=false immediately because we already have cached data
  const [loading, setLoading] = useState(false);

  // Background validation: silently re-verify token with backend
  const refreshUser = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const current = await fetchCurrentUser();
      if (current) {
        setUser(current);
      }
    } catch {
      // Keep cached user if network fails — don't log out on flaky connection
      const cached = getStoredUser();
      if (cached) setUser(cached);
    }
  }, []);

  useEffect(() => {
    // Run background token validation after mount — doesn't block render
    refreshUser();
  }, [refreshUser]);

  const login = async (email, password) => {
    const loggedInUser = await loginUser({ email, password });
    setUser(loggedInUser);
    return loggedInUser;
  };

  const register = async (fullName, email, password) => {
    const newUser = await registerUser({ fullName, email, password });
    setUser(newUser);
    return newUser;
  };

  const logout = () => {
    clearAuthSession();
    setUser(null);
  };

  const saveMedicalProfile = async (profileData) => {
    const updatedProfile = await apiUpdateMedicalProfile(profileData);
    setUser((prev) => prev ? { ...prev, medical_profile: updatedProfile } : null);
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

