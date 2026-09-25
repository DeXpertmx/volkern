// @vitest-environment node
//
// Guardia del SIMULADOR del proveedor de conectividad
// (`scripts/simulador-conectividad.mjs`).
//
// El simulador sirve para ensayar el día H y para desarrollar sin el proveedor,
// así que lo que hay que vigilar es que implemente el contrato DE VERDAD: si el
// simulador se relaja (acepta cualquier credencial, ignora el prefijo de la ruta
// o devuelve un catálogo que el mapping no puede leer), el ensayo diría que todo
// funciona mientras el proveedor real rechaza al hotel. Aquí se comprueba contra
// el proceso de verdad, en un puerto efímero y sin tocar base de datos.

import { describe, it, expect, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');

const CLAVES = {
  partnerId: 'partner-guardia',
  usuario: 'hotel.api.guardia',
  password: 'Clave-Guardia!1',
  hotelCode: 'hotel-guardia',
};

let simulador: ChildProcess | null = null;
let baseUrl = '';

async function levantar(): Promise<string> {
  if (simulador && baseUrl) return baseUrl;
  const script = path.join(RAIZ, 'scripts', 'simulador-conectividad.mjs');
  simulador = spawn(
    process.execPath,
    [
      script,
      '--port',
      '0',
      '--partner-id',
      CLAVES.partnerId,
      '--usuario',
      CLAVES.usuario,
      '--password',
      CLAVES.password,
      '--hotel-code',
      CLAVES.hotelCode,
      '--moneda',
      'EUR',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  baseUrl = await new Promise<string>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('El simulador no arrancó')), 10_000);
    simulador!.stdout?.on('data', (trozo: Buffer) => {
      const m = /SIMULADOR_LISTO puerto=\d+ url=(\S+)/.exec(trozo.toString());
      if (m) {
        clearTimeout(t);
        resolve(m[1]);
      }
    });
    simulador!.on('exit', () => {
      clearTimeout(t);
      reject(new Error('El simulador se cerró'));
    });
  });
  return baseUrl;
}

function authBasica(usuario = CLAVES.usuario, password = CLAVES.password): string {
  return `Basic ${Buffer.from(`${usuario}:${password}`).toString('base64')}`;
}

/**
 * Origen del simulador SIN el prefijo del contrato: las rutas de control no
 * viven bajo `/api/v2/cm` (no son parte de lo que el proveedor expone) y
 * pedirlas con el prefijo da 401, que es justo lo que el contrato exige.
 */
function control(base: string, ruta: string): string {
  return `${base.replace(/\/api\/v2\/cm$/, '')}${ruta}`;
}

afterAll(() => {
  simulador?.kill('SIGTERM');
});

describe('simulador del proveedor — autenticación y rutas', () => {
  it('exige Basic Auth: sin credenciales no hay catálogo', async () => {
    const base = await levantar();
    const res = await fetch(`${base}/property_details/${CLAVES.hotelCode}?partnerId=${CLAVES.partnerId}`);
    expect(res.status).toBe(401);
  });

  it('rechaza la contraseña con un espacio de más (la trampa del copiar y pegar)', async () => {
    const base = await levantar();
    const res = await fetch(`${base}/property_details/${CLAVES.hotelCode}?partnerId=${CLAVES.partnerId}`, {
      headers: { Authorization: authBasica(CLAVES.usuario, `${CLAVES.password} `) },
    });
    expect(res.status).toBe(401);
  });

  it('distingue un partnerId desconocido', async () => {
    const base = await levantar();
    const res = await fetch(`${base}/property_details/${CLAVES.hotelCode}?partnerId=otro`, {
      headers: { Authorization: authBasica() },
    });
    expect(res.status).toBe(403);
  });

  it('un hotelCode que no conoce da 404, no un catálogo inventado', async () => {
    const base = await levantar();
    const res = await fetch(`${base}/property_details/otro-hotel?partnerId=${CLAVES.partnerId}`, {
      headers: { Authorization: authBasica() },
    });
    expect(res.status).toBe(404);
  });

  it('la ruta necesita el prefijo del contrato: sin él, 404', async () => {
    const base = await levantar();
    const raiz = base.replace(/\/api\/v2\/cm$/, '');
    const res = await fetch(`${raiz}/property_details/${CLAVES.hotelCode}?partnerId=${CLAVES.partnerId}`, {
      headers: { Authorization: authBasica() },
    });
    expect(res.status).toBe(404);
  });
});

