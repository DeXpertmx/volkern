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

// Solo las rutas del flujo VIGENTE: la página pública es una (`/reservar/<slug>`)
// y su API también. La antigua `/api/public/booking/[slug]` se retiró al unificar
// las dos páginas — dejarla sería una segunda forma de reservar, con su propio
// criterio de publicación.
const RUTAS_PUBLICAS = [
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

describe('solo hay una página pública de reserva', () => {
  it('el enlace antiguo redirige a la página única y no sirve su propia versión', () => {
    const antiguo = leer('app/booking/[slug]/page.tsx');
    // Redirección permanente (308): los enlaces que los hoteles ya repartieron y
    // el buscador se quedan con la dirección buena.
    expect(antiguo).toContain('permanentRedirect');
    expect(antiguo).toContain('propiedadesPublicadas');
    expect(antiguo).not.toContain('estado: \'conectada\'');
    // Sin formulario ni API propios: no puede haber dos criterios de publicación.
    expect(antiguo).not.toContain('/api/public/booking/');
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

describe('el desglose noche a noche (estancia en temporada)', () => {
  it('las dos superficies públicas lo reciben del servidor, no lo calculan', () => {
    // El asistente: la ruta que cotiza lo expone tal cual lo sumó el motor.
    expect(leer('app/api/public/booking/[slug]/cotizar/route.ts')).toContain(
      'desgloseNoches: u.desgloseNoches'
    );
    // La página pública: el desglose viaja con la cotización del motor hasta el
    // asistente, que es quien lo enseña.
    expect(leer('components/hospitality/booking/BookingWizard.tsx')).toContain('desgloseNoches');
    // El enlace antiguo ya no pinta ninguna página: solo redirige (308) a la
    // página única, así que no hay una segunda superficie que pueda cotizar
    // distinto.
    const enlaceAntiguo = leer('app/booking/[slug]/page.tsx');
    expect(enlaceAntiguo).toContain('permanentRedirect');
    expect(enlaceAntiguo).not.toContain('desgloseNoches');
  });

  it('la reserva cotiza con la estacionalidad del plan, no con la tarifa plana', () => {
    // Cotizar y reservar con el MISMO plan: si una añadiera las temporadas y la
    // otra no, la página y la reserva dirían precios distintos. Ahora hay un solo
    // motor, así que la comprobación es una: el motor público pasa la
    // estacionalidad del plan a la tarificación.
    const motor = leer('lib/hospitality/booking-engine.ts');
    expect(motor).toMatch(/estacionalidad:\s*plan \? plan\.temporadas/);
    // Y las reglas son las del módulo único de tarificación: nadie suma a mano.
    expect(leer('lib/hospitality/booking-rates.ts')).toContain("from './pricing'");
  });

  it('la fecha de cada noche se lee como día local (una fecha ISO no se corre un día)', () => {
    expect(leer('lib/hospitality/booking-i18n.ts')).toContain('fechaDeNoche');
    for (const superficie of ['components/hospitality/booking/BookingWizard.tsx']) {
      const codigo = leer(superficie);
      expect(codigo, `${superficie} no localiza la fecha de la noche`).toContain('fechaDeNoche');
      // `new Date('2026-09-25')` es medianoche UTC: en América se lee como el 24.
      expect(codigo, `${superficie} parsea la fecha de la noche en UTC`).not.toMatch(
        /new Date\(noche\.fecha\)/
      );
    }
  });
});

describe('la capa 2 (ajustes por demanda) es de la reserva directa', () => {
  it('el push a canales no conoce los ajustes: un calendario por fecha no sabe de antelación', () => {
    const sync = leer('lib/hospitality/sync.ts');
    expect(sync).not.toContain("from './ajustes'");
    // Ni los lee del plan para empujarlos: la tarifa que viaja es la publicada.
    expect(sync).not.toMatch(/\.ajustes\b/);
  });

  it('los dos motores públicos piden la capa 2 al plan y la tarifa al motor único', () => {
    for (const ruta of [
      'lib/hospitality/booking-engine.ts',
      'lib/hospitality/booking-rates.ts',
    ]) {
      expect(leer(ruta), `${ruta} no le pasa los ajustes a la tarificación`).toMatch(
        /ajustes:\s*/
      );
    }
    // Y la demanda la calcula el Availability Engine, no cada uno por su cuenta.
    expect(leer('lib/hospitality/availability.ts')).toContain('export function ocupacionPorNoche');
    for (const ruta of [
      'lib/hospitality/booking-engine.ts',
      'lib/hospitality/booking-rates.ts',
    ]) {
      expect(leer(ruta), `${ruta} no mide la demanda con el motor`).toContain('ocupacionPorNoche');
    }
  });

  it('la API de planes normaliza los ajustes antes de guardarlos (nunca guarda basura)', () => {
    for (const ruta of [
      'app/api/hospitality/rateplans/route.ts',
      'app/api/hospitality/rateplans/[id]/route.ts',
    ]) {
      const codigo = leer(ruta);
      expect(codigo, `${ruta} no normaliza los ajustes`).toContain('normalizarAjustes');
      expect(codigo, `${ruta} no rechaza ajustes inválidos`).toContain('pidenAjustes');
    }
  });
});
