import { ActionContext } from '../types'
import { createSystemContext } from '@/lib/skills/context'

export async function sendOnboarding(config: any, ctx: ActionContext): Promise<boolean> {
  const { estudianteId, cursoId } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const estudiante = await tenantClient.estudiante.findUnique({
    where: { id: estudianteId || ctx.state.estudianteId },
    include: { usuario: true },
  })
  if (estudiante?.usuario?.email) {
    const { sendEmail } = await import('@/lib/resend-email')
    await sendEmail(estudiante.usuario.email, '¡Bienvenido a tu nuevo curso!', '¡Bienvenido al curso! Estamos emocionados de tenerte. Comienza tu viaje de aprendizaje hoy.', ctx.state.tenantId)
  }
  await ctx.log('send_onboarding', 'action', 'success', 'Onboarding de estudiante enviado')
  return true
}

export async function createEvaluation(config: any, ctx: ActionContext): Promise<boolean> {
  const { estudianteId, cursoId, tipo, titulo } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await tenantClient.evaluacion.create({
    data: {
      tenantId: ctx.state.tenantId, estudianteId: estudianteId || ctx.state.estudianteId,
      cursoId: cursoId || ctx.state.cursoId, tipo: tipo || 'examen',
      titulo: titulo || 'Evaluación', estado: 'pendiente',
    },
  })
  await ctx.log('create_evaluation', 'action', 'success', 'Evaluación creada')
  return true
}

export async function sendSurvey(config: any, ctx: ActionContext): Promise<boolean> {
  const { inscripcionId, tipoEncuesta } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const inscripcion = await tenantClient.inscripcion.findUnique({
    where: { id: inscripcionId || ctx.state.inscripcionId },
    include: { estudiante: { include: { usuario: true } } },
  })
  if (inscripcion?.estudiante?.usuario?.email) {
    const { sendEmail } = await import('@/lib/resend-email')
    const subject = tipoEncuesta === 'satisfaccion' ? 'Encuesta de Satisfacción' : 'Evaluación del Curso'
    await sendEmail(inscripcion.estudiante.usuario.email, subject, 'Tu opinión es importante. Por favor, toma unos minutos para completar esta encuesta.', ctx.state.tenantId)
  }
  await ctx.log('send_survey', 'action', 'success', 'Encuesta enviada')
  return true
}

export async function registerTraining(config: any, ctx: ActionContext): Promise<boolean> {
  const { estudianteId, cursoId, tipoParticipacion } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await tenantClient.registroCapacitacion.create({
    data: {
      tenantId: ctx.state.tenantId, estudianteId: estudianteId || ctx.state.estudianteId,
      cursoId: cursoId || ctx.state.cursoId, tipo: tipoParticipacion || 'presencial',
      fecha: new Date(), asistencia: true,
    },
  })
  await ctx.log('register_training', 'action', 'success', 'Capacitación registrada')
  return true
}

export async function notifyCertification(config: any, ctx: ActionContext): Promise<boolean> {
  const { estudianteId, cursoId } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const inscripcion = await tenantClient.inscripcion.findFirst({
    where: { estudianteId: estudianteId || ctx.state.estudianteId, cursoId: cursoId || ctx.state.cursoId, estado: 'completada' },
  })

  if (inscripcion) {
    const { notifyByTelegram, sendEmail } = await import('@/lib/skills/notification-layer')
    const context = createSystemContext(ctx.state.tenantId)
    const message = '🎓 *¡Felicitaciones!*\n\nHas completado el curso y puedes descargar tu certificado.'
    notifyByTelegram(message, context).catch(() => {})

    const estudiante = await tenantClient.estudiante.findUnique({
      where: { id: estudianteId || ctx.state.estudianteId },
      include: { usuario: true },
    })
    if (estudiante?.usuario?.email) {
      await sendEmail(estudiante.usuario.email, '¡Felicidades por completar el curso!', message, ctx.state.tenantId)
    }
  }
  await ctx.log('notify_certification', 'action', 'success', 'Notificación de certificación enviada')
  return true
}
