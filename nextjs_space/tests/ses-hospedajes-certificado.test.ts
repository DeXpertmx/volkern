/**
 * Guardias del certificado digital de la entidad para SES.HOSPEDAJES.
 *
 * Lo que se prueba aquí es que el certificado que el administrador instala en la
 * configuración sirva de verdad: que se abra con su contraseña, que diga de quién
 * es, que un certificado caducado no se dé por bueno, y que el envío salga con él
 * presentado en el TLS. Los `.p12` de estas pruebas se generan aquí mismo (clave
 * nueva, certificado autofirmado), así que no dependen de ningún fichero real ni
 * de las credenciales de ninguna entidad.
 */
import { describe, it, expect } from 'vitest';
import * as https from 'https';
import type { AddressInfo } from 'net';
// @ts-ignore - node-forge no tiene declaración de tipos en el proyecto
import * as forge from 'node-forge';
import {
  CertificadoInvalidoError,
  agenteTls,
  esMismoCertificado,
  leerCertificado,
  metadatosParaGuardar,
} from '../lib/hospitality/ses-hospedajes/certificado';
import {
  enviarComunicacion,
  transporteHttps,
  type PeticionHttp,
  type TransporteSes,
} from '../lib/hospitality/ses-hospedajes/connector';

const PASSWORD = 'clave-de-la-entidad';
const DIA = 24 * 60 * 60 * 1000;

interface OpcionesP12 {
  password?: string;
  cn?: string;
  nif?: string;
  desde?: Date;
  hasta?: Date;
  /** Incluye un certificado emisor en el .p12 (como hacen los de la FNMT). */
  cadena?: boolean;
  /** Tamaño de la clave. OpenSSL exige 2048 para un certificado de servidor. */
  bits?: number;
}

/** Un certificado autofirmado con sujeto propio, firmado con su propia clave. */
function crearCertificado(clave: any, cn: string, nif?: string, desde?: Date, hasta?: Date) {
  const certificado = forge.pki.createCertificate();
  certificado.publicKey = clave.publicKey;
  certificado.serialNumber = '01';
  certificado.validity.notBefore = desde ?? new Date(Date.now() - DIA);
  certificado.validity.notAfter = hasta ?? new Date(Date.now() + 365 * DIA);

  // `name` y no `shortName`: es la forma en que node-forge resuelve el OID del
  // atributo al construir el sujeto.
  const atributos: Array<{ name: string; value: string }> = [
    { name: 'commonName', value: cn },
    { name: 'organizationName', value: 'ENTIDAD DE PRUEBA SL' },
  ];
  if (nif) atributos.push({ name: 'serialNumber', value: nif });

  certificado.setSubject(atributos as never);
  certificado.setIssuer(certificado.subject.attributes);
  certificado.sign(clave.privateKey, forge.md.sha256.create());
  return certificado;
}

/** El .p12 en Base64, tal como lo sube la configuración. */
function crearP12(opciones: OpcionesP12 = {}) {
  const clave = forge.pki.rsa.generateKeyPair(opciones.bits ?? 1024);
  const hoja = crearCertificado(
    clave,
    opciones.cn ?? 'MARIA GARCIA LOPEZ',
    opciones.nif,
    opciones.desde,
    opciones.hasta
  );

  let certificados: unknown = hoja;
  if (opciones.cadena) {
    const claveEmisora = forge.pki.rsa.generateKeyPair(1024);
    const emisor = crearCertificado(claveEmisora, 'AC COMPONENTES INFORMATICOS');
    // El orden dentro del .p12 no está garantizado: se pone el emisor primero a
    // propósito, para comprobar que la hoja se elige por su clave y no por posición.
    certificados = [emisor, hoja];
  }

  const asn1 = forge.pkcs12.toPkcs12Asn1(clave.privateKey, certificados as never, opciones.password ?? PASSWORD, {
    algorithm: '3des',
    friendlyName: 'entidad',
  });
  return forge.util.encode64(forge.asn1.toDer(asn1).getBytes());
}

