import { describe, it, expect } from 'vitest';
import { crmIntents } from '@/lib/agents/intents/crm-intents';
import { marketingIntents } from '@/lib/agents/intents/marketing-intents';
import { erpIntents } from '@/lib/agents/intents/erp-intents';
import { operationsIntents, ALL_INTENTS } from '@/lib/agents/intents/operations-intents';
import type { IntentSchema } from '@/lib/agents/intents/types';

// ─── Helpers ──────────────────────────────────────────────────────────────

function validateIntentSchema(intent: IntentSchema, name: string) {
  expect(intent).toHaveProperty('name');
  expect(typeof intent.name).toBe('string');
  expect(intent).toHaveProperty('description');
  expect(typeof intent.description).toBe('string');
  expect(intent).toHaveProperty('requiredParams');
  expect(Array.isArray(intent.requiredParams)).toBe(true);
  expect(intent).toHaveProperty('optionalParams');
  expect(Array.isArray(intent.optionalParams)).toBe(true);
  expect(intent).toHaveProperty('examples');
  expect(Array.isArray(intent.examples)).toBe(true);
  expect(intent).toHaveProperty('destructive');
  expect(typeof intent.destructive).toBe('boolean');
}

function namesOf(intents: IntentSchema[]) { return intents.map(i => i.name); }

// ─── CRM Intents ──────────────────────────────────────────────────────────

