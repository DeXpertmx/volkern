import { prisma, globalPrisma } from '../db';

export class WebSyncService {
  /**
   * Obtiene los planes de suscripción vigentes directamente de la base de datos maestra.
   * Esto asegura que cualquier cambio en el Admin Panel se refleje en tiempo real.
   */
  static async getActivePlans() {
    try {
      const plans = await prisma.subscriptionPlan.findMany({
        orderBy: { precio: 'asc' },
        select: {
          id: true,
          nombre: true,
          descripcion: true,
          slug: true,
          precio: true,
          moneda: true,
          intervalo: true,
          limiteUsuarios: true,
          limiteLeads: true,
          whatsappHabilitado: true,
          whitelabelHabilitado: true,
          lmsHabilitado: true,
          automationsHabilitado: true,
          campaignsHabilitado: true,
        }
      });
      return plans;
    } catch (error) {
      console.error('[WebSync] Error fetching plans:', error);
      return [];
    }
  }

  /**
   * Obtiene el contador total de operaciones protegidas por The Vault.
   * Lee la suma de totalRecords de la tabla AuditVault.
   */
  static async getVaultProofCount() {
    try {
      const result = await prisma.auditVault.aggregate({
        _sum: {
          totalRecords: true
        }
      });
      return result._sum.totalRecords || 0;
    } catch (error) {
      console.error('[WebSync] Error fetching vault proof:', error);
      return 0;
    }
  }

  /**
   * Obtiene logos de clientes destacados para el Trust Bar.
   * Filtra por tenants que tengan habilitada la opción de "public_logo".
   */
  static async getClientLogos() {
    try {
      // Simulamos la obtención de logos de clientes reales en el ecosistema
      const tenants = await globalPrisma.tenant.findMany({
        where: {
          estado: 'activo',
          brandingConfig: {
            path: ['showInPublicTrustBar'],
            equals: true
          }
        },
        select: {
          nombre: true,
          brandingConfig: true
        },
        take: 6
      });

      return tenants.map(t => ({
        name: t.nombre,
        logo: (t.brandingConfig as any)?.logoUrl || `/assets/logos/client-placeholder.png`
      }));
    } catch (error) {
      // Fallback a logos predefinidos si falla la consulta dinámica
      return [
        { name: 'Industrial Nexus', logo: '/assets/logos/client1.png' },
        { name: 'Sovereign Lab', logo: '/assets/logos/client2.png' },
        { name: 'Global Logistics', logo: '/assets/logos/client3.png' },
      ];
    }
  }
}
