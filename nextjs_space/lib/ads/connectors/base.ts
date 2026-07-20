/**
 * Base connector — re-exporta la interfaz AdPlatformConnector desde types.ts
 * para mantener la estructura de imports limpia.
 * 
 * Los conectores específicos (meta-ads, google-ads, etc.) implementan
 * esta interfaz y se registran en index.ts.
 */

export type { AdPlatformConnector } from '../types';
