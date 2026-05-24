import { Ionicons } from '@expo/vector-icons';

// ─── Icono lookup ─────────────────────────────────────────────────────────────
// Mapea nombres de icono simplificados del backend a nombres reales de Ionicons.
// Centralizado aquí para evitar duplicación entre pantallas.
const ICON_MAP: Record<string, string> = {
  'business': 'business',
  'trending-up': 'trending-up',
  'chatbubbles': 'chatbubbles',
  'megaphone': 'megaphone',
  'school': 'school',
  'people': 'people',
  'person-circle': 'person-circle',
  'calculator': 'calculator',
  'shield-checkmark': 'shield-checkmark',
  'settings': 'settings',
  'cube': 'cube',
  'briefcase': 'briefcase',
  'headset': 'headset',
  'book': 'book',
  'person': 'person',
  'bar-chart': 'bar-chart',
  'checkbox': 'checkbox',
  'git-network': 'git-network',
  'pricetag': 'pricetag',
  'document-text': 'document-text',
  'document': 'document',
  'cart': 'cart',
  'calendar': 'calendar',
  'trophy': 'trophy',
  'call': 'call',
  'hardware-chip': 'hardware-chip',
  'git-branch': 'git-branch',
  'code-slash': 'code-slash',
  'share-social': 'share-social',
  'help-circle': 'help-circle',
  'receipt': 'receipt',
  'wallet': 'wallet',
  'alert-circle': 'alert-circle',
  'list': 'list',
  'grid': 'grid',
  'cash': 'cash',
  'checkmark-circle': 'checkmark-circle',
  'mail': 'mail',
  'sparkles': 'sparkles',
  'star': 'star',
  'sync': 'sync',
  'notifications': 'notifications',
  'warning': 'warning',
  'card': 'card',
  'time': 'time',
  'globe': 'globe',
  'color-palette': 'color-palette',
  'pulse': 'pulse',
  'shield': 'shield-checkmark',
};

/**
 * Convierte un nombre de icono simplificado a un nombre válido de Ionicons.
 * Fallback a 'grid' si no se encuentra el mapeo.
 */
export function getIonicon(iconName: string): keyof typeof Ionicons.glyphMap {
  return (ICON_MAP[iconName] || 'grid') as keyof typeof Ionicons.glyphMap;
}
