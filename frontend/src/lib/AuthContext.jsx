/**
 * src/lib/AuthContext.jsx
 * PharmaShield — Global Authentication & Profile Context.
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

  // Initialize auth from token / local storage
  const refreshUser = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      if (!token) {
        setUser(null);
        return;
      }
      const current = await fetchCurrentUser();
      setUser(current);
    } catch (err) {
      console.warn('[Auth] Session validation failed:', err);
      setUser(getStoredUser());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email, password) => {
    const loggedInUser = await loginUser({ email, password });
    setUser(loggedInUser);
    return loggedInUser;
  };

  const register = async ({ fullName, email, password, confirmPassword, autoLogin = false }) => {
    const res = await registerUser({ fullName, email, password, confirmPassword, autoLogin });
    if (autoLogin && res?.user) {
      setUser(res.user);
    }
    return res;
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
