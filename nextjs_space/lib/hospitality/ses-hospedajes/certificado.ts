/**
 * Certificado digital de la entidad para SES.HOSPEDAJES.
 *
 * Qué es esto. El certificado que la entidad usa ante el Ministerio (el de su
 * representante, emitido por la FNMT) llega en la configuración del registro de
 * viajeros como un fichero PKCS#12 (`.p12`/`.pfx`) protegido por su contraseña.
 * Aquí se abre ese fichero, se comprueba que sirve —que su contraseña es la
 * correcta y que no está caducado—, se sacan los datos que la interfaz necesita
 * para que el administrador vea qué instaló, y se prepara el agente TLS con el
 * que la comunicación se presenta ante el Ministerio.
 *
 * Lo que NO es. Aquí no se guarda nada: el certificado se cifra en la capa de
 * datos (`compliance-store.ts`). Este módulo solo lo interpreta, y por eso puede
 * probarse sin base de datos ni red.
 *
 * Por qué PKCS#12 y no PEM. Es lo que expide la FNMT y lo que el administrador
 * tiene a mano. Aceptar solo PEM obligaría a la entidad a convertir el fichero,
 * que es justo el paso donde se pierde la clave privada.
 *
 * La contraseña del fichero y la clave privada NUNCA se registran en logs ni en
 * la bitácora: de este módulo solo salen metadatos públicos (titular, NIF,
 * huella y vigencia) y material criptográfico que se queda en memoria.
 */

import * as https from 'https';
// @ts-ignore - node-forge no tiene declaración de tipos en el proyecto
import * as forge from 'node-forge';

/** Causas por las que un certificado no se puede instalar, para que el mensaje sea exacto. */
export type CausaCertificadoInvalido =
  | 'archivo'
  | 'password'
  | 'sin-clave'
  | 'caducado'
  | 'no-vigente'
  | 'formato';

/**
 * El certificado no se puede usar.
 *
 * Es un error tipado para que la ruta pueda responder «el fichero no es un .p12» o
 * «la contraseña no es correcta» en lugar de un 500 que parezca una caída, y para
 * que la interfaz diga qué corregir en vez de «error inesperado».
 */
export class CertificadoInvalidoError extends Error {
  readonly causa: CausaCertificadoInvalido;

  constructor(causa: CausaCertificadoInvalido, mensaje: string) {
    super(mensaje);
    this.name = 'CertificadoInvalidoError';
    this.causa = causa;
  }
}

/** Lo que la interfaz puede enseñar del certificado instalado. Nada de esto es secreto. */
export interface MetadatosCertificado {
  /** Titular del certificado, tal como lo emitió la FNMT. */
  titular: string;
  /** NIF del titular, cuando el certificado lo lleva en el `serialNumber`. */
  nif: string | null;
  /** Nombre de la entidad certificadora que lo emitió. */
  emisor: string;
  /** Huella SHA-256 del certificado hoja, para comparar con el original. */
  huella: string;
  desde: Date;
  hasta: Date;
  caducado: boolean;
  /** Días de vigencia que le quedan; 0 o negativo si ya caducó. */
  diasRestantes: number;
  /** Cuántos certificados viajan con la hoja (la cadena que trae el .p12). */
  cadena: number;
}

