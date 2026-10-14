/**
 * Qué descartó el canal en un push y a qué UNIDAD corresponde.
 *
 * Por qué existe
 * --------------
 * El proveedor responde 200 `{ success: true, warnings: [...] }` cuando acepta
 * la petición pero **descarta parte del envío**, con el código concreto:
 * `INVALID_ROOM_CODE : 1a`, `INVALID_RATEPLAN_CODE : 1b-s-ep` (medido en
 * producción: 13-oct-2026, hotel `75fdbbce2e`). La capa ya no lo lee como éxito
 * —un descarte es un dato perdido— pero lo que llegaba al operador era un
 * bloque de **códigos** sin nombre de unidad («El proveedor aceptó la petición
 * pero descartó datos: INVALID_ROOM_CODE : 2a · …»), así que la puesta en marcha
 * se caía «entera» sin decir QUÉ unidad había que arreglar. El código del
 * proveedor es su vocabulario; la unidad es la del hotel.
 *
 * Y no es un fallo de nuestro lado: habitaciones y planes existen en el catálogo
 * del proveedor —el paso 5 del asistente los validó— pero el canal todavía no
 * los tiene autorizados, así que la unidad que sí está autorizada se sincroniza
 * y las demás no. Eso hay que decirlo unidad por unidad.
 *
 * Reglas
 * ------
 * - **Puro**: sin BD, sin red, sin UI. Es la MISMA función la que usa el
 *   servidor (dispatcher, rutas) y la que puede usar el panel.
 * - **Nada se inventa**: solo se atribuye un descarte a una unidad cuando el
 *   código que nombró el proveedor es EXACTAMENTE el `roomCode` o uno de los
 *   códigos de tarifa que esa unidad empuja. Un código que no corresponde a
 *   ninguna unidad se informa como tal (`codigosSinUnidad`), no se reparte.
 * - **Nada se pierde**: un `warning` con otra forma no se descarta en silencio;
 *   viaja como descarte sin atribuir con su texto íntegro.
 * - La comparación es exacta (con recorte de espacios): los códigos del
 *   proveedor distinguen mayúsculas y un `2B` no es `2b`.
 */

/** Códigos de descarte del proveedor que sabemos leer. */
export type CodigoDescarte = 'INVALID_ROOM_CODE' | 'INVALID_RATEPLAN_CODE' | 'DESCONOCIDO';

/** Un descarte tal cual lo nombró el proveedor, ya separado en código y valor. */
export interface AvisoDescarte {
  codigo: CodigoDescarte;
  /** Código que el proveedor descartó (room code o rateplan code). */
  valor: string;
  /** El aviso tal cual llegó, para no perder nada en el camino. */
  crudo: string;
}

/** `INVALID_ROOM_CODE : 2a` → código y valor. */
const RE_AVISO = /^([A-Za-z_]+)\s*[:=]\s*(.+)$/;

/** Los dos únicos códigos medidos contra el servicio real. */
const CODIGOS_CONOCIDOS: CodigoDescarte[] = ['INVALID_ROOM_CODE', 'INVALID_RATEPLAN_CODE'];

/**
 * Normaliza los `warnings` de una respuesta del proveedor.
 *
 * Deduplica: el proveedor repite el mismo descarte una vez por tramo de fechas
 * (`INVALID_ROOM_CODE : 1b` aparecía tres veces en un solo push de tarifas), y
 * una lista con el mismo código repetido se lee como tres problemas distintos.
 */
