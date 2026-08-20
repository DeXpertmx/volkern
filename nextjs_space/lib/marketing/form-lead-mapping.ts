export const LEAD_STANDARD_FIELD_LABELS = {
  nombre: 'Nombre',
  email: 'Email',
  telefono: 'Teléfono',
  empresa: 'Empresa',
  cargo: 'Cargo / función',
  ubicacion: 'Ubicación',
  direccion: 'Dirección',
  ciudad: 'Ciudad',
  codigoPostal: 'Código postal',
  pais: 'País',
  linkedin: 'LinkedIn',
  notas: 'Notas',
} as const;

export type LeadStandardField = keyof typeof LEAD_STANDARD_FIELD_LABELS;
export type FormFieldTarget = `standard:${LeadStandardField}` | `custom:${string}` | 'ignore';

export type LeadFieldDefinitionLike = {
  fieldKey: string;
  label?: string | null;
  type?: string | null;
  activo?: boolean;
};

export function isLeadStandardField(value: string): value is LeadStandardField {
  return Object.prototype.hasOwnProperty.call(LEAD_STANDARD_FIELD_LABELS, value);
}

/**
 * Obtiene el destino configurado para una clave del formulario.
 * `fieldMappings` es el formato actual (origen -> destino). También se acepta
 * `mapping` por compatibilidad con borradores anteriores.
 */
export function getConfiguredTarget(config: any, sourceKey: string): string {
  const fieldMappings = config?.fieldMappings;
  if (fieldMappings && typeof fieldMappings === 'object' && typeof fieldMappings[sourceKey] === 'string') {
    return fieldMappings[sourceKey];
  }

  const element = Array.isArray(config?.pages)
    ? config.pages.flatMap((page: any) => Array.isArray(page?.elements) ? page.elements : []).find((candidate: any) => candidate?.name === sourceKey)
    : undefined;
  if (typeof element?.mapping === 'string') return element.mapping;

  const mapping = config?.mapping;
  if (mapping && typeof mapping === 'object') {
    // Formato antiguo: { email: 'correo_del_formulario' } (destino -> origen).
    for (const [target, source] of Object.entries(mapping)) {
      if (isLeadStandardField(target) && source === sourceKey) return `standard:${target}`;
    }
    if (typeof mapping[sourceKey] === 'string') {
      const direct = mapping[sourceKey];
      if (isLeadStandardField(sourceKey) && direct !== sourceKey && !direct.includes(':')) {
        return `standard:${sourceKey}`;
      }
      return direct;
    }
  }

  return '';
}

const SOURCE_ALIASES: Record<LeadStandardField, string[]> = {
  nombre: ['nombre', 'name', 'nombre_completo', 'fullname'],
  email: ['email', 'correo', 'correo_electronico', 'mail'],
  telefono: ['telefono', 'teléfono', 'phone', 'celular', 'whatsapp'],
  empresa: ['empresa', 'company', 'negocio'],
  cargo: ['cargo', 'puesto', 'funcion', 'función', 'position'],
  ubicacion: ['ubicacion', 'ubicación', 'location'],
  direccion: ['direccion', 'dirección', 'address'],
  ciudad: ['ciudad', 'city'],
  codigoPostal: ['codigoPostal', 'codigo_postal', 'código_postal', 'cp', 'zip'],
  pais: ['pais', 'país', 'country'],
  linkedin: ['linkedin', 'linkedin_url'],
  notas: ['notas', 'notes', 'mensaje', 'comentarios', 'comment'],
};

/** Inferencia conservadora para formularios existentes que aún no tienen mapping. */
export function inferStandardTarget(sourceKey: string): FormFieldTarget | '' {
  const normalized = sourceKey.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(SOURCE_ALIASES) as [LeadStandardField, string[]][]) {
    if (aliases.some(alias => alias.toLowerCase() === normalized)) return `standard:${field}`;
  }
  return '';
}

export function resolveFormFieldTarget(config: any, sourceKey: string): FormFieldTarget | '' {
  const configured = getConfiguredTarget(config, sourceKey).trim();
  if (!configured) return inferStandardTarget(sourceKey);
  if (configured === 'ignore') return 'ignore';
  if (configured.startsWith('standard:') && isLeadStandardField(configured.slice('standard:'.length))) {
    return configured as FormFieldTarget;
  }
  if (configured.startsWith('custom:') && configured.slice('custom:'.length).trim()) {
    return configured as FormFieldTarget;
  }
  return '';
}

