/**
 * Optimización de landings para IA Crawlers.
 *
 * Detecta los User-Agent de los crawlers de IA más comunes (GPTBot, ClaudeBot,
 * PerplexityBot, Google-Extended, OAI-SearchBot, etc.) y genera una versión
 * Markdown limpia de una página publicada, para que los agentes no tengan que
 * parsear el HTML denso de GrapesJS/Puck/Tailwind.
 */

import { convert } from 'html-to-text'

export { isAICrawler } from './ai-crawler-detect'


/**
 * Convierte el contenido de una página (GrapesJS html, Puck content o legacy
 * components) a Markdown/texto limpio. Si no se puede extraer nada estructurado,
 * cae a la descripción o un stub genérico.
 */
export function pageToMarkdown(page: {
  titulo?: string | null
  descripcion?: string | null
  metaTitulo?: string | null
  metaDescripcion?: string | null
  metaKeywords?: string | null
  contenido?: any
}): string {
  const title = page.metaTitulo || page.titulo || 'Página'
  const description = page.metaDescripcion || page.descripcion || ''
  const keywords = page.metaKeywords || ''

  const parts: string[] = []
  parts.push(`# ${title}`)
  if (description) parts.push('', description)
  if (keywords) parts.push('', `_Palabras clave: ${keywords}_`)

  const content = page.contenido || {}
  const html = typeof content === 'object' && typeof content.html === 'string' ? content.html : null

  if (html) {
    const text = convert(html, {
      wordwrap: 120,
      selectors: [
        { selector: 'script', format: 'skip' },
        { selector: 'style', format: 'skip' },
        { selector: 'noscript', format: 'skip' },
        { selector: 'iframe', format: 'skip' },
        { selector: 'nav', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'h1', options: { uppercase: false } },
        { selector: 'h2', options: { uppercase: false } },
        { selector: 'h3', options: { uppercase: false } },
        { selector: 'a', options: { hideLinkHrefIfSameAsText: true, noAnchorUrl: true } },
        { selector: 'img', format: 'skip' },
        { selector: 'button', format: 'inline', options: { uppercase: false } },
      ],
    })
    const clean = text
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
    if (clean) {
      parts.push('', '---', '', clean)
    }
  } else if (Array.isArray(content.content) && content.content.length) {
    // Puck: recorre la estructura de componentes y extrae textos
    const texts = extractPuckTexts(content.content)
    if (texts.length) {
      parts.push('', '---', '', texts.join('\n\n'))
    }
  } else if (Array.isArray(content.components) && content.components.length) {
    // Legacy: GrapesJS projectData con components
    const texts = extractComponentTexts(content.components)
    if (texts.length) {
      parts.push('', '---', '', texts.join('\n\n'))
    }
  }

  return parts.join('\n').trim() || `# ${title}`
}

interface PuckNode {
  props?: Record<string, any>
  children?: PuckNode[]
}

function extractPuckTexts(nodes: PuckNode[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    const props = node.props || {}
    const textCandidates = [
      props.title,
      props.heading,
      props.subtitle,
      props.description,
      props.text,
      props.content,
      props.body,
      props.label,
      props.buttonText,
    ]
    for (const c of textCandidates) {
      if (typeof c === 'string' && c.trim()) out.push(c.trim())
    }
    if (Array.isArray(node.children)) {
      out.push(...extractPuckTexts(node.children))
    }
  }
  return dedupe(out)
}

function extractComponentTexts(components: any[]): string[] {
  const out: string[] = []
  const walk = (comp: any) => {
    if (!comp || typeof comp !== 'object') return
    if (typeof comp.content === 'string' && comp.content.trim()) out.push(comp.content.trim())
    if (typeof comp.type === 'string' && comp.type) {
      // tipos comunes de GrapesJS: text, textnode, link, image, ...
      if (comp.type === 'text' || comp.type === 'textnode') {
        // ya cubierto por content
      }
    }
    if (Array.isArray(comp.components)) {
      for (const child of comp.components) walk(child)
    }
  }
  for (const c of components) walk(c)
  return dedupe(out)
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>()
  return items.filter((i) => {
    const key = i.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
