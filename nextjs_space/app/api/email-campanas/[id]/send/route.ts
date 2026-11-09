export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { sendEmail, replaceTemplateVariables } from '@/lib/ses-email';
import { checkResourceLimit } from '@/lib/limits';

// POST /api/email-campanas/[id]/send - Enviar o programar campaña
export async function POST(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    // Obtener campaña
    const campana = await prisma.emailCampaign.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId
      },
      include: {
        audiencia: true
      }
    });

    if (!campana) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 });
    }

    // Validar estado
    if (!['borrador', 'programada'].includes(campana.estado)) {
      return NextResponse.json(
        { error: 'La campaña no puede ser enviada en su estado actual' },
        { status: 400 }
      );
    }

    // Obtener leads destinatarios
    const leadsQuery: any = {
      tenantId: user.tenantId,
      email: { not: '' }
    };

    // Aplicar filtros de audiencia
    if (campana.audienciaId && campana.audiencia) {
      const filtrosAudiencia = JSON.parse(campana.audiencia.filtrosJSON || '{}');
      
      if (filtrosAudiencia.tags?.length > 0) {
        leadsQuery.tags = { contains: filtrosAudiencia.tags[0] };
      }
      
      if (filtrosAudiencia.scoreMin !== undefined || filtrosAudiencia.scoreMax !== undefined) {
        leadsQuery.scoreValue = {
          gte: filtrosAudiencia.scoreMin || 0,
          lte: filtrosAudiencia.scoreMax || 100
        };
      }
      
      if (filtrosAudiencia.estado) {
        leadsQuery.estado = filtrosAudiencia.estado;
      }
    } else if (campana.filtrosJSON) {
      // Aplicar filtros personalizados
      const filtros = JSON.parse(campana.filtrosJSON);
      
      if (filtros.tags?.length > 0) {
        leadsQuery.tags = { contains: filtros.tags[0] };
      }
      
      if (filtros.scoreMin !== undefined || filtros.scoreMax !== undefined) {
        leadsQuery.scoreValue = {
          gte: filtros.scoreMin || 0,
          lte: filtros.scoreMax || 100
        };
      }
      
      if (filtros.estado) {
        leadsQuery.estado = filtros.estado;
      }
    }

    const leads = await prisma.lead.findMany({
      where: leadsQuery,
      select: {
        id: true,
        nombre: true,
        email: true,
        empresa: true,
        cargo: true,
        telefono: true
      }
    });

    if (leads.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron destinatarios que cumplan los criterios' },
        { status: 400 }
      );
    }

    // Filtrar emails en lista de unsuscribe
    const emailsUnsubscribe = await prisma.unsubscribeList.findMany({
      where: {
        tenantId: user.tenantId,
        email: { in: leads.map(l => l.email) }
      },
      select: { email: true }
    });

    const emailsExcluidos = new Set(emailsUnsubscribe.map(u => u.email));
    const leadsValidos = leads.filter(lead => !emailsExcluidos.has(lead.email));

    if (leadsValidos.length === 0) {
      return NextResponse.json(
        { error: 'Todos los destinatarios están en la lista de exclusión' },
        { status: 400 }
      );
    }

    // Validar límite de emails antes de enviar
    const limitCheck = await checkResourceLimit(user.tenantId, 'emails_per_month');
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: limitCheck.message || 'Has alcanzado el límite de emails mensuales',
          code: 'LIMIT_REACHED',
          details: {
            current: limitCheck.current,
            max: limitCheck.max,
            cantidadAEnviar: leadsValidos.length
          }
        },
        { status: 403 }
      );
    }

    // Verificar si hay suficiente cuota para todos los destinatarios
    const emailsDisponibles = limitCheck.max === -1 ? Infinity : limitCheck.max - limitCheck.current;
    if (emailsDisponibles < leadsValidos.length) {
      return NextResponse.json(
        {
          error: `No tienes suficiente cuota de emails. Disponibles: ${emailsDisponibles}, necesitas: ${leadsValidos.length}`,
          code: 'INSUFFICIENT_QUOTA',
          details: {
            available: emailsDisponibles,
            required: leadsValidos.length
          }
        },
        { status: 403 }
      );
    }

    // Si es envío inmediato, procesar ahora
    if (campana.tipoProgramacion === 'inmediato') {
      // Actualizar estado de la campaña
      await prisma.emailCampaign.update({
        where: { id: campana.id },
        data: {
          estado: 'enviando',
          totalDestinatarios: leadsValidos.length
        }
      });

      // Crear registros de destinatarios con asignación de variantes A/B si aplica
      const destinatarios = await Promise.all(
        leadsValidos.map((lead, index) => {
          // Asignar variante A/B si es test
          let varianteAsignada: string | undefined;
          if (campana.esABTest) {
            // Usar porcentajeA para distribuir (ej: 50% = mitad A, mitad B)
            const porcentaje = campana.porcentajeA || 50;
            const umbral = (porcentaje / 100) * leadsValidos.length;
            varianteAsignada = index < umbral ? 'A' : 'B';
          }

          return prisma.campaignRecipient.create({
            data: {
              campanaId: campana.id,
              leadId: lead.id,
              tenantId: user.tenantId!,
              emailDestinatario: lead.email,
              nombreDestinatario: lead.nombre ?? undefined,
              estado: 'pendiente',
              varianteAsignada
            }
          });
        })
      );

      // Procesar envíos en segundo plano (limitado a batches)
      procesarEnvios(campana, leadsValidos, destinatarios, user.tenantId).catch(error => {
        console.error('Error procesando envíos:', error);
      });

      return NextResponse.json({
        success: true,
        message: `Campaña en proceso de envío a ${leadsValidos.length} destinatarios`,
        totalDestinatarios: leadsValidos.length,
        excluidos: emailsExcluidos.size
      });
    } else {
      // Programar para envío posterior
      await prisma.emailCampaign.update({
        where: { id: campana.id },
        data: {
          estado: 'programada',
          totalDestinatarios: leadsValidos.length
        }
      });

      // Crear destinatarios programados
      await Promise.all(
        leadsValidos.map(lead =>
          prisma.campaignRecipient.create({
            data: {
              campanaId: campana.id,
              leadId: lead.id,
              tenantId: user.tenantId!,
              emailDestinatario: lead.email,
              nombreDestinatario: lead.nombre ?? undefined,
              estado: 'pendiente',
              fechaProgramada: campana.fechaEnvio ?? undefined
            }
          })
        )
      );

      return NextResponse.json({
        success: true,
        message: `Campaña programada para ${campana.fechaEnvio?.toLocaleString('es-MX')}`,
        totalDestinatarios: leadsValidos.length,
        fechaEnvio: campana.fechaEnvio
      });
    }
  } catch (error: any) {
    console.error('Error al enviar campaña:', error);
    return NextResponse.json(
      { error: 'Error al enviar campaña', details: error.message },
      { status: 500 }
    );
  }
}

