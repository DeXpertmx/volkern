import { describe, it, expect } from 'vitest';
import {
  VINCULO_PENDIENTE_REVISION,
  ESTADOS_VINCULO_TRABAJABLES,
  ORIGEN_VINCULO_WEBHOOK,
  MOTIVO_PENDIENTE_DOTACION,
  vinculoTrabajable,
  vinculoPendienteDeRevision,
  estadoDeVinculoAutomatico,
} from '@/lib/hospitality/vinculo-revision';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');

describe('vinculo-revision — estados y guardas', () => {
  it('el estado pendiente viaja junto con el activo en las entradas', () => {
    expect(ESTADOS_VINCULO_TRABAJABLES).toEqual(['activo', 'pendiente_revision']);
    expect(vinculoTrabajable('activo')).toBe(true);
    expect(vinculoPendienteDeRevision('pendiente_revision')).toBe(true);
    // `inactivo` y `deshecho` no importan: es lo que el operador apagó.
    expect(vinculoTrabajable('inactivo')).toBe(false);
    expect(vinculoTrabajable(null)).toBe(false);
    expect(vinculoTrabajable(undefined)).toBe(false);
  });

  it('la cadena real del estado es estable (schema String libre: nada la reescribe)', () => {
    expect(VINCULO_PENDIENTE_REVISION).toBe('pendiente_revision');
    expect(ORIGEN_VINCULO_WEBHOOK).toBe('vinculacion_automatica_webhook');
    // El listing de pendientes del wizard y las lecturas de entrada comparan
    // esa cadena a pelo: cambiarla rompería el peaje en silencio.
    expect(typeof VINCULO_PENDIENTE_REVISION).toBe('string');
  });

  it('un vínculo automático por WEBHOOK nace pendiente de revisión', () => {
    expect(estadoDeVinculoAutomatico({ origen: 'vinculacion_automatica_webhook' })).toBe(
      'pendiente_revision'
    );
    expect(estadoDeVinculoAutomatico({ origen: 'vinculacion_automatica_webhook', motivo: 'x' })).toBe(
      'pendiente_revision'
    );
  });

  it('un vínculo creado por el operador (manual, propuesta del wizard) sigue activo', () => {
    // metadataConfirmado del guardado del wizard:
    expect(estadoDeVinculoAutomatico({ origen: 'manual', confirmadoPor: 'u1' })).toBe('activo');
    // La propuesta aplicada SIN webhook es una acción de operador del panel:
    expect(estadoDeVinculoAutomatico({ origen: 'vinculacion_automatica' })).toBe('activo');
  });

  it('sin metadata (mappings históricos) sigue naciendo activo', () => {
    expect(estadoDeVinculoAutomatico(null)).toBe('activo');
    expect(estadoDeVinculoAutomatico(undefined)).toBe('activo');
    expect(estadoDeVinculoAutomatico({})).toBe('activo');
  });

  it('el mensaje del peaje es de operador: explica qué pasa y quié lo resuelve', () => {
    expect(MOTIVO_PENDIENTE_DOTACION).toContain('no publica');
    expect(MOTIVO_PENDIENTE_DOTACION).toContain('revis');
  });
});

// Guardias de fuente: las obligaciones del operador viven en varios archivos;
// si alguien revierte el criterio en uno solo, el test lo señala.
describe('vinculo-revision — guardias de fuente', () => {
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

  it('las SALIDAS (push) siguen filtrando solo lo activo', () => {
    const sync = leer('lib/hospitality/sync.ts');
    // La consulta de mappings que empuja inventario/rates.
    expect(sync).toContain("where: { provider: 'channel_connectivity', estado: 'activo' }");
    // Ninguna lectura de salida incluyó el pendiente por accidente.
    expect(sync).not.toContain('pendiente_revision');

    const availability = leer('lib/hospitality/availability.ts');
    expect(availability).not.toContain('pendiente_revision');
  });

  it('las ENTRADAS aceptan el pendiente (webhook, mensajes, reconciliación)', () => {
    const reservas = leer('lib/hospitality/reservations.ts');
    expect(reservas).toContain("estado: { in: ['activo', VINCULO_PENDIENTE_REVISION] }");

    const mensajes = leer('lib/hospitality/mensajes-service.ts');
    expect(mensajes).toContain("estado: { in: ['activo', VINCULO_PENDIENTE_REVISION] }");

    const reconciliation = leer('lib/hospitality/reconciliation.ts');
    expect(reconciliation).toContain(
      "estado: { in: ['activo', VINCULO_PENDIENTE_REVISION] }"
    );

    const incidencias = leer('lib/hospitality/incidencias.ts');
    // El creador del vínculo automático usa la regla del módulo puro:
    expect(incidencias).toContain('estadoDeVinculoAutomatico');
    // y las lecturas de entrada comparten la guarda.
    expect(incidencias).toContain("ESTADOS_ENTRADA = { in: ['activo', VINCULO_PENDIENTE_REVISION]");
  });

  it('el guardado del wizard convierte el pendiente en revisado (metadata manual)', () => {
    const route = leer('app/api/hospitality/onboarding/mapping/route.ts');
    expect(route).toContain('meta'.concat('dataConfirmado'));
    // El upsert del guardado sale activo con metadataConfirmado (ES la revisión).
    expect(route).toContain("estado: 'activo'");
    expect(route).toContain('metadata: metadataConfirmado');
    // Los pendientes de la unidad se apagan al reasignar:
    expect(route).toContain("estado: { in: ['activo', VINCULO_PENDIENTE_REVISION] }");
  });
});
