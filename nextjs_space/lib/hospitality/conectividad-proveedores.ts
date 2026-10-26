/**
 * Registro de proveedores de conectividad y **política de un solo escritor**.
 *
 * Puro: no toca base de datos ni red. Recibe lo que hay configurado y decide
 * quién puede escribir. La decisión no es cosmética: dos sistemas empujando la
 * misma noche es exactamente el overbooking que ya costó dinero (§2 y §6 del
 * plan, `docs/hospitality-nobeds-conectividad.md`).
 *
 * El cambio de proveedor es una **convivencia**, no un interruptor:
 *
 * - `nobeds` es el principal (papel `principal`).
 * - `channel_connectivity` —el actual— pasa a **respaldo** y puede quedarse
 *   vivo en `modo: 'lectura'`: sigue leyendo reservas y reconciliando, pero no
 *   empuja inventario ni tarifas. Nunca los dos escribiendo.
 *
 * Regla de marca: `nombreVisible` es «Conectividad de Canales» para todos. El
 * nombre de un proveedor no aparece en UI, correos ni PDFs.
 */

export type ProveedorConectividad = 'nobeds' | 'channel_connectivity';

export type ModoProveedor = 'escritura' | 'lectura';

export type PapelProveedor = 'principal' | 'respaldo';

export interface CapacidadesProveedor {
  /** Puede leer catálogo, disponibilidad y reservas. */
  lectura: boolean;
  /** Puede empujar reservas, cierres e inventario. */
  escritura: boolean;
  /** Empuja eventos en vez de exigir sondeo. */
  webhooks: boolean;
  /** Tiene planes de tarifa como entidad propia. */
  planesDeTarifa: boolean;
  /** La credencial es por hotel, no una compartida por cuenta. */
  tokenPorPropiedad: boolean;
  /** Mensajería con el huésped por reserva. */
  mensajes: boolean;
  /** Reseñas legibles por API (sin importar CSV). */
  resenas: boolean;
}

export interface DefinicionProveedor {
  key: ProveedorConectividad;
  /** Lo único que puede verse en producto. */
  nombreVisible: string;
  papel: PapelProveedor;
  capacidades: CapacidadesProveedor;
}

const NOMBRE_VISIBLE = 'Conectividad de Canales';

export const PROVEEDORES: Record<ProveedorConectividad, DefinicionProveedor> = {
  nobeds: {
    key: 'nobeds',
    nombreVisible: NOMBRE_VISIBLE,
    papel: 'principal',
    capacidades: {
      lectura: true,
      escritura: true,
      // Su `/api/Webhooks` responde 404 y no está entre sus 52 operaciones.
      webhooks: false,
      // Un precio por habitación y noche; los planes se colapsan en venta directa.
      planesDeTarifa: false,
      // Token por hotel, en la ruta de cada llamada.
      tokenPorPropiedad: true,
      mensajes: true,
      resenas: true,
    },
  },
  channel_connectivity: {
    key: 'channel_connectivity',
    nombreVisible: NOMBRE_VISIBLE,
    papel: 'respaldo',
    capacidades: {
      lectura: true,
      escritura: true,
      webhooks: true,
      planesDeTarifa: true,
      // Un partner id por tenant, con el par Basic de plataforma.
      tokenPorPropiedad: false,
      mensajes: true,
      resenas: false,
    },
  },
};

/** El que se elige primero cuando hay más de uno disponible para escribir. */
export const PROVEEDOR_PRINCIPAL: ProveedorConectividad = 'nobeds';

export function esProveedorConocido(valor: string): valor is ProveedorConectividad {
  return Object.prototype.hasOwnProperty.call(PROVEEDORES, valor);
}

export function capacidadesDe(proveedor: string): CapacidadesProveedor | null {
  return esProveedorConocido(proveedor) ? PROVEEDORES[proveedor].capacidades : null;
}

// ─── Política de escritura ────────────────────────────────────────────────

/** Lo mínimo que hace falta de una credencial para decidir. */
export interface ConfiguracionProveedor {
  provider: string;
  activo: boolean;
  /**
   * Por defecto `escritura`: en el modelo actual un proveedor activo empuja.
   * `lectura` es el modo de convivencia del respaldo.
   */
  modo?: ModoProveedor;
}