describe('crmIntents', () => {
  it('debe ser un array', () => {
    expect(Array.isArray(crmIntents)).toBe(true);
  });

  it('debe tener al menos 25 intents', () => {
    expect(crmIntents.length).toBeGreaterThanOrEqual(25);
  });

  it('todos los intents deben cumplir el schema', () => {
    crmIntents.forEach(intent => validateIntentSchema(intent, intent.name));
  });

  it('nombres únicos', () => {
    const names = namesOf(crmIntents);
    expect(new Set(names).size).toBe(names.length);
  });

  // ── Contactos & Leads ──
  it('debe incluir crear_lead', () => {
    const i = crmIntents.find(x => x.name === 'crear_lead')!;
    expect(i.requiredParams).toContain('nombre');
    expect(i.requiredParams).toContain('email');
    expect(i.destructive).toBe(false);
  });

  it('debe incluir buscar_lead (sin requiredParams)', () => {
    const i = crmIntents.find(x => x.name === 'buscar_lead')!;
    expect(i.requiredParams).toEqual([]);
    expect(i.optionalParams).toContain('email');
    expect(i.optionalParams).toContain('nombre');
  });

  it('debe incluir actualizar_lead', () => {
    const i = crmIntents.find(x => x.name === 'actualizar_lead')!;
    expect(i.requiredParams).toEqual([]);
    expect(i.optionalParams.length).toBeGreaterThanOrEqual(3);
    expect(i.destructive).toBe(false);
  });

  it('debe incluir convertir_lead (destructive=false)', () => {
    const i = crmIntents.find(x => x.name === 'convertir_lead')!;
    expect(i.requiredParams).toContain('email');
  });

  it('debe incluir obtener_telefono', () => {
    const i = crmIntents.find(x => x.name === 'obtener_telefono')!;
    expect(i.requiredParams).toContain('nombre');
  });

  it('debe incluir registrar_interaccion', () => {
    const i = crmIntents.find(x => x.name === 'registrar_interaccion')!;
    expect(i.requiredParams).toContain('tipo');
    expect(i.requiredParams).toContain('contenido');
  });

  it('debe incluir diagnosticos_lead', () => {
    const i = crmIntents.find(x => x.name === 'diagnosticos_lead')!;
    expect(i.requiredParams).toEqual([]);
  });

  // ── Citas / Bookings ──
  it('debe incluir agendar_cita con fecha+hora+nombre (email opcional: auto-registro)', () => {
    const i = crmIntents.find(x => x.name === 'agendar_cita')!;
    expect(i.requiredParams).toContain('fecha');
    expect(i.requiredParams).toContain('hora');
    // El clasificador solo exige fecha+hora; el wrapper resuelve nombre|email
    // y auto-registra el lead con email sintético si no está en el CRM.
    expect(i.requiredParams).toEqual(['fecha', 'hora']);
    expect(i.requiredParams).not.toContain('email');
    expect(i.optionalParams).toContain('email');
    expect(i.optionalParams).toContain('nombre');
    expect(i.optionalParams).toContain('telefono');
  });

  it('debe incluir mis_citas', () => {
    const i = crmIntents.find(x => x.name === 'mis_citas')!;
    expect(i.requiredParams).toEqual([]);
  });

  it('cancelar_cita debe ser destructive=false (cancelar ≠ borrar)', () => {
    const i = crmIntents.find(x => x.name === 'cancelar_cita')!;
    expect(i.destructive).toBe(false);
    expect(i.requiredParams).toContain('nombre');
  });

  it('reagendar_cita debe ser destructive=false (cancelar ≠ borrar)', () => {
    const i = crmIntents.find(x => x.name === 'reagendar_cita')!;
    expect(i.destructive).toBe(false);
  });

  it('debe incluir confirmar_cita', () => {
    const i = crmIntents.find(x => x.name === 'confirmar_cita')!;
    expect(i.requiredParams).toContain('citaId');
    expect(i.destructive).toBe(false);
  });

  it('debe incluir auto_agendar', () => {
    const i = crmIntents.find(x => x.name === 'auto_agendar')!;
    expect(i.requiredParams).toContain('email');
  });

  // ── Conversaciones & Mensajes ──
  it('debe incluir enviar_mensaje (mensaje requerido; email/nombre/canal opcionales)', () => {
    const i = crmIntents.find(x => x.name === 'enviar_mensaje')!;
    expect(i.requiredParams).toContain('mensaje');
    expect(i.optionalParams).toContain('email');
    expect(i.optionalParams).toContain('nombre');
    expect(i.optionalParams).toContain('canal');
  });

  it('debe incluir enviar_mensaje_interno', () => {
    const i = crmIntents.find(x => x.name === 'enviar_mensaje_interno')!;
    expect(i.requiredParams).toContain('to');
    expect(i.requiredParams).toContain('message');
  });

  it('debe incluir crear_conversacion', () => {
    const i = crmIntents.find(x => x.name === 'crear_conversacion')!;
    expect(i.requiredParams).toContain('email');
  });

  it('debe incluir cerrar_conversacion', () => {
    const i = crmIntents.find(x => x.name === 'cerrar_conversacion')!;
    expect(i.requiredParams).toContain('email');
  });

  // ── Tareas ──
  it('debe incluir crear_tarea', () => {
    const i = crmIntents.find(x => x.name === 'crear_tarea')!;
    expect(i.requiredParams).toContain('titulo');
  });

  it('debe incluir completar_tarea', () => {
    const i = crmIntents.find(x => x.name === 'completar_tarea')!;
    expect(i.requiredParams).toContain('titulo');
  });

  it('debe incluir mis_tareas', () => {
    const i = crmIntents.find(x => x.name === 'mis_tareas')!;
    expect(i.requiredParams).toEqual([]);
  });

  // ── Notas ──
  it('debe incluir crear_nota con contenido (email opcional: el wrapper resuelve por nombre)', () => {
    const i = crmIntents.find(x => x.name === 'crear_nota')!;
    expect(i.requiredParams).toContain('contenido');
    expect(i.requiredParams).not.toContain('email');
    expect(i.optionalParams).toContain('email');
    expect(i.optionalParams).toContain('nombre');
  });

  it('debe incluir ver_notas (email opcional)', () => {
    const i = crmIntents.find(x => x.name === 'ver_notas')!;
    expect(i.requiredParams).toEqual([]);
    expect(i.optionalParams).toContain('email');
    expect(i.optionalParams).toContain('nombre');
  });

  // ── Deals / Pipeline ──
  it('debe incluir crear_negocio', () => {
    const i = crmIntents.find(x => x.name === 'crear_negocio')!;
    expect(i.requiredParams).toContain('email');
    expect(i.requiredParams).toContain('titulo');
  });

  it('debe incluir actualizar_negocio', () => {
    const i = crmIntents.find(x => x.name === 'actualizar_negocio')!;
    expect(i.requiredParams).toContain('email');
  });

  it('debe incluir mis_negocios', () => {
    const i = crmIntents.find(x => x.name === 'mis_negocios')!;
    expect(i.requiredParams).toEqual([]);
  });

  it('debe incluir calificar_lead', () => {
    const i = crmIntents.find(x => x.name === 'calificar_lead')!;
    expect(i.requiredParams).toContain('email');
  });

  // ── Edge: cancelar/reagendar dejan rastro, no son destructivos ──
  it('ningún intent de citas debe ser destructive (cancelar ≠ borrar)', () => {
    const destructive = crmIntents.filter(i => i.destructive).map(i => i.name);
    expect(destructive).toEqual([]);
  });
});

