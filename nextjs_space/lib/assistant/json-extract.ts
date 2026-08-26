/**
 * Extrae un objeto/array JSON válido del contenido devuelto por la IA,
 * tolerando: bloques de código markdown (```json ... ```), texto antes o
 * después del JSON, y basura alrededor. Devuelve null si no hay JSON válido.
 *
 * NUNCA devolver una plantilla hardcodeada: si la IA falla, mejor un error
 * claro que una página inventada que ignore el prompt del usuario.
 */
export function extractJsonFromContent(content: string): any | null {
  if (!content) return null;

  let cleaned = content.trim();

  // Quitar fences de markdown (```json, ``` o ``` con lenguaje) en su propia línea
  cleaned = cleaned.replace(/^\s*```[a-zA-Z]*\s*$/gim, '').trim();
  // Quitar fences pegados al inicio/final del contenido
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

  // 1. Intento directo
  try {
    return JSON.parse(cleaned);
  } catch {}

  // 2. Buscar bloques balanceados. No basta con tomar el primer {…}: algunos
  // modelos anteponen texto con llaves o devuelven un primer candidato roto y
  // después el JSON correcto.
  for (let start = 0; start < cleaned.length; start++) {
    if (cleaned[start] !== '{' && cleaned[start] !== '[') continue;

    const stack: string[] = [];
    let inString = false;
    let escape = false;

    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') {
        const expected = ch === '}' ? '{' : '[';
        if (stack[stack.length - 1] !== expected) break;
        stack.pop();
        if (stack.length === 0) {
          try {
            return JSON.parse(cleaned.substring(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}