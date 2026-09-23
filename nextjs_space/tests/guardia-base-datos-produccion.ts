/**
 * Guardia de base de datos: los tests no pueden escribir en producción.
 *
 * Por qué existe
 * --------------
 * La suite de integración (149 archivos hablan con Prisma) usa el `DATABASE_URL`
 * del entorno. El 11-ago-2026 ese valor apuntaba a la base de producción y una
 * tanda de tests dejó dentro 9 tenants "Test …" con sus 14 claves de API y 12
 * conexiones bancarias, todos mezclados con los datos reales de los clientes.
 * Nada avisó: los tests pasaron en verde, porque escribir en producción con
 * éxito es indistinguible de escribir en local con éxito.
 *
 * Este módulo convierte esa dependencia silenciosa en un aborto explícito antes
 * de que arranque ningún archivo de test. Es una decisión de *producto*, no un
 * detalle de configuración: la base de producción sólo se toca desde la
 * aplicación desplegada (y desde scripts de administración revisados a mano),
 * nunca desde una suite que crea datos a discreción.
 *
 * Cómo reconoce producción
 * ------------------------
 *   1. El host: el servicio Postgres del stack (`volkern-erp_postgres`, también
 *      como DNS de tarea `tasks.volkern-erp_postgres`), el VPS y cualquier
 *      subdominio de `volkern.app`.
 *   2. El nombre de la base: `volkern_erp`. Cubre el caso de un túnel
 *      (`ssh -L 5432:volkern-erp_postgres:5432 …`), donde el host pasa a ser
 *      `localhost` y la lista de hosts dejaría de verlo.
 *   3. Lo que añada el entorno: `TEST_DB_HOSTS_PROHIBIDOS` y
 *      `TEST_DB_NOMBRES_PROHIBIDOS` (separados por comas), para entornos donde
 *      la base de producción viva en otro sitio sin tener que tocar el código.
 *
 * No hay escape ni variable para saltarse la guardia: si un test necesita
 * datos con forma de producción, se levanta una copia. Eso es lo que la hace
 * "imposible" en vez de "desaconsejada".
 */

/** Hosts que sirven datos de clientes reales. */
export const HOSTS_PRODUCCION = [
  // Servicio Postgres del stack de producción (DNS interno de Docker Swarm).
  'volkern-erp_postgres',
  // VPS de producción, por si se alcanza desde fuera del swarm.
  '62.171.134.195',
  // Cualquier host bajo el dominio de producción.
  'volkern.app',
] as const;

/** Nombre de la base de datos de producción. */
export const NOMBRES_BASE_PRODUCCION = ['volkern_erp'] as const;

export interface ConfiguracionGuardia {
  /** Hosts extra prohibidos (además de los de producción). */
  hostsExtra?: string[];
  /** Nombres de base extra prohibidos (además de los de producción). */
  nombresExtra?: string[];
}

export interface ReferenciaBaseDeDatos {
  host: string;
  puerto: string;
  baseDatos: string;
}

export interface Bloqueo {
  /** Qué se ha reconocido como producción: `host` o `nombre`. */
  motivo: 'host' | 'nombre';
  /** El valor concreto que coincide (host o nombre de base). */
  valor: string;
  mensaje: string;
}

/**
 * Descompone un `DATABASE_URL` en host, puerto y nombre de base.
 * Devuelve `null` si no hay URL, si no es una URL de Postgres o si está mal
 * formada: no poder interpretarla no es motivo para bloquear la suite (los
 * tests que no usan base seguirán corriendo).
 */
