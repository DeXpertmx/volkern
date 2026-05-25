import { api } from './api';
import * as storage from './storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────
interface LoginCredentials {
  email: string;
  password: string;
}

interface LoginResponse {
  token: string;
  user: storage.UserData;
}

interface SessionResponse {
  session: storage.UserData;
}

// ─── Auth Service ─────────────────────────────────────────────────────────────
export const authService = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>(
      '/customer/auth/login',
      credentials,
    );

    // Guardar token y usuario
    await storage.setToken(response.token);
    await storage.setUserData(response.user);
    return response;
  },

  async logout(): Promise<void> {
    await storage.clearAll();
  },

  async checkSession(): Promise<storage.UserData | null> {
    try {
      // Validar que el token sea válido
      await api.get<SessionResponse>('/customer/auth/me');
      // Devolver datos cacheados
      return await storage.getUserData();
    } catch {
      await storage.clearAll();
      return null;
    }
  },

  async forgotPassword(email: string): Promise<void> {
    await api.post('/auth/recuperar-contrasena', { email });
  },

  async validateResetToken(token: string): Promise<{ valid: boolean }> {
    return api.get<{ valid: boolean }>(`/auth/validar-token?token=${encodeURIComponent(token)}`);
  },

  async resetPassword(token: string, password: string): Promise<void> {
    await api.post('/auth/resetear-contrasena', { token, password });
  },

  async isBiometricAvailable(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  },

  async loginWithBiometrics(): Promise<LoginResponse | null> {
    const biometricToken = await storage.getBiometricToken();
    if (!biometricToken) return null;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Acceder a Volkern',
      fallbackLabel: 'Usar contraseña',
      disableDeviceFallback: false,
    });

    if (!result.success) return null;

    // Auto-login con token biométrico
    return await this.login({
      email: biometricToken,
      password: '__biometric__',
    });
  },

  async enableBiometric(email: string): Promise<boolean> {
    const available = await this.isBiometricAvailable();
    if (!available) return false;

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Habilitar acceso biométrico',
        fallbackLabel: 'Usar contraseña',
        disableDeviceFallback: false,
      });

      if (!result.success) return false;

      await storage.setBiometricEnabled(true);
      await storage.setBiometricToken(email);
      return true;
    } catch {
      return false;
    }
  },

  async disableBiometric(): Promise<void> {
    await storage.setBiometricEnabled(false);
    await storage.removeBiometricToken();
  },
};
