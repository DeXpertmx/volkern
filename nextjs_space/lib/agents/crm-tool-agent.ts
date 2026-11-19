/**
 * Agente de CRM con herramientas (tool calling)
 *
 * El clasificador por intents resuelve bien una acción por mensaje, pero un
 * comercial escribe cosas como «Iris no pudo ver el demo, quedó de verlo, hoy
 * tiene dos CRM, prepara un email para el jueves de la siguiente semana»: son
 * varias acciones descritas en lenguaje libre. En vez de añadir una regla por
 * frase, aquí el LLM elige y ejecuta las herramientas del CRM, y devuelve el
 * resumen de lo que realmente quedó guardado.
 *
 * Las herramientas no se declaran aquí: las compone `tool-registry.ts` a
 * partir de las nativas, el catálogo MCP y las skills. Este módulo sólo hace
 * dos cosas: pasarle al modelo lo que el rol puede usar y ejecutar lo que
 * pide, comprobando el permiso otra vez antes de tocar datos.
 */

import { prisma } from '@/lib/db';
import { cargarRolDeUsuario } from '@/lib/agents/crm-tool-permissions';
import type { MensajeDeHistorial } from '@/lib/agents/conversation-history';
import {
  cargarRestriccionesMcp,
  ejecutarHerramientaDelAgente,
  herramientasParaElModelo,
  PermisoDenegadoError,
} from '@/lib/agents/tool-registry';
import {
  callAssistantWithToolLoop,
  type OpenRouterMessage,
} from '@/lib/assistant/openrouter-client';

// Compatibilidad: las herramientas nativas viven en su módulo, pero quien
// importaba HERRAMIENTAS desde aquí (pruebas de cobertura de permisos) sigue
// funcionando.
export { HERRAMIENTAS } from '@/lib/agents/herramientas-crm';

export interface AgenteCrmInput {
  message: string;
  tenantId: string;
  userId: string;
  /** Turnos anteriores del hilo, para resolver referencias del usuario. */
  historial?: MensajeDeHistorial[];
  /** Presupuesto total de la conversación con herramientas (ms). */
  timeoutMs?: number;
}

export interface AgenteCrmResultado {
  /** Texto para el chat (vacío si no se ejecutó ninguna herramienta). */
  texto: string;
  /** Nombres de las herramientas ejecutadas, en orden. */
  herramientas: string[];
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Fechas de referencia (hoy + 21 días) para que el modelo no improvise fechas. */
function calendarioDeReferencia(timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const hoyIso = fmt.format(new Date());
  const [y, m, d] = hoyIso.split('-').map(Number);

  const lineas: string[] = [];
  for (let i = 0; i < 22; i++) {
    const fecha = new Date(Date.UTC(y, m - 1, d + i));
    const iso = fecha.toISOString().slice(0, 10);
    const nombre = `${DIAS[fecha.getUTCDay()]} ${fecha.getUTCDate()} de ${MESES[fecha.getUTCMonth()]} de ${fecha.getUTCFullYear()}`;
    lineas.push(`${iso} — ${nombre}${i === 0 ? ' (HOY)' : ''}`);
  }
  return lineas.join('\n');
}

/**
 * Ejecuta el agente con herramientas. Sólo devuelve texto si el modelo llegó a
 * ejecutar alguna: si no, el orquestador sigue su camino normal.
 */
export async function ejecutarAgenteCrm(input: AgenteCrmInput): Promise<AgenteCrmResultado> {
  const { message, tenantId, userId } = input;

  const usuario = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, name: true } });
  const timezone = usuario?.timezone || 'America/Mexico_City';

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: construirSistema(timezone) },
    // El historial ya llega recortado y ordenado desde el canal. Sin él, «que
    // tengan terraza» no tendría antecedente y empezaría una búsqueda nueva.
    ...(input.historial ?? []),
    { role: 'user', content: message },
  ];

  const ejecutadas: string[] = [];
  // El rol y las restricciones de la empresa se leen una sola vez por mensaje:
  // juntos deciden qué herramientas ve el modelo y vuelven a decidir, sin otra
  // consulta, si puede ejecutar cada una de las que pida.
  const [rolDelTurno, restricciones] = await Promise.all([
    cargarRolDeUsuario({ userId, tenantId }),
    cargarRestriccionesMcp(tenantId),
  ]);

  // Cinco vueltas como máximo: consultar lo que haga falta, registrar lo
  // ocurrido, dejar la nota y crear la tarea pendiente. El presupuesto total
  // acota la espera del chat aunque el modelo encadene llamadas.
  const respuesta = await callAssistantWithToolLoop(
    messages,
    herramientasParaElModelo(rolDelTurno, restricciones),
    async (nombre, args) => {
      try {
        // El modelo propone; el registro autoriza antes de tocar la skill.
        const resultado = await ejecutarHerramientaDelAgente(nombre, args, {
          tenantId,
          userId,
          autorizacion: { usuario: rolDelTurno, restricciones },
        });
        if (resultado?.ok !== false) ejecutadas.push(nombre);
        const serializado = JSON.stringify(resultado ?? { ok: true }).slice(0, 2000);
        console.log(`[AgenteCRM] ${nombre}(${JSON.stringify(args).slice(0, 160)}) → ${serializado.slice(0, 200)}`);
        return serializado;
      } catch (error: any) {
        if (error instanceof PermisoDenegadoError) {
          console.warn(`[AgenteCRM] ${nombre} denegada: ${error.motivo}`);
          return JSON.stringify({
            ok: false,
            codigo: 'sin_permiso',
            mensaje: 'No tienes permiso para esta acción en el CRM. Pídeselo a un administrador.',
          });
        }
        console.warn(`[AgenteCRM] ${nombre} falló:`, error?.message || error);
        return JSON.stringify({ ok: false, error: error?.message || 'Error ejecutando la herramienta' });
      }
    },
    5,
    input.timeoutMs ?? 20000
  );

  const texto = respuesta?.choices?.[0]?.message?.content?.trim() || '';
  return {
    texto: ejecutadas.length > 0 ? texto : '',
    herramientas: ejecutadas,
  };
}

