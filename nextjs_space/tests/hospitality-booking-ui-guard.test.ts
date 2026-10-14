// @vitest-environment node
//
// Guardia de UI, menú y plan de la FASE 3.D (Booking Engine).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');

function leer(relativo: string): string {
  const contenido = fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
  expect(contenido.length, `El archivo ${relativo} está vacío`).toBeGreaterThan(0);
  return contenido;
}

describe('Página pública de reserva', () => {
  // El asistente es el motor de la página: la página única (`/reservar/<slug>`)
  // monta la plantilla y él lleva el flujo. La antigua `/booking/<id>` solo
  // redirige, así que aquí se vigila el asistente.
  const fuente = leer('components/hospitality/booking/BookingWizard.tsx');
  const i18n = leer('lib/hospitality/booking-i18n.ts');

  it('implementa el flujo del plan: fechas → disponibilidad → datos → confirmación', () => {
    // Los textos del flujo viven en el diccionario ES/EN, no en el componente.
    for (const texto of ['verDisponibilidad', 'confirmarReserva', 'reservaConfirmada']) {
      expect(i18n).toContain(`${texto}:`);
      expect(fuente).toContain(`t.${texto}`);
    }
    expect(fuente).toContain("from '@/lib/hospitality/booking-i18n'");
  });

  it('el enlace antiguo de reserva ya no es una página: redirige a la única', () => {
    const antiguo = leer('app/booking/[slug]/page.tsx');
    expect(antiguo).toContain('permanentRedirect');
    expect(antiguo).toContain('/reservar/');
    expect(antiguo).not.toContain('BookingWizard');
  });

  it('i18n: los dos idiomas existen y el español es el defecto', () => {
    expect(i18n).toContain("IDIOMAS = ['es', 'en'] as const");
    expect(i18n).toContain("IDIOMA_POR_DEFECTO: Idioma = 'es'");
    // Record<Idioma, ...> tipado: es y en con las mismas claves.
    expect(i18n).toContain('Record<Idioma, BookingTextos>');
  });

  it('consume la API pública del booking (sin sesión de dashboard)', () => {
    expect(fuente).toContain('/api/public/booking/');
    expect(fuente).not.toContain('/api/hospitality/');
  });

  it('lleva al pago cuando la reserva abre una sesión (Stripe Connect)', () => {
    // El asistente no cobra: si la respuesta trae URL de pago, navega a la
    // pasarela del hotel; si no, enseña la confirmación.
    expect(fuente).toContain('pagoUrl');
    expect(leer('app/api/public/booking/[slug]/reservar/route.ts')).toContain('crearSesionDePago');
  });

  it('la variante embed es una ruta propia del widget (iframe del dashboard)', () => {
    const config = leer('app/dashboard/hospitality/booking-engine/page.tsx');
    expect(config).toContain('codigoEmbedBooking');
    // El módulo puro de URLs (sin BD: lo usa el panel, que es de cliente).
    expect(leer('lib/hospitality/booking-urls.ts')).toContain('/embed/reservar/');
    expect(fs.existsSync(path.join(RAIZ, 'app/embed/reservar/[slug]/page.tsx'))).toBe(true);
  });
});

describe('Sección Booking Engine del dashboard', () => {
  const fuente = leer('app/dashboard/hospitality/booking-engine/page.tsx');

  it('lista propiedades publicadas con enlace público y embed copiable', () => {
    expect(fuente).toContain('Enlace público');
    expect(fuente).toContain('Embed para tu web');
    expect(fuente).toContain('Publicada');
  });

  it('explica que la reserva entra como "Directa" y cobra a la cuenta del tenant', () => {
    expect(fuente).toContain('Directa');
    expect(fuente).toContain('tu cuenta de Stripe');
  });

  it('ofrece el enlace público en inglés (?lang=en) además del español', () => {
    expect(fuente).toContain('enlacePublicoEn');
    expect(fuente).toContain('Enlace público de reserva (inglés)');
  });

  it('publica por la MISMA lista que lee la página (interruptor por propiedad)', () => {
    // El enlace público sin publicar no sirve de nada: la publicación se manda
    // como lista —la que consume `listarPropiedadesPublicables`— y el estado que
    // el panel enseña sale de esa config, no del estado de la propiedad (dos
    // criterios distintos de «publicada» es cómo se vaciaba la página pública).
    expect(fuente).toContain('propiedadesPublicadas');
    expect(fuente).toContain('onCheckedChange={(v) => publicar(');
    expect(fuente).toContain('publicada: publicadasIds.includes');
  });
});

describe('Menú y plan', () => {
  it('Booking Engine es sección propia del menú (entre Tarifas y Finanzas, según la estructura)', () => {
    const nav = leer('lib/navigation-config.ts');
    const iTarifas = nav.indexOf("{ name: 'Tarifas'");
    const iBooking = nav.indexOf("{ name: 'Booking Engine'");
    const iFinanzas = nav.indexOf("{ name: 'Finanzas'");
    expect(iBooking).toBeGreaterThan(iTarifas);
    expect(iFinanzas).toBeGreaterThan(iBooking);
    expect(nav).toContain("'/dashboard/hospitality/booking-engine'");
  });

  it('las casillas de la FASE 3.D están completadas en el plan', () => {
    const plan = leer('docs/hospitality-booking-payments-plan.md');
    const fase = plan.split('### FASE 3.D')[1]?.split('### FASE 3.E')[0] || '';
    for (const casilla of [
      '- [x] Configuración:',
      '- [x] Previsualización de la experiencia de reserva.',
      '- [x] Reserva pública:',
      '- [x] Enlaces públicos y embeds.',
      '- [x] La reserva entra al flujo común',
    ]) {
      expect(fase).toContain(casilla);
    }
  });
});
