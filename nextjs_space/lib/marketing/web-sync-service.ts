import { prisma, globalPrisma } from '../db';
import { PLANS, PLAN_PRICES, PLAN_LIMITS } from '../plans';

export class WebSyncService {
  /**
   * Obtiene los planes activos para mostrar en landing page.
   * Usa datos hardcodeados de lib/plans.ts como fuente de verdad.
   */
  static async getActivePlans() {
    const plans = [
      {
        id: PLANS.ESENCIAL,
        nombre: 'Esencial',
        descripcion: 'Para autónomos y gestorías pequeñas que empiezan',
        slug: PLANS.ESENCIAL,
        precio: PLAN_PRICES[PLANS.ESENCIAL].monthly,
        moneda: 'EUR',
        intervalo: 'mensual',
        limiteUsuarios: PLAN_LIMITS[PLANS.ESENCIAL].users,
        limiteLeads: PLAN_LIMITS[PLANS.ESENCIAL].leads,
        whatsappHabilitado: false,
        whitelabelHabilitado: false,
        lmsHabilitado: true,
        automationsHabilitado: true,
        campaignsHabilitado: true,
      },
      {
        id: PLANS.PROFESIONAL,
        nombre: 'Profesional',
        descripcion: 'Para PYMES y gestorías en crecimiento',
        slug: PLANS.PROFESIONAL,
        precio: PLAN_PRICES[PLANS.PROFESIONAL].monthly,
        moneda: 'EUR',
        intervalo: 'mensual',
        limiteUsuarios: PLAN_LIMITS[PLANS.PROFESIONAL].users,
        limiteLeads: PLAN_LIMITS[PLANS.PROFESIONAL].leads,
        whatsappHabilitado: true,
        whitelabelHabilitado: false,
        lmsHabilitado: true,
        automationsHabilitado: true,
        campaignsHabilitado: true,
      },
      {
        id: PLANS.INFINITY,
        nombre: 'Infinity',
        descripcion: 'Para empresas y despachos grandes',
        slug: PLANS.INFINITY,
        precio: PLAN_PRICES[PLANS.INFINITY].monthly,
        moneda: 'EUR',
        intervalo: 'mensual',
        limiteUsuarios: PLAN_LIMITS[PLANS.INFINITY].users,
        limiteLeads: PLAN_LIMITS[PLANS.INFINITY].leads,
        whatsappHabilitado: true,
        whitelabelHabilitado: true,
        lmsHabilitado: true,
        automationsHabilitado: true,
        campaignsHabilitado: true,
      },
    ];
    return plans;
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
