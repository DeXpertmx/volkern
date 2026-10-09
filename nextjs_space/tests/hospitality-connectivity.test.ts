import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encrypt, decrypt } from '@/lib/core/crypto';

// Mocks hoisted para poder usarlos en los módulos mockeados
const hoisted = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  syncLogFindFirst: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    connectivityProvider: {
      findUnique: hoisted.findUnique,
      upsert: hoisted.upsert,
      update: hoisted.update,
    },
    hospitalitySyncLog: {
      findFirst: hoisted.syncLogFindFirst,
    },
  },
}));

import {
  getConnectivityPublic,
  getConnectivityCredentials,
  getConnectivityBasicAuth,
  partnerIdEsDeCadaHotel,
  saveConnectivityConfig,
  CONNECTIVITY_PROVIDER_KEY,
  CONNECTIVITY_PROVIDER_NOMBRE,
} from '@/lib/hospitality/connectivity';

const SECRETO_PARTNER = 'partner-real-123';
const SECRETO_USER = 'usuario-api';
const SECRETO_PASS = 'clave-super-secreta';

function filaConfigurada() {
  return {
    id: 'prov_1',
    providerKey: CONNECTIVITY_PROVIDER_KEY,
    nombreVisible: CONNECTIVITY_PROVIDER_NOMBRE,
    baseUrl: 'https://live.example.internal',
    partnerIdEnc: encrypt(SECRETO_PARTNER),
    usernameEnc: encrypt(SECRETO_USER),
    passwordEnc: encrypt(SECRETO_PASS),
    estado: 'configurado',
    ultimaSincronizacion: null,
    ultimoEvento: null,
    contadorErrores: 2,
    configuracion: null,
    fechaCreacion: new Date(),
    fechaEdicion: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CONNECTIVITY_BASE_URL = 'https://live.example.internal';
  hoisted.syncLogFindFirst.mockResolvedValue(null);
});

