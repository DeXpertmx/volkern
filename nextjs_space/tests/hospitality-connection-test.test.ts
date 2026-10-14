import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  findUnique: vi.fn(),
  globalFetch: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    connectivityProvider: {
      findUnique: hoisted.findUnique,
    },
  },
}));

import { encrypt } from '@/lib/core/crypto';

import {
  testConnectivityConnection,
  getConnectivityBaseUrl,
  pushInventory,
  pushRates,
  CONNECTIVITY_API_PREFIX,
  CONNECTIVITY_SANDBOX_HOTEL,
} from '@/lib/hospitality/connectivity';

const creds = {
  partnerIdEnc: encrypt('partner-demo'),
  usernameEnc: encrypt('user-api'),
  passwordEnc: encrypt('pass-secret'),
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CONNECTIVITY_BASE_URL = 'https://connect.example.internal';
  // El servicio usa fetch global: lo mockeamos
  vi.stubGlobal('fetch', hoisted.globalFetch);
});

describe('Hospitality — prueba de conexión (property details)', () => {
  it('usa el hotelCode de sandbox por defecto si no se pasa ninguno', async () => {
    hoisted.findUnique.mockResolvedValue({ ...creds, baseUrl: 'https://connect.example.internal' });
    hoisted.globalFetch.mockResolvedValue(
      new Response(JSON.stringify({ hotel_id: 'sandbox-pms', hotel_name: 'Sandbox PMS' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    await testConnectivityConnection();

    const url = hoisted.globalFetch.mock.calls[0][0];
    expect(url).toContain(`/property_details/${CONNECTIVITY_SANDBOX_HOTEL}`);
    expect(url).toContain('partnerId=partner-demo');
    // Basic Auth con credenciales descifradas
    const headers = hoisted.globalFetch.mock.calls[0][1].headers;
    const expectedAuth = `Basic ${Buffer.from('user-api:pass-secret').toString('base64')}`;
    expect(headers.Authorization).toBe(expectedAuth);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('usa el hotelCode proporcionado en la URL', async () => {
    hoisted.findUnique.mockResolvedValue({ ...creds, baseUrl: 'https://connect.example.internal' });
    hoisted.globalFetch.mockResolvedValue(
      new Response(JSON.stringify({ hotel_id: 'mi-hotel' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    await testConnectivityConnection('mi-hotel');

    const url = hoisted.globalFetch.mock.calls[0][0];
    expect(url).toContain('/property_details/mi-hotel');
  });

  it('devuelve la propiedad completa con habitaciones y rateplans en éxito', async () => {
    hoisted.findUnique.mockResolvedValue({ ...creds, baseUrl: 'https://connect.example.internal' });
    const property = {
      hotel_id: 'sandbox-pms',
      hotel_name: 'Sandbox PMS',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      property_category: 'hotel',
      rooms: [
        {
          room_id: 'executive',
          room_name: 'EXECUTIVE',
          rateplans: [
            { rateplan_id: 'executive-s-ep', rateplan_name: 'Room Only', occupancy: 1 },
          ],
        },
      ],
    };
    hoisted.globalFetch.mockResolvedValue(
      new Response(JSON.stringify(property), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const result = await testConnectivityConnection();

    expect(result.ok).toBe(true);
    expect(result.conectado).toBe(true);
    expect(result.property?.hotel_id).toBe('sandbox-pms');
    expect(result.property?.rooms?.[0]?.rateplans?.[0]?.rateplan_id).toBe('executive-s-ep');
  });

  it('devuelve error con el cuerpo de la respuesta externa cuando el servicio falla', async () => {
    hoisted.findUnique.mockResolvedValue({ ...creds, baseUrl: 'https://connect.example.internal' });
    hoisted.globalFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    );

    const result = await testConnectivityConnection();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
    expect(result.respuestaExterna).toEqual({ success: false, message: 'Invalid credentials' });
  });

  it('un ID de socio deshabilitado se explica tal cual, no como un 400 seco', async () => {
    // Texto documentado en el contrato: `400 {"success":false,"message":"Partner is disabled!"}`.
    // El hotel (o quien opera) tiene que leer qué pasa al pulsar «Comprobar».
    hoisted.findUnique.mockResolvedValue({ ...creds, baseUrl: 'https://connect.example.internal' });
    hoisted.globalFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: 'Partner is disabled!' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    );

    const result = await testConnectivityConnection();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/deshabilitado/i);
    expect(result.error).toMatch(/habiliten/i);
    // El cuerpo crudo sigue viajando para el diagnóstico (nada de tragárselo).
    expect(result.respuestaExterna).toEqual({ success: false, message: 'Partner is disabled!' });
  });

  it('un ID de socio que el servicio no reconoce se explica y dice qué hacer', async () => {
    hoisted.findUnique.mockResolvedValue({ ...creds, baseUrl: 'https://connect.example.internal' });
    hoisted.globalFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: 'Invalid partner id' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    );

    const result = await testConnectivityConnection();

    expect(result.ok).toBe(false);
    // El mensaje nombra al socio: mandar a rotar credenciales aquí era el fallo.
    expect(result.error).toMatch(/no reconoce el ID de socio/i);
    expect(result.error).toMatch(/quítalo/i);
    // El «401» no se pierde, pero ya no es lo único que se dice.
    expect(result.respuestaExterna).toEqual({ success: false, message: 'Invalid partner id' });
  });

  it('un 403 «Access Denied - <hotelCode>» se explica como hotel sin conceder, no como un 403 seco', async () => {
    // Verificado contra el servicio (2026-10-09): con el par Basic y el ID de
    // socio correctos, un hotel no asignado a la cuenta responde esto. El hotel
    // que pulsa «Comprobar» tiene que leer qué falta y a quién pedirlo.
    hoisted.findUnique.mockResolvedValue({ ...creds, baseUrl: 'https://connect.example.internal' });
    hoisted.globalFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: 'Access Denied - 75fdbbce2e' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    );

    const result = await testConnectivityConnection('75fdbbce2e');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no está concedido/i);
    expect(result.error).not.toContain('estado 403');
    expect(result.respuestaExterna).toEqual({ success: false, message: 'Access Denied - 75fdbbce2e' });
  });

  it('devuelve error claro si no hay credenciales configuradas', async () => {
    hoisted.findUnique.mockResolvedValue(null);

    const result = await testConnectivityConnection();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('no configurada');
    expect(hoisted.globalFetch).not.toHaveBeenCalled();
  });

  it('devuelve error si la URL del servicio no está configurada', async () => {
    hoisted.findUnique.mockResolvedValue({ ...creds, baseUrl: 'https://connect.example.internal' });
    delete process.env.CONNECTIVITY_BASE_URL;

    expect(() => getConnectivityBaseUrl()).toThrow('CONNECTIVITY_BASE_URL');
  });

  it('devuelve error de red si fetch lanza excepción', async () => {
    hoisted.findUnique.mockResolvedValue({ ...creds, baseUrl: 'https://connect.example.internal' });
    hoisted.globalFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await testConnectivityConnection();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});

describe('Hospitality — URL base de conectividad', () => {
  it('añade el prefijo del contrato cuando la variable solo trae el host', () => {
    process.env.CONNECTIVITY_BASE_URL = 'https://connect.example.internal';
    expect(getConnectivityBaseUrl()).toBe(
      `https://connect.example.internal${CONNECTIVITY_API_PREFIX}`
    );
  });

  it('no duplica el prefijo si la variable ya lo incluye', () => {
    process.env.CONNECTIVITY_BASE_URL = `https://connect.example.internal${CONNECTIVITY_API_PREFIX}`;
    expect(getConnectivityBaseUrl()).toBe(
      `https://connect.example.internal${CONNECTIVITY_API_PREFIX}`
    );
  });

  it('tolera espacios y barra final sobrantes', () => {
    process.env.CONNECTIVITY_BASE_URL = '  https://connect.example.internal/  ';
    expect(getConnectivityBaseUrl()).toBe(
      `https://connect.example.internal${CONNECTIVITY_API_PREFIX}`
    );
  });

  it('todas las llamadas del contrato salen con el prefijo de la API', async () => {
    process.env.CONNECTIVITY_BASE_URL = 'https://connect.example.internal';
    hoisted.findUnique.mockResolvedValue({ ...creds, baseUrl: 'https://connect.example.internal' });
    hoisted.globalFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, message: 'Updated' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await testConnectivityConnection();
    await pushInventory('sandbox-pms', [
      { startDate: '2026-01-01', endDate: '2026-01-02', rooms: [{ roomCode: 'suite', available: 1 }] },
    ]);
    await pushRates('sandbox-pms', [
      { startDate: '2026-01-01', endDate: '2026-01-02', rates: [{ roomCode: 'suite', rateplanCode: 'suite-d-ep', rate: 100 }] },
    ]);

    const urls = hoisted.globalFetch.mock.calls.map((c) => String(c[0]));
    expect(urls).toHaveLength(3);
    for (const url of urls) {
      expect(url).toContain(CONNECTIVITY_API_PREFIX);
    }
    expect(urls[1]).toContain(`/update/`);
    expect(urls[2]).toContain('/update-rates/');
  });
});