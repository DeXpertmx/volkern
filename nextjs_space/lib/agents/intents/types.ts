/**
 * Tipos compartidos para el sistema de intenciones del chatbot.
 * Extraídos a archivo separado para evitar imports circulares.
 */
export interface IntentSchema {
  name: string;
  description: string;
  requiredParams: string[];
  optionalParams: string[];
  examples: string[];
  destructive: boolean;
}
