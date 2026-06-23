import * as crypto from 'crypto';
import { globalPrisma, prisma } from './db';
import { provisionTenantDatabase } from './tenant-provisioning';

export interface VaultResult {
  genesisHash: string;
  masterKey: string;
}

/**
 * Inicializa la Bóveda de Seguridad para un nuevo tenant
 * Genera el Hash Génesis SHA-256 y la Llave Maestra inicial
 */
export async function initializeSecurityVault(tenantId: string): Promise<VaultResult> {
  // 1. Generar Llave Maestra (32 bytes para AES-256)
  const masterKey = crypto.randomBytes(32).toString('hex');
  
  // 2. Obtener datos del tenant para el bloque génesis
  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) throw new Error('Tenant no encontrado para inicializar bóveda');

  // 3. Calcular Hash Génesis SHA-256
  // Se incluye el ID, el slug, la fecha de creación y la llave maestra
  const genesisData = `${tenant.id}-${tenant.slug}-${tenant.fechaCreacion.toISOString()}-${masterKey}`;
  const genesisHash = crypto.createHash('sha256').update(genesisData).digest('hex');

  // 4. Guardar metadatos en el Registro Global
  await globalPrisma.tenant.update({
    where: { id: tenantId },
    data: {
      genesisHash,
      masterKeyHash: `v1-${crypto.randomBytes(4).toString('hex')}` // Hash/Hint para rotación futura
    }
  });

  return { genesisHash, masterKey };
}

/**
 * Activa los módulos industriales (ERP) para un tenant
 */
export async function activateIndustrialModules(tenantId: string) {
  const industrialFeatures = ['produccion', 'calidad', 'rrhh', 'inventario_industrial', 'cfo_virtual', 'asistencia_ai'];
  
  await Promise.all(industrialFeatures.map(f => 
    globalPrisma.tenantFeature.upsert({
      where: {
        tenantId_feature: {
          tenantId: tenantId,
          feature: f
        }
      },
      update: {
        habilitado: true,
        razon: 'Activación automática Onboarding 2.0 (Plan ERP)'
      },
      create: {
        tenantId: tenantId,
        feature: f,
        habilitado: true,
        razon: 'Activación inicial Onboarding 2.0 (Plan ERP)'
      }
    })
  ));
  
  // Inicializar reglas de asistencia por defecto.
  // COMPLIANCE-NOTE (RGPD/LOPDGDD, Julio 2026): ya no activamos `requireSelfie` ni
  // `randomPulsesPerDay` (los challenges ya no aplican). Activamos sólo GPS con
  // retención 4 años (RD-Ley 8/2010 + LISOS prescripción laboral) y cooldown 30s
  // para evitar doble-tap accidental.
  await globalPrisma.attendanceRules.upsert({
    where: { tenantId },
    update: {},
    create: {
      tenantId,
      requireGPS: true,
      gracePeriodMinutes: 3,
      antiSpoofingLevel: 'HIGH',
      minPunchIntervalSec: 30,
      retentionDays: 1460,
      noticeVersion: 'v1-2026-gps-only',
    },
  });
}

/**
 * Ejecuta el Proceso Génesis completo (Onboarding 2.0)
 */
export async function upgradeOnboarding(tenantId: string, plan: string) {
  try {
    console.log(`[Genesis] Iniciando Onboarding 2.0 para tenant ${tenantId}...`);

    // 1. Provisionamiento de Infraestructura (Base de Datos Aislada)
    const provisionResult = await provisionTenantDatabase(tenantId);
    if (!provisionResult.success) {
      throw new Error(`Fallo en provisionamiento: ${provisionResult.message}`);
    }

    // 2. Inicialización de Bóveda de Seguridad
    const vault = await initializeSecurityVault(tenantId);

    // 3. Configuración de Módulos según Licencia
    if (plan === 'ERP_INDUSTRIAL' || plan === 'enterprise') {
      await activateIndustrialModules(tenantId);
    }

    // 4. Registro en la Nube Global de Auditoría (Génesis)
    await globalPrisma.globalAuditCloud.create({
      data: {
        tenantId,
        action: 'TENANT_GENESIS',
        hash: vault.genesisHash,
        details: `Sistema iniciado bajo protocolo de seguridad inmutable. Plan asignado: ${plan}.`
      }
    });

    console.log(`[Genesis] Onboarding 2.0 completado para ${tenantId}`);

    return { 
      status: 'READY', 
      genesisHash: vault.genesisHash,
      masterKey: vault.masterKey // ESTA LLAVE DEBE SER MOSTRADA AL USUARIO UNA ÚNICA VEZ
    };
  } catch (error: any) {
    console.error(`[Genesis] Error en proceso onboarding: ${error.message}`);
    throw error;
  }
}
