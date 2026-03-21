import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Keep token in memory only (for socket auth) - not in localStorage
  const tokenRef = useRef(null);

  useEffect(() => {
    // Check if we have a valid session by calling /me (cookie sent automatically)
    authService.getMe()
      .then(setUser)
      .catch(() => {
        tokenRef.current = null;
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((token, userData) => {
    tokenRef.current = token;
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Ignore logout errors
    }
    tokenRef.current = null;
    setUser(null);
  }, []);

  const updateUser = useCallback((userData) => {
    setUser(userData);
  }, []);

  const getToken = useCallback(() => {
    return tokenRef.current;
  }, []);

  const value = {
    user,
    loading,
    login,
    logout,
    updateUser,
    getToken,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
