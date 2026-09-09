/**
 * Catálogo compartido de canales de campaña (fuente única de verdad).
 *
 * Módulo puro: sin imports de servidor (prisma), sin React ni lucide-react,
 * importable desde componentes 'use client' y desde schemas de validación.
 *
 * Consumidores:
 *   - UI: app/dashboard/campanas/nueva/page.tsx (selector de canales)
 *   - Validación server: lib/validation/schemas/messaging.ts (MensajeEnviarSchema)
 *                        lib/validation/schemas/marketing.ts (CampaignMessageSchema)
 *   - Motor de envío: lib/campaign-engine.ts (sendMessage — solo soporta estos 6)
 *
 * Si se añade un canal aquí, debe existir también en lib/campaign-engine.ts
 * (método de envío) y en el switch de sendDirectMessage; si no, el envío fallará.
 */

export const CAMPAIGN_CHANNEL_IDS = [
  'whatsapp',
  'email',
  'sms',
  'telegram',
  'facebook',
  'instagram',
] as const;

export type CanalCampana = (typeof CAMPAIGN_CHANNEL_IDS)[number];

export interface CanalCampanaInfo {
  id: CanalCampana;
  nombre: string;
}

export function getCanalesDisponibles(): CanalCampanaInfo[] {
  return [
    { id: 'whatsapp', nombre: 'WhatsApp' },
    { id: 'email', nombre: 'Email' },
    { id: 'sms', nombre: 'SMS' },
    { id: 'telegram', nombre: 'Telegram' },
    { id: 'facebook', nombre: 'Facebook' },
    { id: 'instagram', nombre: 'Instagram' },
  ];
}