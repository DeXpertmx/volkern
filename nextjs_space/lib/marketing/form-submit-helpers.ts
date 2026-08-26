// Campos estándar del Lead: se mapean a su columna. Todo lo demás del
// payload (campos personalizados del formulario) se conserva como notas,
// con el nombre del formulario como contexto — nada se pierde.
export const CAMPOS_ESTANDAR = new Set([
  'email', 'Email', 'correo',
  'nombre', 'name', 'Nombre',
  'telefono', 'phone', 'Telefono',
  'empresa', 'company', 'Empresa',
  'notas', 'notes', 'Notas',
]);

// Construye las notas del lead: contexto del formulario + notas del
// solicitante + campos personalizados que no tienen columna propia.
export function buildLeadNotas(payload: Record<string, any>, formName: string, notas?: any): string {
  const partes: string[] = [`Lead generado desde el formulario: ${formName}`];
  if (notas) partes.push(`Notas del solicitante:\n${String(notas)}`);

  const extra = Object.entries(payload)
    .filter(([k]) => !CAMPOS_ESTANDAR.has(k))
    .filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (extra.length > 0) {
    partes.push('Datos adicionales del formulario:');
    for (const [k, v] of extra) {
      partes.push(`• ${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
    }
  }
  return partes.join('\n\n');
}

/**
 * Lee envíos tanto del SurveyFormRenderer (JSON con `payload`) como de un
 * formulario HTML tradicional (urlencoded/multipart). Web Creator puede
 * publicar el segundo formato según el navegador y el markup generado.
 */
export async function parseSubmissionPayload(req: Request): Promise<Record<string, any>> {
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    return Object.fromEntries(
      Array.from(formData.entries()).map(([key, value]) => [key, typeof value === 'string' ? value : value.name]),
    );
  }

  const raw = await req.text();

  if (contentType.includes('application/json') || raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw || '{}');
      return parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : parsed;
    } catch {
      return {};
    }
  }

  // Formulario HTML tradicional (application/x-www-form-urlencoded)
  const params = new URLSearchParams(raw);
  const result: Record<string, any> = {};
  for (const [key, value] of params.entries()) {
    if (key.endsWith('[]')) {
      const base = key.slice(0, -2);
      if (!Array.isArray(result[base])) result[base] = [];
      result[base].push(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}