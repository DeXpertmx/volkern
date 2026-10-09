import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encrypt, decrypt } from '@/lib/core/crypto';

/**
 * ID de socio (partner id) de conectividad POR TENANT.
 *
 * El proveedor emite un ID de socio al registrarse cada hotel: es la clave con
 * la que devuelve SUS propiedades. Estas comprobaciones fijan las dos reglas
 * que hacen que eso no rompa a nadie:
 *
 *  1. **El del hotel gana; el de plataforma es el respaldo.** Un hotel sin ID
 *     propio (o con el suyo desactivado) debe seguir funcionando exactamente
 *     como antes de existir esta columna.
 *  2. **No hay credenciales a medias.** Sin par Basic de plataforma no se llama
 *     a nadie, tenga el hotel su ID o no.
 */

const hoisted = vi.hoisted(() => ({
  providerFindUnique: vi.fn(),
  providerUpdate: vi.fn(),
  configFindUnique: vi.fn(),
  configUpsert: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    connectivityProvider: {
      findUnique: hoisted.providerFindUnique,
      update: hoisted.providerUpdate,
    },
    hospitalityConnectivityConfig: {
      findUnique: hoisted.configFindUnique,
      upsert: hoisted.configUpsert,
    },
  },
}));

import {
  CONNECTIVITY_PROVIDER_KEY,
  CONNECTIVITY_PROVIDER_NOMBRE,
  getConnectivityCredentials,
  getTenantConnectivityPublic,
  getTenantPartnerId,
  pushInventory,
  saveTenantPartnerId,
} from '@/lib/hospitality/connectivity';

const TENANT = 'tenant_hotel';
const SECRETO_PARTNER_PLATAFORMA = 'partner-de-plataforma';
const SECRETO_PARTNER_HOTEL = 'partner-del-hotel';
const SECRETO_USER = 'usuario-api';
const SECRETO_PASS = 'clave-super-secreta';

function filaPlataforma(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prov_1',
    providerKey: CONNECTIVITY_PROVIDER_KEY,
    nombreVisible: CONNECTIVITY_PROVIDER_NOMBRE,
    baseUrl: 'https://live.example.internal',
    partnerIdEnc: encrypt(SECRETO_PARTNER_PLATAFORMA),
    usernameEnc: encrypt(SECRETO_USER),
    passwordEnc: encrypt(SECRETO_PASS),
    estado: 'configurado',
    ultimaSincronizacion: null,
    ultimoEvento: null,
    ultimaVerificacion: null,
    contadorErrores: 0,
    configuracion: null,
    fechaCreacion: new Date(),
    fechaEdicion: new Date(),
    ...overrides,
  };
}

function filaDelHotel(partnerId: string, activo = true) {
  return { tenantId: TENANT, partnerIdEnc: encrypt(partnerId), activo };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CONNECTIVITY_BASE_URL = 'https://live.example.internal';
  hoisted.providerFindUnique.mockResolvedValue(filaPlataforma());
  hoisted.configFindUnique.mockResolvedValue(null);
  hoisted.configUpsert.mockResolvedValue({});
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
  vi.stubGlobal('fetch', fetchMock);
});

