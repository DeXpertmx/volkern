
import { prisma } from './db';
import { sendWhatsAppMessage } from './whatsapp';
import { sendEmail } from './resend-email';
import { sendSMS } from './sms';
import { sendTelegramMessage } from './telegram';
import { sendFacebookMessage, sendInstagramMessage } from './meta-messenger';

/**
 * Motor de Ejecución de Campañas Multicanal
 * Gestiona el envío, tracking y análisis de campañas
 */

export interface CampaignExecutionResult {
  success: boolean;
  executionId: string;
  error?: string;
}

export interface CampaignStats {
  totalDestinatarios: number;
  enviados: number;
  entregados: number;
  abiertos: number;
  clicks: number;
  conversiones: number;
  errores: number;
  tasaEntrega: number;
  tasaApertura: number;
  tasaClick: number;
  tasaConversion: number;
}

export interface ABTestVariant {
  variante: string;
  nombre: string;
  enviados: number;
  entregados: number;
  abiertos: number;
  clicks: number;
  conversiones: number;
  tasaApertura: number;
  tasaClick: number;
  tasaConversion: number;
}

export interface ABTestResults {
  campanaNombre: string;
  variantes: ABTestVariant[];
  mejorVariante: string;
  confianzaEstadistica: number;
  fechaInicio: Date;
  fechaFin?: Date;
}

/**
 * Obtiene los destinatarios basados en la segmentación de la campaña
 */
async function getTargetAudience(
  targetType: string,
  targetConfig: any
): Promise<Array<{ tipo: string; id: string; nombre: string; email?: string; telefono?: string }>> {
  const destinatarios: Array<any> = [];

  switch (targetType) {
    case 'todos':
      // Obtener todos los leads y estudiantes
      const leads = await prisma.lead.findMany({
        select: {
          id: true,
          nombre: true,
          email: true,
          telefono: true,
          empresa: true,
          perfilFiscal: { select: { idFiscal: true } }
        }
      });
      const estudiantes = await prisma.estudiante.findMany({
        select: { id: true, nombre: true, email: true, telefono: true }
      });

      destinatarios.push(
        ...leads.map(l => ({
          tipo: 'lead',
          id: l.id,
          nombre: l.nombre,
          email: l.email,
          telefono: l.telefono || undefined,
          empresa: l.empresa || undefined,
          idFiscal: l.perfilFiscal?.idFiscal || undefined
        })),
        ...estudiantes.map(e => ({ tipo: 'estudiante', id: e.id, nombre: e.nombre, email: e.email, telefono: e.telefono || undefined }))
      );
      break;

    case 'score_range':
      // Filtrar por rango de puntuación
      const { minScore, maxScore } = targetConfig;
      const leadsWithScore = await prisma.lead.findMany({
        where: {
          score: {
            puntuacion: {
              gte: minScore || 0,
              lte: maxScore || 1000
            }
          }
        },
        select: {
          id: true,
          nombre: true,
          email: true,
          telefono: true,
          empresa: true,
          perfilFiscal: { select: { idFiscal: true } }
        }
      });
      destinatarios.push(...leadsWithScore.map(l => ({
        tipo: 'lead',
        id: l.id,
        nombre: l.nombre,
        email: l.email,
        telefono: l.telefono || undefined,
        empresa: l.empresa || undefined,
        idFiscal: l.perfilFiscal?.idFiscal || undefined
      })));
      break;

    case 'estado':
      // Filtrar por estado del lead
      const { estados } = targetConfig;
      const leadsByEstado = await prisma.lead.findMany({
        where: { estado: { in: estados || [] } },
        select: {
          id: true,
          nombre: true,
          email: true,
          telefono: true,
          empresa: true,
          perfilFiscal: { select: { idFiscal: true } }
        }
      });
      destinatarios.push(...leadsByEstado.map(l => ({
        tipo: 'lead',
        id: l.id,
        nombre: l.nombre,
        email: l.email,
        telefono: l.telefono || undefined,
        empresa: l.empresa || undefined,
        idFiscal: l.perfilFiscal?.idFiscal || undefined
      })));
      break;

    case 'curso':
      // Filtrar estudiantes de cursos específicos
      const { cursoIds } = targetConfig;
      const estudiantesByCurso = await prisma.estudiante.findMany({
        where: {
          inscripciones: {
            some: {
              cursoId: { in: cursoIds || [] },
              estado: 'activo'
            }
          }
        },
        select: { id: true, nombre: true, email: true, telefono: true }
      });
      destinatarios.push(...estudiantesByCurso.map(e => ({ tipo: 'estudiante', id: e.id, nombre: e.nombre, email: e.email, telefono: e.telefono || undefined })));
      break;

    case 'custom':
      // IDs específicos proporcionados
      const { leadIds = [], estudianteIds = [] } = targetConfig;

      if (leadIds.length > 0) {
        const customLeads = await prisma.lead.findMany({
          where: { id: { in: leadIds } },
          select: {
            id: true,
            nombre: true,
            email: true,
            telefono: true,
            empresa: true,
            perfilFiscal: { select: { idFiscal: true } }
          }
        });
        destinatarios.push(...customLeads.map(l => ({
          tipo: 'lead',
          id: l.id,
          nombre: l.nombre,
          email: l.email,
          telefono: l.telefono || undefined,
          empresa: l.empresa || undefined,
          idFiscal: l.perfilFiscal?.idFiscal || undefined
        })));
      }

      if (estudianteIds.length > 0) {
        const customEstudiantes = await prisma.estudiante.findMany({
          where: { id: { in: estudianteIds } },
          select: { id: true, nombre: true, email: true, telefono: true }
        });
        destinatarios.push(...customEstudiantes.map(e => ({ tipo: 'estudiante', id: e.id, nombre: e.nombre, email: e.email, telefono: e.telefono || undefined })));
      }
      break;
  }

  return destinatarios;
}