export type MotivoDecision =
  | 'ok'
  | 'sin_configurar'
  /** Hay un proveedor activo que no conocemos: no se puede probar que no escriba. */
  | 'desconocido'
  /** Dos o más activos en modo escritura: no se elige ninguno. */
  | 'dos_escritores';

export interface DecisionEscritura {
  /** `null` = no se escribe. Nunca se «elige uno» entre dos aspirantes. */
  escritor: ProveedorConectividad | null;
  motivo: MotivoDecision;
  /** Proveedores activos en modo escritura, para el mensaje al operador. */
  aspirantes: string[];
  /** Proveedores activos cuyo tipo no reconocemos. */
  desconocidos: string[];
}

function modoEfectivo(config: ConfiguracionProveedor): ModoProveedor {
  return config.modo === 'lectura' ? 'lectura' : 'escritura';
}

/**
 * Decide quién escribe. **Nunca** hay dos:
 *
 * - Ningún activo con escritura → `sin_configurar`.
 * - Un activo desconocido → `desconocido` (no se puede descartar que empuje).
 * - Dos o más activos con capacidad y modo de escritura → `dos_escritores`, y
 *   `escritor` queda en `null`. El llamador no debe empujar nada hasta que un
 *   humano decida.
 * - Uno solo → ese, con `ok`, sea principal o respaldo. Que el respaldo siga
 *   pudiendo escribir es deliberado: es la vuelta atrás del cambio de proveedor.
 */
export function decidirEscritor(configs: ConfiguracionProveedor[]): DecisionEscritura {
  const activos = configs.filter((c) => c.activo);

  const desconocidos = activos
    .map((c) => c.provider)
    .filter((provider) => !esProveedorConocido(provider));

  if (desconocidos.length > 0) {
    return {
      escritor: null,
      motivo: 'desconocido',
      aspirantes: [],
      desconocidos: [...new Set(desconocidos)],
    };
  }

  const aspirantes = configs
    .filter((c) => c.activo)
    .filter((c) => {
      const capacidades = capacidadesDe(c.provider);
      return Boolean(capacidades?.escritura) && modoEfectivo(c) === 'escritura';
    })
    .map((c) => c.provider as ProveedorConectividad);

  const unicos = [...new Set(aspirantes)];

  if (unicos.length === 0) {
    return { escritor: null, motivo: 'sin_configurar', aspirantes: [], desconocidos: [] };
  }
  if (unicos.length > 1) {
    return { escritor: null, motivo: 'dos_escritores', aspirantes: unicos, desconocidos: [] };
  }
  return { escritor: unicos[0], motivo: 'ok', aspirantes: unicos, desconocidos: [] };
}

/**
 * Proveedores que pueden **leer** de esta propiedad, principal primero.
 *
 * Es lo que permite la convivencia: mientras el nuevo escribe, el anterior sigue
 * en `lectura` para reconciliar y comparar, sin empujar nada.
 */
export function proveedoresDeLectura(configs: ConfiguracionProveedor[]): ProveedorConectividad[] {
  const activos = configs
    .filter((c) => c.activo)
    .filter((c) => esProveedorConocido(c.provider))
    .filter((c) => Boolean(capacidadesDe(c.provider)?.lectura))
    .map((c) => c.provider as ProveedorConectividad);

  const unicos = [...new Set(activos)];
  const peso = (proveedor: ProveedorConectividad): number =>
    PROVEEDORES[proveedor].papel === 'principal' ? 0 : 1;

  return unicos.sort((a, b) => peso(a) - peso(b));
}

/**
 * Mensaje para el operador. **Nunca nombra al proveedor**: el detalle técnico
 * (`aspirantes`, `desconocidos`) vive en la decisión para logs internos, no en
 * el texto que se pinta. En producto esto se llama «Conectividad de Canales».
 */
export function describirDecision(decision: DecisionEscritura): string {
  switch (decision.motivo) {
    case 'ok':
      return 'Un único proveedor escribe esta propiedad.';
    case 'sin_configurar':
      return 'No hay ninguna conectividad activa para escribir en esta propiedad.';
    case 'desconocido':
      return 'Hay una conectividad activa de un tipo no reconocido: no se escribe hasta revisarlo.';
    case 'dos_escritores':
      return 'Hay dos conectividades activas con escritura: no se escribe nada hasta dejar una sola.';
  }
}
