import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encrypt, decrypt } from '@/lib/core/crypto';

// Mocks hoisted para poder usarlos en los módulos mockeados
const hoisted = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    connectivityProvider: {
      findUnique: hoisted.findUnique,
      upsert: hoisted.upsert,
      update: hoisted.update,
    },
  },
}));

import {
  getConnectivityPublic,
  getConnectivityCredentials,
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
});