// Función para procesar envíos en batches
async function procesarEnvios(
  campana: any,
  leads: any[],
  destinatarios: any[],
  tenantId: string
) {
  const BATCH_SIZE = 10; // Procesar 10 emails a la vez
  const DELAY_MS = 2000; // 2 segundos entre batches
  
  let enviados = 0;
  let fallidos = 0;

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const destinatariosBatch = destinatarios.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (lead, idx) => {
        try {
          const destinatario = destinatariosBatch[idx];

          // Reemplazar variables en el contenido
          const variables: Record<string, string> = {
            nombre: lead.nombre || '',
            email: lead.email || '',
            empresa: lead.empresa ?? '',
            cargo: lead.cargo ?? '',
            telefono: lead.telefono ?? '',
            link_agendamiento: 'https://volkern.app/dashboard/citas'
          };

          // Usar variante correcta si es A/B Test
          let contenidoHTML: string;
          if (campana.esABTest && destinatario.varianteAsignada) {
            const contenidoVariante = destinatario.varianteAsignada === 'A' 
              ? campana.varianteA 
              : campana.varianteB;
            contenidoHTML = replaceTemplateVariables(contenidoVariante || campana.contenidoHTML, variables);
          } else {
            contenidoHTML = replaceTemplateVariables(campana.contenidoHTML, variables);
          }
          
          const asunto = replaceTemplateVariables(campana.asunto, variables);

          // Agregar pixel de tracking
          const trackingPixel = `<img src="https://lh6.googleusercontent.com/Mrh0hEOUYvlA8LI2EUtgIJO-8fxM-hY1miwfBU6nNd4S4fpWqIVrh5v4PxHa4fOSDsIesSMiOmeQdLGLd8az6d3pFaag0UFR7zIZ6oKHVd8ojj1XbbHC6pdDWmFI5M4dv5cSN7PB" width="1" height="1" style="display:none;" alt="" />`;
          contenidoHTML = contenidoHTML + trackingPixel;

          // Agregar link de unsuscribe
          const tokenUnsub = Buffer.from(`${tenantId}:${lead.email}:${Date.now()}`).toString('base64');
          const contenidoConUnsub = contenidoHTML + `
            <br/><br/>
            <p style="font-size: 12px; color: #666; text-align: center;">
              <a href="https://volkern.app/api/email-campanas/unsubscribe/${tokenUnsub}" 
                 style="color: #666; text-decoration: underline;">
                Cancelar suscripción
              </a>
            </p>
          `;

          // Enviar email
          const resultado = await sendEmail({
            to: lead.email,
            subject: asunto,
            html: contenidoConUnsub,
            from: `${campana.remitente} <${campana.remitenteEmail}>`,
            replyTo: campana.responderA,
            tenantSubdomain: tenantId
          });

          if (resultado.success) {
            await prisma.campaignRecipient.update({
              where: { id: destinatario.id },
              data: {
                estado: 'enviado',
                fechaEnviado: new Date()
              }
            });
            enviados++;

            // Registrar en el timeline del lead
            await prisma.interaction.create({
              data: {
                leadId: lead.id,
                tipo: 'email',
                contenido: `Campaña de email enviada: ${campana.nombre}`,
                resultado: 'positivo',
                metadatos: {
                  campanaId: campana.id,
                  asunto: campana.asunto
                }
              }
            });
          } else {
            await prisma.campaignRecipient.update({
              where: { id: destinatario.id },
              data: {
                estado: 'fallido',
                errorMensaje: resultado.error
              }
            });
            fallidos++;
          }
        } catch (error: any) {
          console.error(`Error enviando email a ${lead.email}:`, error);
          fallidos++;
        }
      })
    );

    // Delay entre batches
    if (i + BATCH_SIZE < leads.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  // Actualizar estadísticas de la campaña
  await prisma.emailCampaign.update({
    where: { id: campana.id },
    data: {
      estado: 'enviada',
      totalEnviados: enviados,
      totalFallidos: fallidos
    }
  });

  console.log(`Campaña ${campana.id} completada: ${enviados} enviados, ${fallidos} fallidos`);
}
