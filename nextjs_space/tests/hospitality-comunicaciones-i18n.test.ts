// @vitest-environment node
//
// Guardias del i18n de las comunicaciones al huésped (plan maestro §21):
//
//   1. Las plantillas sugeridas existen en los DOS idiomas para los CINCO
//      eventos, con las mismas variables — y viven en el módulo único
//      (booking-i18n), no copiadas en la UI.
//   2. El módulo de comunicaciones resuelve el idioma desde guestData.idioma
//      (lo escribe la página pública) y selecciona la plantilla de ese idioma.
//   3. Fallback: si el hotel no tradujo la plantilla del idioma del huésped,
//      el huésped recibe la española — nunca se queda sin mensaje.
//   4. El contexto formatea fechas e importe al locale del idioma y el nombre
//      vacío cae a un respaldo legible ("Huésped"/"Guest").
//   5. La pre-llegada (y el check-in del día) llevan el enlace de check-in: es
//      lo que hace que el huésped suba los documentos de su grupo y el parte de
//      viajeros salga completo sin que nadie del hotel lo persiga.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const prisma = vi.hoisted(() => ({
  hospitalityCommunicationTemplate: { findMany: vi.fn() },
  hospitalityReservation: { findFirst: vi.fn(), update: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma }));

import {
  PLANTILLAS_SUGERIDAS,
  plantillaSugerida,
  COMUNICACION_EVENTOS_TRADUCIBLES,
  idiomaDeValor,
  fechaLarga,
  monedaFormateada,
  IDIOMA_POR_DEFECTO,
} from '@/lib/hospitality/booking-i18n';
import {
  buildContextoPlantilla,
  guestNombre,
  renderPlantilla,
  dispararComunicacionPorEvento,
  IDIOMAS_COMUNICACION,
} from '@/lib/hospitality/comunicaciones';

const RESERVA = {
  channel: 'Directa',
  externalBookingId: 'BE-123',
  estado: 'confirmed',
  checkIn: new Date('2026-10-16T15:00:00Z'),
  checkOut: new Date('2026-10-18T11:00:00Z'),
  amountAfterTax: 2400,
  currency: 'MXN',
  guestData: { firstName: 'Ana', email: 'ana@mail.com', idioma: 'en' },
};

describe('plantillas sugeridas bilingües (módulo único)', () => {
  it('los cinco eventos tienen plantilla en los dos idiomas, con asunto y contenido', () => {
    for (const evento of COMUNICACION_EVENTOS_TRADUCIBLES) {
      for (const idioma of IDIOMAS_COMUNICACION) {
        const p = plantillaSugerida(evento, idioma);
        expect(p, `${evento}/${idioma} sin plantilla`).toBeTruthy();
        expect(p!.contenido.length).toBeGreaterThan(0);
        expect(p!.asunto).toBeTruthy();
      }
    }
  });

  it('es y en comparten exactamente las mismas variables {{...}} por evento', () => {
    const variables = (texto: string) => [...texto.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join(',');
    for (const evento of COMUNICACION_EVENTOS_TRADUCIBLES) {
      expect(variables(PLANTILLAS_SUGERIDAS.en[evento].contenido)).toBe(
        variables(PLANTILLAS_SUGERIDAS.es[evento].contenido)
      );
      expect(variables(PLANTILLAS_SUGERIDAS.en[evento].asunto!)).toBe(
        variables(PLANTILLAS_SUGERIDAS.es[evento].asunto!)
      );
    }
  });

  it('la UI de Comunicaciones consume las sugeridas del módulo (sin copia local que se desincronice)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const ui = fs.readFileSync(path.resolve(__dirname, '../app/dashboard/hospitality/comunicaciones/page.tsx'), 'utf8');
    expect(ui).toContain("from '@/lib/hospitality/booking-i18n'");
    expect(ui).toContain('plantillaSugerida');
    // La copia local desapareció: si alguien la vuelve a meter, esta guardia avisa.
    expect(ui).not.toContain('const PLANTILLAS_SUGERIDAS');
    // El selector de idioma y su explicación están.
    expect(ui).toContain('cambiarIdioma');
    expect(ui).toContain('si no existe, la española');
    // El destinatario WhatsApp de prueba usa el selector de país + número E.164.
    expect(ui).toContain('<CampoTelefonoConPais');
    expect(ui).toContain('País del teléfono de prueba');
  });

  it('la página pública guarda el idioma en guestData y la comunicación lo lee', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const post = fs.readFileSync(path.resolve(__dirname, '../app/api/public/booking/[slug]/route.ts'), 'utf8');
    expect(post).toContain('idiomaDeValor(lang)');
    expect(post).toContain("evento: 'confirmacion'");
    const mod = fs.readFileSync(path.resolve(__dirname, '../lib/hospitality/comunicaciones.ts'), 'utf8');
    expect(mod).toContain("guestData || {})?.idioma");
  });
});

