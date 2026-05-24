import { api } from './api';
import { getToken } from './storage';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  image: string | null;
  telefono: string | null;
  bookingSlug: string | null;
  bookingTitle: string | null;
  bookingBio: string | null;
  bookingEnabled: boolean;
  role: {
    id: string;
    nombre: string;
    permisos: any;
  };
  tenant: {
    id: string;
    nombre: string;
    slug: string;
    subdomain: string | null;
    accountType: string;
  };
  timezone: string | null;
  metadata: Record<string, any> | null;
  isTwoFactorEnabled: boolean;
  isImpersonating?: boolean;
}

export interface SubscriptionStatus {
  plan: string;
  status: string;
  limits: any;
  trial?: {
    daysRemaining: number;
    endsAt: string;
  };
  subscription?: {
    id: string;
    status: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  };
  isSuperAdmin?: boolean;
}

export interface FeatureUsage {
  feature: string;
  label: string;
  current: number;
  limit: number;
  unlimited: boolean;
  percentage: number;
  status: 'ok' | 'warning' | 'exceeded';
}

export interface UsageResponse {
  plan: {
    slug: string;
    nombre: string;
  };
  usage: FeatureUsage[];
  upgrade: {
    suggestedPlan: string;
    nearLimitCount: number;
    message: string;
  };
}

export interface TenantUsage {
  leads: number;
  contacts: number;
  companies: number;
  storage: number;
  users: number;
  [key: string]: any;
}

// ─── Service ──────────────────────────────────────────────────────────────────
class ProfileService {
  /**
   * GET /api/users/me — Obtener perfil completo del usuario
   */
  async getProfile(): Promise<UserProfile> {
    return api.get<UserProfile>('/users/me');
  }

  /**
   * PATCH /api/users/me — Actualizar perfil
   */
  async updateProfile(data: {
    name?: string;
    telefono?: string;
    timezone?: string;
  }): Promise<{ success: boolean; user: Partial<UserProfile> }> {
    return api.patch('/users/me', data);
  }

  /**
   * POST /api/users/avatar — Subir avatar
   */
  async uploadAvatar(fileUri: string): Promise<{ url: string }> {
    const formData = new FormData();
    const filename = fileUri.split('/').pop() || 'avatar.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('file', {
      uri: fileUri,
      name: filename,
      type,
    } as any);

    const token = await getToken();
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'}/api/users/avatar`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: formData,
      },
    );

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al subir avatar');
    return data;
  }

  /**
   * POST /api/users/cambiar-password — Cambiar contraseña
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return api.post('/users/cambiar-password', {
      currentPassword,
      newPassword,
    });
  }

  /**
   * POST /api/users/me/2fa — Activar/desactivar 2FA
   */
  async toggle2FA(enabled: boolean): Promise<{ success: boolean; isTwoFactorEnabled: boolean }> {
    return api.post('/users/me/2fa', { enabled });
  }

  /**
   * GET /api/subscriptions/status — Estado de suscripción
   */
  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    return api.get<SubscriptionStatus>('/subscriptions/status');
  }

  /**
   * GET /api/subscriptions/usage — Uso de características
   */
  async getUsage(): Promise<UsageResponse> {
    return api.get<UsageResponse>('/subscriptions/usage');
  }

  /**
   * GET /api/usage — Uso de recursos del tenant
   */
  async getTenantUsage(): Promise<{ usage: TenantUsage }> {
    return api.get<{ usage: TenantUsage }>('/usage');
  }

  /**
   * POST /api/users/me/skill-key — Generar API key para Agent Skills
   */
  async generateSkillKey(): Promise<{ id: string; key: string; createdAt: string }> {
    return api.post('/users/me/skill-key');
  }
}

export const profileService = new ProfileService();
