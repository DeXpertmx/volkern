/**
 * Documentación del huésped para el registro de viajeros (RD 933/2021) —
 * módulo puro, sin BD ni React.
 *
 * El problema que resuelve: al canal (OTA) le llegan nombre y poco más, así que
 * el parte de viajeros nacía `datos_incompletos` y **una persona** tenía que
 * completarlo a mano desde la pantalla antes de que saliera. Aquí está lo que
 * necesitan las dos superficies que sí pueden pedírselo al huésped —el motor de
 * reservas y el check-in online— para que el parte salga completo sin que nadie
 * del hotel toque nada.
 *
 * Tres decisiones que conviene tener presentes:
 *
 *  1. **Se guarda en el formato del Ministerio, no en uno propio.** Un viajero
 *     recogido aquí es un `PersonaMIR` sin el rol (`rol` lo asigna el registro de
 *     viajeros: en el parte todos son `VI` y en la reserva de hospedaje el
 *     primero es `TI`). Guardar el formato nativo evita el paso de traducción
 *     donde se pierden campos: `personasDesdeGuestData()` lo lee tal cual.
 *
 *  2. **Qué falta es lo que valida el Ministerio**, no una lista paralela. Las
 *     reglas de aquí son la proyección de `validarParteViajeros()` —mismos
 *     límites (`LONGITUDES`), mismos formatos (NIF/NIE con dígito de control,
 *     país alfa-3, municipio INE de 5 dígitos, correo), misma regla de menores—
 *     y un test compara las dos: si divergen, falla.
 *
 *  3. **Lo que el huésped no repite, se hereda con su consentimiento explícito.**
 *     El contacto y la dirección del titular se copian a los acompañantes solo
 *     cuando el formulario lo ofrece y el huésped lo acepta (checkbox «misma
 *     dirección», activado por defecto). Nada se rellena por suposición: lo que
 *     falta se queda vacío y se dice cuál es.
 */

import {
  LONGITUDES,
  edadEn,
  esDocumentoNIFoNIE,
  esNIE,
  esNIF,
  type DireccionMIR,
  type PersonaMIR,
} from './registro-viajeros';

/** Tope del formulario público: acota el cuerpo del POST sin descartar a nadie. */
export const MAX_VIAJEROS_CHECKIN = 30;

/**
 * Lo mínimo para que una fila del formulario sea una persona: el resto son
 * datos que se pueden completar después. Se usa para responder «aquí no hay
 * nadie que documentar» con la misma forma que el resto de faltantes, en vez de
 * una lista vacía que la pantalla no sabría explicar.
 */
export const CAMPOS_MINIMOS_VIAJERO: CampoViajero[] = ['nombre', 'apellido1'];

/** Longitud máxima que se acepta de un campo de texto libre. */
const MAX_TEXTO = 200;

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_ALFA3 = /^[A-Za-z]{3}$/;
const RE_MUNICIPIO_INE = /^\d{5}$/;
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Un viajero tal y como se guarda en `guestData.viajeros[i]`.
 *
 * Es el `PersonaMIR` del registro de viajeros sin `rol` (lo decide el registro,
 * no el huésped). `actualizadoEn` es solo traza: sirve para saber cuándo lo
 * completó el huésped, que es lo que se le enseña al hotel si pregunta.
 */
export type ViajeroCheckin = Omit<PersonaMIR, 'rol' | 'direccion'> & {
  /**
   * La dirección es opcional hasta que el huésped la da: `null` significa «aún
   * no la tenemos», que es distinto de un bloque con campos vacíos. Por eso el
   * tipo la admite nula aunque el `PersonaMIR` del registro la dé por hecha.
   */
  direccion: DireccionMIR | null;
  actualizadoEn?: string | null;
};

/** Campos del formulario, en el orden en que se piden. */
export const CAMPOS_VIAJERO = [
  'nombre',
  'apellido1',
  'apellido2',
  'tipoDocumento',
  'numeroDocumento',
  'soporteDocumento',
  'fechaNacimiento',
  'nacionalidad',
  'sexo',
  'direccion.calle',
  'direccion.codigoPostal',
  'direccion.pais',
  'direccion.municipio',
  'contacto',
  'parentesco',
] as const;

export type CampoViajero = (typeof CAMPOS_VIAJERO)[number];