describe('getConnectivityCredentials — el ID del hotel gana, el de plataforma respalda', () => {
  it('sin ID propio usa el de plataforma (nadie que ya funcionaba se queda fuera)', async () => {
    const creds = await getConnectivityCredentials(TENANT);

    expect(creds).not.toBeNull();
    expect(creds!.partnerId).toBe(SECRETO_PARTNER_PLATAFORMA);
    expect(creds!.username).toBe(SECRETO_USER);
    expect(creds!.password).toBe(SECRETO_PASS);
  });

  it('con ID propio usa el suyo y mantiene el par Basic de plataforma', async () => {
    hoisted.configFindUnique.mockResolvedValue(filaDelHotel(SECRETO_PARTNER_HOTEL));

    const creds = await getConnectivityCredentials(TENANT);

    expect(creds!.partnerId).toBe(SECRETO_PARTNER_HOTEL);
    expect(creds!.username).toBe(SECRETO_USER);
    expect(creds!.password).toBe(SECRETO_PASS);
    // El par Basic NO es del hotel: aquí no hay credenciales propias de usuario.
    expect(JSON.stringify(creds)).not.toContain(SECRETO_PARTNER_PLATAFORMA);
  });

  it('un ID propio desactivado vuelve al de plataforma sin borrar el valor', async () => {
    hoisted.configFindUnique.mockResolvedValue(filaDelHotel(SECRETO_PARTNER_HOTEL, false));

    const creds = await getConnectivityCredentials(TENANT);
    expect(creds!.partnerId).toBe(SECRETO_PARTNER_PLATAFORMA);
  });

  it('sin ID propio ni de plataforma no hay credenciales (y no se inventa ninguna)', async () => {
    hoisted.providerFindUnique.mockResolvedValue(filaPlataforma({ partnerIdEnc: null }));

    expect(await getConnectivityCredentials(TENANT)).toBeNull();
  });

  it('sin par Basic de plataforma no se llama a nadie aunque el hotel tenga su ID', async () => {
    hoisted.providerFindUnique.mockResolvedValue(
      filaPlataforma({ usernameEnc: null, passwordEnc: null })
    );
    hoisted.configFindUnique.mockResolvedValue(filaDelHotel(SECRETO_PARTNER_HOTEL));

    expect(await getConnectivityCredentials(TENANT)).toBeNull();
  });

  it('sin tenant (llamadas de plataforma) usa siempre el ID de plataforma', async () => {
    const creds = await getConnectivityCredentials();

    expect(creds!.partnerId).toBe(SECRETO_PARTNER_PLATAFORMA);
    // Ni siquiera consulta la tabla por tenant: no hay tenant que consultar.
    expect(hoisted.configFindUnique).not.toHaveBeenCalled();
  });

  it('un valor guardado que no es un ID válido cae al de plataforma en vez de condenar al hotel', async () => {
    // `decrypt` devuelve el texto tal cual cuando no está en formato cifrado
    // (clave rotada, valor tocado a mano). Un valor así viajaría al proveedor y
    // volvería como 403 «partner desconocido»: mudo y para todos los hoteles del
    // cliente. El preflight de la capa lo descarta y se usa el de plataforma.
    hoisted.configFindUnique.mockResolvedValue({
      tenantId: TENANT,
      partnerIdEnc: 'esto no es un id valido',
      activo: true,
    });

    const creds = await getConnectivityCredentials(TENANT);
    expect(creds!.partnerId).toBe(SECRETO_PARTNER_PLATAFORMA);
  });
});

describe('getTenantPartnerId — lectura del ID propio', () => {
  it('devuelve null sin tenant, sin fila o con la fila desactivada', async () => {
    expect(await getTenantPartnerId(null)).toBeNull();
    expect(await getTenantPartnerId('   ')).toBeNull();

    hoisted.configFindUnique.mockResolvedValue(null);
    expect(await getTenantPartnerId(TENANT)).toBeNull();

    hoisted.configFindUnique.mockResolvedValue(filaDelHotel(SECRETO_PARTNER_HOTEL, false));
    expect(await getTenantPartnerId(TENANT)).toBeNull();
  });

  it('devuelve el valor descifrado cuando existe', async () => {
    hoisted.configFindUnique.mockResolvedValue(filaDelHotel(SECRETO_PARTNER_HOTEL));
    expect(await getTenantPartnerId(TENANT)).toBe(SECRETO_PARTNER_HOTEL);
  });
});