describe('simulador del proveedor — catálogo (property_details)', () => {
  it('devuelve la propiedad con habitaciones y planes de tarifa que el mapping puede leer', async () => {
    const base = await levantar();
    const res = await fetch(`${base}/property_details/${CLAVES.hotelCode}?partnerId=${CLAVES.partnerId}`, {
      headers: { Authorization: authBasica() },
    });
    expect(res.status).toBe(200);
    const cuerpo = (await res.json()) as any;

    expect(cuerpo.hotel_id).toBe(CLAVES.hotelCode);
    expect(cuerpo.currency).toBe('EUR');
    expect(Array.isArray(cuerpo.rooms)).toBe(true);
    expect(cuerpo.rooms.length).toBeGreaterThan(0);

    const primera = cuerpo.rooms[0];
    expect(typeof primera.room_id).toBe('string');
    expect(typeof primera.min_occ).toBe('number');
    expect(typeof primera.max_occ).toBe('number');
    expect(Array.isArray(primera.rateplans)).toBe(true);
    expect(typeof primera.rateplans[0].rateplan_id).toBe('string');
  });

  it('registra las llamadas (también las rechazadas) para poder comprobarlas desde el ensayo', async () => {
    const base = await levantar();
    const res = await fetch(control(base, '/_control/peticiones'));
    const { peticiones } = (await res.json()) as { peticiones: any[] };
    const catálogos = peticiones.filter((p) => String(p.ruta).includes('property_details'));
    expect(catálogos.length).toBeGreaterThan(0);
    // El catálogo bueno queda registrado con su autenticación; los intentos
    // rechazados también (con authOk: false), que es lo que permite ver un 401
    // desde fuera sin adivinar.
    expect(catálogos.some((p) => p.authOk === true && p.httpStatus === 200)).toBe(true);
    expect(catálogos.some((p) => p.authOk === false && p.httpStatus === 401)).toBe(true);
    // El registro nunca guarda contraseñas.
    expect(JSON.stringify(peticiones)).not.toContain(CLAVES.password);
  });
});

