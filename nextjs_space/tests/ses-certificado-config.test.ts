/**
 * Guardia del certificado de la entidad en la configuración del registro de viajeros.
 *
 * Lo que se fija aquí es cómo se guarda y cómo sale el certificado, que es donde
 * una fuga es cara: el `.p12` de la entidad lleva su clave privada. Por eso estas
 * pruebas comprueban tres cosas y ninguna es cosmética:
 *
 *   1. lo que llega a la base de datos está cifrado y lo que se enseña son solo
 *      metadatos públicos;
 *   2. un certificado que no se puede abrir (contraseña equivocada) no se guarda;
 *   3. la prueba de conexión y el envío salen CON el certificado presentado, y
 *      cuando el guardado ya no sirve lo dicen antes de salir a la red.
 *
 * El `.p12` se genera en la propia prueba, así que no depende de las credenciales
 * reales de ninguna entidad.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as https from 'https';
// @ts-ignore - node-forge no tiene declaración de tipos en el proyecto
import * as forge from 'node-forge';

const { prisma, logAuditAction } = vi.hoisted(() => ({
  prisma: {
    hospitalityComplianceConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
  logAuditAction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma }));
vi.mock('@/lib/permissions', () => ({ logAuditAction }));

import { encrypt, decrypt } from '../lib/core/crypto';
import { CertificadoInvalidoError } from '../lib/hospitality/ses-hospedajes/certificado';
import {
  borrarCredenciales,
  credencialesDeTenant,
  guardarConfig,
  leerConfig,
  probarServicioDelMinisterio,
} from '../lib/hospitality/compliance-store';
import type { PeticionHttp } from '../lib/hospitality/ses-hospedajes/connector';

const TENANT = 'tenant-demo';
const PASSWORD = 'clave-de-la-entidad';

/** Un .p12 de verdad, generado aquí (clave nueva, certificado autofirmado). */
function crearP12(opciones: { password?: string; hasta?: Date } = {}) {
  const clave = forge.pki.rsa.generateKeyPair(1024);
  const certificado = forge.pki.createCertificate();
  certificado.publicKey = clave.publicKey;
  certificado.serialNumber = '01';
  certificado.validity.notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  certificado.validity.notAfter = opciones.hasta ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  certificado.setSubject([
    { name: 'commonName', value: 'MARIA GARCIA LOPEZ' },
    { name: 'serialNumber', value: 'B12345678' },
  ] as never);
  certificado.setIssuer(certificado.subject.attributes);
  certificado.sign(clave.privateKey, forge.md.sha256.create());

  const asn1 = forge.pkcs12.toPkcs12Asn1(
    clave.privateKey,
    certificado as never,
    opciones.password ?? PASSWORD,
    { algorithm: '3des' }
  );
  return forge.util.encode64(forge.asn1.toDer(asn1).getBytes());
}

const P12 = crearP12();
const P12_CADUCADO = crearP12({ hasta: new Date('2024-06-30T00:00:00Z') });

/** La fila de configuración tal como la devuelve la base de datos. */
function fila(extra: Record<string, unknown> = {}) {
  return {
    id: 'cfg-1',
    tenantId: TENANT,
    activo: true,
    entorno: 'pruebas',
    entidadNombre: 'ENTIDAD DE PRUEBA SL',
    entidadNif: 'B12345678',
    codigoArrendador: '0000000141',
    usuarioEnc: null,
    passwordEnc: null,
    certificadoEnc: null,
    certificadoPasswordEnc: null,
    certificadoTitular: null,
    certificadoNif: null,
    certificadoEmisor: null,
    certificadoHuella: null,
    certificadoVence: null,
    estadoConexion: 'sin_configurar',
    ultimoEnvio: null,
    ultimoCodigo: null,
    ultimoError: null,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // La auditoría se espera con `.catch`: el mock tiene que devolver una promesa.
  logAuditAction.mockResolvedValue(undefined);
  // El upsert devuelve lo que se le pide guardar, como haría Prisma: así el valor
  // que sale hacia la interfaz es el que de verdad se escribió.
  prisma.hospitalityComplianceConfig.upsert.mockImplementation(async ({ create }: { create: object }) =>
    fila(create)
  );
  prisma.hospitalityComplianceConfig.update.mockImplementation(async ({ data }: { data: object }) =>
    fila(data)
  );
});

