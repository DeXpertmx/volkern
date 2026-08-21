/**
 * lib/open-api-v1.ts
 *
 * Single source-of-truth para el spec OpenAPI 3.0 del Partner API v1
 * (POST /v1/invoices + GET /v1/invoices/{id}).
 *
 * Por qué este archivo existe aparte de lib/openapi.ts:
 * - `lib/openapi.ts` usa `@asteasolutions/zod-to-openapi` v8, que tiene un
 *   bug de incompatibilidad con `zod@3.25` ("Cannot read properties of
 *   undefined (reading 'parent')") — el runtime route `/api/openapi` lo
 *   caza con try-catch y degrada a 503 históricamente.
 * - Este archivo usa `zod-to-json-schema` v3.25 (ya instalado) y convierte
 *   directamente el runtime schema `ExternalInvoiceCreateSchema` (la
 *   fuente de verdad para validación) a JSON Schema en dialecto OpenAPI 3.0.
 *
 * Uso:
 *   - `scripts/generate-openapi.mjs` importa `openApiV1Document` y lo
 *     serializa a `/public/openapi.json` (servido por Next.js vía public/).
 *   - `tests/zod-schemas-v4.test.ts` importa `openApiV1Document` para
 *     test de paridad OpenAPI ↔ runtime (mismos inputs válidos).
 *   - `app/docs/redoc/page.tsx` sirve Redoc que carga `/openapi.json`.
 *
 * Cualquier cambio en `lib/validation/schemas/finance.ts` se refleja
 * automáticamente aquí y en `/public/openapi.json` en el siguiente build.
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import { ExternalInvoiceCreateSchema } from '@/lib/validation/schemas/finance';

// ─── Convertir runtime schema a JSON Schema (OpenAPI 3.0 dialect) ────
// El output se embebe directo en `requestBody.content.application/json.schema`
// del path POST /v1/invoices, sin envoltorios. La transformación:
//   z.coerce.number().positive() → { type: 'number', exclusiveMinimum: 0 }
//   z.string().length(3)          → { type: 'string', maxLength: 3, minLength: 3 }
//   etc.
// El refinamiento `.refine(leadId || contactId)` queda como `allOf` validation
// en el JSON Schema — Redoc lo muestra como un constrait visual secundario.

export const bodySchemaV1Json = zodToJsonSchema(ExternalInvoiceCreateSchema, {
  target: 'openApi3',
  $refStrategy: 'none',        // Inline: esquema único sin $refs externos
  errorMessages: false,        // Solo tipos/constraints, no textos de error
  topLevelAnyOf: false,
  definitions: false,
} as any);

// ─── Documento OpenAPI 3.0 completo ──────────────────────────────

export const openApiV1Document = {
  openapi: '3.0.3',
  info: {
    title: 'Volkern Partner API v1',
    version: '1.0.0',
    description:
      '# Volkern Partner API v1\n\n' +
      'API externa para integradores (ERPs, POS, e-commerce) que necesitan\n' +
      'facturar clientes a través de Volkern con compliance Verifactu\n' +
      '(sello y reporte automático a AEAT).\n\n' +
      '## Autenticación\n' +
      'Todas las requests requieren un Bearer API Key emitido en\n' +
      '`/dashboard/developers` del tenant:\n' +
      '```\n' +
      'Authorization: Bearer vk_prod_<api-key>\n' +
      '```\n\n' +
      '## Idempotencia\n' +
      'Envía `Idempotency-Key: <uuid-v4>` para evitar facturas duplicadas.\n' +
      'Repeticiones dentro de 24h con la misma key devuelven la factura\n' +
      'original sin crear una nueva.\n\n' +
      '## Webhooks\n' +
      'Opcionalmente, configura `webhookUrl` + `webhookEvents` en\n' +
      '`/dashboard/developers` para recibir notificaciones de\n' +
      '`invoice.accepted` y `invoice.rejected`.',
    contact: {
      name: 'Volkern Developer Relations',
      url: 'https://volkern.com/docs/partners',
      email: 'partners@volkern.com',
    },
    license: {
      name: 'Proprietary',
    },
  },
  'x-service-info': {
    categories: ['commerce', 'invoicing', 'developer-tools'],
    docs: {
      homepage: 'https://volkern.app/',
      apiReference: 'https://volkern.app/docs/developers',
      llms: 'https://volkern.app/auth.md',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Desarrollo local',
    },
    {
      url: 'https://api.volkern.app',
      description: 'Producción multi-tenant',
    },
    {
      url: 'https://{tenant}.volkern.app',
      description: 'Producción por subdominio del tenant',
      variables: {
        tenant: {
          default: 'demo',
          description: 'Subdominio del tenant',
        },
      },
    },
  ],
  tags: [
    {
      name: 'External API v1',
      description:
        'Endpoints públicos expuestos a integradores externos ' +
        '(ERPs, POS, e-commerce). Compatible con Verifactu. ' +
        'Autenticación vía Bearer API Key emitida por el admin del tenant.',
    },
  ],
  paths: {
    '/api/public/paid-search': {
      get: {
        summary: 'Búsqueda pública de contenido',
        description:
          'Búsqueda de contenido público para agentes. Requiere un pago x402 exact en Base Sepolia y devuelve un desafío HTTP 402 cuando no se envía PAYMENT-SIGNATURE.',
        tags: ['Agent commerce'],
        operationId: 'paidPublicSearch',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string', minLength: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
          },
        ],
        'x-payment-info': {
          offers: [
            {
              protocol: 'x402',
              intent: 'charge',
              method: 'base-sepolia-usdc',
              amount: '10000',
              currency: 'USDC atomic units',
              description: 'Acceso a una búsqueda pública.',
            },
          ],
        },
        responses: {
          '200': {
            description: 'Resultados de la búsqueda',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          '402': {
            description: 'Payment Required — incluye PAYMENT-REQUIRED con requisitos x402 codificados en Base64.',
            headers: {
              'PAYMENT-REQUIRED': {
                schema: { type: 'string' },
                description: 'Objeto PaymentRequired x402 v2 codificado en Base64.',
              },
            },
          },
          '503': {
            description: 'x402 no configurado en el entorno.',
          },
        },
      },
    },
    '/v1/invoices': {
      post: {
        summary: 'Crear factura',
        description:
          'Crea una factura para un lead o contacto existente. La factura se sella ' +
          'y se reporta automáticamente a AEAT vía Verifactu.\n\n' +
          '**Reglas de validación**:\n' +
          '- `leadId` o `contactId` requerido (al menos uno).\n' +
          '- `amount` debe ser > 0 (acepta string coerced a number).\n' +
          '- `currency` exactamente 3 caracteres ISO 4217 (default `EUR`).\n' +
          '- `items` opcional: si se omite, se crea una sola línea con `amount` y `taxRate=21%`.\n' +
          '- El `.refine()` runtime verifica `leadId || contactId`.\n\n' +
          '**Respuesta**: devuelve `201` con `{ success, message, invoice: { id, numero, fingerprint, status, aeat_csv_url } }`.\n' +
          'El `status` empieza como `queued` y transita a `accepted_by_aeat` o `rejected_by_aeat` ' +
          'async (Recibirás webhook si configuraste uno).',
        tags: ['External API v1'],
        operationId: 'createInvoiceV1',
        'x-payment-info': {
          offers: [
            {
              intent: 'charge',
              method: 'stripe',
              amount: null,
              currency: 'eur',
              description: 'Importe dinámico según la factura solicitada.',
            },
          ],
        },
        security: [{ bearerAuth: ['invoices:write'] }],
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: {
              type: 'string',
              format: 'uuid',
            },
            description:
              'UUID v4 idempotency key por invoice. Si repites el request dentro de 24h ' +
              'con la misma key, devolvemos el resultado cacheado sin crear una factura nueva.',
          },
        ],
        requestBody: {
          required: true,
          description: 'Datos de la factura a crear',
          content: {
            'application/json': {
              schema: bodySchemaV1Json as Record<string, unknown>,
              examples: {
                minimal: {
                  summary: 'Mínimo: lead + amount',
                  value: {
                    leadId: 'cm123leadabc456def789ghi',
                    amount: 750.5,
                  },
                },
                full: {
                  summary: 'Completo: con desglose de líneas + dueDate',
                  value: {
                    leadId: 'cm123leadabc456def789ghi',
                    amount: 1210.0,
                    currency: 'EUR',
                    description: 'Servicios mayo 2026',
                    items: [
                      { name: 'Consultoría estratégica', quantity: 2, price: 400, taxRate: 21 },
                      { name: 'Setup inicial', quantity: 1, price: 250, taxRate: 21 },
                    ],
                    dueDate: '2026-06-15T23:59:59Z',
                  },
                },
                stringAmount: {
                  summary: 'Coerción: amount enviado como string',
                  value: {
                    leadId: 'cm123leadabc456def789ghi',
                    amount: '750.50',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Factura creada y encolada para Verifactu',
            headers: {
              'X-RateLimit-Limit': {
                schema: { type: 'integer' },
                description: 'Total de requests permitidas en la ventana actual',
              },
              'X-RateLimit-Remaining': {
                schema: { type: 'integer' },
                description: 'Requests restantes en la ventana actual',
              },
              'X-RateLimit-Reset': {
                schema: { type: 'integer' },
                description: 'Timestamp UNIX del reset de la ventana',
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'message', 'invoice'],
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Factura creada correctamente' },
                    invoice: {
                      type: 'object',
                      required: ['id', 'numero', 'fingerprint', 'status'],
                      properties: {
                        id: { type: 'string', description: 'ID interno Volkern de la factura' },
                        numero: { type: 'string', description: 'Número correlativo', example: 'F-00042' },
                        fingerprint: {
                          type: 'string',
                          description: 'SHA-256 hex que enlaza con la factura anterior (Verifactu chain integrity)',
                        },
                        status: {
                          type: 'string',
                          enum: ['queued', 'processing', 'accepted_by_aeat', 'rejected_by_aeat'],
                          description:
                            'Estado actual. Webhooks emitidos en `invoice.accepted` (status pasa a `accepted_by_aeat`) ' +
                            'y `invoice.rejected` (status pasa a `rejected_by_aeat`).',
                        },
                        aeat_csv_url: {
                          type: 'string',
                          format: 'uri',
                          nullable: true,
                          description:
                            'URL al CSV validado por AEAT (se rellena async tras aceptación; null mientras esté queued/processing/rejected).',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Datos inválidos',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '401': {
            description: 'API key ausente, inválida o revocada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '403': {
            description: 'Scope insuficiente o límite de plan alcanzado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '409': {
            description: 'Conflicto: Idempotency-Key reutilizada con payload distinto',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '429': {
            description: 'Rate limit excedido (ver headers X-RateLimit-*)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '402': {
            description: 'Payment Required',
          },
          '500': {
            description: 'Error interno del servidor',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/v1/invoices/{id}': {
      get: {
        summary: 'Consultar estado de factura',
        description:
          'Devuelve el estado actual y metadatos de una factura previamente creada vía POST /v1/invoices. ' +
          'Útil para polling tras recibir el webhook `invoice.accepted` o `invoice.rejected` cuando ' +
          'se necesita el `aeat_csv_url` final o el `fingerprint` registrado.',
        tags: ['External API v1'],
        operationId: 'getInvoiceV1',
        security: [{ bearerAuth: ['invoices:write'] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'ID interno Volkern de la factura (devuelto en el campo `invoice.id` de POST /v1/invoices)',
            example: 'cm123abc456def789ghi',
          },
        ],
        responses: {
          '200': {
            description: 'Factura encontrada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'invoice'],
                  properties: {
                    success: { type: 'boolean', example: true },
                    invoice: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        numero: { type: 'string', example: 'F-00042' },
                        fingerprint: { type: 'string' },
                        status: {
                          type: 'string',
                          enum: ['queued', 'processing', 'accepted_by_aeat', 'rejected_by_aeat'],
                        },
                        aeat_csv_url: { type: 'string', format: 'uri', nullable: true },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'API key inválida',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '404': {
            description: 'Factura no encontrada (o pertenece a otro tenant)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key',
        description:
          'API Key con formato Bearer. Generada desde /dashboard/developers del tenant. ' +
          'Formato: `vk_prod_<64 chars>` (producción) o `vk_live_<64 chars>` (live test).',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        required: ['error'],
        properties: {
          error: { type: 'string', description: 'Mensaje de error legible', example: 'Datos inválidos' },
          details: {
            type: 'object',
            additionalProperties: true,
            description: 'Detalles adicionales del error (e.g. validation issues por campo)',
          },
        },
      },
    },
  },
  security: [{ bearerAuth: ['invoices:write'] }],
};
