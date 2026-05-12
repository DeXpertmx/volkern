import { TelegramGatewayAgent, ParsedMessage } from './telegram-gateway';
import { ConversationContextAgent } from './conversation-context';
import { GemmaRouterAgent } from './gemma-router';
import { SkillOrchestratorAgent } from './skill-orchestrator';
import { ExecutionEngine } from './execution-engine';
import { ResponseFormatter, FormattedResponse } from './response-formatter';
import { ChatbotAuditLogger } from './audit-logger';

export interface ChatbotInput {
  tenantId: string;
  update: any;
  chatId: string;
  telegramUserId: string;
  messageText: string;
  messageId: number;
}

export class TelegramChatbot {
  static async process(input: ChatbotInput): Promise<FormattedResponse> {
    const { tenantId, chatId, telegramUserId, messageText, messageId } = input;

    try {
      // 1. Obtener contexto de conversación
      const context = await ConversationContextAgent.getOrCreateContext(
        tenantId,
        telegramUserId
      );

      // 2. Detectar intent con Gemma
      const intentResult = await GemmaRouterAgent.detectIntent(
        messageText,
        {
          pendingIntent: context.pendingIntent,
          collectedEntities: context.collectedEntities,
          missingEntities: context.missingEntities
        }
      );

      if (!intentResult.success || !intentResult.data) {
        await ChatbotAuditLogger.log({
          tenantId,
          sessionId: context.sessionId,
          telegramUserId,
          intent: 'unknown',
          inputRaw: messageText,
          status: 'ERROR',
          errorMessage: intentResult.error
        });

        return ResponseFormatter.formatFallback(
          intentResult.fallbackMessage || 'No entendí bien. ¿Puedes reformular?'
        );
      }

      const { intent, entities, missingEntities, confidence } = intentResult.data;

      // 3. Loggear intent detectado
      await ChatbotAuditLogger.log({
        tenantId,
        sessionId: context.sessionId,
        telegramUserId,
        messageId: messageId.toString(),
        intent,
        detectedEntities: entities,
        inputRaw: messageText,
        status: 'PENDING'
      });

      // 4. Actualizar contexto con intent
      await ConversationContextAgent.updateContext(context.sessionId, {
        lastIntent: intent,
        pendingIntent: missingEntities.length > 0 ? intent : undefined,
        collectedEntities: { ...context.collectedEntities, ...entities },
        missingEntities
      });

      // 5. Si hay missing entities, pedir la faltante
      if (missingEntities.length > 0) {
        const nextEntity = missingEntities[0];
        const prompt = GemmaRouterAgent['getPromptForEntity'](nextEntity);

        // Guardar estado de pending intent
        await ConversationContextAgent.setMissingEntities(context.sessionId, missingEntities);

        return ResponseFormatter.formatMissingEntity(nextEntity, prompt);
      }

      // 6. Construir plan de ejecución
      const planResult = await SkillOrchestratorAgent.buildExecutionPlan(
        intentResult.data,
        context,
        tenantId
      );

      if (!planResult.success) {
        return ResponseFormatter.formatError(planResult.error || 'Error desconocido');
      }

      // Si hay response en lugar de plan, retornarlo
      if (planResult.response) {
        return ResponseFormatter.formatSuccess(planResult.response, {
          sessionId: context.sessionId,
          intent
        });
      }

      if (!planResult.plan) {
        return ResponseFormatter.formatError('No se pudo construir el plan de ejecución');
      }

      // 7. Ejecutar el plan
      const executionResult = await ExecutionEngine.execute(
        planResult.plan,
        {
          tenantId,
          userId: context.userId,
          telegramUserId,
          sessionId: context.sessionId
        }
      );

      // 8. Formatear respuesta
      if (executionResult.success) {
        const formattedMessage = ExecutionEngine.formatSkillResult(
          planResult.plan.skillName,
          executionResult.data
        );

        // Limpiar pending intent si todo salió bien
        await ConversationContextAgent.updateContext(context.sessionId, {
          pendingIntent: undefined,
          missingEntities: []
        });

        return ResponseFormatter.formatSuccess(formattedMessage, {
          skill: planResult.plan.skillName,
          sessionId: context.sessionId,
          intent,
          executionTimeMs: executionResult.executionTimeMs
        });
      } else {
        return ResponseFormatter.formatError(
          executionResult.error || 'Error al ejecutar la acción',
          {
            skill: planResult.plan.skillName,
            sessionId: context.sessionId,
            intent
          }
        );
      }

    } catch (error) {
      console.error('[TelegramChatbot] Error processing message:', error);

      await ChatbotAuditLogger.log({
        tenantId,
        telegramUserId,
        inputRaw: messageText,
        status: 'ERROR',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });

      return ResponseFormatter.formatError(
        'Ocurrió un error al procesar tu mensaje. Por favor, intenta de nuevo.'
      );
    }
  }
}

export async function handleTelegramWebhook(
  tenantId: string,
  update: any
): Promise<{ response?: string; error?: string }> {
  try {
    // 1. Procesar update con Gateway
    const gatewayResult = await TelegramGatewayAgent.processUpdate(tenantId, update);

    if (!gatewayResult.success) {
      return { error: gatewayResult.error };
    }

    // Si no hay mensaje para procesar (ej. mensaje de bot), salir
    if (!update.message?.text) {
      return {};
    }

    // 2. Extraer datos del mensaje
    const parsed = TelegramGatewayAgent.parseUpdate(update);
    if (!parsed) {
      return {};
    }

    // 3. Procesar con el chatbot
    const response = await TelegramChatbot.process({
      tenantId,
      update,
      chatId: parsed.chatId,
      telegramUserId: parsed.telegramUserId,
      messageText: parsed.text,
      messageId: parsed.messageId
    });

    // 4. Enviar respuesta a Telegram
    if (response.message) {
      const formattedMessage = ResponseFormatter.toTelegramMarkdown(response.message);
      await TelegramGatewayAgent.sendMessage(
        parsed.chatId,
        formattedMessage,
        tenantId
      );
    }

    return { response: response.message };

  } catch (error) {
    console.error('[TelegramWebhook] Error:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}