describe('el certificado se guarda cifrado y solo sus metadatos salen a la interfaz', () => {
  it('guarda el .p12 y su contraseña cifrados, y los datos públicos en claro', async () => {
    prisma.hospitalityComplianceConfig.findUnique.mockResolvedValue(null);

    await guardarConfig(
      TENANT,
      { activo: true, certificado: P12, certificadoPassword: PASSWORD },
      'usuario-1'
    );

    const { create } = prisma.hospitalityComplianceConfig.upsert.mock.calls[0][0] as {
      create: Record<string, string>;
    };

    expect(create.certificadoEnc).toBeTruthy();
    expect(create.certificadoEnc).not.toBe(P12);
    expect(decrypt(create.certificadoEnc)).toBe(P12);
    expect(create.certificadoPasswordEnc).not.toBe(PASSWORD);
    expect(decrypt(create.certificadoPasswordEnc)).toBe(PASSWORD);
    expect(create.certificadoTitular).toBe('MARIA GARCIA LOPEZ');
    expect(create.certificadoNif).toBe('B12345678');
    expect(create.certificadoHuella).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    // Ni la contraseña ni la clave privada acaban en ninguna columna.
    expect(JSON.stringify(create)).not.toContain(PASSWORD);
    expect(JSON.stringify(create)).not.toContain('PRIVATE KEY');
  });

  it('la configuración que se devuelve no lleva el fichero ni la contraseña, solo de quién es', async () => {
    prisma.hospitalityComplianceConfig.findUnique.mockResolvedValue(null);

    const config = await guardarConfig(
      TENANT,
      { activo: true, certificado: P12, certificadoPassword: PASSWORD },
      'usuario-1'
    );

    const serializado = JSON.stringify(config);
    expect(serializado).not.toContain(P12);
    expect(serializado).not.toContain(PASSWORD);
    expect(serializado).not.toContain('certificadoEnc');
    expect(config.tieneCertificado).toBe(true);
    expect(config.tieneCertificadoPassword).toBe(true);
    expect(config.certificado?.titular).toBe('MARIA GARCIA LOPEZ');
    expect(config.certificado?.caducado).toBe(false);
  });

  it('la auditoría deja constancia del certificado instalado, sin el fichero ni la contraseña', async () => {
    prisma.hospitalityComplianceConfig.findUnique.mockResolvedValue(null);

    await guardarConfig(TENANT, { certificado: P12, certificadoPassword: PASSWORD }, 'usuario-1');

    const detalle = logAuditAction.mock.calls[0][5] as string;
    expect(detalle).toMatch(/certificado de la entidad instalado/i);
    expect(detalle).not.toContain(PASSWORD);
    expect(detalle).not.toContain(P12.slice(0, 40));
  });
});

describe('un certificado que no se puede abrir no se guarda', () => {
  it('con la contraseña equivocada no se escribe nada en la base', async () => {
    prisma.hospitalityComplianceConfig.findUnique.mockResolvedValue(null);

    await expect(
      guardarConfig(TENANT, { certificado: P12, certificadoPassword: 'no-es-la-contraseña' }, 'usuario-1')
    ).rejects.toBeInstanceOf(CertificadoInvalidoError);

    expect(prisma.hospitalityComplianceConfig.upsert).not.toHaveBeenCalled();
  });

  it('un certificado caducado tampoco se instala', async () => {
    prisma.hospitalityComplianceConfig.findUnique.mockResolvedValue(null);

    await expect(
      guardarConfig(TENANT, { certificado: P12_CADUCADO, certificadoPassword: PASSWORD }, 'usuario-1')
    ).rejects.toMatchObject({ causa: 'caducado' });

    expect(prisma.hospitalityComplianceConfig.upsert).not.toHaveBeenCalled();
  });

  it('cambiar solo la contraseña revalida el certificado que ya estaba guardado, sin volver a subirlo', async () => {
    prisma.hospitalityComplianceConfig.findUnique.mockResolvedValue(
      fila({ certificadoEnc: encrypt(P12), certificadoPasswordEnc: encrypt('vieja') })
    );

    await guardarConfig(TENANT, { certificadoPassword: PASSWORD }, 'usuario-1');

    const { update } = prisma.hospitalityComplianceConfig.upsert.mock.calls[0][0] as {
      update: Record<string, string>;
    };
    expect(decrypt(update.certificadoPasswordEnc)).toBe(PASSWORD);
    expect(update.certificadoEnc).toBeUndefined();
    expect(update.certificadoTitular).toBe('MARIA GARCIA LOPEZ');
  });

  it('si la contraseña nueva tampoco abre el certificado guardado, no se acepta', async () => {
    prisma.hospitalityComplianceConfig.findUnique.mockResolvedValue(
      fila({ certificadoEnc: encrypt(P12), certificadoPasswordEnc: encrypt(PASSWORD) })
    );

    await expect(
      guardarConfig(TENANT, { certificadoPassword: 'otra-cosa' }, 'usuario-1')
    ).rejects.toBeInstanceOf(CertificadoInvalidoError);

    expect(prisma.hospitalityComplianceConfig.upsert).not.toHaveBeenCalled();
  });
});