describe('simulador del proveedor — push y datos', () => {
  it('acepta el push de inventario y de tarifas del contrato', async () => {
    const base = await levantar();
    const cabeceras = { Authorization: authBasica(), 'Content-Type': 'application/json' };

    const inventario = await fetch(`${base}/update/${CLAVES.partnerId}`, {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify({
        hotelCode: CLAVES.hotelCode,
        updates: [{ startDate: '2026-10-01', endDate: '2026-10-05', rooms: [{ roomCode: '101', available: 3 }] }],
      }),
    });
    expect(inventario.status).toBe(200);
    expect(((await inventario.json()) as any).success).toBe(true);

    const tarifas = await fetch(`${base}/update-rates/${CLAVES.partnerId}`, {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify({
        hotelCode: CLAVES.hotelCode,
        updates: [
          { startDate: '2026-10-01', endDate: '2026-10-05', rates: [{ roomCode: '101', rateplanCode: 'FLEX-101', rate: 100 }] },
        ],
      }),
    });
    expect(tarifas.status).toBe(200);

    // Sin hotelCode el contrato exige 400: el simulador no se lo inventa.
    const sinHotel = await fetch(`${base}/update/${CLAVES.partnerId}`, {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify({ updates: [] }),
    });
    expect(sinHotel.status).toBe(400);
  });

  it('el empuje acepta una cabecera Authorization EXACTA (contrapruebas del 401) y una SIN cabecera', async () => {
    const base = await levantar();

    // «Producto» mínimo: deja constancia de la cabecera Authorization que
    // realmente recibió, que es exactamente lo que las contrapruebas del 401
    // del webhook necesitan que el simulador sepa mandar.
    const recibidas: Array<{ auth: string | undefined }> = [];
    const producto = http.createServer((req, res) => {
      let datos = '';
      req.on('data', (t) => (datos += t));
      req.on('end', () => {
        recibidas.push({ auth: req.headers.authorization as string | undefined });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status: 'creada' }));
      });
    });
    await new Promise<void>((resolve) => producto.listen(0, '127.0.0.1', () => resolve()));
    const destino = `http://127.0.0.1:${(producto.address() as any).port}/api/hospitality/webhook/reservations`;

    const empujar = async (cuerpoExtra: Record<string, unknown>) => {
      const res = await fetch(control(base, '/_control/empujar-reserva'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: destino, action: 'book', bookingId: 'H-1', ...cuerpoExtra }),
      });
      return (await res.json()) as any;
    };

    try {
      // 1. Cabecera cruda tal cual: `basic` en minúsculas pasa SIN retocar.
      const minuscula = await empujar({
        cabecera: `basic ${Buffer.from(`${CLAVES.usuario}:${CLAVES.password}`).toString('base64')}`,
      });
      expect(minuscula.ok).toBe(true);

      // 2. Otro esquema: la cabecera llega intacta, el PRODUCTO decide.
      const bearer = await empujar({ cabecera: 'Bearer abc.def.ghi' });
      expect(bearer.ok).toBe(true);

      // 3. Sin cabecera: el emisor que la olvidó.
      const sinCabecera = await empujar({ sinCabecera: true });
      expect(sinCabecera.ok).toBe(true);

      // 4. Sin instrucción especial: Basic canónico del proveedor (como antes).
      const porDefecto = await empujar({});
      expect(porDefecto.ok).toBe(true);

      expect(recibidas).toHaveLength(4);
      expect(recibidas[0].auth).toBe(
        `basic ${Buffer.from(`${CLAVES.usuario}:${CLAVES.password}`).toString('base64')}`,
      );
      expect(recibidas[1].auth).toBe('Bearer abc.def.ghi');
      expect(recibidas[2].auth).toBeUndefined();
      expect(recibidas[3].auth).toBe(authBasica());
    } finally {
      producto.close();
    }
  });

  it('devuelve por /data las reservas que le han empujado', async () => {
    const base = await levantar();
    const cabeceras = { Authorization: authBasica(), 'Content-Type': 'application/json' };

    const reserva = {
      action: 'book',
      hotelCode: CLAVES.hotelCode,
      channel: 'Volkern',
      bookingId: 'G-1',
      checkin: '2026-10-01',
      checkout: '2026-10-03',
      amount: { amountAfterTax: 200, currency: 'EUR' },
    };

    // El simulador empuja el webhook a un «producto» mínimo: un servidor local
    // que solo comprueba que le llega con el Basic Auth del proveedor.
    const recibidas: Array<{ auth: string | undefined; cuerpo: any }> = [];
    const producto = http.createServer((req, res) => {
      let datos = '';
      req.on('data', (t) => (datos += t));
      req.on('end', () => {
        recibidas.push({ auth: req.headers.authorization as string | undefined, cuerpo: JSON.parse(datos || '{}') });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status: 'creada' }));
      });
    });
    await new Promise<void>((resolve) => producto.listen(0, '127.0.0.1', () => resolve()));
    const puertoProducto = (producto.address() as any).port;

    try {
      const empujada = await fetch(control(base, '/_control/empujar-reserva'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `http://127.0.0.1:${puertoProducto}/api/hospitality/webhook/reservations`,
          ...reserva,
        }),
      });
      expect(empujada.status).toBe(200);
      const cuerpoEmpujada = (await empujada.json()) as any;
      expect(cuerpoEmpujada.ok).toBe(true);
      expect(cuerpoEmpujada.httpStatus).toBe(200);

      expect(recibidas).toHaveLength(1);
      expect(recibidas[0].auth).toBe(authBasica());
      expect(recibidas[0].cuerpo.bookingId).toBe('G-1');
      expect(recibidas[0].cuerpo.action).toBe('book');
    } finally {
      producto.close();
    }

    // La reserva empujada es la que el proveedor dice tener.
    const datos = await fetch(`${base}/data/${CLAVES.partnerId}`, {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify({
        type: 'reservation',
        hotelCode: CLAVES.hotelCode,
        startDate: '2026-09-01',
        endDate: '2026-12-31',
      }),
    });
    expect(datos.status).toBe(200);
    const devueltas = (await datos.json()) as any[];
    expect(devueltas.some((r) => r.bookingId === 'G-1')).toBe(true);

    // Un tipo de dato que no es «reservation» no se acepta.
    const otroTipo = await fetch(`${base}/data/${CLAVES.partnerId}`, {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify({ type: 'rate', hotelCode: CLAVES.hotelCode }),
    });
    expect(otroTipo.status).toBe(400);
  });
});