describe('saveTenantPartnerId — validación y cifrado', () => {
  it('rechaza un ID de socio con un espacio en medio (sería un 403 «desconocido»)', async () => {
    const res = await saveTenantPartnerId(TENANT, 'partner del hotel');

    expect(res.ok).toBe(false);
    expect(res.avisos?.some((a) => a.campo === 'partnerId' && a.gravedad === 'error')).toBe(true);
    expect(hoisted.configUpsert).not.toHaveBeenCalled();
  });

  it('guarda el valor recortado y CIFRADO, nunca en claro', async () => {
    const res = await saveTenantPartnerId(TENANT, `  ${SECRETO_PARTNER_HOTEL}  `);

    expect(res.ok).toBe(true);
    const guardado = hoisted.configUpsert.mock.calls[0][0] as { create: { partnerIdEnc: string } };
    expect(guardado.create.partnerIdEnc).not.toContain(SECRETO_PARTNER_HOTEL);
    expect(decrypt(guardado.create.partnerIdEnc)).toBe(SECRETO_PARTNER_HOTEL);
  });

  it('borrar (null o vacío) deja la fila sin valor: vuelve al de plataforma', async () => {
    await saveTenantPartnerId(TENANT, null);
    expect(hoisted.configUpsert.mock.calls[0][0]).toMatchObject({
      create: { tenantId: TENANT, partnerIdEnc: null },
      update: { partnerIdEnc: null },
    });

    vi.clearAllMocks();
    await saveTenantPartnerId(TENANT, '   ');
    expect(hoisted.configUpsert.mock.calls[0][0]).toMatchObject({
      update: { partnerIdEnc: null },
    });
  });

  it('sin tenant no escribe nada', async () => {
    const res = await saveTenantPartnerId('  ', SECRETO_PARTNER_HOTEL);
    expect(res.ok).toBe(false);
    expect(hoisted.configUpsert).not.toHaveBeenCalled();
  });
});

describe('pushInventory — empuja con el ID del hotel', () => {
  it('la URL del push lleva el ID de socio del tenant, no el de plataforma', async () => {
    hoisted.configFindUnique.mockResolvedValue(filaDelHotel(SECRETO_PARTNER_HOTEL));

    const res = await pushInventory(
      'HOTEL-1',
      [{ startDate: '2026-10-10', endDate: '2026-10-11', rooms: [{ roomCode: 'DOBLE', available: 2 }] }],
      TENANT
    );

    expect(res.ok).toBe(true);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain(`/update/${SECRETO_PARTNER_HOTEL}`);
    expect(url).not.toContain(SECRETO_PARTNER_PLATAFORMA);
  });
});

describe('getTenantConnectivityPublic — estado sin secretos', () => {
  it('no filtra el valor y distingue «falta el de la plataforma» de «falta el tuyo»', async () => {
    hoisted.configFindUnique.mockResolvedValue(null);
    const sinPropio = await getTenantConnectivityPublic(TENANT);

    expect(sinPropio.plataformaConfigurada).toBe(true);
    expect(sinPropio.tienePartnerIdPropio).toBe(false);
    expect(sinPropio.partnerId).toBe('');
    // Con el de plataforma hay con qué operar: no falta nada.
    expect(sinPropio.completo).toBe(true);

    hoisted.configFindUnique.mockResolvedValue(filaDelHotel(SECRETO_PARTNER_HOTEL));
    const conPropio = await getTenantConnectivityPublic(TENANT);

    expect(conPropio.tienePartnerIdPropio).toBe(true);
    expect(conPropio.partnerId).toBe('••••••');
    expect(JSON.stringify(conPropio)).not.toContain(SECRETO_PARTNER_HOTEL);
    expect(JSON.stringify(conPropio)).not.toContain(SECRETO_PARTNER_PLATAFORMA);
  });

  it('sin el par Basic de plataforma avisa aunque el hotel tenga su ID', async () => {
    hoisted.providerFindUnique.mockResolvedValue(
      filaPlataforma({ partnerIdEnc: null, usernameEnc: null, passwordEnc: null })
    );
    hoisted.configFindUnique.mockResolvedValue(filaDelHotel(SECRETO_PARTNER_HOTEL));

    const estado = await getTenantConnectivityPublic(TENANT);
    expect(estado.plataformaConfigurada).toBe(false);
    expect(estado.completo).toBe(false);
  });
});