/**
 * Qué le falta a un viajero.
 *
 * `faltan` es «campos que impiden enviar el parte»: ausentes **o** con un
 * formato/longitud que el Ministerio rechaza — por eso la pantalla lo enseña
 * como «revisa estos datos» y no como «te falta esto». `recomendados` no
 * bloquea nada (nacionalidad y sexo: el Ministerio no rechaza el parte sin
 * ellos, pero los pide en la práctica).
 */
export interface FaltantesViajero {
  faltan: CampoViajero[];
  recomendados: CampoViajero[];
}

/** Cobertura de la documentación de toda la reserva. */
export interface DocumentacionReserva {
  total: number;
  /** Viajeros con todos los campos que bloquean. */
  completos: number;
  /** Campos a revisar en al menos un viajero (únicos, en orden de formulario). */
  faltan: CampoViajero[];
  recomendados: CampoViajero[];
  /** `true` solo si hay viajeros y no queda nada por revisar. */
  completa: boolean;
}

function texto(valor: unknown): string {
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor);
  return '';
}

/** Texto normalizado y acotado (los formularios son públicos: hay que acotar). */
function campo(valor: unknown): string {
  return texto(valor).slice(0, MAX_TEXTO);
}

/** El código de documento y la nacionalidad van en mayúsculas (catálogo MIR). */
function codigo(valor: unknown): string {
  return campo(valor).toUpperCase();
}

/** ¿El texto no cabe en el campo? (el Ministerio lo rechaza por longitud). */
function excede(valor: string, maximo: number): boolean {
  return Boolean(valor) && valor.length > maximo;
}

/**
 * Normaliza la dirección al bloque del XSD (`direccion`, `codigoMunicipio`…).
 * Acepta los alias habituales de los formularios (`calle`, `municipio`) porque
 * los formularios no tienen por qué escribir el nombre técnico.
 */
function normalizarDireccion(crudo: unknown): DireccionMIR | null {
  // Formularios planos: la dirección llega como un solo texto.
  if (typeof crudo === 'string') {
    const calle = campo(crudo);
    return calle ? { direccion: calle, codigoPostal: '', pais: '' } : null;
  }
  if (!crudo || typeof crudo !== 'object') return null;
  const d = crudo as Record<string, unknown>;
  const direccion = campo(d.direccion ?? d.calle ?? d.address ?? d.linea);
  const complementaria = campo(d.direccionComplementaria ?? d.complementaria ?? d.piso);
  const codigoPostal = campo(d.codigoPostal ?? d.cp ?? d.postalCode ?? d.zip);
  const pais = codigo(d.pais ?? d.country);
  const codigoMunicipio = campo(d.codigoMunicipio ?? d.codigoINE ?? d.municipioCodigo);
  const nombreMunicipio = campo(d.nombreMunicipio ?? d.municipio ?? d.ciudad ?? d.city);

  const vacia =
    !direccion && !complementaria && !codigoPostal && !pais && !codigoMunicipio && !nombreMunicipio;
  if (vacia) return null;

  return {
    direccion,
    direccionComplementaria: complementaria || null,
    codigoMunicipio: codigoMunicipio || null,
    nombreMunicipio: nombreMunicipio || null,
    codigoPostal,
    pais,
  };
}

/**
 * Convierte lo que llega del formulario en un viajero almacenable.
 *
 * Devuelve `null` si no hay ni nombre ni apellidos: una fila vacía del
 * formulario no es un viajero y no debe acabar en el parte (ni contar como
 * persona para el Ministerio).
 */
export function normalizarViajero(crudo: unknown, ahora: Date = new Date()): ViajeroCheckin | null {
  if (!crudo || typeof crudo !== 'object') return null;
  const c = crudo as Record<string, unknown>;

  const nombre = campo(c.nombre ?? c.firstName ?? c.nombres);
  const apellido1 = campo(c.apellido1 ?? c.primerApellido ?? c.lastName ?? c.apellidos);
  if (!nombre && !apellido1) return null;

  return {
    nombre,
    apellido1,
    apellido2: campo(c.apellido2 ?? c.segundoApellido) || null,
    tipoDocumento: codigo(c.tipoDocumento ?? c.documentoTipo) || null,
    numeroDocumento: codigo(c.numeroDocumento ?? c.documento ?? c.nif ?? c.nie ?? c.dni) || null,
    soporteDocumento: campo(c.soporteDocumento ?? c.soporte) || null,
    fechaNacimiento: campo(c.fechaNacimiento ?? c.birthdate ?? c.birthDate ?? c.nacimiento),
    nacionalidad: codigo(c.nacionalidad ?? c.nationality) || null,
    sexo: codigo(c.sexo ?? c.genero ?? c.gender) || null,
    direccion: normalizarDireccion(c.direccion ?? c.address ?? c),
    telefono: campo(c.telefono ?? c.phone ?? c.telefono1) || null,
    telefono2: campo(c.telefono2 ?? c.phone2) || null,
    correo: campo(c.correo ?? c.email) || null,
    parentesco: campo(c.parentesco ?? c.relacion) || null,
    actualizadoEn: ahora.toISOString(),
  };
}