export function resolveLeadMapping(
  config: any,
  payload: Record<string, unknown>,
  definitions: LeadFieldDefinitionLike[] = [],
) {
  const standard: Partial<Record<LeadStandardField, unknown>> = {};
  const custom: Record<string, unknown> = {};
  const unmapped: Array<[string, unknown]> = [];
  const activeDefinitions = definitions.filter(def => def.activo !== false);
  const validCustomKeys = new Set(activeDefinitions.map(def => def.fieldKey));
  const definitionsByKey = new Map(activeDefinitions.map(def => [def.fieldKey, def]));

  // Texto visible del campo en el formulario publicado (title/placeholder).
  // Es la pista más fiable cuando el payload trae una clave antigua.
  const formElements = new Map<string, { title?: string; placeholder?: string }>();
  if (Array.isArray(config?.pages)) {
    for (const page of config.pages) {
      for (const el of Array.isArray(page?.elements) ? page.elements : []) {
        if (el?.name) formElements.set(String(el.name), el);
      }
    }
  }

  const findMatchingCustomKey = (sourceKey: string): string | undefined => {
    const normalizedSource = normalizeFieldKey(sourceKey);
    const exact = activeDefinitions.find(def => normalizeFieldKey(def.fieldKey) === normalizedSource);
    if (exact) return exact.fieldKey;

    const sourceTokens = tokenizeFieldKey(sourceKey);
    if (sourceTokens.length === 0) return undefined;
    const formEl = formElements.get(sourceKey);
    const formTokens = new Set([
      ...tokenizeFieldKey(formEl?.title || ''),
      ...tokenizeFieldKey(formEl?.placeholder || ''),
    ]);

    // Puntúa cada campo personalizado del tenant contra la clave del payload
    // (clave antigua, etiqueta visible del formulario, placeholder o etiqueta
    // del CRM) y elige el mejor candidato si supera un umbral mínimo.
    let best: { fieldKey: string; score: number } | undefined;
    for (const def of activeDefinitions) {
      const fieldTokens = tokenizeFieldKey(def.fieldKey);
      const labelTokens = tokenizeFieldKey(def.label || '');
      const overlap = (tokens: string[]) =>
        tokens.filter(t => fieldTokens.includes(t) || labelTokens.includes(t)).length;
      const formOverlap = Array.from(formTokens).filter(t =>
        fieldTokens.includes(t) || labelTokens.includes(t),
      ).length;
      const score =
        overlap(sourceTokens) +
        formOverlap +
        (sourceTokens.some(t => fieldTokens.some(ft => ft.startsWith(t) || t.startsWith(ft))) ? 2 : 0) +
        (sourceTokens.some(t => labelTokens.some(lt => lt.startsWith(t) || t.startsWith(lt))) ? 1 : 0);
      if (score >= 2 && (!best || score > best.score)) best = { fieldKey: def.fieldKey, score };
    }
    return best ? best.fieldKey : undefined;
  };

  for (const [sourceKey, rawValue] of Object.entries(payload)) {
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;

    // Un destino explícito siempre tiene prioridad. Si el formulario no lo
    // configuró, probamos primero el fieldKey personalizado del tenant (clave
    // exacta o coincidencia por solapamiento/etiqueta). Solo si no hay un
    // campo personalizado razonable se cae a la inferencia estándar: así
    // `cargo` va a `cargo_empresa` y no se pierde en la columna estándar.
    const configured = getConfiguredTarget(config, sourceKey).trim();
    let target: FormFieldTarget | '' = configured
      ? resolveFormFieldTarget(config, sourceKey)
      : '';
    if (!configured) {
      const matchingCustomKey = findMatchingCustomKey(sourceKey);
      if (matchingCustomKey) target = `custom:${matchingCustomKey}`;
    }
    if (!target && !(target?.startsWith('custom:'))) target = inferStandardTarget(sourceKey);

    if (target === 'ignore') continue;
    if (target?.startsWith('standard:')) {
      const field = target.slice('standard:'.length) as LeadStandardField;
      if (standard[field] === undefined) standard[field] = rawValue;
      continue;
    }
    if (target?.startsWith('custom:')) {
      const fieldKey = target.slice('custom:'.length);
      if (validCustomKeys.has(fieldKey)) {
        const definition = definitionsByKey.get(fieldKey);
        custom[fieldKey] = normalizeCustomValue(rawValue, definition?.type);
      } else unmapped.push([sourceKey, rawValue]);
      continue;
    }
    unmapped.push([sourceKey, rawValue]);
  }

  return { standard, custom, unmapped };
}

function normalizeFieldKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function tokenizeFieldKey(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Convierte las respuestas booleanas a boolean real, nunca a una cadena truthy. */
export function normalizeCustomValue(value: unknown, type?: string | null): unknown {
  if (type !== 'boolean') return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'si', 'sí', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'não', 'off'].includes(normalized)) return false;
  return Boolean(value);
}
