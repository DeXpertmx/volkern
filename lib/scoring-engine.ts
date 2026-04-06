import { prisma } from './db';

export interface ScoreChange {
  leadId: string;
  evento: string;
  categoria: string;
  detalles?: any;
}

export interface AIScoreResult {
  puntuacion: number;
  razon: string;
  categoria: string;
}

export interface ScoreResult {
  puntuacionAnterior: number;
  puntuacionNueva: number;
  cambio: number;
  categoria: string;
}

/**
 * Motor de puntuación de leads
 * Calcula y actualiza automáticamente los scores de leads basado en reglas
 */
export class ScoringEngine {
  /**
   * Calcula el score de un lead basado en un evento
   */
  static async calculateScore(change: ScoreChange): Promise<ScoreResult | null> {
    try {
      const { leadId, evento, categoria, detalles } = change;

      // Obtener el lead
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: {
          score: true,
          citas: true,
          conversaciones: {
            include: {
              mensajes: true,
            },
          },
        },
      });

      if (!lead) {
        console.error(`Lead ${leadId} no encontrado`);
        return null;
      }

      // Obtener las reglas activas para el evento
      const rules = await prisma.scoringRule.findMany({
        where: {
          evento: evento,
          activo: true,
        },
        orderBy: {
          orden: 'asc',
        },
      });

      if (rules.length === 0) {
        console.log(`No hay reglas activas para el evento: ${evento}`);
        return null;
      }

      // Calcular los puntos a otorgar
      let puntosGanados = 0;
      let razonCambio = '';

      for (const rule of rules) {
        // Evaluar condiciones si existen
        if (rule.condiciones && typeof rule.condiciones === 'object') {
          const condiciones = rule.condiciones as any;
          if (!this.evaluateConditions(condiciones, { lead, detalles })) {
            continue;
          }
        }

        puntosGanados += rule.puntos;
        razonCambio = razonCambio ? `${razonCambio}, ${rule.nombre}` : rule.nombre;
      }

      if (puntosGanados === 0) {
        console.log(`No se otorgaron puntos para el evento: ${evento}`);
        return null;
      }

      // Obtener o crear el score del lead
      let leadScore = lead.score;
      const puntuacionAnterior = leadScore?.puntuacion || 0;

      if (!leadScore) {
        leadScore = await prisma.leadScore.create({
          data: {
            leadId: leadId,
            puntuacion: 0,
            puntuacionDemografica: 0,
            puntuacionComportamiento: 0,
            puntuacionInteraccion: 0,
            puntuacionEngagement: 0,
          },
        });
      }

      // Actualizar el score según la categoría
      const updateData: any = {
        puntuacion: leadScore.puntuacion + puntosGanados,
      };

      switch (categoria) {
        case 'demografica':
          updateData.puntuacionDemografica = leadScore.puntuacionDemografica + puntosGanados;
          break;
        case 'comportamiento':
          updateData.puntuacionComportamiento = leadScore.puntuacionComportamiento + puntosGanados;
          break;
        case 'interaccion':
          updateData.puntuacionInteraccion = leadScore.puntuacionInteraccion + puntosGanados;
          break;
        case 'engagement':
          updateData.puntuacionEngagement = leadScore.puntuacionEngagement + puntosGanados;
          break;
      }

      // Determinar la categoría del lead
      const nuevaCategoria = await this.determineCategory(updateData.puntuacion);
      updateData.categoria = nuevaCategoria;

      // Actualizar el score
      const updatedScore = await prisma.leadScore.update({
        where: { id: leadScore.id },
        data: updateData,
      });

      // Crear registro en el historial
      await prisma.scoreHistory.create({
        data: {
          leadId: leadId,
          puntuacionAnterior: puntuacionAnterior,
          puntuacionNueva: updatedScore.puntuacion,
          cambio: puntosGanados,
          razon: razonCambio,
          categoria: categoria,
          detalles: detalles || {},
        },
      });

