import { createHash } from 'crypto'

/**
 * Catálogo de Agent Skills de Volkern para descubrimiento vía
 * /.well-known/agent-skills/index.json (RFC Agent Skills Discovery v0.2.0).
 *
 * Cada skill tiene un `SKILL.md` servible en
 * /.well-known/agent-skills/{name}/SKILL.md cuyo digest SHA-256 se calcula
 * del contenido exacto (mismo string que se sirve), garantizando que el
 * índice y el artefacto siempre coinciden.
 */
export interface AgentSkillEntry {
  name: string
  description: string
  /** Tipo de distribución: skill-md (SKILL.md único) o archive */
  type: 'skill-md' | 'archive'
  skillMd: string
}

export const AGENT_SKILLS: AgentSkillEntry[] = [
  {
    name: 'volkern-tasks',
    type: 'skill-md',
    description:
      'Gestiona tareas del CRM: crea, completa, reprograma y consulta tareas pendientes, vencidas o de hoy. Úsalo cuando el usuario pida organizar o revisar su agenda de tareas.',
    skillMd: `---
name: volkern-tasks
description: Gestiona tareas del CRM de Volkern: crea, completa, reprograma y consulta tareas pendientes, vencidas o de hoy.
---

# Volkern Tasks

Gestiona tareas de un usuario de Volkern CRM/ERP.

## Cuándo usarlo

- "Crea una tarea para llamar a Juan mañana"
- "Qué tareas tengo vencidas"
- "Completa la tarea de enviar propuesta"

## Uso

POST /api/skills/user/{userId}/execute con Bearer API key (scope agent:skill):

\`\`\`json
{ "skill": "create_task", "arguments": { "titulo": "Llamar a Juan", "fechaVencimiento": "2026-08-22T10:00:00.000Z" } }
\`\`\`

Skills: create_task, complete_task, reschedule_task, snooze_task, get_pending_tasks, get_overdue_tasks, get_tasks_due_today.
`,
  },
  {
    name: 'volkern-leads',
    type: 'skill-md',
    description:
      'Gestiona leads y contactos del CRM: crea, actualiza, busca, convierte leads y registra interacciones. Úsalo para capturar o consultar clientes potenciales.',
    skillMd: `---
name: volkern-leads
description: Gestiona leads y contactos del CRM de Volkern: crea, actualiza, busca, convierte y registra interacciones.
---

# Volkern Leads

Gestión de leads y contactos de Volkern CRM/ERP.

## Cuándo usarlo

- "Crea un lead para María López con email maria@empresa.com"
- "Busca el contacto de Juan por email"
- "Convierte el lead de Ana a cliente"

## Uso

POST /api/skills/user/{userId}/execute con Bearer API key (scope agent:skill):

\`\`\`json
{ "skill": "create_lead", "arguments": { "nombre": "María López", "email": "maria@empresa.com", "telefono": "+34600000000" } }
\`\`\`

Skills: create_lead, update_lead, get_lead, find_lead_by_email, convert_lead, list_leads, registrar_interaccion.
`,
  },
  {
    name: 'volkern-bookings',
    type: 'skill-md',
    description:
      'Agenda, confirma y cancela citas y bookings (Google Meet/Calendar) y consulta las próximas. Úsalo para programar reuniones y citas del usuario.',
    skillMd: `---
name: volkern-bookings
description: Agenda, confirma y cancela citas y bookings de Volkern (Google Meet/Calendar) y consulta las próximas.
---

# Volkern Bookings

Citas y bookings de Volkern CRM/ERP.

## Cuándo usarlo

- "Agenda una reunión por Google Meet con Ana mañana a las 4pm"
- "Qué citas tengo esta semana"
- "Cancela mi cita de mañana"

## Uso

POST /api/skills/user/{userId}/execute con Bearer API key (scope agent:skill):

\`\`\`json
{ "skill": "create_booking", "arguments": { "cliente": "Ana", "fecha": "2026-08-22T16:00:00.000Z" } }
\`\`\`

Skills: create_booking, confirm_booking, cancel_booking, get_upcoming_bookings, auto_schedule.
`,
  },
  {
    name: 'volkern-hospitality',
    type: 'skill-md',
    description:
      'Consulta la operación del PMS de alojamientos: ocupación, llegadas y salidas, reservas por estado/canal/huésped, rentabilidad por reserva y estado del motor de reservas. Úsalo para la gestión diaria del módulo Hospitality.',
    skillMd: `---
name: volkern-hospitality
description: Consulta ocupación, llegadas y salidas, reservas, rentabilidad por reserva y estado del booking engine del PMS de Volkern.
---

# Volkern Hospitality

Operación del módulo Hospitality (PMS + Booking Engine) de Volkern CRM/ERP.

## Cuándo usarlo

- "¿Qué tal va la casa hoy? ¿Quién llega mañana?"
- "Reservas de Airbnb del último mes" o "Reservas de Ana García"
- "¿Cuánto ganamos con la reserva WEB-123?" (margen, comisión OTA, pendiente de cobro)
- "¿Funciona la web de reservas directa?"

## Uso

POST /api/skills/user/{userId}/execute con Bearer API key (scope agent:skill):

\`\`\`json
{ "skill": "estado_del_dia", "arguments": { "dias": 7 } }
\`\`\`

Skills: estado_del_dia, llegadas_salidas_hoy, buscar_reservas (filtros estado/canal/huésped/días), rentabilidad_reserva (por referencia o id), estado_booking_engine.

Las canceladas y no-show no cuentan como producción: ocupación, noches e ingresos las excluyen.
`,
  },
  {
    name: 'volkern-expenses',
    type: 'skill-md',
    description:
      'Registra gastos, gestiona proveedores y autoriza gastos pendientes. Úsalo para capturar o aprobar gastos del negocio.',
    skillMd: `---
name: volkern-expenses
description: Registra gastos, gestiona proveedores y autoriza gastos pendientes de Volkern.
---

# Volkern Expenses

Gastos y proveedores de Volkern CRM/ERP.

## Cuándo usarlo

- "Registra un gasto de 120€ en suministros"
- "Qué gastos están pendientes de autorizar"
- "Autoriza todos los gastos pendientes"

## Uso

POST /api/skills/user/{userId}/execute con Bearer API key (scope agent:skill):

\`\`\`json
{ "skill": "create_expense", "arguments": { "concepto": "Suministros", "importe": 120, "proveedor": "Leroy" } }
\`\`\`

Skills: create_expense, authorize_bulk_expenses, summarize_pending_expenses, create_supplier, list_suppliers.
`,
  },
  {
    name: 'volkern-invoicing',
    type: 'skill-md',
    description:
      'Crea, rectifica y cancela facturas con sello Veri*factu y consulta su estado fiscal. Úsalo para facturación y cumplimiento AEAT.',
    skillMd: `---
name: volkern-invoicing
description: Crea, rectifica y cancela facturas con sello Veri*factu y consulta su estado fiscal.
---

# Volkern Invoicing

Facturación de Volkern CRM/ERP con compliance Veri*factu.

## Cuándo usarlo

- "Crea una factura de 500€ para María"
- "Qué facturas están pendientes"
- "Estado fiscal de la factura F-00042"

## Uso

POST /api/skills/user/{userId}/execute con Bearer API key (scope agent:skill):

\`\`\`json
{ "skill": "create_invoice", "arguments": { "cliente": "María", "amount": 500 } }
\`\`\`

Skills: create_invoice, rectify_invoice, cancel_invoice, get_invoice_fiscal_status.
`,
  },
  {
    name: 'volkern-inventory',
    type: 'skill-md',
    description:
      'Ajusta stock de productos, consulta la salud del inventario y procesa consumos. Úsalo para movimientos de almacén con registro auditable.',
    skillMd: `---
name: volkern-inventory
description: Ajusta stock, consulta la salud del inventario y procesa consumos de materiales en Volkern.
---

# Volkern Inventory

Inventario de Volkern CRM/ERP.

## Cuándo usarlo

- "Mueve la caja de jabones del almacén 1 al 2"
- "Qué productos están por debajo del stock mínimo"

## Uso

POST /api/skills/user/{userId}/execute con Bearer API key (scope agent:skill):

\`\`\`json
{ "skill": "adjust_stock", "arguments": { "producto": "Jabón de baño", "cantidad": 10, "motivo": "Transferencia", "almacenOrigen": "1", "almacenDestino": "2" } }
\`\`\`

Skills: adjust_stock, get_inventory_health, process_inventory_consumption.
`,
  },
  {
    name: 'volkern-payroll',
    type: 'skill-md',
    description:
      'Ejecuta nómina sellada con envío a AEAT, aprueba vacaciones y detecta anomalías de presencia. Úsalo para RRHH y nómina del personal.',
    skillMd: `---
name: volkern-payroll
description: Ejecuta nómina sellada con envío a AEAT, aprueba vacaciones y detecta anomalías de presencia.
---

# Volkern Payroll

RRHH y nómina de Volkern CRM/ERP.

## Cuándo usarlo

- "Ejecuta la nómina de julio"
- "Aprueba mis vacaciones"
- "Detecta anomalías de presencia esta semana"

## Uso

POST /api/skills/user/{userId}/execute con Bearer API key (scope agent:skill):

\`\`\`json
{ "skill": "orchestrate_secure_payroll", "arguments": { "periodo": "2026-07" } }
\`\`\`

Skills: orchestrate_secure_payroll, approve_vacation_voice, detect_attendance_anomalies, get_hr_daily_brief.
`,
  },
  {
    name: 'volkern-email',
    type: 'skill-md',
    description:
      'Envía emails desde Telegram con la firma del usuario y su link de booking, y gestiona conversaciones. Úsalo para comunicaciones por correo.',
    skillMd: `---
name: volkern-email
description: Envía emails con la firma del usuario y su link de booking, y gestiona conversaciones de Volkern.
---

# Volkern Email

Email y comunicaciones de Volkern CRM/ERP.

## Cuándo usarlo

- "Envía un email a Alejandra agradeciendo la reunión"
- "Qué mensajes tengo sin asignar"

## Uso

POST /api/skills/user/{userId}/execute con Bearer API key (scope agent:skill):

\`\`\`json
{ "skill": "send_message", "arguments": { "destinatario": "alevvalverde@gmail.com", "asunto": "Gracias", "cuerpo": "Gracias por la reunión" } }
\`\`\`

Skills: send_message, get_conversation, get_or_create_conversation, close_conversation.
`,
  },
]

export const AGENT_SKILLS_SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json'

/** Digest SHA-256 del contenido del SKILL.md, formato sha256:{hex} */
export function skillDigest(skillMd: string): string {
  return `sha256:${createHash('sha256').update(skillMd).digest('hex')}`
}
