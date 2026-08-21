import { MetadataRoute } from 'next'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app').replace(/\/$/, '')

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/p/', '/sitemap.xml'],
        disallow: ['/dashboard', '/admin', '/api/', '/_next/', '/member/', '/academy/'],
      },
      // Los crawlers de IA pueden acceder a todo el contenido público (las
      // landings se les sirven en Markdown limpio por User-Agent).
      {
        userAgent: ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Anthropic-ai', 'PerplexityBot', 'Google-Extended', 'Gemini-Crawler'],
        allow: ['/', '/p/'],
        disallow: ['/dashboard', '/admin', '/api/'],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  }
}
