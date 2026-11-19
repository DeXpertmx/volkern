/**
 * P6 — Salida estructurada del agente.
 *
 * El contrato que pinta el chat ya no es texto libre: cada ejecución se
 * convierte en una acción con estado, las entidades en tarjeta y los listados
 * en tabla. Aquí se fija ese mapeo y que el agente lo devuelve aunque el
 * modelo sólo aporte el resumen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  construirSalidaEstructurada,
  resumenDeTexto,
} from '@/lib/agents/salida-estructurada';

describe('resumen de una línea', () => {
  it('colapsa saltos y espacios y acota la longitud', () => {
    const texto = 'Listo:\n- Nota guardada\n- Tarea creada para el jueves\n';
    expect(resumenDeTexto(texto)).toBe('Listo: - Nota guardada - Tarea creada para el jueves');
  });

  it('un texto largo se corta con puntos suspensivos', () => {
    const resumen = resumenDeTexto('a'.repeat(400));
    expect(resumen.length).toBeLessThanOrEqual(281);
    expect(String(resumen).endsWith('…')).toBe(true);
  });
});

describe('mapeo a acciones', () => {
  it('una escritura ok lleva etiqueta, entidad, id y tarjeta de contacto', () => {
    const { acciones } = construirSalidaEstructurada(
      [{ tool: 'crear_lead', estado: 'ok', resultado: { ok: true, id: 'l1', nombre: 'Ana Propia', email: 'ana@a.test' } }],
      'Ficha creada'
    );

    expect(acciones).toHaveLength(1);
    const accion = acciones[0];
    expect(accion.etiqueta).toBe('Ficha creada');
    expect(accion.estado).toBe('ok');
    expect(accion.id).toBe('l1');
    expect(accion.tarjeta?.titulo).toBe('Ana Propia');
    expect(accion.tarjeta?.subtitulo).toBe('ana@a.test');
  });

  it('una denegada y un error se distinguen y no llevan tarjeta', () => {
    const { acciones } = construirSalidaEstructurada(
      [
        { tool: 'crear_nota', estado: 'denegado', error: 'sin permiso' },
        { tool: 'crear_tarea', estado: 'error', error: 'falló la fecha' },
      ],
      ''
    );

    expect(acciones[0]).toMatchObject({ estado: 'denegado', error: 'sin permiso' });
    expect(acciones[0].tarjeta).toBeUndefined();
    expect(acciones[1]).toMatchObject({ estado: 'error', error: 'falló la fecha' });
  });

  it('marca una acción idempotente sin repetir la escritura', () => {
    const { acciones } = construirSalidaEstructurada(
      [{ tool: 'crear_nota', estado: 'ok', idempotente: true, resultado: { ok: true, id: 'n1' } }],
      ''
    );

    expect(acciones[0].idempotente).toBe(true);
    expect(acciones[0].detalle).toBe('Nota guardada en la ficha');
  });
});

describe('mapeo a tablas', () => {
  it('los inmuebles se normalizan con columnas fijas', () => {
    const { datos } = construirSalidaEstructurada(
      [
        {
          tool: 'buscar_propiedades',
          estado: 'ok',
          resultado: {
            propiedades: [{ id: 'p1', nombre: 'Piso Sol', precio: 250000, zona: 'Madrid', habitaciones: 3, terraza: true }],
          },
        },
      ],
      ''
    );

    expect(datos).toHaveLength(1);
    expect(datos[0].tipo).toBe('propiedades');
    expect(datos[0].total).toBe(1);
    expect(datos[0].columnas.map((c) => c.clave)).toEqual(['nombre', 'precio', 'zona', 'habitaciones', 'terraza']);
    expect(datos[0].filas[0]).toMatchObject({ nombre: 'Piso Sol', zona: 'Madrid', terraza: 'Sí' });
  });

  it('varios candidatos de persona se convierten en tabla de leads', () => {
    const { datos } = construirSalidaEstructurada(
      [
        {
          tool: 'buscar_persona',
          estado: 'ok',
          resultado: {
            candidatos: [
              { id: 'l1', nombre: 'Ana', email: 'ana@a.test' },
              { id: 'l2', nombre: 'Ana Pérez', email: 'ana.p@a.test' },
            ],
          },
        },
      ],
      ''
    );

    expect(datos).toHaveLength(1);
    expect(datos[0].tipo).toBe('leads');
    expect(datos[0].total).toBe(2);
  });

  it('un listado vacío no produce tabla', () => {
    const { datos } = construirSalidaEstructurada(
      [{ tool: 'get_pending_tasks', estado: 'ok', resultado: { tareas: [] } }],
      ''
    );

    expect(datos).toHaveLength(0);
  });
});

// ─── Integración: el agente devuelve la estructura con lo que ejecutó ───────

import { reiniciarPrisma, prismaActual } from '../ayuda/prisma-en-memoria';

const h = vi.hoisted(() => ({
  guion: [] as Array<{ nombre: string; args: Record<string, any> }>,
}));

vi.mock('@/lib/db', async () => {
  const { prismaActual } = await import('../ayuda/prisma-en-memoria');
  const delegado = new Proxy({}, { get: (_t, prop: string) => (prismaActual.prisma as any)[prop] });
  return { prisma: delegado, default: delegado, globalPrisma: delegado, getTenantDb: async () => delegado };
});

vi.mock('@/lib/assistant/openrouter-client', () => ({
  callAssistantWithToolLoop: async (
    _mensajes: unknown,
    _herramientas: unknown,
    ejecutar: (nombre: string, args: Record<string, any>) => Promise<string>
  ) => {
    for (const paso of h.guion) await ejecutar(paso.nombre, paso.args);
    return { choices: [{ message: { content: 'Resumen del turno' } }] };
  },
}));

const TENANT = 'tenant-a';
const ROL_COMERCIAL = { id: 'r-comercial', nombre: 'Comercial', permisos: { leads: { ver: true, crear: true, editar: true } } };
const ROL_LECTURA = { id: 'r-lectura', nombre: 'Lectura', permisos: { leads: { ver: true } } };

function sembrar() {
  reiniciarPrisma({
    tenant: [{ id: TENANT, nombre: 'Inmobiliaria A' }],
    user: [
      { id: 'u-comercial', tenantId: TENANT, name: 'Carla', role: ROL_COMERCIAL },
      { id: 'u-lectura', tenantId: TENANT, name: 'Lola', role: ROL_LECTURA },
    ],
    lead: [{ id: 'lead-a', tenantId: TENANT, nombre: 'Ana Propia', email: 'ana@a.test' }],
    note: [],
    task: [],
    interaction: [],
    contact: [],
    mcpToolCapability: [],
    idempotencyRecord: [],
    toolExecution: [],
  });
}

async function pedir(userId: string, pasos: Array<{ nombre: string; args: Record<string, any> }>) {
  h.guion.length = 0;
  h.guion.push(...pasos);
  const { ejecutarAgenteCrm } = await import('@/lib/agents/crm-tool-agent');
  return ejecutarAgenteCrm({ message: 'prueba P6', tenantId: TENANT, userId, conversationId: 'conv-1' });
}

beforeEach(() => {
  sembrar();
  h.guion.length = 0;
});

describe('el agente devuelve la estructura', () => {
  it('una escritura ok queda como acción con su detalle', async () => {
    const resultado = await pedir('u-comercial', [
      { nombre: 'crear_nota', args: { nombre: 'Ana Propia', contenido: 'seguimiento' } },
    ]);

    expect(resultado.estructura.resumen).toBe('Resumen del turno');
    expect(resultado.estructura.acciones).toHaveLength(1);
    expect(resultado.estructura.acciones[0]).toMatchObject({
      tool: 'crear_nota',
      estado: 'ok',
      etiqueta: 'Nota guardada',
    });
    expect(prismaActual.tablas.note).toHaveLength(1);
  });

  it('una herramienta denegada queda como acción denegada', async () => {
    const resultado = await pedir('u-lectura', [
      { nombre: 'crear_nota', args: { nombre: 'Ana Propia', contenido: 'no debería' } },
    ]);

    expect(resultado.herramientas).toEqual([]);
    expect(resultado.estructura.acciones).toHaveLength(1);
    expect(resultado.estructura.acciones[0].estado).toBe('denegado');
    expect(prismaActual.tablas.note).toHaveLength(0);
  });

  it('buscar una persona concreta produce tarjeta de contacto', async () => {
    const resultado = await pedir('u-comercial', [
      { nombre: 'buscar_persona', args: { nombre: 'Ana Propia' } },
    ]);

    const accion = resultado.estructura.acciones[0];
    expect(accion.tarjeta?.titulo).toBe('Ana Propia');
    expect(accion.tarjeta?.subtitulo).toBe('ana@a.test');
  });
});