/** El certificado ya interpretado, listo para hablar con el Ministerio. */
export interface CertificadoEntidad {
  metadatos: MetadatosCertificado;
  /** Clave privada en PEM. No sale de memoria. */
  keyPem: string;
  /** Certificado hoja seguido de su cadena, tal como lo espera OpenSSL. */
  certPem: string;
  /** Solo el certificado hoja, para firmar o comparar huellas. */
  certPemHoja: string;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * El patrón de un NIF/NIE/CIF español, para reconocerlo cuando el certificado no lo
 * expone en un campo propio (algunos emisores solo lo llevan dentro del CN).
 */
const PATRON_NIF = /\b([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J])\b/;

/**
 * Normaliza el fichero que llega desde la interfaz.
 *
 * La interfaz sube el `.p12` en Base64 (puede llegar con el prefijo `data:` del
 * `FileReader`, con saltos de línea o en un formato distinto) y aquí se convierte
 * en el binario que entiende node-forge. Un fichero que no es Base64 se rechaza
 * con su causa en lugar de intentar adivinar.
 */
function aDer(base64: unknown): string {
  const texto = String(base64 ?? '')
    .replace(/^data:[^;]+;base64,/, '')
    .replace(/\s+/g, '');
  if (!texto) {
    throw new CertificadoInvalidoError('archivo', 'No se recibió ningún fichero de certificado');
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(texto)) {
    throw new CertificadoInvalidoError(
      'archivo',
      'El certificado no llegó en Base64: vuelve a subir el fichero .p12/.pfx sin convertirlo'
    );
  }
  try {
    return forge.util.decode64(texto);
  } catch {
    throw new CertificadoInvalidoError('archivo', 'El fichero del certificado está corrupto o incompleto');
  }
}

/**
 * Abre el PKCS#12 y devuelve la clave privada, la cadena y el certificado hoja.
 *
 * La contraseña incorrecta es el fallo más común al instalar un certificado, y
 * node-forge lo reporta de varias formas según el algoritmo del fichero; aquí se
 * traduce a una sola causa reconocible para poder decirla en la interfaz.
 */
function abrirP12(der: string, password: string) {
  let p12;
  try {
    const asn1 = forge.asn1.fromDer(der, false);
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    if (/mac|password|invalid|pkcs12/i.test(detalle)) {
      throw new CertificadoInvalidoError(
        'password',
        'La contraseña del certificado no es correcta (o el fichero no es un .p12/.pfx de la entidad)'
      );
    }
    throw new CertificadoInvalidoError(
      'formato',
      'El fichero no tiene el formato de un certificado PKCS#12 (.p12/.pfx)'
    );
  }

  // La clave puede venir envuelta (pkcs8ShroudedKeyBag) o sin envolver (keyBag):
  // los .p12 exportados por la FNMT y los de Windows no siempre coinciden.
  const bolsasClave = p12.getBags({
    bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
  })[forge.pki.oids.pkcs8ShroudedKeyBag];
  const bolsasClaveSueltas = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];
  const clave = bolsasClave?.[0]?.key ?? bolsasClaveSueltas?.[0]?.key;
  if (!clave) {
    throw new CertificadoInvalidoError(
      'sin-clave',
      'El fichero no contiene la clave privada: es el certificado sin su clave y no sirve para firmar la comunicación'
    );
  }

  const bolsasCert: Array<{ cert?: unknown }> =
    p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const certificados = bolsasCert.map((bolsa) => bolsa.cert).filter(Boolean);
  if (certificados.length === 0) {
    throw new CertificadoInvalidoError('formato', 'El fichero no contiene ningún certificado');
  }

  return { clave, certificados };
}

/**
 * Elige el certificado hoja: el que casa con la clave privada.
 *
 * No se toma el primero a ciegas porque un `.p12` puede traer la cadena en
 * cualquier orden, y presentar la intermedia como certificado de cliente produce un
 * handshake fallido sin explicación.
 *
 * La comprobación es una firma de verdad y no una comparación de módulos: firmar un
 * texto fijo con la clave privada y verlo con cada certificado solo pasa con el
 * certificado de ESA clave, sin depender de cómo represente cada versión de
 * node-forge los números grandes.
 */
function hojaQueCasa(certificados: Array<{ publicKey?: { verify?: (d: string, f: string) => boolean } | null }>, clave: { sign?: (md: unknown) => string }) {
  try {
    const resumen = forge.md.sha256.create();
    resumen.update('volkern:comprobacion-de-emparejamiento');
    const firma = clave.sign?.(resumen);
    const digest = resumen.digest().bytes();
    if (firma) {
      const casa = certificados.find((certificado) => {
        try {
          return certificado.publicKey?.verify?.(digest, firma) === true;
        } catch {
          return false;
        }
      });
      if (casa) return casa;
    }
  } catch {
    // Una clave que no sabe firmar (un tipo exótico) no debe impedir instalar el
    // certificado: se cae al primero, que es lo que hacen las herramientas del
    // sistema.
  }
  return certificados[0];
}

/**
 * Todos los atributos de un nombre (sujeto o emisor), buscando por nombre corto,
 * nombre largo u OID: node-forge los etiqueta de las tres formas según el caso.
 */
function atributo(nombre: { attributes: Array<Record<string, unknown>> }, ...claves: string[]) {
  for (const clave of claves) {
    const encontrado = nombre.attributes.find(
      (a) => a.shortName === clave || a.name === clave || a.type === clave
    );
    if (encontrado?.value) return String(encontrado.value);
  }
  return null;
}

/** El nombre con el que se identifica un nombre distinguido (sujeto o emisor). */
function nombreComun(nombre: { attributes: Array<Record<string, unknown>> }): string {
  const cn = atributo(nombre, 'CN', 'commonName', '2.5.4.3');
  if (cn) return cn;
  const partes = ['G', 'SN'].map((clave) => atributo(nombre, clave)).filter(Boolean);
  return partes.join(' ') || 'Sin nombre en el certificado';
}

