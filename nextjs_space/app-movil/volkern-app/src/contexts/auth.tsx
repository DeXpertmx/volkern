import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/auth';
import * as storage from '../services/storage';
import { registerPushToken } from '../services/push-notification';
import type { UserData } from '../services/storage';

// ─── Context Type ─────────────────────────────────────────────────────────────
interface AuthContextType {
  user: UserData | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  checkBiometric: () => Promise<boolean>;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  setBiometric: (enabled: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);

  // Verificar sesión al montar
  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      // Primero intentar biometría
      const hasBiometric = await authService.isBiometricAvailable();
      setBiometricAvailable(hasBiometric);

      if (hasBiometric) {
        const bioEnabled = await storage.isBiometricEnabled();
        setBiometricEnabledState(bioEnabled);

        if (bioEnabled) {
          const result = await authService.loginWithBiometrics();
          if (result) {
            setUser(result.user);
            registerPushToken().catch(() => {});
            setIsLoading(false);
            return;
          }
        }
      }

      // Fallback a token de sesión
      const sessionUser = await authService.checkSession();
      if (sessionUser) {
        setUser(sessionUser);
        // Verificar si biometría está habilitada
        if (hasBiometric) {
          const bioEnabled = await storage.isBiometricEnabled();
          setBiometricEnabledState(bioEnabled);
        }
        // Registrar push token para sesión existente
        registerPushToken().catch(() => {});
      }
    } catch {
      // No hay sesión, iniciar como invitado
    } finally {
      setIsLoading(false);
    }
  }

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await authService.login({ email, password });
    setUser(response.user);

    // Verificar biometría disponible
    const available = await authService.isBiometricAvailable();
    setBiometricAvailable(available);
    if (available) {
      const enabled = await storage.isBiometricEnabled();
      setBiometricEnabledState(enabled);
    }

    // Registrar push notification token (no bloqueante)
    registerPushToken().catch(() => {});
  }, []);

  const signOut = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const checkBiometric = useCallback(async () => {
    return authService.isBiometricAvailable();
  }, []);

  const setBiometric = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const success = await authService.enableBiometric(user?.email || '');
      if (success) {
        setBiometricEnabledState(true);
      }
    } else {
      await authService.disableBiometric();
      setBiometricEnabledState(false);
    }
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signOut,
        checkBiometric,
        biometricAvailable,
        biometricEnabled,
        setBiometric,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
