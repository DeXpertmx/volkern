/**
 * Limpia la salida del modelo para devolver SOLO el texto de la respuesta.
 * Red de seguridad contra el boilerplate que a veces añade el LLM
 * ("Aquí tienes tu siguiente respuesta como asesor:", análisis previo, comillas, etc.).
 * Compartido por los generadores de sugerencias de respuesta (suggest-reply, scoring).
 */
export function cleanSuggestion(raw: string): string {
    let text = raw?.trim() || '';
    if (!text) return text;

    // 1. Quedarse con el contenido después del último marcador conocido (si existe).
    const markers = [
        'Aquí tienes tu siguiente respuesta como asesor:',
        'Aquí tienes tu respuesta:',
        'Aquí tienes tu sugerencia:',
        'Aquí tienes:',
        'Mi siguiente respuesta como asesor sería:',
        'Mi respuesta sería:',
        'La respuesta sería:',
        'Como asesor, mi respuesta sería:',
        'Te sugiero responder:',
        'Te sugiero:',
        'Puedes responder:',
        'Respondería:',
    ];
    let lastIndex = -1;
    for (const marker of markers) {
        const idx = text.lastIndexOf(marker);
        if (idx > lastIndex) lastIndex = idx;
    }
    if (lastIndex >= 0) {
        text = text.slice(lastIndex + text.slice(lastIndex).indexOf(':') + 1).trim();
    }

    // 2. Quitar líneas introductorias que expliquen la respuesta (heurística conservadora).
    const introPatterns = [
        /^¡?Hola!? Como veo que el chat acaba de iniciar/i,
        /^Como veo que el chat/i,
        /^Lo ideal es mantener la conversación/i,
        /^Aquí tienes tu siguiente respuesta/i,
        /^Esta respuesta es breve/i,
        /^Esta respuesta/i,
    ];
    const lines = text.split('\n');
    while (lines.length > 0 && introPatterns.some((p) => p.test(lines[0].trim()))) {
        lines.shift();
    }
    text = lines.join('\n').trim();

    // 3. Quitar comillas envolventes (rectas, curvas o francesas).
    const quoteStart = text.charCodeAt(0);
    const quoteEnd = text.charCodeAt(text.length - 1);
    const openQuotes = [0x22, 0x201c, 0xab, 0x2018]; // " " « '
    const closeQuotes = [0x22, 0x201d, 0xbb, 0x2019];
    if (openQuotes.includes(quoteStart) && closeQuotes.includes(quoteEnd)) {
        text = text.slice(1, -1).trim();
    }

    return text;
}
