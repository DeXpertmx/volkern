/**
 * Etapa F — Validación integral del orquestador inteligente (Etapa D).
 *
 * Prueba el proceso canónico inmobiliario («busca compradores compatibles,
 * identifica los tres mejores para cada propiedad y prepara los seguimientos»)
 * sin LLM real, con Prisma en memoria y mocks de skills y base de datos.
 *
 * Las 15 pruebas cubren: identidad del turno, búsqueda con filtros combinados,
 * pipeline con aprobación, operación compuesta, permisos, multi-tenant,
 * idempotencia por hilo y en vuelo, errores, encadenamiento de resultados,
 * omisión de los pasos que dependen de un comprador, reanudación tras aprobar,
 * validación de argumentos contra el esquema del registro, restricciones MCP del
 * tenant y fallos de pasos no esenciales.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reiniciarPrisma, prismaActual } from '../ayuda/prisma-en-memoria';

// Formas reales de las skills que el plan encadena: inmuebles del catálogo y
// deals con su lead. Cada prueba puede ajustarlas antes de ejecutar.
const h = vi.hoisted(() => ({
  llamadasSkill: [] as Array<{ nombre: string; payload: Record<string, any> }>,
  propiedades: [] as any[],
  compradores: [] as any[],
  fallos: [] as string[],
}));

vi.mock('@/lib/db', async () => {
  const { prismaActual } = await import('../ayuda/prisma-en-memoria');
  const delegado = new Proxy({}, { get: (_t, prop: string) => (prismaActual.prisma as any)[prop] });
  return { prisma: delegado, default: delegado, globalPrisma: delegado, getTenantDb: async () => delegado };
});

// Las herramientas CRM (crear_tarea, crear_nota) llaman directamente a
// funciones del registro de skills (create_task, create_note), no sólo a
// executeSkill. Se cubren para no depender de la base real.
const skillsMock = {
  create_task: vi.fn(async () => ({ id: 'tarea-1', titulo: 'Seguimiento', fechaVencimiento: '2026-12-01' })),
  create_note: vi.fn(async () => ({ id: 'nota-1' })),
};

vi.mock('@/lib/skills', () => ({
  executeSkill: async (nombre: string, payload: Record<string, any>) => {
    h.llamadasSkill.push({ nombre, payload });
    if (h.fallos.includes(nombre)) throw new Error(`fallo simulado en ${nombre}`);
    // Contratos reales de las skills del plan canónico.
    if (nombre === 'search_properties_by_filters') {
      return { properties: h.propiedades, total: h.propiedades.length };
    }
    if (nombre === 'list_deals') {
      return { deals: h.compradores, total: h.compradores.length, page: 1, limit: 50 };
    }
    if (nombre === 'recommend_properties') {
      return {
        recommendations: h.propiedades.map((p) => ({ id: p.id, titulo: p.nombre, score: 90 })),
        total: h.propiedades.length,
        mensaje: '',
      };
    }
    return { ok: true, id: `skill-${nombre}-${h.llamadasSkill.length}` };
  },
  skills: skillsMock,
}));

import { OrquestadorInteligente, ejecutarProcesoInmobiliarioEjemplo } from '@/lib/agents/orchestracion-inteligente';
import { reanudarProcesoAprobado } from '@/lib/agents/proceso-pendiente';
import { claveIdempotencia } from '@/lib/agents/tool-idempotency';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

// Datos realistas: un inmueble del catálogo y un comprador con su deal.
const PROPIEDAD = {
  id: 'prop-centro',
  nombre: 'Piso reformado en Centro',
  precioBase: 250000,
  city: 'Centro',
  bedrooms: 3,
  operationType: 'venta',
  propertyType: 'casa',
};
const DEAL_COMPRADOR = {
  id: 'deal-1',
  titulo: 'Compra en Centro',
  lead: { id: 'lead-lucia', nombre: 'Lucía Ferrer', email: 'lucia@example.com' },
};

const ROL_COMERCIAL = { nombre: 'Comercial', permisos: { leads: { ver: true, crear: true, editar: true }, catalogo: { ver: true }, citas: { ver: true, crear: true }, mensajes: { ver: true, enviar: true } } };
const ROL_SOLO_LECTURA = { nombre: 'Lectura', permisos: { leads: { ver: true }, catalogo: { ver: true } } };

function usuario(id: string, tenantId: string, role: typeof ROL_COMERCIAL) {
  return { id, tenantId, name: `Usuario ${id}`, role };
}

function ctx(tenantId: string, userId: string, role: typeof ROL_COMERCIAL, conversacionId?: string) {
  return {
    tenantId,
    userId,
    conversacionId,
    usuario: { role, existe: true },
    restricciones: {},
  };
}

function sembrarBase(tenant: string, rol: typeof ROL_COMERCIAL, extra: Record<string, any[]> = {}) {
  reiniciarPrisma({
    tenant: [{ id: tenant, nombre: `Inmobiliaria ${tenant}` }],
    user: [usuario('u-1', tenant, rol)],
    // La ficha del comprador existe: las notas y tareas del proceso cuelgan de ella.
    lead: [{ id: 'lead-lucia', tenantId: tenant, nombre: 'Lucía Ferrer', email: 'lucia@example.com' }],
    ...extra,
  });
  h.llamadasSkill.length = 0;
}

beforeEach(() => {
  h.propiedades = [PROPIEDAD];
  h.compradores = [DEAL_COMPRADOR];
  h.fallos = [];
  sembrarBase(TENANT_A, ROL_COMERCIAL);
  vi.clearAllMocks();
});

describe('Etapa F — validación integral del orquestador', () => {
  it('1. identidad del turno: las herramientas reciben el tenant y el usuario de la sesión, no los del plan', async () => {
    const orquestador = new OrquestadorInteligente();
    // El plan se construye con otro tenant a propósito: manda la sesión.
    const pasos = orquestador.planificarProcesoInmobiliario({ tenantId: TENANT_B });

    await orquestador.ejecutarProceso('proceso_contexto', pasos, ctx(TENANT_A, 'u-1', ROL_COMERCIAL, 'conv-1'));

    const busqueda = h.llamadasSkill.find((l) => l.nombre === 'search_properties_by_filters');
    expect(busqueda?.payload.tenantId).toBe(TENANT_A);
    expect(busqueda?.payload.userId).toBe('u-1');
  });

  it('2. búsqueda inmobiliaria con filtros combinados', async () => {
    const orquestador = new OrquestadorInteligente();
    const pasos = orquestador.planificarProcesoInmobiliario({
      tenantId: TENANT_A,
      zona: 'Centro',
      tipoOperacion: 'venta',
      tipoInmueble: 'casa',
      habitaciones: 3,
      precioMax: 300000,
      limitePropiedades: 5,
      topCompradores: 3,
    });

    const plan = pasos.find((p) => p.nombre === 'identificar_propiedades');
    expect(plan?.args).toMatchObject({
      zona: 'Centro',
      tipo_operacion: 'venta',
      tipo_inmueble: 'casa',
      habitaciones: 3,
      precio_max: 300000,
      limit: 5,
    });
  });

  it('3. pipeline: el plan canónico se ejecuta en orden y se pausa en la aprobación', async () => {
    const orquestador = new OrquestadorInteligente();
    const pasos = orquestador.planificarProcesoInmobiliario({ tenantId: TENANT_A });

    expect(pasos.map((p) => p.nombre)).toEqual([
      'identificar_propiedades',
      'consultar_caracteristicas_propiedades',
      'buscar_compradores',
      'calcular_compatibilidad',
      'seleccionar_top_compradores',
      'preparar_seguimientos',
      'solicitar_aprobacion_seguimiento',
      'registrar_resultados',
    ]);

    const resultado = await orquestador.ejecutarProceso('pipeline_completo', pasos, ctx(TENANT_A, 'u-1', ROL_COMERCIAL, 'conv-3'));

    // Las herramientas del plan existen y ejecutan; send_message es clase C:
    // no se envía, el proceso se pausa y registrar_resultados queda pendiente.
    expect(resultado.pasos.map((p) => p.estado)).toEqual([
      'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'aprobacion',
    ]);
    expect(h.llamadasSkill.some((l) => l.nombre === 'send_message')).toBe(false);

    // La acción pendiente queda en la bandeja de aprobación del chat.
    const solicitud = await (prismaActual.prisma as any).mcpApprovalRequest.findFirst({
      where: { tenantId: TENANT_A, toolName: 'send_message' },
    });
    expect(solicitud?.via).toBe('/api/chat');
  });

  it('4. operación compuesta: el ejemplo propaga sus filtros al proceso', async () => {
    const resultado = await ejecutarProcesoInmobiliarioEjemplo(
      ctx(TENANT_A, 'u-1', ROL_COMERCIAL, 'conv-4'),
      { zona: 'Madrid', tipoInmueble: 'casa', habitaciones: 2, precioMax: 400000, limitePropiedades: 4 }
    );

    expect(resultado.nombreProceso).toBe('proceso_inmobiliario_ejemplo');
    const busqueda = h.llamadasSkill.find((l) => l.nombre === 'search_properties_by_filters');
    expect(busqueda?.payload).toMatchObject({
      zona: 'Madrid',
      tipo_inmueble: 'casa',
      habitaciones: 2,
      precio_max: 400000,
      limit: 4,
    });
  });

  it('5. permisos: rol sin permiso de escritura no puede ejecutar pasos de escritura', async () => {
    sembrarBase(TENANT_A, ROL_SOLO_LECTURA);
    const orquestador = new OrquestadorInteligente();
    const pasos = orquestador.planificarProcesoInmobiliario({ tenantId: TENANT_A });

    const resultado = await orquestador.ejecutarProceso('permisos', pasos, ctx(TENANT_A, 'u-1', ROL_SOLO_LECTURA, 'conv-5'));

    // crear_tarea es escritura (clase B): un rol de solo lectura no puede ejecutarlo
    // y, al ser esencial, el proceso se detiene antes de registrar resultados.
    const preparar = resultado.pasos.find((p) => p.nombre === 'preparar_seguimientos');
    expect(preparar?.estado).toBe('denegado');
    expect(resultado.pasos.map((p) => p.nombre)).not.toContain('registrar_resultados');
  });

  it('6. multi-tenant: cada proceso ejecuta con la identidad de su tenant', async () => {
    reiniciarPrisma({
      tenant: [{ id: TENANT_A, nombre: 'A' }, { id: TENANT_B, nombre: 'B' }],
      user: [usuario('u-a', TENANT_A, ROL_COMERCIAL), usuario('u-b', TENANT_B, ROL_COMERCIAL)],
    });

    const orquestador = new OrquestadorInteligente();
    const pasosA = orquestador.planificarProcesoInmobiliario({ tenantId: TENANT_A });
    const pasosB = orquestador.planificarProcesoInmobiliario({ tenantId: TENANT_B });

    await Promise.all([
      orquestador.ejecutarProceso('tenant-a', pasosA, ctx(TENANT_A, 'u-a', ROL_COMERCIAL, 'conv-6a')),
      orquestador.ejecutarProceso('tenant-b', pasosB, ctx(TENANT_B, 'u-b', ROL_COMERCIAL, 'conv-6b')),
    ]);

    // Ninguna ejecución cruza tenant ni usuario.
    const usuarioPorTenant = Object.fromEntries(
      h.llamadasSkill.map((l) => [l.payload.tenantId, l.payload.userId])
    );
    expect(usuarioPorTenant).toEqual({ [TENANT_A]: 'u-a', [TENANT_B]: 'u-b' });
  });

  it('7. idempotencia: el mismo hilo no vuelve a escribir y otro hilo sí ejecuta', async () => {
    const orquestador = new OrquestadorInteligente();
    // crear_tarea es escritura (clase B): va por la clave de idempotencia.
    const paso = {
      nombre: 'crear_tarea_repetida',
      herramienta: 'crear_tarea',
      args: { nombre: 'Lucía Ferrer', titulo: 'Seguimiento', tipo: 'seguimiento', fechaVencimiento: '2026-12-01' },
      esencial: false,
    };

    const primero = await orquestador.ejecutarProceso('idem-1', [paso], ctx(TENANT_A, 'u-1', ROL_COMERCIAL, 'conv-idem'));
    const repetido = await orquestador.ejecutarProceso('idem-2', [paso], ctx(TENANT_A, 'u-1', ROL_COMERCIAL, 'conv-idem'));
    const otroHilo = await orquestador.ejecutarProceso('idem-3', [paso], ctx(TENANT_A, 'u-1', ROL_COMERCIAL, 'conv-otro'));

    expect(primero.pasos[0].resultado?.idempotente).toBeFalsy();
    // El reintento del mismo hilo devuelve lo guardado, sin ejecutar la skill.
    expect(repetido.pasos[0].resultado?.idempotente).toBe(true);
    // Otro hilo es otra operación: la skill se ejecuta de nuevo.
    expect(otroHilo.pasos[0].estado).toBe('ok');
    expect(otroHilo.pasos[0].resultado?.idempotente).toBeFalsy();
    expect(skillsMock.create_task).toHaveBeenCalledTimes(2);
  });

  it('8. errores: herramienta desconocida se marca como error de selección de herramientas', async () => {
    const orquestador = new OrquestadorInteligente();
    const pasos = [
      { nombre: 'paso_desconocido', herramienta: 'herramienta_que_no_existe', args: {}, esencial: false },
      { nombre: 'paso_despues', herramienta: 'volkern_list_deals', args: { tenantId: TENANT_A, etapa: 'calificacion' }, esencial: false },
    ];

    const resultado = await orquestador.ejecutarProceso('errores', pasos, ctx(TENANT_A, 'u-1', ROL_COMERCIAL, 'conv-8'));

    // No es esencial: se marca el error de selección y el proceso sigue.
    expect(resultado.pasos.map((p) => p.nombre)).toEqual(['paso_desconocido', 'paso_despues']);
    expect(resultado.pasos[0].estado).toBe('error');
    expect(resultado.erroresSeleccionHerramienta).toBe(1);
  });

  it('9. encadenamiento: compatibilidad y seguimientos usan la propiedad y el comprador encontrados', async () => {
    const orquestador = new OrquestadorInteligente();
    // El plan pide otra zona, precio y habitaciones: manda el inventario encontrado.
    const pasos = orquestador.planificarProcesoInmobiliario({
      tenantId: TENANT_A,
      zona: 'Norte',
      precioMax: 900000,
      habitaciones: 5,
    });

    await orquestador.ejecutarProceso('encadenado', pasos, ctx(TENANT_A, 'u-1', ROL_COMERCIAL, 'conv-9'));

    const compatibilidad = h.llamadasSkill.find((l) => l.nombre === 'recommend_properties');
    expect(compatibilidad?.payload).toMatchObject({
      ciudad: 'Centro',
      tipoInmueble: 'casa',
      precioMax: 250000,
      habitaciones: 3,
    });

    // El seguimiento va a la persona del deal, no a un destinatario genérico.
    expect(skillsMock.create_task).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Lucía Ferrer' })
    );

    const solicitud = await (prismaActual.prisma as any).mcpApprovalRequest.findFirst({
      where: { tenantId: TENANT_A, toolName: 'send_message' },
    });
    expect(solicitud?.arguments).toMatchObject({ nombre: 'Lucía Ferrer', email: 'lucia@example.com' });
  });

  it('10. sin compradores, los pasos con destinatario se omiten en vez de inventarlo', async () => {
    h.compradores = [];
    const orquestador = new OrquestadorInteligente();
    const pasos = orquestador.planificarProcesoInmobiliario({ tenantId: TENANT_A });

    const resultado = await orquestador.ejecutarProceso('sin_compradores', pasos, ctx(TENANT_A, 'u-1', ROL_COMERCIAL, 'conv-10'));

    expect(resultado.pasos.map((p) => p.estado)).toEqual([
      'ok', 'ok', 'ok', 'ok', 'omitido', 'omitido', 'omitido', 'omitido',
    ]);
    expect(skillsMock.create_task).not.toHaveBeenCalled();
  });

  it('11. reanudación: al aprobar se ejecutan los pasos pendientes con el hilo del turno', async () => {
    const orquestador = new OrquestadorInteligente();
    const pasos = orquestador.planificarProcesoInmobiliario({ tenantId: TENANT_A });
    await orquestador.ejecutarProceso('pipeline_completo', pasos, ctx(TENANT_A, 'u-1', ROL_COMERCIAL, 'conv-11'));

    const solicitud = await (prismaActual.prisma as any).mcpApprovalRequest.findFirst({
      where: { tenantId: TENANT_A, toolName: 'send_message' },
    });
    expect(solicitud?.id).toBeTruthy();

    const reanudado = await reanudarProcesoAprobado({
      approvalId: solicitud.id,
      tenantId: TENANT_A,
      userId: 'u-1',
    });

    // Solo quedaba registrar el resultado; la tarea ya creada no se repite.
    expect(reanudado?.pasos.map((p) => p.nombre)).toEqual(['registrar_resultados']);
    expect(reanudado?.pasos[0].estado).toBe('ok');
    expect(skillsMock.create_note).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead-lucia' })
    );
    expect(skillsMock.create_task).toHaveBeenCalledTimes(1);

    // El paso pendiente se guarda con la clave de idempotencia del mismo hilo.
    const claves = (prismaActual.tablas.idempotencyRecord ?? []).map((registro: any) => registro.key);
    expect(claves.some((clave: string) => clave.startsWith('agente:u-1:conv-11:crear_nota:'))).toBe(true);

    // El estado se consume: resolver otra vez no repite el proceso.
    const otra = await reanudarProcesoAprobado({ approvalId: solicitud.id, tenantId: TENANT_A, userId: 'u-1' });
    expect(otra).toBeNull();
  });

  it('12. esquema: campos inventados o incompletos fallan antes de ejecutarse', async () => {
    const orquestador = new OrquestadorInteligente();
    const pasos = [
      {
        nombre: 'envio_invalido',
        herramienta: 'send_message',
        args: { destinatario: 'lucia@example.com', contenido: 'Hola' },
        esencial: false,
      },
      {
        nombre: 'tarea_incompleta',
        herramienta: 'crear_tarea',
        args: { nombre: 'Lucía Ferrer', titulo: 'Seguimiento' },
        esencial: false,
      },
    ];

    const resultado = await orquestador.ejecutarProceso('esquema', pasos, ctx(TENANT_A, 'u-1', ROL_COMERCIAL, 'conv-12'));

    expect(resultado.pasos[0].estado).toBe('error');
    expect(resultado.pasos[0].error).toContain('«destinatario»');
    expect(resultado.pasos[0].error).toContain('«contenido»');
    expect(resultado.pasos[1].estado).toBe('error');
    expect(resultado.pasos[1].error).toContain('falta el campo obligatorio «fechaVencimiento»');

    // Tampoco se abre una aprobación para una acción que no se podría ejecutar.
    const solicitud = await (prismaActual.prisma as any).mcpApprovalRequest.findFirst({
      where: { tenantId: TENANT_A, toolName: 'send_message' },
    });
    expect(solicitud).toBeFalsy();
  });

  it('13. restricciones del tenant: una tool MCP vetada deniega su paso sin frenar el proceso', async () => {
    const orquestador = new OrquestadorInteligente();
    const pasos = orquestador.planificarProcesoInmobiliario({ tenantId: TENANT_A });
    const contexto = {
      ...ctx(TENANT_A, 'u-1', ROL_COMERCIAL, 'conv-13'),
      // La empresa vetó el pipeline para todos los roles.
      restricciones: { volkern_list_deals: [{ roleName: null, decision: 'deny' }] },
    };

    const resultado = await orquestador.ejecutarProceso('restringido', pasos, contexto);

    // El veto afecta solo a la búsqueda de compradores (tercer paso): es del
    // paso, no del proceso. La compatibilidad sigue y los pasos que dependen de
    // compradores se omiten en vez de inventarlos.
    expect(resultado.pasos.map((p) => p.estado)).toEqual([
      'ok', 'ok', 'denegado', 'ok', 'omitido', 'omitido', 'omitido', 'omitido',
    ]);
  });

  it('14. fallo de un paso no esencial: se marca el error y el proceso sigue', async () => {
    h.fallos = ['recommend_properties'];
    const orquestador = new OrquestadorInteligente();
    const pasos = orquestador.planificarProcesoInmobiliario({ tenantId: TENANT_A });

    const resultado = await orquestador.ejecutarProceso('fallo_no_esencial', pasos, ctx(TENANT_A, 'u-1', ROL_COMERCIAL, 'conv-14'));

    const compatibilidad = resultado.pasos.find((p) => p.nombre === 'calcular_compatibilidad');
    expect(compatibilidad?.estado).toBe('error');

    // No es un error de selección de herramientas y no frena el pipeline, que
    // sigue hasta solicitar la aprobación del envío.
    expect(resultado.erroresSeleccionHerramienta).toBe(0);
    const aprobacion = resultado.pasos.find((p) => p.nombre === 'solicitar_aprobacion_seguimiento');
    expect(aprobacion?.estado).toBe('aprobacion');
  });

  it('15. idempotencia en vuelo: un turno que llega mientras otro guarda no duplica la escritura', async () => {
    const paso = {
      nombre: 'tarea_en_vuelo',
      herramienta: 'crear_tarea',
      args: { nombre: 'Lucía Ferrer', titulo: 'Seguimiento', tipo: 'seguimiento', fechaVencimiento: '2026-12-01' },
      esencial: false,
    };
    const orquestador = new OrquestadorInteligente();

    // La primera ejecución de ese hilo está a mitad de la escritura: su clave
    // queda reservada como `processing`. Se siembra ese estado para no depender
    // del orden en que el planificador arranque dos promesas: lo que se prueba
    // es la llegada durante una ejecución en curso, no una carrera real.
    const clave = claveIdempotencia({
      userId: 'u-1',
      conversacionId: 'conv-vuelo',
      herramienta: 'crear_tarea',
      argumentos: paso.args,
    });
    prismaActual.tablas.idempotencyRecord.push({
      key: clave,
      status: 'processing',
      result: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const enVuelo = await orquestador.ejecutarProceso(
      'en-vuelo',
      [paso],
      ctx(TENANT_A, 'u-1', ROL_COMERCIAL, 'conv-vuelo')
    );

    // El turno que coincide con la ejecución en curso no vuelve a escribir y
    // recibe el aviso de la escritura en curso, no el resultado ya guardado.
    expect(skillsMock.create_task).not.toHaveBeenCalled();
    expect(enVuelo.pasos[0].estado).toBe('ok');
    expect(enVuelo.pasos[0].resultado.idempotente).toBe(true);
    expect(enVuelo.pasos[0].resultado.mensaje).toContain('ya se estaba guardando');
  });
});
