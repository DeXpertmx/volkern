import { describe, expect, it } from 'vitest'
import { isAICrawler } from '@/lib/seo/ai-crawler-detect'
import { pageToMarkdown } from '@/lib/seo/ai-crawlers'

describe('isAICrawler (detección edge-safe de crawlers de IA)', () => {
  it('detecta GPTBot', () => {
    expect(isAICrawler('Mozilla/5.0 GPTBot/1.2 (+https://openai.com/gptbot)')).toBe(true)
  })

  it('detecta ClaudeBot y OAI-SearchBot', () => {
    expect(isAICrawler('Mozilla/5.0 AppleWebKit/537.36 ClaudeBot/1.0')).toBe(true)
    expect(isAICrawler('OAI-SearchBot (+https://openai.com/oai-searchbot)')).toBe(true)
  })

  it('detecta PerplexityBot, Google-Extended y Gemini', () => {
    expect(isAICrawler('PerplexityBot/1.0 (+https://perplexity.ai/perplexitybot)')).toBe(true)
    expect(isAICrawler('Mozilla/5.0 Google-Extended (+https://developers.google.com/search/docs/crawling/overview)')).toBe(true)
    expect(isAICrawler('Google-InspectionTool Gemini-Crawler')).toBe(true)
  })

  it('NO detecta navegadores normales ni bots de buscadores convencionales', () => {
    expect(isAICrawler('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36')).toBe(false)
    expect(isAICrawler('Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe(false)
    expect(isAICrawler('Bingbot/2.0')).toBe(false)
    expect(isAICrawler('curl/8.1.2')).toBe(false)
    expect(isAICrawler(null)).toBe(false)
    expect(isAICrawler(undefined)).toBe(false)
  })
})

describe('pageToMarkdown (versión Markdown de una landing)', () => {
  it('convierte HTML de GrapesJS a Markdown limpio, saltando scripts y estilos', () => {
    const md = pageToMarkdown({
      titulo: 'Comunidad Empresarial AGS',
      metaDescripcion: 'Pre-registro para el lanzamiento',
      contenido: {
        format: 'grapesjs',
        html: `<div class="hero"><h1>Estamos construyendo una nueva comunidad</h1><p>Conecta con empresarios de Aguascalientes.</p><ul><li>Relaciones reales</li><li>Oportunidades</li></ul><button>Quiero pre-registrarme</button></div><script>alert('x')</script><style>.x{color:red}</style>`,
      },
    })

    expect(md).toContain('# Comunidad Empresarial AGS')
    expect(md).toContain('Pre-registro para el lanzamiento')
    expect(md).toContain('Estamos construyendo una nueva comunidad')
    expect(md).toContain('Conecta con empresarios de Aguascalientes')
    expect(md).toContain('Relaciones reales')
    expect(md).toContain('Oportunidades')
    expect(md).toContain('Quiero pre-registrarme')
    expect(md).not.toContain('alert(')
    expect(md).not.toContain('.x{color:red}')
  })

  it('usa metaTitulo si existe y añade keywords', () => {
    const md = pageToMarkdown({
      titulo: 'Título interno',
      metaTitulo: 'Meta título SEO',
      metaKeywords: 'networking, aguascalientes',
      contenido: { format: 'grapesjs', html: '<p>Contenido</p>' },
    })
    expect(md).toContain('# Meta título SEO')
    expect(md).toContain('Palabras clave: networking, aguascalientes')
    expect(md).not.toContain('Título interno')
  })

  it('extrae textos de contenido Puck (componentes con props)', () => {
    const md = pageToMarkdown({
      titulo: 'Landing Puck',
      contenido: {
        content: [
          { props: { title: 'Hola mundo', description: 'Descripción de la landing' } },
          { props: { buttonText: 'Clic aquí' } },
        ],
      },
    })
    expect(md).toContain('Hola mundo')
    expect(md).toContain('Descripción de la landing')
    expect(md).toContain('Clic aquí')
  })

  it('extrae textos de contenido legacy (components de GrapesJS)', () => {
    const md = pageToMarkdown({
      titulo: 'Landing legacy',
      contenido: {
        components: [
          {
            type: 'wrapper',
            components: [
              { type: 'text', content: 'Bienvenido a la landing' },
              { type: 'text', content: 'Bienvenido a la landing' }, // duplicado se elimina
              { type: 'link', content: 'Leer más' },
            ],
          },
        ],
      },
    })
    expect(md).toContain('Bienvenido a la landing')
    expect(md).toContain('Leer más')
    expect(md.match(/Bienvenido a la landing/g)).toHaveLength(1) // dedupe
  })

  it('cae al título cuando no hay contenido extraíble', () => {
    const md = pageToMarkdown({ titulo: 'Página vacía', contenido: {} })
    expect(md).toBe('# Página vacía')
  })
})
