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
      new Response(JSON.stringify({ success: false, message: 'Invalid partner id' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    );

    const result = await testConnectivityConnection();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
    expect(result.respuestaExterna).toEqual({ success: false, message: 'Invalid partner id' });
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