/**
 * Normaliza la lista de viajeros de un formulario.
 *
 * Devuelve además `descartados`: cuántas filas vacías se ignoraron. El número
 * se devuelve (y no se calla) para que la pantalla pueda explicar por qué el
 * parte dice «2 personas» si el huésped rellenó cuatro filas.
 */
export function normalizarViajeros(
  entrada: unknown,
  ahora: Date = new Date()
): { viajeros: ViajeroCheckin[]; descartados: number } {
  const lista = Array.isArray(entrada) ? entrada : [];
  const viajeros: ViajeroCheckin[] = [];
  let descartados = 0;

  for (const crudo of lista) {
    const viajero = normalizarViajero(crudo, ahora);
    if (viajero) viajeros.push(viajero);
    else descartados++;
  }

  return { viajeros, descartados };
}

/** ¿Hay algo en este bloque de dirección? */
function hayDireccion(d: DireccionMIR | null | undefined): boolean {
  if (!d) return false;
  return Boolean(d.direccion || d.codigoPostal || d.pais || d.codigoMunicipio || d.nombreMunicipio);
}

/**
 * Qué le falta a este viajero para que el Ministerio acepte su parte.
 *
 * Es la proyección de `validarParteViajeros()` para una persona: mismas reglas
 * y mismos límites, para que lo que la pantalla le pide al huésped sea
 * exactamente lo que el servicio va a exigir. La `referencia` es la fecha con la
 * que se decide si es menor de edad: **la fecha de entrada de la reserva** (el
 * registro de viajeros usa la misma).
 */
export function faltantesParaParte(
  viajero: ViajeroCheckin,
  referencia: Date = new Date()
): FaltantesViajero {
  const faltan: CampoViajero[] = [];
  const recomendados: CampoViajero[] = [];
  const marcar = (campo: CampoViajero) => {
    if (!faltan.includes(campo)) faltan.push(campo);
  };

  const nombre = texto(viajero?.nombre);
  if (!nombre || excede(nombre, LONGITUDES.nombre)) marcar('nombre');

  const apellido1 = texto(viajero?.apellido1);
  if (!apellido1 || excede(apellido1, LONGITUDES.apellido)) marcar('apellido1');

  const nacimiento = texto(viajero?.fechaNacimiento);
  const edad = RE_FECHA.test(nacimiento) ? edadEn(nacimiento, referencia) : null;
  if (edad === null) marcar('fechaNacimiento');

  // Sin fecha de nacimiento válida no se puede probar que sea menor, así que el
  // documento se exige igual: darlo por menor sería una suposición sin soporte.
  const mayor = edad === null || edad >= 18;

  const tipoDocumento = texto(viajero?.tipoDocumento);
  const numeroDocumento = texto(viajero?.numeroDocumento);
  const esNifNie = esDocumentoNIFoNIE(tipoDocumento);
  const numeroInvalido = esNifNie && Boolean(numeroDocumento) && !esNIF(numeroDocumento) && !esNIE(numeroDocumento);

  if (mayor) {
    if (!tipoDocumento || excede(tipoDocumento, LONGITUDES.tipoDocumento)) marcar('tipoDocumento');
    if (!numeroDocumento || excede(numeroDocumento, LONGITUDES.numeroDocumento)) marcar('numeroDocumento');
  }
  if (numeroInvalido) marcar('numeroDocumento');

  // Segundo apellido con NIF/NIE: a cualquier edad. Soporte: solo al mayor (es
  // el único caso en que el XSD lo exige).
  if (esNifNie) {
    const apellido2 = texto(viajero?.apellido2);
    if (!apellido2 || excede(apellido2, LONGITUDES.apellido)) marcar('apellido2');
    if (mayor) {
      const soporte = texto(viajero?.soporteDocumento);
      if (!soporte || excede(soporte, LONGITUDES.soporteDocumento)) marcar('soporteDocumento');
    }
  }

  const nacionalidad = texto(viajero?.nacionalidad);
  if (!nacionalidad) recomendados.push('nacionalidad');
  else if (!RE_ALFA3.test(nacionalidad)) marcar('nacionalidad');

  const sexo = texto(viajero?.sexo);
  if (!sexo) recomendados.push('sexo');
  else if (sexo.length > LONGITUDES.sexo) marcar('sexo');

  const direccion = viajero?.direccion ?? null;
  if (!hayDireccion(direccion)) {
    // Sin bloque de dirección: el Ministerio exige la calle, el código postal y
    // el país. Se piden los tres porque los tres son obligatorios.
    marcar('direccion.calle');
    marcar('direccion.codigoPostal');
    marcar('direccion.pais');
  } else {
    const calle = texto(direccion?.direccion);
    if (!calle || excede(calle, LONGITUDES.direccion)) marcar('direccion.calle');

    const codigoPostal = texto(direccion?.codigoPostal);
    if (!codigoPostal || excede(codigoPostal, LONGITUDES.codigoPostal)) marcar('direccion.codigoPostal');

    const pais = texto(direccion?.pais).toUpperCase();
    if (!pais || excede(pais, LONGITUDES.pais)) marcar('direccion.pais');
    else if (!RE_ALFA3.test(pais)) marcar('direccion.pais');

    const municipioIne = texto(direccion?.codigoMunicipio);
    const nombreMunicipio = texto(direccion?.nombreMunicipio);
    if (pais === 'ESP') {
      // España se identifica por el código INE del municipio, no por el nombre.
      if (!municipioIne || !RE_MUNICIPIO_INE.test(municipioIne)) marcar('direccion.municipio');
    } else if (pais) {
      if (!nombreMunicipio || excede(nombreMunicipio, LONGITUDES.nombreMunicipio)) marcar('direccion.municipio');
    }
  }

  const telefono = texto(viajero?.telefono);
  const telefono2 = texto(viajero?.telefono2);
  const correo = texto(viajero?.correo);
  if (!telefono && !telefono2 && !correo) marcar('contacto');
  if (excede(telefono, LONGITUDES.telefono) || excede(telefono2, LONGITUDES.telefono)) marcar('contacto');
  if (correo && (excede(correo, LONGITUDES.correo) || !RE_CORREO.test(correo))) marcar('contacto');

  const parentesco = texto(viajero?.parentesco);
  if (excede(parentesco, LONGITUDES.parentesco)) marcar('parentesco');

  return { faltan, recomendados };
}

