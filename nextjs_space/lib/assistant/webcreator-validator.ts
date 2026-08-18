/**
 * Validación determinista de páginas generadas por Web Creator.
 *
 * La IA puede producir HTML visualmente correcto pero funcionalmente inválido:
 * formularios sin conexión al CRM, etiquetas HTML inventadas o claims no
 * verificados. Esta capa corrige los casos conocidos antes de entregar el
 * projectData al editor.
 */

export interface WebCreatorValidationResult {
  projectData: any;
  warnings: string[];
  convertedForms: number;
  correctedTags: number;
}

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Quita del brief los resultados que el usuario haya pegado después de pedir
 * una revisión. Es habitual copiar "Esto es lo que obtuve:" junto con miles
 * de caracteres de HTML; ese HTML no es una instrucción y consume el contexto
 * del modelo hasta provocar JSON truncado o respuestas inconsistentes.
 */
export function cleanWebCreatorPrompt(prompt: string): string {
  if (!prompt) return prompt;
  const markers = [
    /\n\s*Esto es lo que obtuve\s*:/i,
    /\n\s*Resultado\s*:/i,
    /\n\s*Resultado obtenido\s*:/i,
  ];
  let cleaned = prompt;
  for (const marker of markers) {
    const match = cleaned.match(marker);
    if (match?.index !== undefined) cleaned = cleaned.slice(0, match.index);
  }
  // Protección adicional para HTML pegado sin encabezado.
  const htmlIndex = cleaned.search(/<body(?:\s|>)/i);
  if (htmlIndex > 0) cleaned = cleaned.slice(0, htmlIndex);
  return cleaned.trim();
}

/** Acepta respuestas envueltas como { projectData: { pages: [...] } }. */
export function unwrapWebCreatorProject(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value.pages)) return value;
  for (const key of ['projectData', 'data', 'page', 'result']) {
    const nested = value[key];
    if (nested && typeof nested === 'object' && Array.isArray(nested.pages)) return nested;
  }
  return value;
}

/** Sustituye claims de urgencia/autoridad que el brief no puede verificar. */
export function sanitizeGeneratedText(value: string): string {
  return value
    .replace(/lanzamiento oficial/gi, 'próximo lanzamiento')
    .replace(/plazas iniciales limitadas/gi, 'forma parte desde el inicio')
    .replace(/últimas plazas/gi, 'forma parte desde el inicio')
    .replace(/con éxito/gi, 'con experiencia')
    .replace(/exitosamente/gi, 'con experiencia')
    .replace(/Únete a miles de empresas/gi, 'Conoce una comunidad de empresas')
    .replace(/resultados garantizados/gi, 'relaciones y oportunidades')
    .replace(/garantizado/gi, 'posible')
    .replace(/©\s*20\d{2}/g, `© ${CURRENT_YEAR}`);
}

function getTextFromNode(node: any): string {
  if (!node || typeof node !== 'object') return '';
  const parts: string[] = [];
  if (typeof node.content === 'string') parts.push(node.content);
  if (Array.isArray(node.components)) {
    for (const child of node.components) parts.push(getTextFromNode(child));
  }
  return parts.join(' ').trim();
}

function hasRawForm(node: any): boolean {
  const tag = typeof node?.tagName === 'string' ? node.tagName.toLowerCase() : '';
  const type = typeof node?.type === 'string' ? node.type.toLowerCase() : '';
  return tag === 'form' || type === 'form';
}

function crmFormNode(node: any): any {
  const parentText = getTextFromNode(node);
  const title = /pre.?registro|lanzamiento/i.test(parentText)
    ? 'Quiero formar parte del lanzamiento'
    : 'Déjanos tus datos';

  return {
    type: 'volkern-form-advanced',
    attributes: {
      'data-volkern-target': 'leads',
      'data-form-title': title,
      'data-btn-text': 'QUIERO PRE-REGISTRARME',
      'data-success-msg': 'Tu pre-registro ha sido recibido. Muy pronto recibirás información sobre los siguientes pasos.',
    },
  };
}

function normalizeNode(node: any, result: WebCreatorValidationResult): any {
  if (Array.isArray(node)) return node.map((item) => normalizeNode(item, result));
  if (!node || typeof node !== 'object') {
    return typeof node === 'string' ? sanitizeGeneratedText(node) : node;
  }

  // Los formularios HTML libres no tienen endpoint CRM. Convertirlos al bloque
  // nativo que ya publica leads y muestra estado de éxito.
  if (hasRawForm(node)) {
    result.convertedForms += 1;
    result.warnings.push('Formulario HTML convertido al formulario conectado al CRM');
    return crmFormNode(node);
  }

  const normalized: Record<string, any> = { ...node };
  const tagName = typeof normalized.tagName === 'string' ? normalized.tagName.toLowerCase() : '';

  // <space> aparece cuando el modelo intenta representar un contenedor con
  // una etiqueta inventada. Sustituirlo por un elemento HTML válido.
  if (tagName === 'space') {
    normalized.tagName = 'div';
    result.correctedTags += 1;
    result.warnings.push('Etiqueta <space> sustituida por <div>');
  }

  if (typeof normalized.content === 'string') {
    normalized.content = sanitizeGeneratedText(normalized.content);
  }

  if (normalized.attributes && typeof normalized.attributes === 'object') {
    normalized.attributes = { ...normalized.attributes };
    for (const [key, value] of Object.entries(normalized.attributes)) {
      // No tocar URLs, clases ni atributos técnicos; solo texto visible y
      // metadatos de copy que la IA pueda haber rellenado.
      if (typeof value === 'string' && (key.startsWith('data-') || key === 'alt' || key === 'title' || key === 'placeholder')) {
        normalized.attributes[key] = sanitizeGeneratedText(value);
      }
    }
  }

  if (Array.isArray(normalized.components)) {
    normalized.components = normalized.components.map((child: any) => normalizeNode(child, result));
  }

  // Recorrer la envoltura de GrapesJS (pages → frames → component), no solo
  // los arrays `components`.
  for (const key of ['pages', 'frames', 'component']) {
    if (normalized[key] !== undefined) {
      normalized[key] = normalizeNode(normalized[key], result);
    }
  }

  return normalized;
}

/**
 * Normaliza un projectData de GrapesJS/Puck sin destruir el contenido válido.
 * Es intencionalmente tolerante: si el JSON tiene una forma desconocida,
 * devuelve una copia segura y registra la advertencia, no una página vacía.
 */
export function validateAndNormalizeWebCreatorProject(projectData: any): WebCreatorValidationResult {
  const result: WebCreatorValidationResult = {
    projectData,
    warnings: [],
    convertedForms: 0,
    correctedTags: 0,
  };

  result.projectData = normalizeNode(projectData, result);
  return result;
}
