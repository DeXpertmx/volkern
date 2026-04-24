import { callGemma, GemmaMessage } from '@/lib/ai/gemma-client';
import { GemmaService, GemmaSuggestion } from '@/lib/gemma/gemma-service';

export class GemmaConnectService {
  /**
   * Analiza un evento del sistema y decide si Gemma debe intervenir en Connect.
   */
  static async analyzeEvent(event: string, payload: any) {
    const tenantId = payload.tenantId;

    try {
      // 1. Preparar el prompt según el evento
      const prompt = this.getPromptForEvent(event, payload);
      if (!prompt) return;

      // 2. Llamar a Gemma
      console.log(`[GemmaConnect] Analizando evento ${event}...`);
      const messages: GemmaMessage[] = [
        { 
          role: 'system', 
          content: `Eres Gemma 4, la inteligencia operativa de Volkern ERP. 
          Tu objetivo es analizar eventos en tiempo real y proporcionar insights críticos, detectar anomalías y sugerir acciones rápidas. 
          
          MODOS DE OPERACIÓN:
          - Observador: Detectar hilos conductores entre eventos.
          - Analista: Encontrar riesgos o anomalías financieras/operativas.
          - Asistente: Proponer "Quick Actions" para el operador.
          
          Responde ÚNICAMENTE en JSON con el formato GemmaSuggestion.` 
        },
        { role: 'user', content: prompt }
      ];

      const aiRes = await callGemma(messages, { responseMimeType: 'application/json' });
      if (aiRes.error) {
        console.error(`[GemmaConnect] Error de IA en evento ${event}:`, aiRes.error);
        return;
      }

      // 3. Parsear respuesta
      console.log(`[GemmaConnect] Respuesta recibida para ${event}`);
      const cleaned = aiRes.content.replace(/```json/g, '').replace(/```/g, '').trim();
      const insight: GemmaSuggestion = JSON.parse(cleaned);

      // 4. Si la confianza es alta (>0.7), procesar vía GemmaService (persistencia + publicación)
      if (insight.confidence > 0.7) {
        await GemmaService.processGemmaResponse(tenantId, event, payload, insight);
      }
    } catch (error) {
      // Gemma Fallback: Degradación elegante. 
      // El chat debe seguir funcionando aunque la IA falle.
      console.warn(`⚠️ [GemmaConnect] Degradación elegante: No se pudo generar insight para ${event}. El sistema continúa operando.`, error);
    }
  }

  private static getPromptForEvent(event: string, payload: any): string | null {
    switch (event) {
      case 'invoice_created':
        return `
          SE HA CREADO UNA FACTURA:
          Monto: ${payload.monto} ${payload.moneda}
          Número: ${payload.numero}
          Lead ID: ${payload.leadId}

          Analiza si esto representa un hito importante o si hay algo inusual.
          Responde en JSON:
          {
            "id": "inv-${payload.invoiceId}",
            "type": "invoice_analysis",
            "message": "Resumen ejecutivo de 1 oración",
            "confidence": 0.0-1.0,
            "evidence": [{"invoiceId": "${payload.invoiceId}"}],
            "suggestedActions": [{"id": "check_tax", "label": "Verificar Impuestos", "critical": false}]
          }
        `;
      case 'payment_received':
        return `
          PAGO RECIBIDO:
          Monto: ${payload.monto} ${payload.moneda}
          
          Genera un insight de flujo de caja.
          {
            "id": "pay-${payload.paymentId}",
            "type": "cashflow_insight",
            "message": "...",
            "confidence": 0.9,
            "evidence": [{"paymentId": "${payload.paymentId}"}],
            "suggestedActions": [{"id": "reconcile", "label": "Conciliar Ahora", "critical": true}]
          }
        `;
      case 'lead_created':
        return `
          NUEVO LEAD DETECTADO:
          Nombre: ${payload.nombre}
          Fuente: ${payload.source}

          Analiza el potencial inicial.
          {
            "id": "lead-${payload.leadId}",
            "type": "lead_scoring",
            "message": "Análisis rápido del lead",
            "confidence": 0.8,
            "evidence": [{"leadId": "${payload.leadId}"}],
            "suggestedActions": [{"id": "assign", "label": "Asignar Urgente", "critical": false}]
          }
        `;
      default:
        return null;
    }
  }

  private static getTargetChannelName(event: string): string {
    if (event.includes('invoice') || event.includes('payment')) return 'Finanzas';
    if (event.includes('lead') || event.includes('deal')) return 'Ventas';
    if (event.includes('task') || event.includes('booking')) return 'Operaciones';
    return 'General';
  }
}
