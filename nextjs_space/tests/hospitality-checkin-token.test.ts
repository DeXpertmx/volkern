// @vitest-environment node
//
// El enlace de check-in del huésped: quién escribe el token y qué pasa cuando lo
// piden dos a la vez.
//
// Lo que se fija aquí salió de un ensayo real: el token que la reserva directa
// devolvía al huésped NO era el que quedaba en la base, así que el enlace que
// acababa de recibir no abría nada. La causa era la carrera entre la preparación
// del enlace (lo que la reserva devuelve) y la comunicación de confirmación
// (que arma el suyo). Estas dos reglas la cierran:
//
//   1. La escritura del token es CONDICIONAL y, si otro llegó antes, se devuelve
//      el que está guardado — nunca uno que no exista en la base.
//   2. En la reserva directa el enlace se prepara ANTES de disparar la
//      comunicación, para que esta lo reutilice en vez de generar otro.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityReservation: {
      updateMany: mocks.updateMany,
      findUnique: mocks.findUnique,
    },
  },
}));

import { asegurarTokenCheckin } from '@/lib/hospitality/checkin-service';

function leer(relativo: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.findUnique.mockResolvedValue({ tokenCheckin: null });
});

describe('asegurarTokenCheckin', () => {
  it('sin token en la reserva lo escribe y lo devuelve', async () => {
    const token = await asegurarTokenCheckin({ id: 'res_a', tokenCheckin: null });

    expect(token).toMatch(/^[\w-]{20,}$/);
    const escritura = mocks.updateMany.mock.calls[0][0];
    expect(escritura.where).toEqual({ id: 'res_a', tokenCheckin: null });
    expect(escritura.data.tokenCheckin).toBe(token);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('si la reserva ya tiene token, no se toca la base', async () => {
    const token = await asegurarTokenCheckin({ id: 'res_a', tokenCheckin: 'tok_existente' });

    expect(token).toBe('tok_existente');
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('si otro llegó antes, devuelve el token GUARDADO (el suyo no valdría)', async () => {
    // La comunicación de confirmación escribió el suyo entre la lectura y la
    // escritura: la escritura condicional no toca nada y aquí no se puede
    // devolver el token propio — el enlace del huésped no abriría el formulario.
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue({ tokenCheckin: 'tok_del_otro' });

    const token = await asegurarTokenCheckin({ id: 'res_a', tokenCheckin: null });

    expect(token).toBe('tok_del_otro');
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: 'res_a' },
      select: { tokenCheckin: true },
    });
  });

  it('una reserva que ya no está no rompe la respuesta', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue(null);

    await expect(asegurarTokenCheckin({ id: 'res_borrada' })).resolves.toMatch(/^[\w-]{20,}$/);
  });
});

describe('la reserva directa prepara el enlace antes de disparar la comunicación', () => {
  it('el token se fija antes de que la confirmación monte el suyo', () => {
    const motor = leer('lib/hospitality/booking-engine.ts');
    const enlace = motor.indexOf('const checkinUrl = await enlaceDeCheckinDe(');
    const comunicacion = motor.indexOf('dispararComunicacionReserva({');

    expect(enlace, 'el motor no prepara el enlace de check-in').toBeGreaterThan(-1);
    expect(comunicacion, 'el motor no dispara la comunicación de confirmación').toBeGreaterThan(-1);
    expect(
      enlace,
      'la comunicación se dispara antes de preparar el enlace: genera un token propio y deja sin valor el que ve el huésped'
    ).toBeLessThan(comunicacion);
    // Y la respuesta devuelve ESE enlace, no uno recalculado al final.
    expect(motor).toContain('checkinUrl,\n    yaExistia: false,');
  });
});