/** ¿Esta persona es menor de edad en la fecha de entrada de la reserva? */
function esMenor(viajero: ViajeroCheckin, referencia: Date): boolean {
  const nacimiento = texto(viajero?.fechaNacimiento);
  if (!RE_FECHA.test(nacimiento)) return false;
  const edad = edadEn(nacimiento, referencia);
  return edad !== null && edad < 18;
}

/**
 * Cobertura de la documentación de la reserva: cuántos viajeros están completos
 * y qué hay que revisar (una vez cada cosa, en orden de formulario) para poder
 * decírselo al huésped y al hotel sin que ninguno de los dos interprete nada.
 *
 * Incluye la única regla que no es de una persona suelta: si hay algún menor,
 * alguien del parte tiene que declarar el parentesco (lo exige el apartado
 * 3.1.1.1, y con razón: es lo que relaciona al menor con un adulto).
 */
export function resumenDocumentacion(
  viajeros: ViajeroCheckin[],
  referencia: Date = new Date()
): DocumentacionReserva {
  const lista = Array.isArray(viajeros) ? viajeros : [];
  const faltan = new Set<CampoViajero>();
  const recomendados = new Set<CampoViajero>();
  let completos = 0;

  for (const viajero of lista) {
    const f = faltantesParaParte(viajero, referencia);
    if (f.faltan.length === 0) completos++;
    f.faltan.forEach((c) => faltan.add(c));
    f.recomendados.forEach((c) => recomendados.add(c));
  }

  const hayMenor = lista.some((v) => esMenor(v, referencia));
  const hayParentesco = lista.some((v) => Boolean(texto(v?.parentesco)));
  if (hayMenor && !hayParentesco) faltan.add('parentesco');

  return {
    total: lista.length,
    // El menor sin parentesco declarado impide cerrar la reserva aunque su
    // propia ficha esté completa: `completos` cuenta fichas, `completa` cuenta
    // que el parte pueda salir.
    completos: hayMenor && !hayParentesco ? Math.max(0, completos - 1) : completos,
    faltan: CAMPOS_VIAJERO.filter((c) => faltan.has(c)),
    recomendados: CAMPOS_VIAJERO.filter((c) => recomendados.has(c)),
    completa: lista.length > 0 && faltan.size === 0,
  };
}