const P12 = crearP12({ nif: 'B12345678', cadena: true });
const P12_SIN_NIF_EN_CAMPO = crearP12({ cn: 'JUAN PEREZ (NIF 12345678Z)' });
const P12_CADUCADO = crearP12({ hasta: new Date('2024-03-31T00:00:00Z') });
// Con clave de 2048 bits, porque es lo que OpenSSL admite en un TLS real.
const P12_FUERTE = crearP12({ bits: 2048 });

describe('el certificado de la entidad se abre y dice de quién es', () => {
  it('saca el titular, el NIF y la vigencia del .p12', () => {
    const certificado = leerCertificado(P12, PASSWORD);

    expect(certificado.metadatos.titular).toBe('MARIA GARCIA LOPEZ');
    expect(certificado.metadatos.nif).toBe('B12345678');
    expect(certificado.metadatos.hasta.getTime()).toBeGreaterThan(Date.now());
    expect(certificado.metadatos.diasRestantes).toBeGreaterThan(0);
    expect(certificado.metadatos.caducado).toBe(false);
    expect(certificado.keyPem).toMatch(/BEGIN (RSA |ENCRYPTED )?PRIVATE KEY/);
  });

  it('saca la huella SHA-256 del certificado hoja, para poder compararlo con el original', () => {
    const certificado = leerCertificado(P12, PASSWORD);
    expect(certificado.metadatos.huella).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    // La huella es del certificado, no de la clave: dos lecturas dan lo mismo.
    expect(leerCertificado(P12, PASSWORD).metadatos.huella).toBe(certificado.metadatos.huella);
  });

  it('presenta la hoja primero y su cadena después, aunque el .p12 las traiga al revés', () => {
    const certificado = leerCertificado(P12, PASSWORD);

    expect(certificado.metadatos.cadena).toBe(2);
    expect(certificado.certPem.startsWith(certificado.certPemHoja)).toBe(true);
    expect(certificado.certPem.match(/BEGIN CERTIFICATE/g)).toHaveLength(2);
    // La hoja es la que casa con la clave privada, no la primera del fichero.
    expect(certificado.certPemHoja).not.toContain('AC COMPONENTES INFORMATICOS');
  });

  it('reconoce el NIF cuando el certificado solo lo lleva dentro del nombre', () => {
    const certificado = leerCertificado(P12_SIN_NIF_EN_CAMPO, PASSWORD);
    expect(certificado.metadatos.nif).toBe('12345678Z');
  });

  it('acepta el fichero tal como lo entrega la interfaz (Base64 con prefijo de datos y saltos de línea)', () => {
    const conPrefijo = `data:application/x-pkcs12;base64,${P12}`;
    expect(leerCertificado(conPrefijo, PASSWORD).metadatos.titular).toBe('MARIA GARCIA LOPEZ');

    const conSaltos = `data:application/x-pkcs12;base64,${P12.replace(/(.{60})/g, '$1\n')}`;
    expect(leerCertificado(conSaltos, PASSWORD).metadatos.titular).toBe('MARIA GARCIA LOPEZ');
  });

  it('guarda solo metadatos públicos: nunca el fichero ni su contraseña', () => {
    const guardado = metadatosParaGuardar(leerCertificado(P12, PASSWORD).metadatos);
    expect(Object.keys(guardado).sort()).toEqual(['emisor', 'huella', 'nif', 'titular', 'vence']);
    expect(JSON.stringify(guardado)).not.toContain(PASSWORD);
    expect(JSON.stringify(guardado)).not.toContain('PRIVATE KEY');
  });

  it('sabe si el certificado que se acaba de subir es el que ya estaba instalado', () => {
    const certificado = leerCertificado(P12, PASSWORD);
    expect(esMismoCertificado(certificado.metadatos.huella, certificado)).toBe(true);
    expect(esMismoCertificado(certificado.metadatos.huella.toLowerCase(), certificado)).toBe(true);
    expect(esMismoCertificado(null, certificado)).toBe(false);
    expect(esMismoCertificado('AA:BB', certificado)).toBe(false);
  });
});