/** Prompt del sistema, con el calendario de referencia para las fechas. */
export function construirSistema(timezone: string, ahora = new Date()): string {
  return `Eres Gemma, la asistente de CRM de Volkern. Hoy es ${ahora.toLocaleDateString('es-MX', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })} (zona horaria ${timezone}).

Tu trabajo es convertir lo que cuenta el comercial en cambios reales del CRM usando las herramientas. Un mensaje puede pedir VARIAS acciones: ejecuta todas, en orden, y no pidas confirmación salvo que falte el nombre de la persona o haya ambigüedad real.

Reglas:
- Primero llama a buscar_persona para confirmar de quién se habla. Si devuelve varios candidatos, pregunta cuál es.
- Si buscar_persona no encuentra a nadie y hay que dejar constancia de una persona nueva (o el usuario pide darla de alta), usa crear_lead con los datos que haya dado: nombre, email, teléfono, empresa, cargo, dirección y origen. No inventes el correo: si no lo tiene, créala sin email y avísale de que la ficha quedó sin correo real. Si crear_lead devuelve yaExistia, no crees otra: sigue trabajando sobre esa ficha y dilo.
- Lo que YA ocurrió (una llamada, un WhatsApp enviado, que no pudo ver el demo, que tiene otras herramientas) se registra con registrar_interaccion; el contexto de negocio (por qué le interesa Volkern, qué usa hoy) con crear_nota.
- Lo que queda PENDIENTE se crea con crear_tarea (tipo llamada/email/reunion/seguimiento) y la fecha que pida el usuario.
- Si dice que una tarea ya está hecha, usa completar_tarea con el TÍTULO EXACTO que devolvió buscar_persona (no inventes ni copies a medias el título).
- Para consultar sin cambiar nada: el pipeline con volkern_list_deals, las tareas propias con get_pending_tasks, la cartera con volkern_list_catalogo o buscar_propiedades, la agenda con volkern_list_citas y el resumen de negocio con volkern_get_financial_dashboard. No inventes cifras: si la herramienta devuelve vacío, dilo.
- Para mover un negocio de etapa, cambiar su importe o prioridad usa update_deal con nombre o correo.
- Fechas: usa SIEMPRE las del calendario de referencia y el formato YYYY-MM-DD. "El jueves" es el próximo jueves; "el jueves de la siguiente semana" es el jueves de la semana que viene, no el de esta.
- Si el usuario se refiere a algo ya dicho en la conversación ("que tengan terraza", "y más baratas", "los de ayer", "escríbele a él"), averigua a qué se refiere en los turnos anteriores y combina ese criterio con lo anterior, en vez de empezar de cero o preguntar lo que ya sabías.
- No inventes datos, importes ni fechas que el usuario no haya dicho.
- No envíes correos ni mensajes reales: sólo registra en el CRM.
- Si una herramienta responde con código sin_permiso, dilo tal cual al usuario y no la reintentes ni busques otra forma de hacer lo mismo.
- Al terminar, responde en español con un resumen breve en viñetas de lo que quedó guardado (tarea completada, nota, interacción, tarea creada con su fecha). Si algo no se pudo hacer, dilo.

Calendario de referencia:
${calendarioDeReferencia(timezone)}`;
}
