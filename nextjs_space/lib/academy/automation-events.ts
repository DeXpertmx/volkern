/**
 * Emisores de triggers de automatización para el módulo Academia (LMS).
 *
 * Cablea los triggers que el builder ofrece pero que no tenían emisor:
 *   - estudiante_inscrito        (al crear una inscripción)
 *   - leccion_completada         (al marcar una lección como completada)
 *   - estudiante_completa_curso  (al completar todas las lecciones del curso)
 *
 * Todos se disparan con `triggerAutomation` del motor de automatizaciones,
 * pasando tenantId (del curso) + ids y objetos del contexto para que las
 * acciones puedan usar variables ({{estudiante.nombre}}, {{curso.titulo}}, etc.).
 */

import { triggerAutomation } from '@/lib/automation-engine'

export interface AcademyTriggerContext {
  tenantId?: string | null
  inscripcionId?: string
  estudianteId?: string
  cursoId?: string
  leccionId?: string
  estudiante?: Record<string, any>
  curso?: Record<string, any>
  inscripcion?: Record<string, any>
  leccion?: Record<string, any>
}

/**
 * Emite `estudiante_inscrito`. Sin tenantId (curso sin tenant) no dispara.
 */
export async function emitEstudianteInscrito(ctx: AcademyTriggerContext) {
  if (!ctx.tenantId) return false
  await triggerAutomation('estudiante_inscrito', {
    tenantId: ctx.tenantId,
    inscripcionId: ctx.inscripcionId,
    estudianteId: ctx.estudianteId,
    cursoId: ctx.cursoId,
    estudiante: ctx.estudiante,
    curso: ctx.curso,
    inscripcion: ctx.inscripcion,
    source: 'academy',
  })
  return true
}

/**
 * Emite `leccion_completada`. Sin tenantId no dispara.
 */
export async function emitLeccionCompletada(ctx: AcademyTriggerContext) {
  if (!ctx.tenantId) return false
  await triggerAutomation('leccion_completada', {
    tenantId: ctx.tenantId,
    estudianteId: ctx.estudianteId,
    cursoId: ctx.cursoId,
    leccionId: ctx.leccionId,
    inscripcionId: ctx.inscripcionId,
    estudiante: ctx.estudiante,
    curso: ctx.curso,
    leccion: ctx.leccion,
    source: 'academy',
  })
  return true
}

/**
 * Emite `estudiante_completa_curso`. Sin tenantId no dispara.
 */
export async function emitCursoCompletado(ctx: AcademyTriggerContext) {
  if (!ctx.tenantId) return false
  await triggerAutomation('estudiante_completa_curso', {
    tenantId: ctx.tenantId,
    estudianteId: ctx.estudianteId,
    cursoId: ctx.cursoId,
    inscripcionId: ctx.inscripcionId,
    estudiante: ctx.estudiante,
    curso: ctx.curso,
    inscripcion: ctx.inscripcion,
    source: 'academy',
  })
  return true
}