describe('lo que se rechaza antes de guardarlo', () => {
  it('una contraseña equivocada se dice como tal, no como un error de formato', () => {
    try {
      leerCertificado(P12, 'no-es-la-contraseña');
      throw new Error('debería haber fallado');
    } catch (error) {
      expect(error).toBeInstanceOf(CertificadoInvalidoError);
      expect((error as CertificadoInvalidoError).causa).toBe('password');
      expect((error as Error).message).toMatch(/contraseña del certificado/i);
    }
  });

  it('un certificado con contraseña no se abre sin ella', () => {
    try {
      leerCertificado(P12, '');
      throw new Error('debería haber fallado');
    } catch (error) {
      expect((error as CertificadoInvalidoError).causa).toBe('password');
    }
  });

  it('lo que no es Base64 se rechaza como fichero', () => {
    try {
      leerCertificado('esto no es un fichero .p12!', PASSWORD);
      throw new Error('debería haber fallado');
    } catch (error) {
      expect((error as CertificadoInvalidoError).causa).toBe('archivo');
    }
  });

  it('un Base64 que no es un PKCS#12 se rechaza como formato', () => {
    try {
      leerCertificado(Buffer.from('no soy un p12, soy texto').toString('base64'), PASSWORD);
      throw new Error('debería haber fallado');
    } catch (error) {
      expect((error as CertificadoInvalidoError).causa).toBe('formato');
    }
  });

  it('un certificado caducado no se instala: el error dice cuándo caducó', () => {
    try {
      leerCertificado(P12_CADUCADO, PASSWORD);
      throw new Error('debería haber fallado');
    } catch (error) {
      expect(error).toBeInstanceOf(CertificadoInvalidoError);
      expect((error as CertificadoInvalidoError).causa).toBe('caducado');
      expect((error as Error).message).toMatch(/2024/);
      expect((error as Error).message).toMatch(/renueva el certificado/i);
    }
  });

  it('un certificado que todavía no está vigente tampoco', () => {
    const futuro = crearP12({ desde: new Date(Date.now() + 30 * DIA), hasta: new Date(Date.now() + 400 * DIA) });
    try {
      leerCertificado(futuro, PASSWORD);
      throw new Error('debería haber fallado');
    } catch (error) {
      expect((error as CertificadoInvalidoError).causa).toBe('no-vigente');
    }
  });

  it('un fichero sin clave privada no sirve para firmar la comunicación', () => {
    // Un .p12 con el certificado pero sin su clave: se construye a mano con ASN.1
    // del certificado solo, que es lo que se obtiene al exportar mal desde Windows.
    const hoja = crearCertificado(forge.pki.rsa.generateKeyPair(1024), 'SOLO CERTIFICADO');
    const asn1 = forge.pkcs12.toPkcs12Asn1(null as never, hoja as never, PASSWORD, { algorithm: '3des' });
    const base64 = forge.util.encode64(forge.asn1.toDer(asn1).getBytes());
    try {
      leerCertificado(base64, PASSWORD);
      throw new Error('debería haber fallado');
    } catch (error) {
      expect((error as CertificadoInvalidoError).causa).toBe('sin-clave');
    }
  });
});

