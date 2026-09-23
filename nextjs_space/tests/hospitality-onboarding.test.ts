import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeOnboardingSteps,
  puedeActivar,
  buildTestReservationPayload,
  esReservaDePrueba,
  esEmailDePrueba,
  estaConectada,
  etiquetaEstadoPropiedad,
  REQUISITO_ACTIVACION_CANAL,
  ONBOARDING_TEST_BOOKING_PREFIX,
  ONBOARDING_TEST_EMAIL_PREFIX,
  type OnboardingEstado,
} from '@/lib/hospitality/onboarding';

const RAIZ = path.resolve(__dirname, '..');

const base: OnboardingEstado = {
  estadoPropiedad: 'activa',
  tienePropiedad: true,
  unidades: 2,
  unidadesConDatosOperativos: 2,
  unidadesVinculadas: 2,
  hotelCode: 'sandbox-pms',
  conectividadConfigurada: true,
  pruebas: { disponibilidad: 'exito', tarifas: 'exito', reserva: 'exito' },
};

describe('Hospitality onboarding (§31) — pasos', () => {
  it('devuelve los 10 pasos del plan en orden', () => {
    const pasos = computeOnboardingSteps(base);
    expect(pasos).toHaveLength(10);
    expect(pasos.map((p) => p.clave)).toEqual([
      'propiedad',
      'unidades',
      'datos_operativos',
      'conectividad',
      'mapping_externo',
      'vincular',
      'probar_disponibilidad',
      'probar_tarifas',
      'probar_reserva',
      'activar',
    ]);
    expect(pasos.map((p) => p.orden)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('sin propiedad: paso 1 pendiente y activación bloqueada', () => {
    const pasos = computeOnboardingSteps({ ...base, tienePropiedad: false, hotelCode: null });
    expect(pasos[0].estado).toBe('pendiente');
    const { ok, faltantes } = puedeActivar({ ...base, tienePropiedad: false, hotelCode: null });
    expect(ok).toBe(false);
    expect(faltantes).toContain('Crear la propiedad');
  });

  it('sin unidades: bloquea datos operativos y las tres pruebas', () => {
    const pasos = computeOnboardingSteps({
      ...base,
      unidades: 0,
      unidadesConDatosOperativos: 0,
      unidadesVinculadas: 0,
      hotelCode: null,
      pruebas: { disponibilidad: null, tarifas: null, reserva: null },
    });
    const porClave = Object.fromEntries(pasos.map((p) => [p.clave, p.estado]));
    expect(porClave.unidades).toBe('pendiente');
    expect(porClave.datos_operativos).toBe('bloqueado');
    expect(porClave.vincular).toBe('bloqueado');
    expect(porClave.probar_disponibilidad).toBe('bloqueado');
  });

  it('sin conectividad de plataforma: bloquea conectividad y mapping externo', () => {
    const pasos = computeOnboardingSteps({
      ...base,
      conectividadConfigurada: false,
      hotelCode: null,
      unidadesVinculadas: 0,
      pruebas: { disponibilidad: null, tarifas: null, reserva: null },
    });
    const porClave = Object.fromEntries(pasos.map((p) => [p.clave, p.estado]));
    expect(porClave.conectividad).toBe('bloqueado');
    expect(porClave.mapping_externo).toBe('bloqueado');
    expect(porClave.vincular).toBe('bloqueado');
  });

  it('con mapping externo pero unidades sin vincular: paso 6 pendiente', () => {
    const pasos = computeOnboardingSteps({ ...base, unidadesVinculadas: 1 });
    const porClave = Object.fromEntries(pasos.map((p) => [p.clave, p.estado]));
    expect(porClave.vincular).toBe('pendiente');
    expect(pasos.find((p) => p.clave === 'vincular')?.detalle).toContain('1 de 2');
    expect(puedeActivar({ ...base, unidadesVinculadas: 1 }).ok).toBe(false);
  });

  it('unidad sin datos operativos: paso 3 pendiente y activación incompleta', () => {
    const estado = { ...base, unidadesConDatosOperativos: 1 };
    const pasos = computeOnboardingSteps(estado);
    expect(pasos.find((p) => p.clave === 'datos_operativos')?.estado).toBe('pendiente');
    expect(puedeActivar(estado).faltantes).toContain('Capacidad y datos operativos');
  });

  it('una prueba fallida marca el paso en error y bloquea la activación', () => {
    const estado = { ...base, pruebas: { ...base.pruebas, tarifas: 'error' as const } };
    const pasos = computeOnboardingSteps(estado);
    expect(pasos.find((p) => p.clave === 'probar_tarifas')?.estado).toBe('error');
    expect(puedeActivar(estado).faltantes).toContain('Probar tarifas');
  });

  it('camino completo: solo falta activar', () => {
    const pasos = computeOnboardingSteps(base);
    expect(pasos.slice(0, 9).every((p) => p.estado === 'completado')).toBe(true);
    expect(pasos[9].estado).toBe('pendiente');
    expect(puedeActivar(base)).toEqual({ ok: true, faltantes: [] });
  });

  it('propiedad conectada: el paso 10 queda completado', () => {
    const pasos = computeOnboardingSteps({ ...base, estadoPropiedad: 'conectada' });
    expect(pasos[9].estado).toBe('completado');
    expect(estaConectada('conectada')).toBe(true);
    expect(estaConectada('activa')).toBe(false);
    expect(etiquetaEstadoPropiedad('conectada')).toBe('Conectada');
  });
});

describe('Hospitality onboarding (§31) — reserva de prueba', () => {
  const checkin = new Date(Date.UTC(2026, 0, 10));

  it('construye un payload book con la forma del contrato', () => {
    const payload = buildTestReservationPayload({
      hotelCode: 'sandbox-pms',
      roomCode: 'suite',
      rateplanCode: 'suite-d-ep',
      checkin,
      noches: 3,
      sufijo: 'abc',
    });

    expect(payload.action).toBe('book');
    expect(payload.hotelCode).toBe('sandbox-pms');
    expect(payload.bookingId).toBe(`${ONBOARDING_TEST_BOOKING_PREFIX}abc`);
    expect(payload.checkin).toBe('2026-01-10');
    expect(payload.checkout).toBe('2026-01-13');
    expect(payload.rooms?.[0]?.roomCode).toBe('suite');
    expect(payload.rooms?.[0]?.rateplanCode).toBe('suite-d-ep');
    expect(payload.rooms?.[0]?.prices).toHaveLength(3);
    expect(payload.amount?.amountAfterTax).toBe(3000);
    expect(payload.guest?.email?.startsWith(ONBOARDING_TEST_EMAIL_PREFIX)).toBe(true);
    // Los opcionales del contrato van presentes (null), no omitidos.
    expect(payload).toHaveProperty('cmBookingId', null);
    expect(payload.amount).toHaveProperty('commission', null);
  });

  it('por defecto son 2 noches desde mañana', () => {
    const payload = buildTestReservationPayload({
      hotelCode: 'sandbox-pms',
      roomCode: 'executive',
      sufijo: 'x',
    });
    const noches =
      (new Date(`${payload.checkout}T00:00:00Z`).getTime() -
        new Date(`${payload.checkin}T00:00:00Z`).getTime()) /
      86_400_000;
    expect(noches).toBe(2);
    expect(payload.rooms?.[0]?.rateplanCode).toBeNull();
  });

  it('identifica las reservas y huéspedes de prueba para poder limpiarlos', () => {
    expect(esReservaDePrueba(`${ONBOARDING_TEST_BOOKING_PREFIX}123`)).toBe(true);
    expect(esReservaDePrueba('111222333')).toBe(false);
    expect(esReservaDePrueba(null)).toBe(false);
    expect(esEmailDePrueba(`${ONBOARDING_TEST_EMAIL_PREFIX}123@onboarding.test`)).toBe(true);
    expect(esEmailDePrueba('cliente@real.com')).toBe(false);
  });
});

// ─── Paso 5: el catálogo depende de un tercero ──────────────────────────────
//
// El catálogo externo NO existe hasta que el canal está activado en la extranet
// de la OTA y el proveedor ha mapeado sus habitaciones. Sin este aviso, el
// operador espera un código que nadie ha pedido a nadie y lo lee como un fallo
// nuestro. El requisito viaja CON el paso pendiente y desaparece al completarlo.
describe('onboarding paso 5 — activación del canal en la OTA (requisito externo)', () => {
  const pasoMapping = (e: OnboardingEstado) =>
    computeOnboardingSteps(e).find((p) => p.clave === 'mapping_externo')!;

  it('el paso pendiente lleva el requisito externo', () => {
    const paso = pasoMapping({ ...base, hotelCode: null });
    expect(paso.estado).toBe('pendiente');
    expect(paso.requisitoExterno).toEqual(REQUISITO_ACTIVACION_CANAL);
  });

  it('el paso bloqueado por nuestra conectividad también lo lleva', () => {
    const paso = pasoMapping({ ...base, conectividadConfigurada: false, hotelCode: null });
    expect(paso.estado).toBe('bloqueado');
    expect(paso.requisitoExterno).toEqual(REQUISITO_ACTIVACION_CANAL);
  });

  it('el paso completado NO lo lleva: ya no hay nada que advertir', () => {
    const paso = pasoMapping({ ...base, hotelCode: 'sandbox-pms' });
    expect(paso.estado).toBe('completado');
    expect(paso.requisitoExterno).toBeUndefined();
  });

  it('solo lo lleva el paso 5: los demás pasos no hablan de terceros', () => {
    const pasos = computeOnboardingSteps({ ...base, hotelCode: null });
    expect(pasos.filter((p) => p.requisitoExterno).map((p) => p.clave)).toEqual([
      'mapping_externo',
    ]);
  });

  it('nombra quién lo ejecuta y dice que esperar no lo resuelve', () => {
    expect(REQUISITO_ACTIVACION_CANAL.quien).toContain('extranet');
    // Los tres canales que documenta la fuente, con su vía real.
    expect(REQUISITO_ACTIVACION_CANAL.detalle).toContain('Booking.com');
    expect(REQUISITO_ACTIVACION_CANAL.detalle).toContain('Expedia');
    expect(REQUISITO_ACTIVACION_CANAL.detalle).toContain('Airbnb');
    // El punto que evita la espera infinita: el paso no se completa esperando.
    expect(REQUISITO_ACTIVACION_CANAL.detalle).toContain('no se completa por esperar');
    // Material de producto: nada de rutas de docs internos ni de «OTA».
    expect(REQUISITO_ACTIVACION_CANAL.detalle).not.toContain('docs/');
    expect(REQUISITO_ACTIVACION_CANAL.titulo).not.toMatch(/\bOTA\b/);
  });

  it('la pantalla del wizard pinta el requisito en el paso 5 (guardia de la página)', () => {
    const fuente = fs.readFileSync(
      path.join(RAIZ, 'app/dashboard/hospitality/onboarding/page.tsx'),
      'utf8'
    );
    expect(fuente).toContain('requisitoExterno');
    // Se pinta el texto del módulo, no uno copiado a mano en la pantalla.
    expect(fuente).not.toContain('El código de propiedad y el catálogo los publica');
    expect(fuente).toContain("paso('mapping_externo')");
  });
});
