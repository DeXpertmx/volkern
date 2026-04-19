import { prisma } from '../../db';
import { VaultService } from '../../security/vault';
import { SocialPlatform } from '../social-media-service';

export class SocialCredentialsManager {
  /**
   * Conecta una plataforma social guardando los tokens cifrados en el Vault
   */
  static async connect(params: {
    tenantId: string;
    platform: SocialPlatform;
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    profileId?: string;
    profileName?: string;
  }) {
    const { tenantId, platform, accessToken, refreshToken, expiresIn, profileId, profileName } = params;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { vaultSeed: true }
    });

    if (!tenant) throw new Error('Tenant no encontrado');

    const encryptedAccessToken = VaultService.encrypt(accessToken, tenantId, tenant.vaultSeed);
    const encryptedRefreshToken = refreshToken 
      ? VaultService.encrypt(refreshToken, tenantId, tenant.vaultSeed)
      : null;

    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    return await prisma.socialPlatformConfig.upsert({
      where: {
        tenantId_platform: { tenantId, platform }
      },
      create: {
        tenantId,
        platform,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        profileId,
        profileName,
        isActive: true,
      },
      update: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        profileId,
        profileName,
        isActive: true,
        updatedAt: new Date(),
      }
    });
  }

  /**
   * Revoca una conexión social y elimina las credenciales del Vault
   */
  static async revoke(tenantId: string, platform: SocialPlatform) {
    return await prisma.socialPlatformConfig.update({
      where: {
        tenantId_platform: { tenantId, platform }
      },
      data: {
        isActive: false,
        accessToken: 'REVOKED',
        refreshToken: null,
      }
    });
  }

  /**
   * Verifica el estado de las conexiones
   */
  static async getStatus(tenantId: string) {
    const configs = await prisma.socialPlatformConfig.findMany({
      where: { tenantId },
      select: {
        platform: true,
        isActive: true,
        expiresAt: true,
        profileName: true,
        updatedAt: true
      }
    });

    return configs.map(c => ({
      ...c,
      isExpired: c.expiresAt ? c.expiresAt < new Date() : false
    }));
  }
}
