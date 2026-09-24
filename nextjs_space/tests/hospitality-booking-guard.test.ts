import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guardia del Booking Engine (FASE 3.D).
 *
 * El diseño de la fase tiene reglas que no se ven en una prueba de unidad y que
 * se rompen por descuido: el motor propio que nadie quería, el dinero escrito a
 * mano en la página pública, el pago contra la cuenta equivocada, la sección que
 * desaparece del menú. Esta prueba las vigila sobre el código real.
 */

const RAIZ = path.resolve(__dirname, '..');
const leer = (relativo: string) => fs.readFileSync(path.join(RAIZ, relativo), 'utf8');

const RUTAS_PUBLICAS = [
  'app/api/public/booking/[slug]/route.ts',
  'app/api/public/booking/[slug]/cotizar/route.ts',
  'app/api/public/booking/[slug]/reservar/route.ts',
];

describe('la reserva directa entra por el Reservation Engine', () => {
  it('ninguna ruta pública escribe reservas por su cuenta', () => {
    const infractoras: string[] = [];
    for (const ruta of RUTAS_PUBLICAS) {
      const codigo = leer(ruta);
      if (/hospitalityReservation\s*\.\s*(create|update|delete)/.test(codigo)) {
        infractoras.push(`${ruta} escribe la reserva directamente`);
      }
      if (/hospitalityPayment\s*\.\s*create/.test(codigo)) {
        infractoras.push(`${ruta} registra el pago directamente`);
      }
    }
    expect(infractoras, infractoras.join('\n')).toEqual([]);
  });

  it('la ruta que reserva pide la creación al motor compartido', () => {
    const codigo = leer('app/api/public/booking/[slug]/reservar/route.ts');
    expect(codigo).toMatch(/from\s+['"]@\/lib\/hospitality\/booking-engine['"]/);
    expect(codigo).toContain('crearReservaDirecta');
  });

  it('el motor cotiza con el Availability Engine central, no con fechas propias', () => {
    const motor = leer('lib/hospitality/booking-engine.ts');
    expect(motor).toMatch(/from\s+['"]\.\/availability['"]/);
    expect(motor).toContain('loadAvailabilityContext');
    expect(motor).toContain('unitUnavailableOnDay');
  });

  it('la configuración pública no consulta reservas: la disponibilidad no vive ahí', () => {
    for (const modulo of ['lib/hospitality/booking-config.ts', 'lib/hospitality/booking-public.ts']) {
      expect(leer(modulo), `${modulo} no debería leer reservas`).not.toContain('hospitalityReservation');
    }
  });
});

describe('la página pública no inventa dinero', () => {
  it('el asistente escribe los importes con el módulo único de dinero', () => {
    const asistente = leer('components/hospitality/booking/BookingWizard.tsx');
    expect(asistente).toContain("from '@/lib/moneda'");
    expect(asistente).toContain('formatearImporte');
    // Ni un símbolo pegando a una cifra ni un formato propio.
    expect(asistente).not.toMatch(/toLocaleString|Intl\.NumberFormat/);
  });

  it('el precio se calcula en el servidor, no en el navegador', () => {
    const asistente = leer('components/hospitality/booking/BookingWizard.tsx');
    expect(asistente).not.toMatch(/noches\s*\*\s*|tarifaPorNoche\s*\*/);
  });
});

describe('el huésped lee la reserva directa en su idioma', () => {
  it('el asistente toma los textos del módulo único y no de una lista paralela', () => {
    const asistente = leer('components/hospitality/booking/BookingWizard.tsx');
    expect(asistente).toContain("from '@/lib/hospitality/booking-i18n'");
    expect(asistente).toContain('WIZARD_TEXTOS');
    // Ni una frase suelta en español fuera del módulo de textos: las que
    // quedan son identificadores de campo, no copy visible.
    expect(asistente).not.toMatch(/'¿Cuándo vienes\?'|"¿Cuándo vienes\?"/);
  });

  it('el idioma baja del servidor: las dos superficies leen ?lang y se lo pasan', () => {
    for (const ruta of ['app/reservar/[slug]/page.tsx', 'app/embed/reservar/[slug]/page.tsx']) {
      const codigo = leer(ruta);
      expect(codigo, `${ruta} no lee ?lang`).toContain('idiomaDeValor');
      expect(codigo, `${ruta} no localiza la pantalla de no disponible`).toContain(
        'textosPaginaNoDisponible'
      );
      expect(codigo, `${ruta} no le pasa el idioma al asistente`).toMatch(/idioma=\{idioma\}/);
      expect(codigo, `${ruta} no le da ruta al conmutador`).toContain('rutaBase=');
    }
  });

  it('el asistente manda su idioma al reservar (y el servidor lo guarda en la reserva)', () => {
    const asistente = leer('components/hospitality/booking/BookingWizard.tsx');
    expect(asistente).toMatch(/lang:\s*idioma/);

    // La reserva directa nace con el idioma del huésped en `guestData.idioma`,
    // que es lo que leen las comunicaciones automáticas.
    const motor = leer('lib/hospitality/booking-engine.ts');
    expect(motor).toMatch(/idioma:\s*idiomaDeValor\(entrada\.idioma\)/);
    expect(leer('app/api/public/booking/[slug]/reservar/route.ts')).toMatch(
      /idioma:\s*textoOpcional\(cuerpo\.lang/
    );
  });
});

describe('el cobro va a la cuenta del tenant, nunca a la de Volkern', () => {
  const cobros = leer('lib/hospitality/booking-payments.ts');

  it('la sesión de pago se abre contra la cuenta conectada', () => {
    expect(cobros).toContain('stripeAccount');
    expect(cobros).toContain('estadoDeCobroDelTenant');
  });

  it('sin cuenta habilitada no se intenta cobrar', () => {
    expect(cobros).toMatch(/if\s*\(!estado\.disponible/);
    // Y el cobro no se da por bueno hasta que lo confirma la pasarela.
    expect(leer('lib/hospitality/booking-engine.ts')).not.toContain('estado: \'pagado\'');
  });

  it('hay un único webhook de la pasarela: el de la plataforma, con su firma', () => {
    const webhook = leer('app/api/webhooks/stripe/route.ts');
    expect(webhook).toContain('hospitalityReservationId');
    expect(webhook).toContain('registrarCobroConfirmado');
    expect(webhook).toContain('constructEvent');

    const rutas = [
      'app/api/webhooks/stripe/route.ts',
      'app/api/webhooks/stripe-hospitality/route.ts',
      'app/api/public/booking/stripe-webhook/route.ts',
    ];
    const existentes = rutas.filter((r) => fs.existsSync(path.join(RAIZ, r)));
    expect(existentes, 'el cobro debe verificar la firma en un solo endpoint').toEqual([
      'app/api/webhooks/stripe/route.ts',
    ]);
  });
});

describe('la sección existe y se puede llegar a ella', () => {
  it('la página de configuración está en el menú de Hospitality', () => {
    const navegacion = leer('lib/navigation-config.ts');
    expect(navegacion).toContain("'/dashboard/hospitality/booking-engine'");
    expect(fs.existsSync(path.join(RAIZ, 'app/dashboard/hospitality/booking-engine/page.tsx'))).toBe(true);
  });

  it('la página pública y el widget existen en rutas top-level', () => {
    for (const ruta of ['app/reservar/[slug]/page.tsx', 'app/embed/reservar/[slug]/page.tsx']) {
      expect(fs.existsSync(path.join(RAIZ, ruta)), `falta ${ruta}`).toBe(true);
    }
    // Sin estar en TOP_LEVEL, el middleware la tomaría por el slug de un tenant y
    // la redirigiría a /p/...: la página no estaría donde el tenant la publica.
    expect(leer('lib/legacy-redirects.ts')).toMatch(/TOP_LEVEL[\s\S]*'reservar'/);
  });

  it('la confirmación se enseña solo a quien tiene el enlace firmado', () => {
    const confirmacion = leer('app/reservar/[slug]/confirmacion/[token]/page.tsx');
    expect(confirmacion).toContain('verificarTokenReserva');
    expect(confirmacion).not.toContain('require(');
  });
});
