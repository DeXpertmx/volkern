/**
 * Aplica el catálogo básico de roles (Admin, Miembro, Solo lectura) a TODAS
 * las cuentas existentes, de una en una y de forma idempotente:
 *   - crea Miembro y Solo lectura donde no existan;
 *   - completa Admin con las llaves modernas que le falten (equipo, roles,
 *     analytics…) sin tocar nada que ya tenga.
 *
 * Uso:
 *   npx tsx scripts/rollout-roles-basicos.ts            # simulación
 *   npx tsx scripts/rollout-roles-basicos.ts --apply    # aplica
 */
import { prisma, globalPrisma } from '../lib/db';
import {
  ROLES_BASICOS_POR_NOMBRE,
  aplicarCatalogoRolesBasicos,
} from '../lib/roles-basicos';

const APLICAR = process.argv.includes('--apply');

async function main() {
  console.log(`\n📚 Catálogo básico de roles — ${APLICAR ? 'APLICANDO' : 'SIMULACIÓN'}\n`);

  const tenants = await globalPrisma.tenant.findMany({
    where: { estado: { not: 'eliminado' } },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  });
  console.log(`Cuentas a revisar: ${tenants.length}\n`);

  let totalCreados = 0;
  let totalActualizados = 0;
  let totalYaCumplian = 0;

  for (const tenant of tenants) {
    try {
      if (APLICAR) {
        const r = await aplicarCatalogoRolesBasicos(prisma as never, tenant.id);
        totalCreados += r.creados.length;
        totalActualizados += r.actualizados.length;
        totalYaCumplian += r.yaCumplian.length;
        if (r.creados.length || r.actualizados.length) {
          console.log(`  ${tenant.nombre}: +${r.creados.join(', ')}${r.actualizados.length ? ' · completados: ' + r.actualizados.join(', ') : ''}`);
        }
      } else {
        const existentes = await prisma.role.findMany({ where: { tenantId: tenant.id } });
        const porNombre = new Map(existentes.map((r) => [r.nombre, r]));
        const faltan: string[] = [];
        const completar: string[] = [];

        for (const def of Object.values(ROLES_BASICOS_POR_NOMBRE)) {
          const existente = porNombre.get(def.nombre);
          if (!existente) {
            faltan.push(def.nombre);
          } else {
            const { llavesFaltantesDelCatalogo } = await import('../lib/roles-basicos');
            if (Object.keys(llavesFaltantesDelCatalogo(def.nombre, existente.permisos)).length) {
              completar.push(def.nombre);
            }
          }
        }
        if (faltan.length || completar.length) {
          console.log(`  ${tenant.nombre}: faltan ${faltan.join(', ')}${completar.length ? ' · a completar: ' + completar.join(', ') : ''}`);
          totalCreados += faltan.length;
          totalActualizados += completar.length;
        } else {
          totalYaCumplian += 1;
        }
      }
    } catch (err) {
      console.error(`  ✗ ${tenant.nombre}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `\nResumen: ${totalCreados} rol(es) por crear · ${totalActualizados} a completar · ${totalYaCumplian} cuenta(s) ya cumplían\n`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
