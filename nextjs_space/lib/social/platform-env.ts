/**
 * Credenciales OAuth que necesita cada red social para poder conectar.
 *
 * Se exige también el secreto: con solo el client id el diálogo de la
 * plataforma se abre, pero el intercambio de código por token falla y el
 * usuario acaba en un error opaco después de haber autorizado.
 */

export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'youtube', 'tiktok'] as const;

export type SocialPlatformKey = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_PLATFORM_ENV: Record<SocialPlatformKey, readonly string[]> = {
  facebook: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  instagram: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  youtube: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  tiktok: ['TIKTOK_CLIENT_ID', 'TIKTOK_CLIENT_SECRET'],
};

export interface PlatformAvailability {
  configured: boolean;
  /** Nombres de las variables ausentes (nunca sus valores). */
  missing: string[];
}

export function disponibilidad(platform: SocialPlatformKey): PlatformAvailability {
  const missing = (SOCIAL_PLATFORM_ENV[platform] ?? []).filter((envVar) => !process.env[envVar]);
  return { configured: missing.length === 0, missing };
}

export function disponibilidadPorPlataforma(): Record<SocialPlatformKey, PlatformAvailability> {
  return SOCIAL_PLATFORMS.reduce(
    (acc, platform) => {
      acc[platform] = disponibilidad(platform);
      return acc;
    },
    {} as Record<SocialPlatformKey, PlatformAvailability>,
  );
}