/**
 * Reemplaza variables en el contenido del mensaje
 */
function replaceVariables(contenido: string, destinatario: any, tenant?: any): string {
  let resultado = contenido;
  const now = new Date();
  const fechaHoy = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

  resultado = resultado.replace(/\{nombre\}/g, destinatario.nombre || '');
  resultado = resultado.replace(/\{email\}/g, destinatario.email || '');
  resultado = resultado.replace(/\{telefono\}/g, destinatario.telefono || '');
  resultado = resultado.replace(/\{empresa\}/g, destinatario.empresa || tenant?.nombre || '');
  resultado = resultado.replace(/\{id_fiscal\}/g, destinatario.idFiscal || '');
  resultado = resultado.replace(/\{fecha_hoy\}/g, fechaHoy);

  if (tenant?.id && destinatario.email) {
    const unsubLink = `${process.env.NEXTAUTH_URL || ''}/unsubscribe?email=${encodeURIComponent(destinatario.email)}&tenantId=${tenant.id}`;
    resultado = resultado.replace(/\{unsubscribe_link\}/g, unsubLink);
  } else {
    resultado = resultado.replace(/\{unsubscribe_link\}/g, '#');
  }

  return resultado;
}

/**
 * Envía un mensaje por el canal especificado
 */
async function sendMessage(
  canal: string,
  destinatario: any,
  mensaje: any,
  tenantId: string,
  tenant?: any
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const contenido = replaceVariables(mensaje.contenido, destinatario, tenant);

  try {
    switch (canal) {
      case 'whatsapp':
        if (!destinatario.telefono) {
          return { success: false, error: 'Teléfono no disponible' };
        }
        await sendWhatsAppMessage(destinatario.telefono, contenido, tenantId);
        return { success: true };

      case 'email':
        if (!destinatario.email) {
          return { success: false, error: 'Email no disponible' };
        }
        const asunto = mensaje.asunto ? replaceVariables(mensaje.asunto, destinatario, tenant) : 'Mensaje de Volkern';
        await sendEmail({
          to: destinatario.email,
          subject: asunto,
          html: contenido,
          text: contenido
        });
        return { success: true };

      case 'sms':
        if (!destinatario.telefono) {
          return { success: false, error: 'Teléfono no disponible' };
        }
        await sendSMS(destinatario.telefono, contenido);
        return { success: true };

      case 'telegram':
        if (!destinatario.telefono) {
          return { success: false, error: 'Teléfono no disponible' };
        }
        await sendTelegramMessage(destinatario.telefono, contenido);
        return { success: true };

      case 'facebook':
        await sendFacebookMessage(destinatario.id, contenido);
        return { success: true };

      case 'instagram':
        await sendInstagramMessage(destinatario.id, contenido);
        return { success: true };

      default:
        return { success: false, error: 'Canal no soportado' };
    }
  } catch (error: any) {
    console.error(`Error enviando mensaje por ${canal}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Ejecuta una campaña
 */
export async function executeCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { mensajes: true, tenant: true }
  });

  if (!campaign) {
    throw new Error('Campaña no encontrada');
  }

  if (campaign.estado !== 'borrador' && campaign.estado !== 'programada') {
    throw new Error('La campaña ya está en ejecución o completada');
  }

  // Actualizar estado a "en_curso"
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      estado: 'en_curso',
      fechaInicio: new Date()
    }
  });

  try {
    // Obtener destinatarios
    const destinatarios = await getTargetAudience(
      campaign.targetType,
      campaign.targetConfig as any
    );

    // Actualizar total de destinatarios
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { totalDestinatarios: destinatarios.length }
    });

    // Crear registros de ejecución para cada destinatario y canal
    const executions: any[] = [];
    for (const destinatario of destinatarios) {
      for (const canal of campaign.canales) {
        const mensaje = campaign.mensajes.find(m => m.canal === canal);
        if (!mensaje) continue;

        const execution = await prisma.campaignExecution.create({
          data: {
            campaignId: campaign.id,
            destinatarioTipo: destinatario.tipo,
            destinatarioId: destinatario.id,
            destinatarioNombre: destinatario.nombre,
            destinatarioEmail: destinatario.email,
            destinatarioTelefono: destinatario.telefono,
            canal: canal,
            estado: 'pendiente'
          }
        });
        executions.push({ execution, destinatario, mensaje });
      }
    }

    // Enviar mensajes
    let enviados = 0;
    let entregados = 0;
    let errores = 0;

    for (const { execution, destinatario, mensaje } of executions) {
      // Actualizar estado a "enviando"
      await prisma.campaignExecution.update({
        where: { id: execution.id },
        data: {
          estado: 'enviando',
          intentos: 1
        }
      });

      // Enviar mensaje
      const resultado = await sendMessage(execution.canal, destinatario, mensaje, campaign.tenantId!, campaign.tenant);

      if (resultado.success) {
        enviados++;
        entregados++;
        await prisma.campaignExecution.update({
          where: { id: execution.id },
          data: {
            estado: 'entregado',
            fechaEnviado: new Date(),
            fechaEntregado: new Date()
          }
        });
      } else {
        errores++;
        await prisma.campaignExecution.update({
          where: { id: execution.id },
          data: {
            estado: 'error',
            errorMensaje: resultado.error
          }
        });
      }

      // Pequeño delay para no sobrecargar los servicios
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Actualizar métricas de la campaña
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        totalEnviados: enviados,
        totalEntregados: entregados,
        totalErrores: errores,
        estado: 'completada',
        fechaCompletado: new Date()
      }
    });

    // Crear métricas agregadas
    await updateCampaignMetrics(campaignId);

  } catch (error: any) {
    console.error('Error ejecutando campaña:', error);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        estado: 'cancelada'
      }
    });
    throw error;
  }
}

/**
 * Actualiza las métricas de una campaña
 */
export async function updateCampaignMetrics(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      executions: true
    }
  });

  if (!campaign) return;

  // Calcular métricas por canal
  for (const canal of campaign.canales) {
    const executionsCanal = campaign.executions.filter(e => e.canal === canal);

    const enviados = executionsCanal.filter(e => ['enviado', 'entregado', 'abierto', 'click', 'convertido'].includes(e.estado)).length;
    const entregados = executionsCanal.filter(e => ['entregado', 'abierto', 'click', 'convertido'].includes(e.estado)).length;
    const abiertos = executionsCanal.filter(e => ['abierto', 'click', 'convertido'].includes(e.estado)).length;
    const clicks = executionsCanal.filter(e => ['click', 'convertido'].includes(e.estado)).length;
    const conversiones = executionsCanal.filter(e => e.estado === 'convertido').length;
    const errores = executionsCanal.filter(e => e.estado === 'error').length;

    const tasaEntrega = enviados > 0 ? (entregados / enviados) * 100 : 0;
    const tasaApertura = entregados > 0 ? (abiertos / entregados) * 100 : 0;
    const tasaClick = abiertos > 0 ? (clicks / abiertos) * 100 : 0;
    const tasaConversion = clicks > 0 ? (conversiones / clicks) * 100 : 0;

    await prisma.campaignMetrics.create({
      data: {
        campaignId: campaign.id,
        canal: canal,
        enviados,
        entregados,
        abiertos,
        clicks,
        conversiones,
        errores,
        tasaEntrega,
        tasaApertura,
        tasaClick,
        tasaConversion
      }
    });
  }

  // Métricas totales
  const totalEnviados = campaign.executions.filter(e => ['enviado', 'entregado', 'abierto', 'click', 'convertido'].includes(e.estado)).length;
  const totalEntregados = campaign.executions.filter(e => ['entregado', 'abierto', 'click', 'convertido'].includes(e.estado)).length;
  const totalAbiertos = campaign.executions.filter(e => ['abierto', 'click', 'convertido'].includes(e.estado)).length;
  const totalClicks = campaign.executions.filter(e => ['click', 'convertido'].includes(e.estado)).length;
  const totalConversiones = campaign.executions.filter(e => e.estado === 'convertido').length;
  const totalErrores = campaign.executions.filter(e => e.estado === 'error').length;

  const tasaEntrega = totalEnviados > 0 ? (totalEntregados / totalEnviados) * 100 : 0;
  const tasaApertura = totalEntregados > 0 ? (totalAbiertos / totalEntregados) * 100 : 0;
  const tasaClick = totalAbiertos > 0 ? (totalClicks / totalAbiertos) * 100 : 0;
  const tasaConversion = totalClicks > 0 ? (totalConversiones / totalClicks) * 100 : 0;

  await prisma.campaignMetrics.create({
    data: {
      campaignId: campaign.id,
      canal: null,
      enviados: totalEnviados,
      entregados: totalEntregados,
      abiertos: totalAbiertos,
      clicks: totalClicks,
      conversiones: totalConversiones,
      errores: totalErrores,
      tasaEntrega,
      tasaApertura,
      tasaClick,
      tasaConversion
    }
  });
}

/**
 * Obtiene estadísticas de una campaña
 */
export async function getCampaignStats(campaignId: string): Promise<CampaignStats> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      metrics: {
        where: { canal: null }, // Métricas totales
        orderBy: { fecha: 'desc' },
        take: 1
      }
    }
  });

  if (!campaign) {
    throw new Error('Campaña no encontrada');
  }

  const latestMetrics = campaign.metrics[0];

  if (latestMetrics) {
    return {
      totalDestinatarios: campaign.totalDestinatarios,
      enviados: latestMetrics.enviados,
      entregados: latestMetrics.entregados,
      abiertos: latestMetrics.abiertos,
      clicks: latestMetrics.clicks,
      conversiones: latestMetrics.conversiones,
      errores: latestMetrics.errores,
      tasaEntrega: latestMetrics.tasaEntrega,
      tasaApertura: latestMetrics.tasaApertura,
      tasaClick: latestMetrics.tasaClick,
      tasaConversion: latestMetrics.tasaConversion
    };
  }

  return {
    totalDestinatarios: campaign.totalDestinatarios,
    enviados: campaign.totalEnviados,
    entregados: campaign.totalEntregados,
    abiertos: campaign.totalAbiertos,
    clicks: campaign.totalClicks,
    conversiones: campaign.totalConversiones,
    errores: campaign.totalErrores,
    tasaEntrega: campaign.totalEnviados > 0 ? (campaign.totalEntregados / campaign.totalEnviados) * 100 : 0,
    tasaApertura: campaign.totalEntregados > 0 ? (campaign.totalAbiertos / campaign.totalEntregados) * 100 : 0,
    tasaClick: campaign.totalAbiertos > 0 ? (campaign.totalClicks / campaign.totalAbiertos) * 100 : 0,
    tasaConversion: campaign.totalClicks > 0 ? (campaign.totalConversiones / campaign.totalClicks) * 100 : 0
  };
}

/**
 * Pausa una campaña en ejecución
 */
export async function pauseCampaign(campaignId: string): Promise<void> {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { estado: 'pausada' }
  });
}

/**
 * Reanuda una campaña pausada
 */
export async function resumeCampaign(campaignId: string): Promise<void> {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { estado: 'en_curso' }
  });

  // Continuar con los envíos pendientes
  await executeCampaign(campaignId);
}

/**
 * Cancela una campaña
 */
export async function cancelCampaign(campaignId: string): Promise<void> {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      estado: 'cancelada',
      fechaCompletado: new Date()
    }
  });

  // Cancelar ejecuciones pendientes
  await prisma.campaignExecution.updateMany({
    where: {
      campaignId: campaignId,
      estado: 'pendiente'
    },
    data: {
      estado: 'error',
      errorMensaje: 'Campaña cancelada'
    }
  });
}

/**
 * ==================== A/B TESTING ====================
 */

/**
 * Calcula los resultados de un A/B test
 */
export async function getABTestResults(campaignId: string): Promise<ABTestResults> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      executions: {
        where: {
          variante: { not: null }
        }
      },
      mensajes: true
    }
  });

  if (!campaign) {
    throw new Error('Campaña no encontrada');
  }

  if (campaign.tipo !== 'a_b_test') {
    throw new Error('Esta campaña no es un A/B test');
  }

  // Obtener variantes únicas
  const variantesUnicas = [...new Set(campaign.executions
    .map(e => e.variante)
    .filter((v): v is string => v !== null))];

  // Calcular métricas por variante
  const variantes: ABTestVariant[] = await Promise.all(
    variantesUnicas.map(async (variante) => {
      const executions = campaign.executions.filter(e => e.variante === variante);

      const enviados = executions.filter(e =>
        ['enviado', 'entregado', 'abierto', 'click', 'convertido'].includes(e.estado)
      ).length;

      const entregados = executions.filter(e =>
        ['entregado', 'abierto', 'click', 'convertido'].includes(e.estado)
      ).length;

      const abiertos = executions.filter(e =>
        ['abierto', 'click', 'convertido'].includes(e.estado)
      ).length;

      const clicks = executions.filter(e =>
        ['click', 'convertido'].includes(e.estado)
      ).length;

      const conversiones = executions.filter(e => e.estado === 'convertido').length;

      const tasaApertura = entregados > 0 ? (abiertos / entregados) * 100 : 0;
      const tasaClick = abiertos > 0 ? (clicks / abiertos) * 100 : 0;
      const tasaConversion = clicks > 0 ? (conversiones / clicks) * 100 : 0;

      // Obtener nombre de la variante del mensaje
      const mensaje = campaign.mensajes.find(m => m.variante === variante);
      const nombre = mensaje?.variante || variante;

      return {
        variante,
        nombre: `Variante ${nombre}`,
        enviados,
        entregados,
        abiertos,
        clicks,
        conversiones,
        tasaApertura,
        tasaClick,
        tasaConversion
      };
    })
  );

  // Determinar la mejor variante (por tasa de conversión)
  const mejorVariante = variantes.reduce((mejor, actual) =>
    actual.tasaConversion > mejor.tasaConversion ? actual : mejor
    , variantes[0]);

  // Calcular confianza estadística (simplificado)
  const confianzaEstadistica = calcularConfianzaEstadistica(variantes);

  return {
    campanaNombre: campaign.nombre,
    variantes,
    mejorVariante: mejorVariante.variante,
    confianzaEstadistica,
    fechaInicio: campaign.fechaInicio || campaign.fechaCreacion,
    fechaFin: campaign.fechaCompletado || undefined
  };
}

/**
 * Calcula la confianza estadística de un A/B test
 * (Implementación simplificada - en producción usar test estadístico apropiado)
 */
function calcularConfianzaEstadistica(variantes: ABTestVariant[]): number {
  if (variantes.length < 2) return 0;

  // Ordenar por tasa de conversión
  const ordenadas = [...variantes].sort((a, b) => b.tasaConversion - a.tasaConversion);
  const mejor = ordenadas[0];
  const segunda = ordenadas[1];

  // Si no hay suficientes datos, baja confianza
  if (mejor.enviados < 30 || segunda.enviados < 30) {
    return 0;
  }

  // Diferencia relativa entre las tasas
  const diferencia = Math.abs(mejor.tasaConversion - segunda.tasaConversion);
  const promedioConversiones = (mejor.conversiones + segunda.conversiones) / 2;

  // Calcular confianza basada en diferencia y tamaño de muestra
  let confianza = 0;

  if (diferencia > 20 && promedioConversiones > 10) {
    confianza = 95;
  } else if (diferencia > 10 && promedioConversiones > 5) {
    confianza = 80;
  } else if (diferencia > 5 && promedioConversiones > 3) {
    confianza = 65;
  } else {
    confianza = 50;
  }

  return Math.min(confianza, 99); // Máximo 99%
}

/**
 * Selecciona automáticamente la mejor variante y finaliza el A/B test
 */
export async function finalizarABTest(campaignId: string): Promise<void> {
  const results = await getABTestResults(campaignId);

  // Actualizar la campaña con la variante ganadora
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      estado: 'completada',
      fechaCompletado: new Date()
    }
  });

  console.log(`A/B Test finalizado. Variante ganadora: ${results.mejorVariante} con ${results.confianzaEstadistica}% de confianza`);
}