// ─── Marketing Intents ────────────────────────────────────────────────────

describe('marketingIntents', () => {
  it('debe ser un array', () => {
    expect(Array.isArray(marketingIntents)).toBe(true);
  });

  it('debe tener 14 intents (3 base + web creator + SEO + automatización + ADS schedules + toggle programación + A/B tests)', () => {
    expect(marketingIntents.length).toBe(14);
  });

  it('todos deben cumplir el schema', () => {
    marketingIntents.forEach(i => validateIntentSchema(i, i.name));
  });

  it('nombres únicos', () => {
    const names = namesOf(marketingIntents);
    expect(new Set(names).size).toBe(names.length);
  });

  it('debe incluir generar_copy con tema required', () => {
    const i = marketingIntents.find(x => x.name === 'generar_copy')!;
    expect(i.requiredParams).toContain('tema');
    expect(i.optionalParams).toContain('tono');
  });

  it('debe incluir analizar_sentimiento', () => {
    const i = marketingIntents.find(x => x.name === 'analizar_sentimiento')!;
    expect(i.requiredParams).toContain('texto');
  });

  it('debe incluir sugerir_campania sin requiredParams', () => {
    const i = marketingIntents.find(x => x.name === 'sugerir_campania')!;
    expect(i.requiredParams).toEqual([]);
  });

  it('solo eliminar_horario y declarar_ganador deben ser destructive', () => {
    const destructive = marketingIntents.filter(i => i.destructive).map(i => i.name);
    expect(destructive).toEqual(['eliminar_horario', 'declarar_ganador']);
  });
});

// ─── ERP Intents ──────────────────────────────────────────────────────────

describe('erpIntents', () => {
  it('debe ser un array', () => {
    expect(Array.isArray(erpIntents)).toBe(true);
  });

  it('debe tener al menos 8 intents', () => {
    expect(erpIntents.length).toBeGreaterThanOrEqual(8);
  });

  it('todos deben cumplir el schema', () => {
    erpIntents.forEach(i => validateIntentSchema(i, i.name));
  });

  it('nombres únicos', () => {
    const names = namesOf(erpIntents);
    expect(new Set(names).size).toBe(names.length);
  });

  it('debe incluir salud_inventario', () => {
    const i = erpIntents.find(x => x.name === 'salud_inventario')!;
    expect(i.requiredParams).toEqual([]);
  });

  it('ajustar_stock debe ser destructive=true', () => {
    const i = erpIntents.find(x => x.name === 'ajustar_stock')!;
    expect(i.destructive).toBe(true);
    expect(i.requiredParams).toContain('producto');
    expect(i.requiredParams).toContain('cantidad');
  });

  it('debe incluir buscar_producto', () => {
    const i = erpIntents.find(x => x.name === 'buscar_producto')!;
    expect(i.requiredParams).toEqual([]);
  });

  it('debe incluir gestionar_catalogo', () => {
    const i = erpIntents.find(x => x.name === 'gestionar_catalogo')!;
    expect(i.requiredParams).toEqual([]);
  });

  it('debe incluir calcular_costo_produccion', () => {
    const i = erpIntents.find(x => x.name === 'calcular_costo_produccion')!;
    expect(i.requiredParams).toContain('productoId');
  });

  it('debe incluir detectar_anomalias_calidad', () => {
    const i = erpIntents.find(x => x.name === 'detectar_anomalias_calidad')!;
    expect(i.requiredParams).toEqual([]);
  });

  it('debe incluir rentabilidad_proyecto', () => {
    const i = erpIntents.find(x => x.name === 'rentabilidad_proyecto')!;
    expect(i.requiredParams).toContain('proyectoId');
  });

  it('debe incluir desviaciones_proyecto', () => {
    const i = erpIntents.find(x => x.name === 'desviaciones_proyecto')!;
    expect(i.requiredParams).toEqual([]);
  });

  it('solo ajustar_stock y consumir_inventario deben ser destructive (verificar_mermas es trazabilidad)', () => {
    const destructive = erpIntents.filter(i => i.destructive).map(i => i.name);
    expect(destructive).toEqual(['ajustar_stock', 'consumir_inventario']);
  });
});

