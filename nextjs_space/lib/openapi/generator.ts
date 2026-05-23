/**
 * OpenAPI Generator — Auto-convierte Zod schemas a OpenAPI 3.0 components
 *
 * Usa zod-to-json-schema para generar JSON Schema compatible con OpenAPI
 * a partir de todos los schemas de validación en lib/validation/schemas/.
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodType } from 'zod';

// ─── Tipos ───────────────────────────────────────────────────

export type OpenApiSchema = Record<string, unknown>;

export interface OpenApiComponent {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  items?: unknown;
  nullable?: boolean;
  description?: string;
  example?: unknown;
  format?: string;
  enum?: string[];
  [key: string]: unknown;
}

export interface NamedSchema {
  name: string;
  schema: ZodType;
  description?: string;
}

// ─── Converter ───────────────────────────────────────────────

/**
 * Convierte un Zod schema a un OpenAPI component schema.
 * Usa zod-to-json-schema y adapta el output para OpenAPI 3.0.
 */
function zodToOpenApiSchema(schema: ZodType, name?: string): OpenApiComponent {
  const jsonSchema = zodToJsonSchema(schema, {
    name: name || 'Schema',
    $refStrategy: 'none',
    target: 'openApi3',
  });

  // Remove the $schema field (OpenAPI doesn't need it)
  const result = jsonSchema as Record<string, unknown>;
  delete result.$schema;

  return result as OpenApiComponent;
}

// ─── Registry builder ────────────────────────────────────────

/**
 * Construye el objeto `components.schemas` de OpenAPI a partir
 * de una lista de pares (nombre, ZodSchema).
 */
export function buildComponentSchemas(schemas: NamedSchema[]): Record<string, OpenApiComponent> {
  const components: Record<string, OpenApiComponent> = {};

  for (const { name, schema, description } of schemas) {
    const converted = zodToOpenApiSchema(schema, name);
    if (description) {
      converted.description = description;
    }
    components[name] = converted;
  }

  return components;
}

/**
 * Helper: registra un set de schemas con naming automático.
 * Ej: registerAll({ leads: leadsSchemas, contacts: contactSchemas })
 */
export function registerAll(
  groups: Record<string, Record<string, ZodType>>,
): NamedSchema[] {
  const result: NamedSchema[] = [];

  for (const [groupName, schemas] of Object.entries(groups)) {
    for (const [schemaName, schema] of Object.entries(schemas)) {
      // Convert LeadCreateSchema → LeadCreate, Lead → Lead, etc.
      const cleanName = schemaName.replace(/Schema$/, '');
      const fullName = `${groupName}_${cleanName}`;
      result.push({
        name: fullName,
        schema,
        description: `Auto-generado de ${groupName}.${schemaName}`,
      });
    }
  }

  return result;
}

// ─── Helpers for paths ──────────────────────────────────────

/**
 * Crea definiciones de parámetros reutilizables para paths.
 */
export function idParam(name: string = 'id', description: string = 'ID único') {
  return {
    name,
    in: 'path' as const,
    required: true,
    schema: { type: 'string' as const },
    description,
  };
}

export function queryParam(
  name: string,
  schema: Record<string, unknown>,
  description?: string,
) {
  return {
    name,
    in: 'query' as const,
    schema,
    description,
  };
}

export function paginationParams() {
  return [
    queryParam('page', { type: 'integer', default: 1 }),
    queryParam('limit', { type: 'integer', default: 25, maximum: 100 }),
  ];
}

// ─── Security ────────────────────────────────────────────────

export const apiKeySecurity = [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }];
export const noSecurity: Record<string, string[]>[] = [];

// ─── Response helpers ────────────────────────────────────────

export function jsonResponse(
  description: string,
  schema: string | Record<string, unknown>,
  status: string = '200',
) {
  const content: Record<string, unknown> = {
    'application/json': {
      schema: typeof schema === 'string' ? { $ref: `#/components/schemas/${schema}` } : schema,
    },
  };
  return { [status]: { description, content } };
}

export function errorResponse(description: string = 'Error del servidor', status: string = '500') {
  return {
    [status]: {
      description,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    },
  };
}

export function validationErrorResponse() {
  return {
    '400': {
      description: 'Datos inválidos',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } },
    },
  };
}

export function authErrorResponse() {
  return {
    '401': { description: 'No autenticado' },
    '403': { description: 'Sin permisos', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  };
}

export default {
  zodToOpenApiSchema,
  buildComponentSchemas,
  registerAll,
  idParam,
  queryParam,
  paginationParams,
  apiKeySecurity,
  noSecurity,
  jsonResponse,
  errorResponse,
  validationErrorResponse,
  authErrorResponse,
};