describe('el enlace de check-in viaja en el mensaje (registro de viajeros)', () => {
  beforeEach(() => {
    prisma.hospitalityCommunicationTemplate.findMany.mockReset();
    prisma.hospitalityReservation.update.mockReset();
    prisma.hospitalityReservation.update.mockResolvedValue({ id: 'r1' });
  });

  it('la pre-llegada lleva un enlace real, y el token se crea si la reserva no lo tenía', async () => {
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValueOnce([
      { id: 'tpl', canal: 'email', asunto: 'Tu llegada', contenido: 'Completa el registro: {{enlace_checkin}}', idioma: 'es' },
    ]);

    const enviados: string[] = [];
    const email = await import('@/lib/ses-email');
    vi.spyOn(email, 'sendEmail').mockImplementation(async (args: any) => {
      enviados.push(String(args.text));
      return { success: true } as any;
    });

    await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'pre_llegada',
      reserva: { ...RESERVA, id: 'r1', tokenCheckin: null, guestData: { firstName: 'Ana', email: 'ana@mail.com', idioma: 'es' } },
    });

    // El token se guarda en la reserva (una sola vez) y va en el enlace.
    const actualizado = prisma.hospitalityReservation.update.mock.calls[0]?.[0];
    const token = actualizado?.data?.tokenCheckin as string;
    expect(token).toBeTruthy();
    expect(enviados[0]).toContain(`/checkin/${token}?lang=es`);
    expect(enviados[0]).not.toContain('{{enlace_checkin}}');
  });

  it('si la reserva ya tenía token, se reutiliza (sin escribir en la base)', async () => {
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValueOnce([
      { id: 'tpl', canal: 'email', asunto: 'Your arrival', contenido: 'Registry: {{enlace_checkin}}', idioma: 'en' },
    ]);

    const enviados: string[] = [];
    const email = await import('@/lib/ses-email');
    vi.spyOn(email, 'sendEmail').mockImplementation(async (args: any) => {
      enviados.push(String(args.text));
      return { success: true } as any;
    });

    await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'check_in',
      reserva: { ...RESERVA, id: 'r1', tokenCheckin: 'TOKEN-FIJO' },
    });

    expect(prisma.hospitalityReservation.update).not.toHaveBeenCalled();
    expect(enviados[0]).toContain('/checkin/TOKEN-FIJO?lang=en');
  });
});

