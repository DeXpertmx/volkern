import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// La configuración habla con Prisma, pero lo que se prueba aquí son sus reglas
// puras y el enlace firmado: la base no entra.
vi.mock('../lib/db', () => ({ prisma: {} }));

import {
  codigoEmbedBooking,
  logoCorporativoTenant,
  monedaPublicada,
  normalizarAnticipo,
  normalizarSlug,
  normalizarTarifaLimpieza,
  propiedadesPublicables,
  urlEmbedBooking,
  urlPublicaBooking,
  validarSlug,
} from '../lib/hospitality/booking-config';
import { prisma } from '../lib/db';
import {
  firmarTokenReserva,
  urlConfirmacionReserva,
  verificarTokenReserva,
} from '../lib/hospitality/booking-link';
import { TOP_LEVEL } from '../lib/legacy-redirects';

describe('normalizarSlug', () => {
  it('quita acentos, mayúsculas y signos', () => {
    expect(normalizarSlug('Alojamiento Sol y Playa')).toBe('alojamiento-sol-y-playa');
    // La eñe se descompone y vuelve a componerse: el slug queda legible.
    expect(normalizarSlug('Casa Ñuñoa')).toBe('casa-nunoa');
    expect(normalizarSlug('Apartamento 2º B')).toBe('apartamento-2-b');
  });

  it('colapsa separadores repetidos y recorta los extremos', () => {
    expect(normalizarSlug('  --Mi   Casa--  ')).toBe('mi-casa');
  });
});

describe('validarSlug', () => {
  it('acepta una dirección normal', () => {
    expect(validarSlug('Mi Casa')).toEqual({ ok: true, slug: 'mi-casa' });
  });

  it('rechaza las direcciones demasiado cortas', () => {
    const resultado = validarSlug('ab');
    expect(resultado.ok).toBe(false);
  });

  it('rechaza las palabras que ya son ruta de la aplicación', () => {
    // Un slug `dashboard` daría un enlace que no lleva a la página publicada.
    for (const reservado of ['dashboard', 'admin', 'api', 'login', 'reservar']) {
      const resultado = validarSlug(reservado);
      expect(resultado.ok, `«${reservado}» no debería aceptarse`).toBe(false);
    }
  });

  it('`reservar` es ruta top-level para que el middleware no se la coma', () => {
    expect(TOP_LEVEL.has('reservar')).toBe(true);
  });
});

describe('normalizarAnticipo', () => {
  it('redondea y recorta al rango del porcentaje', () => {
    expect(normalizarAnticipo('25,5')).toBe(0);
    expect(normalizarAnticipo(25.4)).toBe(25);
    expect(normalizarAnticipo(140)).toBe(100);
    expect(normalizarAnticipo(-10)).toBe(0);
    expect(normalizarAnticipo(null)).toBe(0);
    expect(normalizarAnticipo('')).toBe(0);
  });
});

describe('normalizarTarifaLimpieza', () => {
  it('nulo o vacío significan «no se cobra»', () => {
    expect(normalizarTarifaLimpieza(null)).toBeNull();
    expect(normalizarTarifaLimpieza('')).toBeNull();
    expect(normalizarTarifaLimpieza(0)).toBeNull();
    expect(normalizarTarifaLimpieza(-5)).toBeNull();
  });

  it('guarda el importe redondeado a céntimo', () => {
    expect(normalizarTarifaLimpieza('60')).toBe(60);
    expect(normalizarTarifaLimpieza(45.678)).toBe(45.68);
  });
});

describe('propiedadesPublicables', () => {
  it('deja fuera lo que no es del tenant y no repite', () => {
    const resultado = propiedadesPublicables(
      ['p1', 'p2', 'ajena', 'p1', 'borrada'],
      [{ id: 'p1' }, { id: 'p2' }]
    );
    expect(resultado).toEqual(['p1', 'p2']);
  });

  it('sin propiedades del tenant no publica nada', () => {
    expect(propiedadesPublicables(['p1'], [])).toEqual([]);
  });
});

describe('monedaPublicada', () => {
  it('usa la del tenant mientras el tenant no elija otra', () => {
    expect(monedaPublicada({ moneda: null }, 'EUR')).toBe('EUR');
    expect(monedaPublicada({}, 'COP')).toBe('COP');
  });

  it('la elegida por el tenant manda', () => {
    expect(monedaPublicada({ moneda: 'USD' }, 'EUR')).toBe('USD');
  });

  it('sin moneda de tenant no inventa una divisa', () => {
    expect(monedaPublicada({ moneda: null }, null)).toBe('');
  });
});

