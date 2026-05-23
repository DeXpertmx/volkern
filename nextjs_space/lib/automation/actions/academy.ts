import { ActionContext } from '../types'
import { createSystemContext } from '@/lib/skills/context'

export async function sendOnboarding(config: any, ctx: ActionContext): Promise<boolean> {
  const { estudianteId, cursoId } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const estudiante = await (tenantClient as any).estudiante.findUnique({
    where: { id: estudianteId || ctx.state.estudianteId },
    include: { usuario: true },
  }) as any
  if (estudiante?.usuario?.email) {
    const { sendEmail } = await import('@/lib/resend-email')
    await sendEmail({ to: estudiante.usuario.email, subject: '¡Bienvenido a tu nuevo curso!', text: '¡Bienvenido al curso! Estamos emocionados de tenerte. Comienza tu viaje de aprendizaje hoy.' })
  }
  await ctx.log('send_onboarding', 'action', 'success', 'Onboarding de estudiante enviado')
  return true
}

export async function createEvaluation(config: any, ctx: ActionContext): Promise<boolean> {
  const { estudianteId, cursoId, tipo, titulo } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).evaluacion.create({
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

  const inscripcion = await (tenantClient as any).inscripcion.findUnique({
    where: { id: inscripcionId || ctx.state.inscripcionId },
    include: { estudiante: { include: { usuario: true } } },
  })
  if (inscripcion?.estudiante?.usuario?.email) {
    const { sendEmail } = await import('@/lib/resend-email')
    const subject = tipoEncuesta === 'satisfaccion' ? 'Encuesta de Satisfacción' : 'Evaluación del Curso'
    await sendEmail({ to: inscripcion.estudiante.usuario.email, subject, text: 'Tu opinión es importante. Por favor, toma unos minutos para completar esta encuesta.' })
  }
  await ctx.log('send_survey', 'action', 'success', 'Encuesta enviada')
  return true
}

export async function registerTraining(config: any, ctx: ActionContext): Promise<boolean> {
  const { estudianteId, cursoId, tipoParticipacion } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).registroCapacitacion.create({
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

  const inscripcion = await (tenantClient as any).inscripcion.findFirst({
    where: { estudianteId: estudianteId || ctx.state.estudianteId, cursoId: cursoId || ctx.state.cursoId, estado: 'completada' },
  })

  if (inscripcion) {
    const { notifyByTelegram } = await import('@/lib/skills/notification-layer')
    const { sendEmail } = await import('@/lib/resend-email')
    const context = createSystemContext(ctx.state.tenantId)
    const message = '🎓 *¡Felicitaciones!*\n\nHas completado el curso y puedes descargar tu certificado.'
    notifyByTelegram(message, context).catch(() => {})

    const estudiante = await (tenantClient as any).estudiante.findUnique({
      where: { id: estudianteId || ctx.state.estudianteId },
      include: { usuario: true },
    }) as any
    if (estudiante?.usuario?.email) {
      await sendEmail({ to: estudiante.usuario.email, subject: '¡Felicidades por completar el curso!', text: message })
    }
  }
  await ctx.log('notify_certification', 'action', 'success', 'Notificación de certificación enviada')
  return true
}