describe('Hospitality — capa de conectividad', () => {
  it('el nombre visible es neutro y no revela el proveedor externo', () => {
    expect(CONNECTIVITY_PROVIDER_NOMBRE).toBe('Conectividad de Canales');
    expect(CONNECTIVITY_PROVIDER_NOMBRE.toLowerCase()).not.toContain('aiosell');
    expect(CONNECTIVITY_PROVIDER_KEY.toLowerCase()).not.toContain('aiosell');
  });

  it('getConnectivityPublic nunca expone secretos ni la URL del servicio', async () => {
    hoisted.findUnique.mockResolvedValue(filaConfigurada());

    const pub = await getConnectivityPublic();

    expect(pub.configurado).toBe(true);
    expect(pub.tieneCredenciales).toBe(true);
    expect(pub.partnerId).toBe('••••••');
    expect(pub.username).toBe('••••••');
    // Nunca el valor real
    expect(JSON.stringify(pub)).not.toContain(SECRETO_PARTNER);
    expect(JSON.stringify(pub)).not.toContain(SECRETO_USER);
    expect(JSON.stringify(pub)).not.toContain(SECRETO_PASS);
    // Nunca la URL base del servicio (revelaría el proveedor)
    expect(JSON.stringify(pub)).not.toContain('live.example.internal');
  });

  it('getConnectivityPublic devuelve sin_configurar cuando no existe fila', async () => {
    hoisted.findUnique.mockResolvedValue(null);

    const pub = await getConnectivityPublic();
    expect(pub.configurado).toBe(false);
    expect(pub.estado).toBe('sin_configurar');
    expect(pub.tieneCredenciales).toBe(false);
    expect(pub.ultimaVerificacion).toBeNull();
    // Sin configuración no hay diagnóstico: ni siquiera consulta el historial.
    expect(hoisted.syncLogFindFirst).not.toHaveBeenCalled();
  });

  it('getConnectivityPublic expone la marca de última verificación (health-check / Probar)', async () => {
    const marca = new Date('2026-09-20T05:00:00Z');
    hoisted.findUnique.mockResolvedValue({ ...filaConfigurada(), ultimaVerificacion: marca });

    const pub = await getConnectivityPublic();
    expect(pub.ultimaVerificacion).toEqual(marca);
  });

  it('getConnectivityPublic tolera filas sin marca de verificación (null, no undefined)', async () => {
    hoisted.findUnique.mockResolvedValue(filaConfigurada());

    const pub = await getConnectivityPublic();
    expect(pub.ultimaVerificacion).toBeNull();
  });

  describe('getConnectivityPublic — último fallo para el diagnóstico del panel', () => {
    it('consulta el último SyncLog fallido filtrando por tipos de la capa y lo expone', async () => {
      hoisted.findUnique.mockResolvedValue(filaConfigurada());
      const fallo = {
        httpStatus: 401,
        errorMensaje: 'HTTP 401 del proveedor',
        fechaCreacion: new Date('2026-09-19T09:00:00Z'),
      };
      hoisted.syncLogFindFirst.mockResolvedValue(fallo);

      const pub = await getConnectivityPublic();

      expect(pub.ultimoFallo).toEqual(fallo);
      // El filtro es el del módulo de causas: solo tráfico de conectividad,
      // solo errores, el más reciente primero.
      const args = hoisted.syncLogFindFirst.mock.calls[0][0];
      expect(args.where.estado).toBe('error');
      expect(args.where.tipo.in).toContain('inventory');
      expect(args.where.tipo.in).toContain('reconciliacion');
      expect(args.orderBy).toEqual({ fechaCreacion: 'desc' });
      // Solo campos de diagnóstico — nunca payloads.
      expect(Object.keys(args.select).sort()).toEqual(['errorMensaje', 'fechaCreacion', 'httpStatus']);
    });

    it('sin fallos previos → ultimoFallo null (el badge no inventa causas)', async () => {
      hoisted.findUnique.mockResolvedValue(filaConfigurada());
      hoisted.syncLogFindFirst.mockResolvedValue(null);

      const pub = await getConnectivityPublic();
      expect(pub.ultimoFallo).toBeNull();
    });

    it('si la consulta de diagnóstico falla, degrada a null sin romper el estado', async () => {
      hoisted.findUnique.mockResolvedValue(filaConfigurada());
      hoisted.syncLogFindFirst.mockRejectedValue(new Error('BD caída'));

      const pub = await getConnectivityPublic();
      expect(pub.configurado).toBe(true);
      expect(pub.ultimoFallo).toBeNull();
    });

    it('el diagnóstico nunca añade secretos a la respuesta pública', async () => {
      hoisted.findUnique.mockResolvedValue(filaConfigurada());
      hoisted.syncLogFindFirst.mockResolvedValue({
        httpStatus: 401,
        errorMensaje: `rechazado para ${SECRETO_USER}`,
        fechaCreacion: new Date(),
      });

      const pub = await getConnectivityPublic();
      // El mensaje de error del proveedor puede citar el usuario — la capa
      // pública no lo devuelve en crudo: solo select acotado (httpStatus,
      // errorMensaje y fecha sin secretos estructurales). El secreto del
      // proveedor jamás aparece porque no se lee de esta tabla.
      expect(JSON.stringify(pub)).not.toContain(SECRETO_PARTNER);
      expect(JSON.stringify(pub)).not.toContain(SECRETO_PASS);
    });
  });

  it('getConnectivityCredentials descifra los secretos correctamente', async () => {
    hoisted.findUnique.mockResolvedValue(filaConfigurada());

    const creds = await getConnectivityCredentials();
    expect(creds).toEqual({
      partnerId: SECRETO_PARTNER,
      username: SECRETO_USER,
      password: SECRETO_PASS,
    });
  });

  it('getConnectivityCredentials devuelve null si faltan secretos', async () => {
    hoisted.findUnique.mockResolvedValue({
      ...filaConfigurada(),
      partnerIdEnc: null,
    });
    expect(await getConnectivityCredentials()).toBeNull();
  });

  it('saveConnectivityConfig cifra los secretos antes de persistir', async () => {
    const filaGuardada = {
      id: 'prov_1',
      providerKey: CONNECTIVITY_PROVIDER_KEY,
      nombreVisible: CONNECTIVITY_PROVIDER_NOMBRE,
      baseUrl: 'https://live.example.internal',
      partnerIdEnc: encrypt(SECRETO_PARTNER),
      usernameEnc: encrypt(SECRETO_USER),
      passwordEnc: encrypt(SECRETO_PASS),
      estado: 'configurado',
    };
    hoisted.findUnique.mockResolvedValue(null);
    hoisted.upsert.mockResolvedValue(filaGuardada);

    const result = await saveConnectivityConfig({
      partnerId: SECRETO_PARTNER,
      username: SECRETO_USER,
      password: SECRETO_PASS,
    });

    expect(result.ok).toBe(true);
    expect(result.configurado).toBe(true);

    // La llamada a upsert recibe valores CIFRADOS, nunca en claro
    const createData = hoisted.upsert.mock.calls[0][0].create;
    expect(createData.partnerIdEnc).not.toBe(SECRETO_PARTNER);
    expect(createData.usernameEnc).not.toBe(SECRETO_USER);
    expect(createData.passwordEnc).not.toBe(SECRETO_PASS);
    expect(JSON.stringify(createData)).not.toContain(SECRETO_PASS);
    // Y descifran al valor original
    expect(decrypt(createData.partnerIdEnc)).toBe(SECRETO_PARTNER);
  });

  it('saveConnectivityConfig ignora campos vacíos (no borra lo existente)', async () => {
    const existing = filaConfigurada();
    hoisted.findUnique.mockResolvedValue(existing);
    hoisted.upsert.mockResolvedValue(existing);

    await saveConnectivityConfig({ partnerId: '', username: '' });

    // update no debe contener claves de credenciales vacías
    const updateData = hoisted.upsert.mock.calls[0][0].update;
    expect(updateData.partnerIdEnc).toBeUndefined();
    expect(updateData.usernameEnc).toBeUndefined();
    expect(updateData.passwordEnc).toBeUndefined();
  });

  it('saveConnectivityConfig acepta guardar SOLO el par Basic (sin ID de socio)', async () => {
    const filaParBasic = {
      id: 'prov_1',
      providerKey: CONNECTIVITY_PROVIDER_KEY,
      nombreVisible: CONNECTIVITY_PROVIDER_NOMBRE,
      baseUrl: 'https://live.example.internal',
      partnerIdEnc: null,
      usernameEnc: encrypt(SECRETO_USER),
      passwordEnc: encrypt(SECRETO_PASS),
      estado: 'sin_configurar',
    };
    hoisted.findUnique.mockResolvedValue(null);
    hoisted.upsert.mockResolvedValue(filaParBasic);

    const result = await saveConnectivityConfig({
      partnerId: undefined,
      username: SECRETO_USER,
      password: SECRETO_PASS,
    });

    expect(result.ok).toBe(true);
    // Guardado parcial: el par queda almacenado pero NO está «configurado»
    // (falta el ID de socio para poder llamar al servicio).
    expect(result.configurado).toBe(false);

    const createData = hoisted.upsert.mock.calls[0][0].create;
    expect(createData.partnerIdEnc).toBeUndefined();
    expect(decrypt(createData.usernameEnc)).toBe(SECRETO_USER);
    expect(decrypt(createData.passwordEnc)).toBe(SECRETO_PASS);
  });

  it('getConnectivityPublic: par Basic sin partner → tieneCredenciales true, completo false', async () => {
    hoisted.findUnique.mockResolvedValue({
      ...filaConfigurada(),
      partnerIdEnc: null,
    });

    const pub = await getConnectivityPublic();

    // Hay ALGO guardado: el panel debe mostrar el botón de reset y los
    // placeholders de «dejar vacío para mantener».
    expect(pub.tieneCredenciales).toBe(true);
    // Pero no está completo: no se puede llamar aún al servicio.
    expect(pub.completo).toBe(false);
    // «configurado» solo refleja que hay fila de proveedor; el rigor de
    // «los tres secretos» lo aporta «completo».
    expect(pub.configurado).toBe(true);
  });
});