describe('enlaces publicados', () => {
  it('compone la página pública y el widget', () => {
    expect(urlPublicaBooking('https://volkern.app/', 'mi-casa')).toBe(
      'https://volkern.app/reservar/mi-casa'
    );
    expect(urlEmbedBooking('https://volkern.app', 'mi-casa')).toBe(
      'https://volkern.app/embed/reservar/mi-casa'
    );
  });

  it('el código del widget apunta al embed y escapa las comillas del título', () => {
    const codigo = codigoEmbedBooking('https://volkern.app', 'mi-casa', 'Casa "Sol"');
    expect(codigo).toContain('https://volkern.app/embed/reservar/mi-casa');
    expect(codigo).toContain('title="Casa Sol"');
    expect(codigo.startsWith('<iframe')).toBe(true);
  });
});

describe('logo corporativo del tenant (cabecera de la página pública)', () => {
  const findFirst = vi.fn();

  beforeEach(() => {
    (prisma as unknown as { configuracion: { findFirst: typeof findFirst } }).configuracion = { findFirst };
    findFirst.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sin logo configurado devuelve null: la página no enseña ninguno', async () => {
    findFirst.mockResolvedValue(null);
    await expect(logoCorporativoTenant('t1')).resolves.toBeNull();
    findFirst.mockResolvedValue({ valor: '   ' });
    await expect(logoCorporativoTenant('t1')).resolves.toBeNull();
  });

  it('una URL pública pasa tal cual (y lo que no es URL de imagen cae a null)', async () => {
    findFirst.mockResolvedValue({ valor: 'https://cdn.hotel.com/logo.png' });
    await expect(logoCorporativoTenant('t1')).resolves.toBe('https://cdn.hotel.com/logo.png');
    findFirst.mockResolvedValue({ valor: 'javascript:alert(1)' });
    await expect(logoCorporativoTenant('t1')).resolves.toBeNull();
  });

  it('el valor JSON-codificado se desenvuelve', async () => {
    findFirst.mockResolvedValue({ valor: '"https://cdn.hotel.com/logo.png"' });
    await expect(logoCorporativoTenant('t1')).resolves.toBe('https://cdn.hotel.com/logo.png');
  });

  it('una clave de S3/R2 se convierte a URL pública directa, sin firma que caduque', async () => {
    vi.stubEnv('NEXT_PUBLIC_CDN_URL', 'https://cdn.test');
    findFirst.mockResolvedValue({ valor: 'public/configuracion/logo-123.png' });
    await expect(logoCorporativoTenant('t1')).resolves.toBe('https://cdn.test/public/configuracion/logo-123.png');
  });

  it('si la consulta falla la página se sirve sin logo (auxiliar, nunca rota)', async () => {
    findFirst.mockRejectedValue(new Error('bd caída'));
    await expect(logoCorporativoTenant('t1')).resolves.toBeNull();
  });
});

describe('enlace firmado de la reserva', () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = 'secreto-de-pruebas';
  });

  it('la reserva se recupera de su propio enlace', () => {
    const token = firmarTokenReserva('res-123');
    expect(verificarTokenReserva(token)).toEqual({ ok: true, reservaId: 'res-123' });
  });

  it('una firma manipulada no vale', () => {
    const token = firmarTokenReserva('res-123');
    const [cuerpo, firma] = token.split('.');
    const alterada = `${cuerpo}.${firma.slice(0, -2)}AA`;
    expect(verificarTokenReserva(alterada)).toEqual({ ok: false, motivo: 'firma_invalida' });
  });

  it('no se puede cambiar la reserva sin la firma', () => {
    const token = firmarTokenReserva('res-123');
    const firma = token.split('.')[1];
    const otro = Buffer.from(JSON.stringify({ reservaId: 'res-999', expiraEn: Date.now() + 1000 }))
      .toString('base64url');
    expect(verificarTokenReserva(`${otro}.${firma}`)).toEqual({ ok: false, motivo: 'firma_invalida' });
  });

  it('un enlace caducado se distingue de uno falsificado', () => {
    const token = firmarTokenReserva('res-123', Date.now() - 200 * 24 * 60 * 60 * 1000);
    expect(verificarTokenReserva(token)).toEqual({ ok: false, motivo: 'caducado' });
  });

  it('un token malformado no verifica', () => {
    expect(verificarTokenReserva('sin-punto')).toEqual({ ok: false, motivo: 'malformado' });
    expect(verificarTokenReserva('')).toEqual({ ok: false, motivo: 'malformado' });
  });

  it('la URL de confirmación lleva el enlace firmado, no el id suelto', () => {
    const url = urlConfirmacionReserva('https://volkern.app', 'mi-casa', 'res-123');
    expect(url.startsWith('https://volkern.app/reservar/mi-casa/confirmacion/')).toBe(true);
    const token = url.split('/').pop() as string;
    expect(verificarTokenReserva(token)).toEqual({ ok: true, reservaId: 'res-123' });
  });
});