/**
 * Hereda los datos que el grupo comparte, con la regla escrita:
 *
 *  - **Contacto**: si el acompañante no dejó ninguno, se le pone el del titular.
 *    El Ministerio exige un contacto por persona y el huésped no tiene por qué
 *    repetir el suyo en cada acompañante; es el contacto del grupo.
 *  - **Dirección**: igual, pero solo si se pide explícitamente
 *    (`heredarDireccion`), porque el formulario lo consulta con un check
 *    («misma dirección que el titular», activado por defecto).
 *  - **Documento, nombre y fecha de nacimiento NO se heredan nunca**: son datos
 *    personales de cada viajero y copiarlos sería inventar el parte.
 */
export function heredarDatosDelTitular(
  viajeros: ViajeroCheckin[],
  opciones: { heredarDireccion?: boolean } = {}
): ViajeroCheckin[] {
  const titular = viajeros[0];
  if (!titular) return viajeros;

  return viajeros.map((viajero, indice) => {
    if (indice === 0) return viajero;
    const heredado: ViajeroCheckin = { ...viajero };

    if (!texto(heredado.telefono) && !texto(heredado.telefono2) && !texto(heredado.correo)) {
      heredado.telefono = titular.telefono ?? null;
      heredado.telefono2 = titular.telefono2 ?? null;
      heredado.correo = titular.correo ?? null;
    }

    if (opciones.heredarDireccion && !hayDireccion(heredado.direccion) && hayDireccion(titular.direccion)) {
      heredado.direccion = titular.direccion ? { ...titular.direccion } : null;
    }

    return heredado;
  });
}

/**
 * Deja al titular en primera posición.
 *
 * Importa porque el registro de viajeros asigna el rol por posición: en el parte
 * de viajeros todos son `VI`, pero en la reserva de hospedaje el **primero es el
 * `TI`** (titular del contrato). Se identifica por el correo o el teléfono del
 * titular de la reserva (`guestData`), que es el dato con el que el huésped se
 * identifica en el formulario; si no coincide con ninguno, se respeta el orden
 * que mandó la pantalla.
 */
export function titularPrimero(
  viajeros: ViajeroCheckin[],
  datosTitular: { correo?: unknown; telefono?: unknown } = {}
): ViajeroCheckin[] {
  if (viajeros.length < 2) return viajeros;

  const correo = texto(datosTitular.correo).toLowerCase();
  const telefono = texto(datosTitular.telefono).replace(/\s+/g, '');

  // Primero por correo y solo si no hay ninguno, por teléfono: un teléfono se
  // comparte en una familia, así que emparejar por él antes que por email
  // acabaría subiendo a un acompañante en lugar del titular.
  const porCorreo = correo
    ? viajeros.findIndex((v) => texto(v?.correo).toLowerCase() === correo)
    : -1;
  const indice =
    porCorreo >= 0
      ? porCorreo
      : telefono
        ? viajeros.findIndex((v) => texto(v?.telefono).replace(/\s+/g, '') === telefono)
        : -1;

  if (indice <= 0) return viajeros;
  const reordenados = [...viajeros];
  const [titular] = reordenados.splice(indice, 1);
  return [titular, ...reordenados];
}

/**
 * Guarda los viajeros dentro de `guestData` **sin tocar nada más**.
 *
 * El idioma (`idioma`) y el contacto del titular viven en el mismo JSON y son
 * los que leen las comunicaciones automáticas y el CRM: perderlos al completar
 * el registro dejaría al huésped sin mensajes en su idioma.
 */
export function fusionarViajerosEnGuestData(
  guestData: unknown,
  viajeros: ViajeroCheckin[]
): Record<string, unknown> {
  const base =
    guestData && typeof guestData === 'object' && !Array.isArray(guestData)
      ? { ...(guestData as Record<string, unknown>) }
      : {};

  base.viajeros = viajeros;
  return base;
}

/** Los viajeros ya guardados en `guestData` (para prerellenar el formulario). */
export function viajerosDeGuestData(guestData: unknown): ViajeroCheckin[] {
  if (!guestData || typeof guestData !== 'object') return [];
  const gd = guestData as Record<string, unknown>;
  const crudos = gd.viajeros ?? gd.guests ?? gd.huespedes;
  return normalizarViajeros(crudos).viajeros;
}