/**
 * El ID de socio es de cada hotel; el par Basic, de plataforma. Son dos puertas
 * distintas y cada una exige lo suyo:
 *   • Saliente (push, fetch, sonda) → par Basic + ID de socio.
 *   • Entrante (webhook) → solo par Basic; el ID de socio no participa.
 * Confundirlas dejaba el webhook en 503 en cuanto la plataforma no tenía ID de
 * socio propio, que es el estado correcto cuando lo tiene cada hotel.
 */
describe('getConnectivityBasicAuth — el par Basic sin exigir ID de socio', () => {
  it('devuelve el par AUNQUE la plataforma no tenga ID de socio', async () => {
    hoisted.findUnique.mockResolvedValue({ ...filaConfigurada(), partnerIdEnc: null });

    expect(await getConnectivityBasicAuth()).toEqual({
      username: SECRETO_USER,
      password: SECRETO_PASS,
    });
    // La puerta SALIENTE sigue exigiéndolo: sin ID de socio no se puede llamar.
    expect(await getConnectivityCredentials()).toBeNull();
  });

  it('devuelve el par DESCIFRADO, nunca lo cifrado', async () => {
    const fila = filaConfigurada();
    hoisted.findUnique.mockResolvedValue(fila);

    const par = await getConnectivityBasicAuth();

    expect(par?.password).toBe(SECRETO_PASS);
    expect(par?.password).not.toBe(fila.passwordEnc);
  });

  it('sin par guardado (o sin fila) devuelve null: no hay nada que comparar', async () => {
    hoisted.findUnique.mockResolvedValue({ ...filaConfigurada(), usernameEnc: null });
    expect(await getConnectivityBasicAuth()).toBeNull();

    hoisted.findUnique.mockResolvedValue({ ...filaConfigurada(), passwordEnc: null });
    expect(await getConnectivityBasicAuth()).toBeNull();

    hoisted.findUnique.mockResolvedValue(null);
    expect(await getConnectivityBasicAuth()).toBeNull();
  });
});