export function parsearAvisos(warnings: unknown): AvisoDescarte[] {
  if (!Array.isArray(warnings)) return [];

  const vistos = new Set<string>();
  const avisos: AvisoDescarte[] = [];

  for (const bruto of warnings) {
    if (typeof bruto !== 'string') continue;
    const crudo = bruto.trim();
    if (!crudo) continue;

    const partes = RE_AVISO.exec(crudo);
    const codigoBruto = (partes?.[1] ?? '').toUpperCase();
    const valor = (partes?.[2] ?? '').trim();
    const codigo = (CODIGOS_CONOCIDOS as string[]).includes(codigoBruto)
      ? (codigoBruto as CodigoDescarte)
      : 'DESCONOCIDO';

    // Sin par «código : valor» el aviso se conserva entero como valor: es lo
    // único que se puede enseñar, y perderlo sería perder la causa.
    const clave = `${codigo}\u0000${valor || crudo}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    avisos.push({ codigo, valor: valor || crudo, crudo });
  }

  return avisos;
}

/** Una unidad tal como entra en el push (lo que el canal puede nombrar). */
export interface UnidadDelPush {
  unitId: string;
  nombre: string;
  roomCode: string | null;
  /**
   * Códigos de tarifa que esta unidad empuja: el vinculado del catálogo y los de
   * sus planes activos. El push usa uno u otro según tenga planes, así que un
   * descarte por tarifa puede nombrar cualquiera de ellos.
   */
  rateplanCodes?: Array<string | null | undefined>;
}

/**
 * Lo que un push concreto llevaba DENTRO: los códigos que viajaron.
 *
 * Existe porque un informe que no lo mire miente por omisión: el push de
 * restricciones de tarifa solo lleva las unidades con plan de tarifa con
 * código (una unidad sin plan no tiene restricciones que anunciar), así que al
 * atribuir contra TODAS las unidades de la propiedad las que no viajaron
 * aparecían como «sí se enviaron» —justo lo contrario de lo que pasó—. Medido
 * en producción (13-oct-2026, hotel `75fdbbce2e`): el push de restricciones de
 * tarifa llevaba 2 de las 4 unidades y su mensaje decía «las otras 3 sí se
 * enviaron», nombrando dos unidades que no habían ido en la petición.
 */
export interface EnvioPush {
  /** Códigos de habitación que viajaron en la petición. */
  roomCodes: Array<string | null | undefined>;
  /**
   * Pares (habitación, tarifa) que viajaron. Vacío en los pushes que no llevan
   * tarifas (inventario y sus restricciones): ahí basta la habitación.
   */
  paresTarifa?: Array<{ roomCode: string; rateplanCode: string }>;
}

/** Una unidad de la propiedad que NO viajó en ese push, con el motivo. */
export interface UnidadNoEnviada {
  unitId: string;
  nombre: string;
  /** Por qué no viajó, en palabras (una de las constantes de abajo). */
  motivo: string;
}

/** Sin `roomCode` no hay nada que el canal pueda nombrar ni aplicar. */
export const MOTIVO_SIN_VINCULO = 'no tiene vínculo con el proveedor';
/** Un plan sin código del proveedor no puede viajar como restricción. */
export const MOTIVO_SIN_TARIFA = 'no tiene plan de tarifa con código del proveedor';
/** Con vínculo y planes: simplemente esa unidad no iba en esta petición. */
export const MOTIVO_SIN_ENVIO = 'no viajó en este envío';

function codigoLimpio(valor: string | null | undefined): string {
  return (valor ?? '').trim();
}

/** ¿Esta unidad viajó en ESE push? (habitación y, si el push lleva tarifas, el par completo) */
function viajaEnElEnvio(unidad: UnidadDelPush, envio: EnvioPush): boolean {
  const room = codigoLimpio(unidad.roomCode);
  if (!room) return false;
  if (!envio.roomCodes.some((c) => codigoLimpio(c) === room)) return false;

  const pares = envio.paresTarifa ?? [];
  if (pares.length === 0) return true;

  const codigos = unicos(unidad.rateplanCodes ?? []);
  return pares.some(
    (p) => codigoLimpio(p.roomCode) === room && codigos.includes(codigoLimpio(p.rateplanCode))
  );
}

/**
 * Las unidades que REALMENTE viajaron en un push. Es lo único que se puede
 * atribuir: un descarte del proveedor solo puede nombrar códigos que iban en la
 * petición, y una unidad ausente no puede contarse como enviada.
 */
export function unidadesDelEnvio(unidades: UnidadDelPush[], envio: EnvioPush): UnidadDelPush[] {
  return unidades.filter((u) => viajaEnElEnvio(u, envio));
}

/**
 * Las unidades que quedaron fuera, con el motivo: es la otra mitad del informe
 * —una unidad que no viaja no falla, simplemente no se está vendiendo por el
 * canal— y sin ella el operador no sabe por qué su unidad no aparece en el push.
 */
export function unidadesFueraDelEnvio(
  unidades: UnidadDelPush[],
  envio: EnvioPush
): UnidadNoEnviada[] {
  return unidades
    .filter((u) => !viajaEnElEnvio(u, envio))
    .map((u) => ({
      unitId: u.unitId,
      nombre: u.nombre,
      motivo: !codigoLimpio(u.roomCode)
        ? MOTIVO_SIN_VINCULO
        : (envio.paresTarifa ?? []).length > 0
          ? MOTIVO_SIN_TARIFA
          : MOTIVO_SIN_ENVIO,
    }));
}

/** Una unidad cuyo envío el canal descartó. */
export interface UnidadDescartada {
  unitId: string;
  nombre: string;
  /** `roomCode` de la unidad (el que empuja), si lo tiene. */
  roomCode: string | null;
  /** El código de habitación que el canal descartó, si fue ese. */
  roomCodeDescarte: string | null;
  /** Códigos de tarifa descartados de esta unidad. */
  codigosTarifa: string[];
  /** Motivos legibles, uno por descarte. */
  motivos: string[];
  /** Frase corta para la pantalla: ««Unidad 1A»: la habitación «1a»…». */
  texto: string;
}

/** Resultado de atribuir los descartes de un push a las unidades del envío. */
export interface RechazoDeCanal {
  /** ¿El canal descartó algo? Sin descartes, el resto del informe va vacío. */
  huboDescartes: boolean;
  /** Unidades con al menos un descarte, con su causa. */
  descartadas: UnidadDescartada[];
  /**
   * Unidades que NO aparecen en el descarte del canal: su inventario y sus
   * tarifas sí se enviaron (el proveedor solo advierte de lo que descarta).
   */
  aceptadas: Array<{ unitId: string; nombre: string }>;
  /** Códigos que el canal nombró y no son de ninguna unidad del envío. */
  codigosSinUnidad: string[];
  /**
   * Unidades de la propiedad que NO viajaron en este push, con el motivo. No
   * son un fallo del canal: son unidades que este envío concreto no incluye.
   */
  noEnviadas: UnidadNoEnviada[];
  /** Frase para el operador (null si no hubo descartes). */
  mensaje: string | null;
}

/**
 * Consejo para el operador ante un descarte. Es la causa más probable y la única
 * que se puede afirmar sin ver la cuenta del canal: el código existe en el
 * catálogo del proveedor (si no, el paso 5 no habría dejado vincularlo) pero el
 * canal no lo tiene autorizado.
 */
export const CONSEJO_DESCARTE_CANAL =
  'Habitaciones y planes existen en el catálogo del proveedor, así que el canal todavía no los tiene autorizados: actívalos en su extranet y vuelve a sincronizar. Hasta entonces el canal no vende esas unidades.';

/** Motivo legible de un descarte. */
export function motivoLegible(aviso: AvisoDescarte): string {
  if (aviso.codigo === 'INVALID_ROOM_CODE') {
    return `la habitación «${aviso.valor}» no está autorizada en el canal`;
  }
  if (aviso.codigo === 'INVALID_RATEPLAN_CODE') {
    return `el plan de tarifa «${aviso.valor}» no está autorizado en el canal`;
  }
  return `el canal descartó «${aviso.valor}»`;
}

/**
 * Nombres de unidad en una frase, acotados: el aviso dicta la acción, no es un
 * volcado de inventario. Con muchas unidades se enumeran unas pocas y se dice
 * cuántas quedan.
 */
function nombresDeUnidades(unidades: Array<{ nombre: string }>, tope = 5): string {
  const citados = unidades.slice(0, tope).map((u) => `«${u.nombre}»`);
  const resto = unidades.length - citados.length;
  return resto > 0 ? `${citados.join(' · ')} y ${resto} más` : citados.join(' · ');
}

/** Recorte de valores repetidos conservando el orden de llegada. */
function unicos(valores: Array<string | null | undefined>): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const v of valores) {
    if (typeof v !== 'string') continue;
    const limpio = v.trim();
    if (!limpio || vistos.has(limpio)) continue;
    vistos.add(limpio);
    out.push(limpio);
  }
  return out;
}

/** «habitación 1a · tarifa 1a-s-ep» — lo que se descartó de una unidad. */
function detalleDeCodigos(descartada: UnidadDescartada): string {
  const partes: string[] = [];
  if (descartada.roomCodeDescarte) partes.push(`habitación ${descartada.roomCodeDescarte}`);
  if (descartada.codigosTarifa.length > 0) partes.push(`tarifa ${descartada.codigosTarifa.join(', ')}`);
  return partes.join(' · ');
}

/**
 * Atribuye los descartes del canal a las unidades del envío.
 *
 * @param input.avisos Avisos ya normalizados con `parsearAvisos`.
 * @param input.unidades Unidades que viajaron en ese push —las que devuelve
 *   `unidadesDelEnvio`, no todas las de la propiedad—.
 * @param input.noEnviadas Unidades que quedaron fuera del push, con su motivo
 *   (`unidadesFueraDelEnvio`). Se nombran: una unidad fuera del envío tampoco
 *   se está vendiendo por el canal.
 * @param input.canal Nombre del canal para el mensaje (default «el canal»).
 */
export function atribuirDescartes(input: {
  avisos: AvisoDescarte[];
  unidades: UnidadDelPush[];
  noEnviadas?: UnidadNoEnviada[];
  canal?: string;
}): RechazoDeCanal {
  const noEnviadas = input.noEnviadas ?? [];
  const canal = input.canal?.trim() || 'el canal';
  const consumidos = new Set<number>();

  interface Acumulada {
    unitId: string;
    nombre: string;
    roomCode: string | null;
    roomCodeDescarte: string | null;
    codigosTarifa: string[];
    motivos: string[];
  }

  const porUnidad = new Map<string, Acumulada>();
  const acomuladaDe = (u: UnidadDelPush): Acumulada => {
    const existente = porUnidad.get(u.unitId);
    if (existente) return existente;
    const nueva: Acumulada = {
      unitId: u.unitId,
      nombre: u.nombre,
      roomCode: u.roomCode,
      roomCodeDescarte: null,
      codigosTarifa: [],
      motivos: [],
    };
    porUnidad.set(u.unitId, nueva);
    return nueva;
  };

  input.avisos.forEach((aviso, indice) => {
    for (const unidad of input.unidades) {
      const codigosTarifa = unicos(unidad.rateplanCodes ?? []);
      if (aviso.codigo === 'INVALID_ROOM_CODE' && unidad.roomCode && aviso.valor === unidad.roomCode.trim()) {
        const acumulada = acomuladaDe(unidad);
        acumulada.roomCodeDescarte = aviso.valor;
        acumulada.motivos.push(motivoLegible(aviso));
        consumidos.add(indice);
        return;
      }
      if (aviso.codigo === 'INVALID_RATEPLAN_CODE' && codigosTarifa.includes(aviso.valor)) {
        const acumulada = acomuladaDe(unidad);
        if (!acumulada.codigosTarifa.includes(aviso.valor)) acumulada.codigosTarifa.push(aviso.valor);
        acumulada.motivos.push(motivoLegible(aviso));
        consumidos.add(indice);
        return;
      }
    }
  });

  // Orden de las unidades del envío, no el del proveedor: la lista que lee el
  // operador se corresponde con la que tiene delante, y el orden de los avisos
  // cambia con cada push.
  const posicion = new Map(input.unidades.map((u, i) => [u.unitId, i]));
  const descartadas: UnidadDescartada[] = [...porUnidad.values()]
    .sort((a, b) => (posicion.get(a.unitId) ?? 0) - (posicion.get(b.unitId) ?? 0))
    .map((a) => ({
    unitId: a.unitId,
    nombre: a.nombre,
      roomCode: a.roomCode,
      roomCodeDescarte: a.roomCodeDescarte,
      codigosTarifa: a.codigosTarifa,
      motivos: a.motivos,
      texto: `«${a.nombre}»: ${a.motivos.join('; ')}`,
    }));

  const idsDescartados = new Set(descartadas.map((d) => d.unitId));
  const aceptadas = input.unidades
    .filter((u) => !idsDescartados.has(u.unitId))
    .map((u) => ({ unitId: u.unitId, nombre: u.nombre }));

  const codigosSinUnidad = unicos(
    input.avisos.filter((_, i) => !consumidos.has(i)).map((a) => a.valor)
  );

  if (descartadas.length === 0 && codigosSinUnidad.length === 0) {
    return {
      huboDescartes: false,
      descartadas: [],
      aceptadas,
      codigosSinUnidad: [],
      noEnviadas,
      mensaje: null,
    };
  }

  const partes: string[] = [];
  if (descartadas.length > 0) {
    const lista = descartadas
      .map((d) => {
        const detalle = detalleDeCodigos(d);
        return detalle ? `«${d.nombre}» (${detalle})` : `«${d.nombre}»`;
      })
      .join(' · ');
    partes.push(
      `${canal} descartó ${descartadas.length} de ${input.unidades.length} unidades: ${lista}. ${CONSEJO_DESCARTE_CANAL}`
    );
    if (aceptadas.length > 0) {
      // Se nombran: saber qué SÍ quedó publicado es la otra mitad de la noticia
      // (y es lo que permite comprobar en el canal que el resto llegó).
      partes.push(
        `Las otras ${aceptadas.length} sí se enviaron: ${nombresDeUnidades(aceptadas)}.`
      );
    }
  }
  if (codigosSinUnidad.length > 0) {
    partes.push(
      `${canal} nombró códigos que no son de ninguna unidad del envío: ${codigosSinUnidad.join(', ')}. Revísalos antes de volver a sincronizar.`
    );
  }
  if (noEnviadas.length > 0) {
    const citadas = noEnviadas
      .slice(0, 5)
      .map((n) => `«${n.nombre}» (${n.motivo})`)
      .join(' · ');
    const resto = noEnviadas.length - Math.min(noEnviadas.length, 5);
    partes.push(
      `${noEnviadas.length === 1 ? '1 unidad no viajó' : `${noEnviadas.length} unidades no viajaron`} en este envío: ${citadas}${resto > 0 ? ` y ${resto} más` : ''}.`
    );
  }

  return {
    huboDescartes: true,
    descartadas,
    aceptadas,
    codigosSinUnidad,
    noEnviadas,
    mensaje: partes.join(' '),
  };
}

/**
 * Atajo para el camino real: los `warnings` crudos de la respuesta del proveedor
 * más las unidades que viajaron en el push. Es lo que llaman el dispatcher y las
 * rutas.
 */
export function rechazoDePush(input: {
  warnings: unknown;
  unidades: UnidadDelPush[];
  noEnviadas?: UnidadNoEnviada[];
  canal?: string;
}): RechazoDeCanal {
  return atribuirDescartes({
    avisos: parsearAvisos(input.warnings),
    unidades: input.unidades,
    noEnviadas: input.noEnviadas,
    canal: input.canal,
  });
}
