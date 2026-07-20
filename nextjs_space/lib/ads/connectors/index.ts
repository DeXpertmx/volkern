/**
 * Registry de conectores de plataformas ADS.
 * 
 * Cada plataforma registra su conector aquí usando el patrón factory.
 * Para agregar una nueva plataforma:
 *   1. Crear el connector en lib/ads/connectors/{platform}.ts
 *   2. Importarlo y registrarlo en CONNECTORS
 *   3. Agregar la plataforma al enum AdPlatform en types.ts
 */

import type { AdPlatform, AdPlatformConnector, ConnectorConstructor } from '../types';
import { MetaAdsConnector } from './meta-ads';
import { GoogleAdsConnector } from './google-ads';
import { LinkedInAdsConnector } from './linkedin-ads';
import { TiktokAdsConnector } from './tiktok-ads';

// Mapa de registro: plataforma -> constructor del conector
const CONNECTORS: Partial<Record<AdPlatform, ConnectorConstructor>> = {
  META: MetaAdsConnector,
  GOOGLE: GoogleAdsConnector,
  LINKEDIN: LinkedInAdsConnector,
  TIKTOK: TiktokAdsConnector,
};

/**
 * Obtiene una instancia del conector para una plataforma específica.
 * Lanza error si la plataforma no está registrada.
 */
export function getConnector(platform: AdPlatform): AdPlatformConnector {
  const Connector = CONNECTORS[platform];
  if (!Connector) {
    throw new Error(`Plataforma "${platform}" no soportada. Plataformas disponibles: ${Object.keys(CONNECTORS).join(', ')}`);
  }
  return new Connector();
}

/**
 * Registra un conector para una plataforma.
 * Útil para registro diferido o tests.
 */
export function registerConnector(platform: AdPlatform, constructor: ConnectorConstructor): void {
  CONNECTORS[platform] = constructor;
}

/**
 * Lista las plataformas actualmente registradas.
 */
export function getRegisteredPlatforms(): AdPlatform[] {
  return Object.keys(CONNECTORS) as AdPlatform[];
}