describe('partnerIdEsDeCadaHotel — cuándo la sonda de plataforma no aplica', () => {
  it('par Basic sin ID de socio de plataforma → true (es de cada hotel)', () => {
    expect(
      partnerIdEsDeCadaHotel({ partnerIdEnc: null, usernameEnc: 'x', passwordEnc: 'x' })
    ).toBe(true);
  });

  it('con ID de socio de plataforma → false (la sonda de plataforma sí aplica)', () => {
    expect(
      partnerIdEsDeCadaHotel({ partnerIdEnc: 'x', usernameEnc: 'x', passwordEnc: 'x' })
    ).toBe(false);
  });

  it('sin par Basic → false: eso es «sin configurar», no «ID de cada hotel»', async () => {
    // Distinguirlos importa: sin nada guardado el panel debe seguir diciendo que
    // falta configurar, no que el ID es de cada hotel.
    expect(partnerIdEsDeCadaHotel({ partnerIdEnc: null, usernameEnc: null, passwordEnc: null })).toBe(
      false
    );
    expect(partnerIdEsDeCadaHotel({ partnerIdEnc: null, usernameEnc: 'x', passwordEnc: null })).toBe(
      false
    );
  });

  it('sin fila de proveedor → false (nada configurado)', () => {
    expect(partnerIdEsDeCadaHotel(null)).toBe(false);
    expect(partnerIdEsDeCadaHotel(undefined)).toBe(false);
  });

  it('es coherente con las dos puertas: exactamente el estado «par sin ID»', async () => {
    // Coherencia real contra la base (no solo con literales): con la fila que
    // tiene par Basic y sin ID de socio, la lectura pública dice «tiene
    // credenciales pero no completo» y la regla dice «es de cada hotel».
    const fila = { ...filaConfigurada(), partnerIdEnc: null };
    hoisted.findUnique.mockResolvedValue(fila);

    const pub = await getConnectivityPublic();

    expect(partnerIdEsDeCadaHotel(fila)).toBe(true);
    expect(pub.tieneCredenciales).toBe(true);
    expect(pub.completo).toBe(false);
  });
});