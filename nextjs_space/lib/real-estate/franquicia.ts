/**
 * Volkern Real Estate — Alcance de franquicia y conexiones
 *
 * Una franquicia es una cuenta `AGENCY` (la matriz) con cuentas hijas
 * (`parentId`) que son las oficinas. La matriz consolida los datos de sus
 * oficinas; nadie más los ve.
 *
 * El problema que resuelve este módulo. El aislamiento de Volkern no es solo un
 * filtro `tenantId`: cada tenant puede tener su propia base de datos
 * (`Tenant.dbUrl`) y el proxy `prisma` de `lib/db.ts` envía los modelos de
 * negocio al cliente del tenant que esté en el contexto. Por eso una consulta
 * consolidada **no se puede escribir como un `IN` sobre una sola conexión**:
 *
 *   - Las oficinas creadas por `SlotManager` / `agency/slots` no tienen `dbUrl`
 *     y viven en la base compartida (el control plane).
 *   - La matriz, si se creó desde el panel de admin, sí tiene `dbUrl` propia.
 *
 * Una consulta con `tenantId: { in: [matriz, ...oficinas] }` ejecutada con el
 * cliente de la matriz devuelve **solo** las filas de la matriz: las de las
 * oficinas están en otra base. Y lo hace sin error, con ceros. Este módulo abre
 * el contexto de conexión que corresponde a cada grupo en vez de asumirlo.
 */

import { prisma, globalPrisma, getTenantDb, dbContext } from '@/lib/db';
import { monedaEscritura } from '@/lib/moneda';

// ─── Oficinas ─────────────────────────────────────────────────────────────────

export interface OficinaFranquicia {
  id: string;
  nombre: string;
  /** Divisa de reporte de la oficina (`Tenant.moneda`), normalizada. */
  moneda: string;
}

/**
 * Estados en los que una oficina cuenta para la consolidación. Una oficina
 * suspendida, dada de baja o eliminada no aporta cifras ni expone sus datos; es
 * el mismo criterio que `resolveHierarchicalContext` usa para permitir entrar en
 * ella y el que ya aplicaba `app/api/v1/finance/global`.
 */
const ESTADOS_VIGENTES = ['activo', 'trial'];

/**
 * Oficinas (hijas directas y vigentes) de una matriz. `Tenant` vive en el
 * control plane, así que se lee siempre de la base global.
 */
export async function oficinasDeFranquicia(matrizId: string): Promise<OficinaFranquicia[]> {
  const oficinas = await globalPrisma.tenant.findMany({
    where: { parentId: matrizId, estado: { in: ESTADOS_VIGENTES } },
    select: { id: true, nombre: true, moneda: true },
    orderBy: { nombre: 'asc' },
  });

  return oficinas.map((o) => ({
    id: o.id,
    nombre: o.nombre,
    moneda: monedaEscritura(o.moneda),
  }));
}

// ─── Ejecución por conexión ───────────────────────────────────────────────────

/**
 * Ejecuta `consultar` una vez por **conexión física** implicada y concatena los
 * resultados.
 *
 * Agrupa los ids por base de datos: todos los que no tienen `dbUrl` comparten la
 * base global y se consultan en **una sola** llamada con un `IN`; cada tenant con
 * `dbUrl` propia se consulta en su propio contexto. Así la consolidación funciona
 * tanto si la franquicia entera comparte base como si la matriz tiene la suya.
 *
 * `consultar` recibe los ids que corresponden a su conexión y debe filtrar por
 * ellos; nunca debe asumir que son todos los de la franquicia.
 */
export async function enCadaConexion<T>(
  ids: string[],
  consultar: (idsDeLaConexion: string[]) => Promise<T[]>,
): Promise<T[]> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  if (unicos.length === 0) return [];

  const filas = await globalPrisma.tenant.findMany({
    where: { id: { in: unicos } },
    select: { id: true, dbUrl: true },
  });

  const conBdPropia = new Set(filas.filter((t) => t.dbUrl).map((t) => t.id));
  const compartida = unicos.filter((id) => !conBdPropia.has(id));

  const salidas: T[][] = [];

  // Base compartida: se consulta por la conexión global, no por la del tenant
  // que tenga el turno. Si la matriz tiene base propia, su cliente NO alcanza
  // estas filas, y ese es exactamente el fallo que este módulo evita.
  if (compartida.length > 0) {
    salidas.push(
      await dbContext.run(
        { tenantId: compartida[0], client: globalPrisma },
        () => consultar(compartida),
      ),
    );
  }

  for (const id of unicos.filter((i) => conBdPropia.has(i))) {
    const conexion = (await getTenantDb(id)) as unknown as {
      client?: unknown;
      vaultSeed?: string | null;
    };
    const cliente = (conexion.client ?? conexion) as never;

    salidas.push(
      await dbContext.run(
        { tenantId: id, client: cliente, vaultSeed: conexion.vaultSeed ?? undefined },
        () => consultar([id]),
      ),
    );
  }

  return salidas.flat();
}

// ─── Totales por divisa ───────────────────────────────────────────────────────

export interface TotalPorMoneda {
  moneda: string;
  total: number;
  pendientes: number;
  aprobadas: number;
  pagadas: number;
  cantidad: number;
}

/**
 * Suma importes agrupando por divisa.
 *
 * Una franquicia puede tener oficinas en divisas distintas —cada tenant tiene la
 * suya—, así que un único total que las sume no significa nada. Cuando solo hay
 * una divisa se puede enseñar una cifra; cuando hay varias, hay que enseñarlas
 * separadas.
 */
export function sumarPorMoneda(
  filas: Array<{ moneda: string; monto: number; estado: string }>,
): TotalPorMoneda[] {
  const porMoneda = new Map<string, TotalPorMoneda>();

  for (const fila of filas) {
    const moneda = monedaEscritura(fila.moneda);
    const acumulado = porMoneda.get(moneda)
      ?? { moneda, total: 0, pendientes: 0, aprobadas: 0, pagadas: 0, cantidad: 0 };

    acumulado.total += fila.monto;
    acumulado.cantidad++;
    if (fila.estado === 'pendiente') acumulado.pendientes += fila.monto;
    if (fila.estado === 'aprobada') acumulado.aprobadas += fila.monto;
    if (fila.estado === 'pagada') acumulado.pagadas += fila.monto;

    porMoneda.set(moneda, acumulado);
  }

  return [...porMoneda.values()].sort((a, b) => b.total - a.total);
}