describe('el certificado instalado se usa en la comunicación', () => {
  it('el conector recibe el .p12 descifrado y su contraseña', async () => {
    prisma.hospitalityComplianceConfig.findUnique.mockResolvedValue(
      fila({
        usuarioEnc: encrypt('entidad-1'),
        passwordEnc: encrypt('secreta'),
        certificadoEnc: encrypt(P12),
        certificadoPasswordEnc: encrypt(PASSWORD),
      })
    );

    const credenciales = await credencialesDeTenant(TENANT);

    expect(credenciales).toEqual({
      usuario: 'entidad-1',
      password: 'secreta',
      certificado: P12,
      certificadoPassword: PASSWORD,
    });
  });

  it('la prueba de conexión presenta el certificado de la entidad', async () => {
    prisma.hospitalityComplianceConfig.findUnique.mockResolvedValue(
      fila({ certificadoEnc: encrypt(P12), certificadoPasswordEnc: encrypt(PASSWORD) })
    );

    let visto: PeticionHttp | null = null;
    const alcance = await probarServicioDelMinisterio(TENANT, 'pruebas', async (peticion) => {
      visto = peticion;
      return { ok: false, status: 401, text: async () => '' };
    });

    expect(alcance.alcanzable).toBe(true);
    expect(alcance.certificadoPresentado).toBe(true);
    expect(visto!.agente).toBeInstanceOf(https.Agent);
  });

  it('un certificado guardado que ya caducó se dice antes de salir a la red', async () => {
    prisma.hospitalityComplianceConfig.findUnique.mockResolvedValue(
      fila({ certificadoEnc: encrypt(P12_CADUCADO), certificadoPasswordEnc: encrypt(PASSWORD) })
    );

    let salio = false;
    const alcance = await probarServicioDelMinisterio(TENANT, 'pruebas', async () => {
      salio = true;
      return { ok: true, status: 200, text: async () => '' };
    });

    expect(alcance.alcanzable).toBe(false);
    expect(alcance.certificadoError).toMatch(/caducó|2024/);
    expect(salio).toBe(false);
  });
});

describe('lo que la configuración enseña del certificado guardado', () => {
  it('marca como caducado el que ya venció, para que la sección lo avise', async () => {
    prisma.hospitalityComplianceConfig.findUnique.mockResolvedValue(
      fila({
        certificadoEnc: encrypt(P12_CADUCADO),
        certificadoTitular: 'MARIA GARCIA LOPEZ',
        certificadoVence: new Date('2024-06-30T00:00:00Z'),
      })
    );

    const config = await leerConfig(TENANT);

    expect(config?.certificado?.caducado).toBe(true);
    expect(JSON.stringify(config)).not.toContain('certificadoEnc');
  });

  it('retirar las credenciales retira también el certificado y sus metadatos', async () => {
    prisma.hospitalityComplianceConfig.findUnique.mockResolvedValue(
      fila({ certificadoEnc: encrypt(P12), certificadoTitular: 'MARIA GARCIA LOPEZ' })
    );

    await borrarCredenciales(TENANT, 'usuario-1');

    const { data } = prisma.hospitalityComplianceConfig.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.certificadoEnc).toBeNull();
    expect(data.certificadoPasswordEnc).toBeNull();
    expect(data.certificadoTitular).toBeNull();
    expect(data.certificadoNif).toBeNull();
    expect(data.certificadoEmisor).toBeNull();
    expect(data.certificadoHuella).toBeNull();
    expect(data.certificadoVence).toBeNull();
  });
});