describe('resolución de idioma y fallback', () => {
  beforeEach(() => {
    prisma.hospitalityCommunicationTemplate.findMany.mockReset();
    prisma.hospitalityReservation.update.mockReset();
  });

  it('un huésped en inglés recibe la plantilla en inglés (idioma consultado en el where)', async () => {
    prisma.hospitalityCommunicationTemplate.findMany
      .mockResolvedValueOnce([{ id: 'tpl-en', canal: 'email', asunto: 'Your booking', contenido: 'Hi {{nombre}}!', idioma: 'en' }])
      .mockResolvedValueOnce([]);
    const resultados = await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'confirmacion',
      reserva: RESERVA,
    });
    // Primera consulta: idioma del huésped.
    expect(prisma.hospitalityCommunicationTemplate.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: 't1', evento: 'confirmacion', activo: true, idioma: 'en',
    });
    expect(resultados).toHaveLength(1);
    expect(resultados[0].templateId).toBe('tpl-en');
  });

  it('fallback: sin plantilla en el idioma del huésped, recibe la española (nunca se queda sin mensaje)', async () => {
    prisma.hospitalityCommunicationTemplate.findMany
      .mockResolvedValueOnce([]) // no hay en "en"
      .mockResolvedValueOnce([{ id: 'tpl-es', canal: 'email', asunto: 'Tu reserva', contenido: '¡Hola {{nombre}}!', idioma: 'es' }]);
    const resultados = await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'confirmacion',
      reserva: RESERVA,
    });
    expect(prisma.hospitalityCommunicationTemplate.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.hospitalityCommunicationTemplate.findMany.mock.calls[1][0].where.idioma).toBe(IDIOMA_POR_DEFECTO);
    expect(resultados[0].templateId).toBe('tpl-es');
  });

  it('un huésped sin idioma (OTA) consulta "es" directamente, sin segunda consulta', async () => {
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([]);
    await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'pre_llegada',
      reserva: { ...RESERVA, guestData: { firstName: 'Bob' } },
    });
    expect(prisma.hospitalityCommunicationTemplate.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.hospitalityCommunicationTemplate.findMany.mock.calls[0][0].where.idioma).toBe('es');
  });

  it('un guestData.idioma corrupto cae a español (nunca rompe el envío)', async () => {
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([]);
    await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'post_salida',
      reserva: { ...RESERVA, guestData: { firstName: 'Ana', idioma: 'fr' } },
    });
    expect(prisma.hospitalityCommunicationTemplate.findMany.mock.calls[0][0].where.idioma).toBe('es');
  });
});

describe('contexto bilingüe', () => {
  it('fechas e importe se formatean al locale del idioma', () => {
    const ctx = buildContextoPlantilla({ reserva: RESERVA, idioma: 'en' });
    // En-US: mes/día en inglés.
    expect(ctx.checkIn).toMatch(/Oct/i);
    expect(ctx.importe).toContain('$');
    const ctxEs = buildContextoPlantilla({ reserva: RESERVA, idioma: 'es' });
    expect(ctxEs.checkIn).toMatch(/octubre/i);
  });

  it('nombre ausente: respaldo "Guest"/"Huésped" según idioma (sin hueco en la frase)', () => {
    expect(guestNombre({}, 'en')).toBe('Guest');
    expect(guestNombre({}, 'es')).toBe('Huésped');
    // Sin idioma (lectura a secas) el contrato es el de siempre: cadena vacía.
    expect(guestNombre({}, undefined)).toBe('');
    expect(guestNombre({ firstName: 'Ana', lastName: 'García' }, 'en')).toBe('Ana García');
    expect(renderPlantilla('Hi {{nombre}}!', buildContextoPlantilla({ reserva: { guestData: {}, idioma: 'en' }, idioma: 'en' }))).toBe('Hi Guest!');
  });

  it('idiomaDeValor: normaliza y cae a español con lo desconocido', () => {
    expect(idiomaDeValor('EN')).toBe('en');
    expect(idiomaDeValor('fr')).toBe('es');
    expect(idiomaDeValor(null)).toBe('es');
    expect(idiomaDeValor({})).toBe('es');
  });

  it('fechaLarga y monedaFormateada soportan fecha corrupta y valor ausente', () => {
    expect(fechaLarga(null, 'en')).toBe('');
    expect(monedaFormateada(null, 'MXN', 'en')).toBe('');
    expect(monedaFormateada(2400, null, 'en')).toContain('$');
  });
});