// ─── Operations Intents ───────────────────────────────────────────────────

describe('operationsIntents', () => {
  it('debe ser un array de 4 intents', () => {
    expect(Array.isArray(operationsIntents)).toBe(true);
    expect(operationsIntents.length).toBe(4);
  });

  it('debe incluir auditar_integridad', () => {
    const i = operationsIntents.find(x => x.name === 'auditar_integridad')!;
    expect(i.requiredParams).toEqual([]);
    expect(i.destructive).toBe(false);
  });

  it('debe incluir consulta_general', () => {
    const i = operationsIntents.find(x => x.name === 'consulta_general')!;
    expect(i.requiredParams).toEqual([]);
    expect(i.destructive).toBe(false);
  });
});

// ─── ALL_INTENTS ──────────────────────────────────────────────────────────

describe('ALL_INTENTS', () => {
  it('debe ser un array que contiene todos los intents', () => {
    const expectedMin = crmIntents.length + marketingIntents.length + erpIntents.length + 3 /*hrIntents*/ + 8 /*financeIntents*/ + operationsIntents.length;
    expect(ALL_INTENTS.length).toBeGreaterThanOrEqual(expectedMin);
  });

  it('todos los intents de ALL_INTENTS deben cumplir el schema', () => {
    ALL_INTENTS.forEach(i => validateIntentSchema(i, i.name));
  });

  it('nombres únicos en ALL_INTENTS', () => {
    const names = namesOf(ALL_INTENTS);
    expect(new Set(names).size).toBe(names.length);
  });

  it('debe contener intents de CRM', () => {
    const allNames = namesOf(ALL_INTENTS);
    expect(allNames).toContain('crear_lead');
    expect(allNames).toContain('buscar_lead');
    expect(allNames).toContain('agendar_cita');
    expect(allNames).toContain('crear_negocio');
  });

  it('debe contener intents de Marketing', () => {
    const allNames = namesOf(ALL_INTENTS);
    expect(allNames).toContain('generar_copy');
    expect(allNames).toContain('analizar_sentimiento');
    expect(allNames).toContain('sugerir_campania');
  });

  it('debe contener intents de ERP', () => {
    const allNames = namesOf(ALL_INTENTS);
    expect(allNames).toContain('salud_inventario');
    expect(allNames).toContain('rentabilidad_proyecto');
  });

  it('debe contener intents de HR y Finance', () => {
    const allNames = namesOf(ALL_INTENTS);
    expect(allNames).toContain('resumen_rrhh');
    expect(allNames).toContain('crear_factura');
  });

  it('debe contener operationsIntents', () => {
    const allNames = namesOf(ALL_INTENTS);
    expect(allNames).toContain('consulta_general');
    expect(allNames).toContain('auditar_integridad');
  });

  it('ALL_INTENTS debe contener intents de todos los dominios (CRM + Marketing + ERP + HR + Finance + Ops)', () => {
    const allNames = namesOf(ALL_INTENTS);
    // Verificar presencia de al menos un intent de cada dominio
    const crmInAll = crmIntents.every(ci => allNames.includes(ci.name));
    const mktInAll = marketingIntents.every(mi => allNames.includes(mi.name));
    const erpInAll = erpIntents.every(ei => allNames.includes(ei.name));
    const opsInAll = operationsIntents.every(oi => allNames.includes(oi.name));
    expect(crmInAll).toBe(true);
    expect(mktInAll).toBe(true);
    expect(erpInAll).toBe(true);
    expect(opsInAll).toBe(true);
  });
});
