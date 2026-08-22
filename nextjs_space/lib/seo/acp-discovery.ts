/**
 * ACP discovery metadata for Volkern.
 *
 * This document advertises the commerce-related APIs that currently exist in
 * Volkern. It intentionally does not claim support for ACP checkout sessions
 * or payment handlers until those protocol endpoints are implemented.
 */
export const ACP_PROTOCOL_VERSION = '2026-01-30'

export const ACP_SERVICES = ['catalog', 'quotes', 'sales-orders'] as const

export function buildAcpDiscoveryDocument(baseUrl: string) {
  return {
    protocol: {
      name: 'acp',
      version: ACP_PROTOCOL_VERSION,
    },
    api_base_url: `${baseUrl}/api`,
    transports: ['rest'],
    capabilities: {
      services: [...ACP_SERVICES],
    },
    /** Human/machine-readable pointers to the existing commerce APIs. */
    service_endpoints: {
      catalog: `${baseUrl}/api/catalogo/items`,
      quotes: `${baseUrl}/api/cotizaciones`,
      'sales-orders': `${baseUrl}/api/ordenes-venta`,
    },
    documentation_url: `${baseUrl}/docs/developers`,
  }
}