describe('el certificado viaja de verdad por el TLS', () => {
  /**
   * Un servidor HTTPS que pide certificado de cliente y responde con el titular que
   * recibió. Es la única forma de comprobar que el TLS mutuo funciona de verdad:
   * pasar un agente al transporte no demuestra que el certificado llegue.
   */
  async function servidorQuePideCertificado() {
    const clave = forge.pki.rsa.generateKeyPair(2048);
    const certificado = crearCertificado(clave, 'LOCALHOST DE PRUEBA');
    const servidor = https.createServer(
      {
        key: forge.pki.privateKeyToPem(clave.privateKey),
        cert: forge.pki.certificateToPem(certificado),
        requestCert: true,
        rejectUnauthorized: false,
      },
      (peticion, respuesta) => {
        const cliente = (peticion.socket as { getPeerCertificate?: () => { subject?: unknown } }).getPeerCertificate?.();
        const titular = cliente?.subject ? JSON.stringify(cliente.subject) : null;
        respuesta.writeHead(200, { 'Content-Type': 'text/plain' });
        respuesta.end(titular ?? 'SIN-CERTIFICADO-DE-CLIENTE');
      }
    );
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
    return { servidor, puerto: (servidor.address() as AddressInfo).port };
  }

  it('el transporte entrega el certificado de la entidad al servidor', async () => {
    const { servidor, puerto } = await servidorQuePideCertificado();
    // El certificado del servidor de prueba es autofirmado; lo que se está
    // comprobando aquí es la mitad de cliente (que el certificado de la entidad
    // llegue), no la validación del servidor, que en producción hace la CA de la
    // FNMT que viaja en la imagen.
    const anterior = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
      const conCertificado = await transporteHttps({
        url: `https://127.0.0.1:${puerto}/comunicacion`,
        method: 'POST',
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
        body: '<soapenv:Envelope/>',
        agente: agenteTls(leerCertificado(P12_FUERTE, PASSWORD)),
        timeoutMs: 5_000,
      });
      expect(conCertificado.status).toBe(200);
      expect(await conCertificado.text()).toContain('MARIA GARCIA LOPEZ');

      const sinCertificado = await transporteHttps({
        url: `https://127.0.0.1:${puerto}/comunicacion`,
        method: 'POST',
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
        body: '<soapenv:Envelope/>',
        timeoutMs: 5_000,
      });
      expect(await sinCertificado.text()).toBe('SIN-CERTIFICADO-DE-CLIENTE');
    } finally {
      if (anterior === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = anterior;
      await new Promise<void>((resolve) => servidor.close(() => resolve()));
    }
  });

  it('el transporte informa del fallo de red en lugar de colgarse cuando no hay nada escuchando', async () => {
    await expect(
      transporteHttps({
        url: 'https://127.0.0.1:1/comunicacion',
        method: 'POST',
        headers: {},
        body: '<soapenv:Envelope/>',
        timeoutMs: 2_000,
      })
    ).rejects.toBeInstanceOf(Error);
  });
});

describe('el envío al Ministerio sale con el certificado presentado', () => {
  it('el agente TLS lleva la clave y el certificado de la entidad', () => {
    const certificado = leerCertificado(P12, PASSWORD);
    const agente = agenteTls(certificado);

    expect(agente).toBeInstanceOf(https.Agent);
    const opciones = (agente as unknown as { options: { key?: string; cert?: string } }).options;
    expect(String(opciones.key)).toContain('PRIVATE KEY');
    expect(String(opciones.cert)).toContain('BEGIN CERTIFICATE');
  });

  it('el sobre viaja con la cabecera Basic y con el certificado en el TLS', async () => {
    let visto: PeticionHttp | null = null;
    const transporte: TransporteSes = async (peticion) => {
      visto = peticion;
      return { ok: true, status: 200, text: async () => 'Comunicacion recibida correctamente' };
    };

    await enviarComunicacion({
      entorno: 'pruebas',
      credenciales: { usuario: 'entidad-1', password: 'secreta', certificado: P12, certificadoPassword: PASSWORD },
      peticionSobre: '<soapenv:Envelope/>',
      transporte,
    });

    expect(visto!.agente).toBeInstanceOf(https.Agent);
    expect(visto!.headers.Authorization).toMatch(/^Basic /);
  });

  it('un certificado caducado no llega a salir a la red: falla antes, con su causa', async () => {
    let llamado = false;
    const transporte: TransporteSes = async () => {
      llamado = true;
      return { ok: true, status: 200, text: async () => '' };
    };

    await expect(
      enviarComunicacion({
        entorno: 'pruebas',
        credenciales: {
          usuario: 'entidad-1',
          password: 'secreta',
          certificado: P12_CADUCADO,
          certificadoPassword: PASSWORD,
        },
        peticionSobre: '<soapenv:Envelope/>',
        transporte,
      })
    ).rejects.toBeInstanceOf(CertificadoInvalidoError);

    expect(llamado).toBe(false);
  });

  it('un certificado guardado que ya no se puede abrir se dice con su causa, no como caída de red', async () => {
    await expect(
      enviarComunicacion({
        entorno: 'pruebas',
        credenciales: {
          usuario: 'entidad-1',
          password: 'secreta',
          certificado: P12,
          certificadoPassword: 'contraseña-vieja',
        },
        peticionSobre: '<soapenv:Envelope/>',
        transporte: async () => ({ ok: true, status: 200, text: async () => '' }),
      })
    ).rejects.toMatchObject({ causa: 'password' });
  });
});
