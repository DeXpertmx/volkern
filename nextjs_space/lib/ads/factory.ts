/**
 * Factory para conectores ADS.
 * Crea la instancia correcta según el platform string ('META' | 'GOOGLE' | ...).
 */

import { MetaAdsConnector } from './connectors/meta-ads';
import { GoogleAdsConnector } from './connectors/google-ads';
import type { AdPlatformConnector } from './types';

export function getConnectorForPlatform(platform: string): AdPlatformConnector {
  switch (platform) {
    case 'META':
    case 'meta':
      return new MetaAdsConnector();
    case 'GOOGLE':
    case 'google':
      return new GoogleAdsConnector();
    default:
      throw new Error(`Plataforma ADS no soportada: ${platform}`);
  }
}

// Mapa plataforma enum (AdsPublication) -> AdPlatform del connector
export function publicationPlatformToAdPlatform(plat: string): 'META' | 'GOOGLE' | null {
  if (plat === 'META') return 'META';
  if (plat === 'GOOGLE') return 'GOOGLE';
  return null;
}