      return {
        puntuacionAnterior,
        puntuacionNueva: updatedScore.puntuacion,
        cambio: puntosGanados,
        categoria: nuevaCategoria || 'Sin categoría',
      };
    } catch (error) {
      console.error('Error calculando score:', error);
      return null;
    }
  }

  /**
   * Recalcula el score completo de un lead desde cero
   */
  static async recalculateLeadScore(leadId: string): Promise<ScoreResult | null> {
    try {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: {
          citas: true,
          conversaciones: {
            include: {
              mensajes: true,
            },
          },
        },
      });

      if (!lead) {
        return null;
      }

      // Reiniciar el score
      let leadScore = await prisma.leadScore.findUnique({
        where: { leadId: leadId },
      });

      const puntuacionAnterior = leadScore?.puntuacion || 0;

      if (!leadScore) {
        leadScore = await prisma.leadScore.create({
          data: {
            leadId: leadId,
            puntuacion: 0,
            puntuacionDemografica: 0,
            puntuacionComportamiento: 0,
            puntuacionInteraccion: 0,
            puntuacionEngagement: 0,
          },
        });
      }

      // Calcular score demográfico
      let demograficaScore = 0;
      if (lead.telefono) demograficaScore += 5;
      if (lead.email) demograficaScore += 5;

      // Calcular score de interacción
      let interaccionScore = 0;
      interaccionScore += lead.conversaciones.length * 3;
      lead.conversaciones.forEach((conv) => {
        interaccionScore += conv.mensajes.length * 1;
      });

      // Calcular score de comportamiento (citas)
      let comportamientoScore = 0;
      comportamientoScore += lead.citas.length * 10;
      lead.citas.forEach((cita) => {
        if (cita.estado === 'completada') comportamientoScore += 20;
        if (cita.estado === 'pagada') comportamientoScore += 15;
      });

      const puntuacionTotal = demograficaScore + interaccionScore + comportamientoScore;
      const nuevaCategoria = await this.determineCategory(puntuacionTotal);

      // Actualizar el score
      const updatedScore = await prisma.leadScore.update({
        where: { id: leadScore.id },
        data: {
          puntuacion: puntuacionTotal,
          puntuacionDemografica: demograficaScore,
          puntuacionComportamiento: comportamientoScore,
          puntuacionInteraccion: interaccionScore,
          categoria: nuevaCategoria,
        },
      });

      // Registrar en el historial si hubo cambio
      if (puntuacionTotal !== puntuacionAnterior) {
        await prisma.scoreHistory.create({
          data: {
            leadId: leadId,
            puntuacionAnterior: puntuacionAnterior,
            puntuacionNueva: puntuacionTotal,
            cambio: puntuacionTotal - puntuacionAnterior,
            razon: 'Recálculo completo del score',
            categoria: 'recalculo',
            detalles: {
              demografica: demograficaScore,
              interaccion: interaccionScore,
              comportamiento: comportamientoScore,
            },
          },
        });
      }

      return {
        puntuacionAnterior,
        puntuacionNueva: updatedScore.puntuacion,
        cambio: puntuacionTotal - puntuacionAnterior,
        categoria: nuevaCategoria || 'Sin categoría',
      };
    } catch (error) {
      console.error('Error recalculando score:', error);
      return null;
    }
  }

  /**
   * Determina la categoría del lead según su puntuación
   */
  static async determineCategory(puntuacion: number): Promise<string | null> {
    const categories = await prisma.scoreCategory.findMany({
      orderBy: {
        puntuacionMin: 'desc',
      },
    });

    for (const category of categories) {
      if (puntuacion >= category.puntuacionMin && puntuacion <= category.puntuacionMax) {
        return category.nombre;
      }
    }

    return null;
  }

  /**
   * Evalúa condiciones de una regla
   */
  private static evaluateConditions(condiciones: any, context: any): boolean {
    // Implementación básica de evaluación de condiciones
    // Se puede expandir según necesidades
    try {
      if (condiciones.estadoLead) {
        if (context.lead.estado !== condiciones.estadoLead) {
          return false;
        }
      }

      if (condiciones.tieneEmail !== undefined) {
        if (!!context.lead.email !== condiciones.tieneEmail) {
          return false;
        }
      }

      if (condiciones.tieneTelefono !== undefined) {
        if (!!context.lead.telefono !== condiciones.tieneTelefono) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error evaluando condiciones:', error);
      return false;
    }
  }

  /**
   * Obtiene el score de un lead con detalles
   */
  static async getLeadScore(leadId: string) {
    try {
      const score = await prisma.leadScore.findUnique({
        where: { leadId: leadId },
        include: {
          lead: {
            select: {
              nombre: true,
              email: true,
              estado: true,
            },
          },
        },
      });

      if (!score) {
        // Si no existe, calcularlo
        await this.recalculateLeadScore(leadId);
        return await prisma.leadScore.findUnique({
          where: { leadId: leadId },
          include: {
            lead: {
              select: {
                nombre: true,
                email: true,
                estado: true,
              },
            },
          },
        });
      }

      return score;
    } catch (error) {
      console.error('Error obteniendo score:', error);
      return null;
    }
  }

  /**
   * Obtiene el historial de cambios de score de un lead
   */
  static async getScoreHistory(leadId: string, limit: number = 50) {
    try {
      return await prisma.scoreHistory.findMany({
        where: { leadId: leadId },
        orderBy: {
          fechaCreacion: 'desc',
        },
        take: limit,
      });
    } catch (error) {
      console.error('Error obteniendo historial de score:', error);
      return [];
    }
  }

  /**
   * Obtiene estadísticas de scoring
   */
  static async getScoringStats() {
    try {
      const scores = await prisma.leadScore.findMany({
        include: {
          lead: true,
        },
      });

      const stats = {
        totalLeads: scores.length,
        promedioScore: 0,
        distribucionCategorias: {} as Record<string, number>,
        topLeads: [] as any[],
      };

      if (scores.length > 0) {
        const totalScore = scores.reduce((sum, s) => sum + s.puntuacion, 0);
        stats.promedioScore = Math.round(totalScore / scores.length);

        scores.forEach((score) => {
          const cat = score.categoria || 'Sin categoría';
          stats.distribucionCategorias[cat] = (stats.distribucionCategorias[cat] || 0) + 1;
        });

        stats.topLeads = scores
          .sort((a, b) => b.puntuacion - a.puntuacion)
          .slice(0, 10)
          .map((s) => ({
            leadId: s.leadId,
            nombre: s.lead.nombre,
            puntuacion: s.puntuacion,
            categoria: s.categoria,
          }));
      }

      return stats;
    } catch (error) {
      console.error('Error obteniendo estadísticas de scoring:', error);
      return null;
    }
  }

  /**
   * Calcula un score inteligente usando IA basado en el contexto completo del lead
   */
  static async calculateAIScore(leadId: string): Promise<AIScoreResult | null> {
    try {
      // 1. Obtener el lead con todo su contexto
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: {
          score: true,
          citas: true,
          conversaciones: {
            include: {
              mensajes: {
                orderBy: { fechaCreacion: 'desc' },
                take: 30, // Suficientes mensajes para entender el contexto
              },
            },
            orderBy: { fechaActualizacion: 'desc' },
            take: 3,
          },
          deals: true,
        },
      });

      if (!lead) return null;

      // 2. Preparar el contexto para la IA
      const interactionHistory = lead.conversaciones.flatMap(c =>
        c.mensajes.map(m => `${m.direccion === 'saliente' ? 'Asesor' : 'Cliente'}: ${m.contenido}`)
      ).join('\n');

      const systemPrompt = `Eres un experto en calificación de leads (Lead Scoring) para un CRM B2B.
Tu tarea es evaluar la "calentura" o probabilidad de cierre de un lead basándote en su perfil e interacciones.

REGLAS DE EVALUACIÓN:
- Puntuación de 0 a 100.
- Categorías: A (80-100: Hot/Inmediato), B (60-79: Warm/Seguimiento), C (40-59: Cold/Nutrir), D (0-39: Unqualified).
- Considera: Claridad en su necesidad, urgencia expresada, presupuesto (si se menciona), y nivel de respuesta.

DEBES RESPONDER EXCLUSIVAMENTE EN FORMATO JSON:
{
  "puntuacion": número entre 0 y 100,
  "categoria": "A" | "B" | "C" | "D",
  "razon": "Breve explicación de por qué se otorgó ese score"
}`;

      const userContent = `DATOS DEL LEAD:
Nombre: ${lead.nombre}
Empresa: ${lead.empresa || 'N/A'}
Cargo: ${lead.cargo || 'N/A'}
Estado Actual: ${lead.estado}
Proyectos/Contexto: ${lead.contextoProyecto || 'N/A'}

HISTORIAL DE INTERACCIONES RECIENTES:
${interactionHistory || 'No hay mensajes registrados aún.'}

CITAS: ${lead.citas.length} registradas.
DEALS: ${lead.deals.length} registrados.`;

      // 3. Llamar a Abacus AI
      const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          max_tokens: 300,
          temperature: 0.3,
        }),
      });

      if (!response.ok) throw new Error(`Abacus API Error: ${response.status}`);

      const data = await response.json();
      const aiResult: AIScoreResult = JSON.parse(data.choices?.[0]?.message?.content || '{}');

      if (typeof aiResult.puntuacion !== 'number') {
        throw new Error('Formato de respuesta IA inválido');
      }

      // 4. Actualizar el score en la DB
      const puntuacionAnterior = lead.score?.puntuacion || 0;

      await prisma.leadScore.upsert({
        where: { leadId },
        update: {
          puntuacion: aiResult.puntuacion,
          categoria: aiResult.categoria,
          puntuacionEngagement: aiResult.puntuacion, // Usamos engagement para el score IA por ahora
        },
        create: {
          leadId,
          puntuacion: aiResult.puntuacion,
          categoria: aiResult.categoria,
          puntuacionEngagement: aiResult.puntuacion,
        },
      });

      // 5. Registrar en el historial
      await prisma.scoreHistory.create({
        data: {
          leadId,
          puntuacionAnterior,
          puntuacionNueva: aiResult.puntuacion,
          cambio: aiResult.puntuacion - puntuacionAnterior,
          razon: `IA: ${aiResult.razon}`,
          categoria: 'ia_evaluation',
          detalles: aiResult as any,
        },
      });

      // 6. Actualizar campo denormalizado en Lead para filtros rápidos
      await prisma.lead.update({
        where: { id: leadId },
        data: { scoreValue: aiResult.puntuacion },
      });

      return aiResult;
    } catch (error) {
      console.error('Error in calculateAIScore:', error);
      return null;
    }
  }
}

export default ScoringEngine;
