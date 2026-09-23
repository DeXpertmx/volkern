/**
 * Empaquetado ZIP y Base64 de un documento XML.
 *
 * Por qué existe. SES.HOSPEDAJES no recibe el XML en claro: la documentación exige
 * que determinadas operaciones vayan **comprimidas en ZIP y codificadas en Base64**.
 * Eso es una regla del protocolo del Ministerio, no del dominio del registro de
 * viajeros, y por eso vive aquí, aislada y comprobable, en vez de dentro del
 * conector.
 *
 * Por qué se implementa a mano y no con una librería. La plataforma no tiene
 * ninguna dependencia de ZIP (`jest`, `adm-zip` y compañía no están), y añadir una
 * por un archivo comprimido sería desproporcionado: el ZIP de una sola entrada son
 * 30 bytes de cabecera local, los datos y 46 de directorio central, y `node:zlib`
 * ya trae el DEFLATE. Se implementa lo mínimo que el protocolo necesita.
 *
 * La fecha de los registros va fijada a 1980-01-01 (el origen del formato) en vez
 * de la fecha actual: así el paquete de un XML es siempre el mismo binario, que es
 * lo que permite comprobarlo con una firma estable y depurar comparando.
 */

import { deflateRawSync, inflateRawSync } from 'node:zlib';

/** Fecha DOS fija: 1980-01-01, el origen del formato ZIP. */
const FECHA_DOS = 0x0021;
const HORA_DOS = 0x0000;
const VERSION = 20;
/** Bit 11: los nombres de archivo viajan en UTF-8. */
const FLAG_UTF8 = 0x0800;
const METODO_DEFLATE = 8;
const METODO_ALMACENADO = 0;

const FIRMA_LOCAL = 0x04034b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_FIN = 0x06054b50;

const TABLA_CRC = (() => {
  const tabla = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let valor = i;
    for (let bit = 0; bit < 8; bit += 1) {
      valor = valor & 1 ? 0xedb88320 ^ (valor >>> 1) : valor >>> 1;
    }
    tabla[i] = valor;
  }
  return tabla;
})();

/** CRC-32 de un búfer, el que exige la cabecera de cada entrada del ZIP. */
export function crc32(datos: Buffer): number {
  let valor = -1;
  for (let i = 0; i < datos.length; i += 1) {
    valor = (valor >>> 8) ^ TABLA_CRC[(valor ^ datos[i]) & 0xff];
  }
  return (valor ^ -1) >>> 0;
}

export interface ArchivoZip {
  nombre: string;
  contenido: string | Buffer;
}

const aBuffer = (contenido: string | Buffer): Buffer =>
  Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8');

/**
 * Empaqueta los archivos en un ZIP con DEFLATE.
 *
 * El orden de las entradas es el que recibe: no se reordena nada, porque el
 * contenido del paquete es lo que se firma y se envía.
 */
export function empaquetarZip(archivos: ArchivoZip[]): Buffer {
  if (archivos.length === 0) throw new Error('El ZIP necesita al menos un archivo');

  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;

  for (const archivo of archivos) {
    const nombre = Buffer.from(archivo.nombre, 'utf8');
    const sinComprimir = aBuffer(archivo.contenido);
    const comprimido = deflateRawSync(sinComprimir);
    const crc = crc32(sinComprimir);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(FIRMA_LOCAL, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(METODO_DEFLATE, 8);
    local.writeUInt16LE(HORA_DOS, 10);
    local.writeUInt16LE(FECHA_DOS, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(sinComprimir.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    local.writeUInt16LE(0, 28);

    locales.push(local, nombre, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(FIRMA_CENTRAL, 0);
    central.writeUInt16LE(VERSION, 4);
    central.writeUInt16LE(VERSION, 6);
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(METODO_DEFLATE, 10);
    central.writeUInt16LE(HORA_DOS, 12);
    central.writeUInt16LE(FECHA_DOS, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(sinComprimir.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(desplazamiento, 42);

    centrales.push(central, nombre);
    desplazamiento += local.length + nombre.length + comprimido.length;
  }

  const cuerpo = Buffer.concat(locales);
  const directorio = Buffer.concat(centrales);

  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(FIRMA_FIN, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(cuerpo.length, 16);
  fin.writeUInt16LE(0, 20);

  return Buffer.concat([cuerpo, directorio, fin]);
}

/** El paquete tal como lo espera el Ministerio: ZIP codificado en Base64. */
export function empaquetarZipBase64(archivos: ArchivoZip[]): string {
  return empaquetarZip(archivos).toString('base64');
}

export interface ArchivoDesempaquetado {
  nombre: string;
  contenido: Buffer;
}

/**
 * Lee un ZIP de vuelta.
 *
 * No es el camino de producción —el Ministerio nos responde, no nos manda ZIP—:
 * existe para que el empaquetado se pueda comprobarse a sí mismo y para poder
 * inspeccionar en local lo que se envió.
 */
export function desempaquetarZip(paquete: Buffer): ArchivoDesempaquetado[] {
  const fin = localizarFin(paquete);
  const total = paquete.readUInt16LE(fin + 10);
  let cursor = paquete.readUInt32LE(fin + 16);

  const archivos: ArchivoDesempaquetado[] = [];

  for (let i = 0; i < total; i += 1) {
    if (paquete.readUInt32LE(cursor) !== FIRMA_CENTRAL) {
      throw new Error(`Directorio central corrupto en la entrada ${i + 1}`);
    }

    const metodo = paquete.readUInt16LE(cursor + 10);
    const comprimido = paquete.readUInt32LE(cursor + 20);
    const largoNombre = paquete.readUInt16LE(cursor + 28);
    const largoExtra = paquete.readUInt16LE(cursor + 30);
    const largoComentario = paquete.readUInt16LE(cursor + 32);
    const offsetLocal = paquete.readUInt32LE(cursor + 42);
    const nombre = paquete.subarray(cursor + 46, cursor + 46 + largoNombre).toString('utf8');

    const largoNombreLocal = paquete.readUInt16LE(offsetLocal + 26);
    const largoExtraLocal = paquete.readUInt16LE(offsetLocal + 28);
    const inicioDatos = offsetLocal + 30 + largoNombreLocal + largoExtraLocal;
    const datos = paquete.subarray(inicioDatos, inicioDatos + comprimido);

    archivos.push({
      nombre,
      contenido: metodo === METODO_DEFLATE ? inflateRawSync(datos) : Buffer.from(datos),
    });

    cursor += 46 + largoNombre + largoExtra + largoComentario;
  }

  return archivos;
}

/** Igual que `desempaquetarZip`, partiendo del Base64 que viaja por la red. */
export function desempaquetarZipBase64(base64: string): ArchivoDesempaquetado[] {
  return desempaquetarZip(Buffer.from(base64, 'base64'));
}

/** El fin del directorio central, contando con que puede llevar comentario. */
function localizarFin(paquete: Buffer): number {
  const desde = Math.max(0, paquete.length - 22 - 0xffff);
  for (let i = paquete.length - 22; i >= desde; i -= 1) {
    if (paquete.readUInt32LE(i) === FIRMA_FIN) return i;
  }
  throw new Error('El búfer no es un ZIP: no se encontró el fin del directorio central');
}

export const METODOS_ZIP = { METODO_DEFLATE, METODO_ALMACENADO } as const;