/** Huella SHA-256 (hex, en mayúsculas y con dos puntos) del certificado hoja. */
function huellaSha256(hoja: unknown): string {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(hoja)).getBytes();
  const resumen = forge.md.sha256.create();
  resumen.update(der);
  const hex = resumen.digest().toHex().toUpperCase() as string;
  return hex.match(/.{2}/g)?.join(':') ?? hex;
}

/**
 * Interpreta el certificado de la entidad y comprueba que está vigente.
 *
 * Se llama al guardar la configuración y también antes de cada envío: un
 * certificado caducado produce en TLS un error opaco, y aquí se convierte en un
 * mensaje que dice qué pasa y qué hacer.
 */
export function leerCertificado(base64: unknown, password?: string | null): CertificadoEntidad {
  const der = aDer(base64);
  const { clave, certificados } = abrirP12(der, String(password ?? ''));

  const candidatos = certificados as Array<{ publicKey?: { verify?: (d: string, f: string) => boolean } | null }>;
  const hoja = hojaQueCasa(candidatos, clave) as {
    subject: { attributes: Array<Record<string, unknown>> };
    issuer: { attributes: Array<Record<string, unknown>> };
    validity: { notBefore: Date; notAfter: Date };
  };

  const desde = new Date(hoja.validity.notBefore);
  const hasta = new Date(hoja.validity.notAfter);
  const ahora = Date.now();

  if (Number.isNaN(hasta.getTime()) || Number.isNaN(desde.getTime())) {
    throw new CertificadoInvalidoError('formato', 'El certificado no declara un periodo de validez legible');
  }
  if (ahora > hasta.getTime()) {
    throw new CertificadoInvalidoError(
      'caducado',
      `El certificado de la entidad caducó el ${hasta.toLocaleDateString('es-ES')}: renueva el certificado e instálalo de nuevo`
    );
  }
  if (ahora < desde.getTime()) {
    throw new CertificadoInvalidoError(
      'no-vigente',
      `El certificado todavía no está vigente (empieza el ${desde.toLocaleDateString('es-ES')})`
    );
  }

  const titular = nombreComun(hoja.subject);
  const nifDirecto = atributo(hoja.subject, 'serialNumber', '2.5.4.5', 'organizationIdentifier', '2.5.4.97');
  const nif = (nifDirecto?.match(PATRON_NIF)?.[1] ?? titular.match(PATRON_NIF)?.[1] ?? null)?.toUpperCase() ?? null;

  const huella = huellaSha256(hoja);
  const cadena = certificados.length;
  const hojas = certificados.filter((certificado: unknown) => certificado !== hoja);

  return {
    metadatos: {
      titular,
      nif,
      emisor: nombreComun(hoja.issuer),
      huella,
      desde,
      hasta,
      caducado: false,
      diasRestantes: Math.floor((hasta.getTime() - ahora) / DIA_MS),
      cadena,
    },
    keyPem: forge.pki.privateKeyToPem(clave),
    // La hoja primero y su cadena después: así lo espera OpenSSL al presentarse.
    certPem: [hoja, ...hojas].map((certificado) => forge.pki.certificateToPem(certificado)).join('\n'),
    certPemHoja: forge.pki.certificateToPem(hoja),
  };
}

/**
 * Agente TLS con el certificado de cliente de la entidad.
 *
 * `NODE_EXTRA_CA_CERTS` (la CA intermedia de la FNMT que viaja en la imagen) sigue
 * validando al Ministerio; lo que añade el agente es la otra mitad del TLS mutuo:
 * presentar el certificado de la entidad para que el Ministerio sepa quién
 * comunica. No se desactiva la validación del servidor: si su certificado no se
 * puede verificar, la comunicación falla y se ve por qué.
 */
export function agenteTls(certificado: Pick<CertificadoEntidad, 'keyPem' | 'certPem'>): https.Agent {
  return new https.Agent({
    key: certificado.keyPem,
    cert: certificado.certPem,
    minVersion: 'TLSv1.2',
    keepAlive: false,
  });
}

/**
 * ¿Coinciden el certificado guardado y el que el administrador acaba de subir?
 *
 * Sirve para que la interfaz pueda decir «este es el certificado que ya estaba
 * instalado» sin volver a subirlo, comparando huellas.
 */
export function esMismoCertificado(
  huellaGuardada: string | null | undefined,
  certificado: CertificadoEntidad
): boolean {
  const guardada = String(huellaGuardada ?? '').trim().toUpperCase();
  return guardada !== '' && guardada === certificado.metadatos.huella;
}

/** Los metadatos tal como se guardan en la base de datos (fechas aparte). */
export function metadatosParaGuardar(metadatos: MetadatosCertificado) {
  return {
    titular: metadatos.titular,
    nif: metadatos.nif,
    huella: metadatos.huella,
    vence: metadatos.hasta,
    emisor: metadatos.emisor,
  };
}