export function interpretarUrl(url?: string | null): ReferenciaBaseDeDatos | null {
  if (!url) return null;
  const limpia = String(url).trim().replace(/^["']|["']$/g, '');
  if (!/^postgres(ql)?:\/\//i.test(limpia)) return null;
  try {
    const u = new URL(limpia);
    return {
      host: u.hostname.toLowerCase().replace(/\.$/, ''),
      puerto: u.port || '5432',
      baseDatos: decodeURIComponent(u.pathname.replace(/^\//, '')).toLowerCase(),
    };
  } catch {
    return null;
  }
}

/**
 * Un host coincide con un patrón prohibido si es el mismo, si cuelga de él
 * (`tasks.volkern-erp_postgres`) o si lo contiene como sufijo de dominio
 * (`api.volkern.app`).
 */
function coincideHost(host: string, patron: string): boolean {
  const p = patron.trim().toLowerCase().replace(/\.$/, '');
  if (!p) return false;
  return host === p || host.startsWith(`${p}.`) || host.endsWith(`.${p}`);
}

/** Listas efectivas, sumando lo que declare el entorno. */
function listasEfectivas(cfg: ConfiguracionGuardia = {}): { hosts: string[]; nombres: string[] } {
  const delEntorno = (clave: string): string[] =>
    (process.env[clave] ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

  return {
    hosts: [...HOSTS_PRODUCCION, ...delEntorno('TEST_DB_HOSTS_PROHIBIDOS'), ...(cfg.hostsExtra ?? [])],
    nombres: [
      ...NOMBRES_BASE_PRODUCCION,
      ...delEntorno('TEST_DB_NOMBRES_PROHIBIDOS'),
      ...(cfg.nombresExtra ?? []),
    ],
  };
}

/**
 * Decide si una `DATABASE_URL` apunta a producción. Devuelve el bloqueo con su
 * motivo, o `null` si la base es aceptable para tests.
 */
export function motivoBloqueo(
  url?: string | null,
  cfg: ConfiguracionGuardia = {},
): Bloqueo | null {
  const ref = interpretarUrl(url);
  if (!ref) return null;

  const { hosts, nombres } = listasEfectivas(cfg);

  const hostProhibido = hosts.find((h) => coincideHost(ref.host, h));
  if (hostProhibido) {
    return {
      motivo: 'host',
      valor: ref.host,
      mensaje:
        `El host "${ref.host}" sirve la base de datos de PRODUCCIÓN ` +
        `(coincide con "${hostProhibido}").`,
    };
  }

  if (nombres.includes(ref.baseDatos)) {
    return {
      motivo: 'nombre',
      valor: ref.baseDatos,
      mensaje:
        `La base de datos "${ref.baseDatos}" es la de PRODUCCIÓN, aunque el host ` +
        `sea "${ref.host}" (túnel, reenvío de puerto o copia local con el mismo nombre).`,
    };
  }

  return null;
}

/** Cuerpo del error: qué pasó, qué se jugó la última vez y qué hacer ahora. */
export function construirMensajeBloqueo(bloqueo: Bloqueo): string {
  return [
    '',
    '  ✖ La suite de tests se detiene antes de arrancar.',
    '',
    `  ${bloqueo.mensaje}`,
    '',
    '  Los tests de integración crean tenants, claves de API, reservas y cobros a',
    '  discreción: contra producción eso no es una prueba, es un incidente. Ya pasó',
    '  el 11-ago-2026 y quedaron 9 tenants de prueba, 14 claves de API y 12 conexiones',
    '  bancarias mezcladas con los datos de clientes reales.',
    '',
    '  Levanta una base desechable y apunta ahí la suite, por ejemplo:',
    '',
    '    docker run -d --name volkern-test -e POSTGRES_PASSWORD=postgres \\',
    '      -e POSTGRES_DB=volkern_test -p 5432:5432 postgres:15',
    '',
    '    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/volkern_test" \\',
    '      npx vitest run',
    '',
    '  Si hace falta trabajar con datos con forma de producción, restaura una copia:',
    '  nunca se apunta la suite al original. No hay variable para saltarse esta',
    '  guardia a propósito.',
    '',
  ].join('\n');
}

/**
 * Aborta si la `DATABASE_URL` apunta a producción. Es lo que invoca el
 * `globalSetup` de vitest (ver `tests/global-setup.ts`).
 */
export function exigirBaseDeDatosDePruebas(
  url: string | null | undefined = process.env.DATABASE_URL,
  cfg: ConfiguracionGuardia = {},
): void {
  const bloqueo = motivoBloqueo(url, cfg);
  if (bloqueo) {
    throw new Error(construirMensajeBloqueo(bloqueo));
  }
}
