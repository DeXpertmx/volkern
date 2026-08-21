import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { searchStaticPages, STATIC_PAGES } from '@/lib/seo/webmcp'

const webmcpJs = readFileSync(join(process.cwd(), 'public', 'webmcp.js'), 'utf-8')

describe('WebMCP: tools del navegador (public/webmcp.js)', () => {
  it('registra tools vía navigator.modelContext.registerTool en el load de la página', () => {
    expect(webmcpJs).toContain('navigator.modelContext')
    expect(webmcpJs).toContain('registerTool')
    expect(webmcpJs).toContain('DOMContentLoaded')
  })

  it('cada tool expone name, description, inputSchema y execute', () => {
    const toolNames = ['volkern_search_site', 'volkern_list_resources', 'volkern_get_page', 'volkern_get_health']
    for (const name of toolNames) {
      expect(webmcpJs).toContain(`name: '${name}'`)
    }
    // Al menos una tool con inputSchema (JSON Schema) y una con execute
    expect(webmcpJs).toContain('inputSchema:')
    expect(webmcpJs).toContain('async execute(')
  })

  it('usa AbortController para desregistrar tools cuando ya no se necesitan', () => {
    expect(webmcpJs).toContain('new AbortController()')
    expect(webmcpJs).toContain('controller.abort()')
    expect(webmcpJs).toContain('pagehide')
  })

  it('el layout carga el script con defer', () => {
    const layout = readFileSync(join(process.cwd(), 'app', 'layout.tsx'), 'utf-8')
    expect(layout).toContain('<script src="/webmcp.js" defer />')
  })
})

describe('WebMCP: búsqueda estática (lib/seo/webmcp.ts)', () => {
  it('devuelve hits para una query que existe', () => {
    const hits = searchStaticPages('precios')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].url).toMatch(/\/precios$/)
  })

  it('devuelve vacío para una query sin coincidencias', () => {
    expect(searchStaticPages('zzz_no_existe_zzz')).toEqual([])
  })

  it('devuelve vacío para query vacía', () => {
    expect(searchStaticPages('')).toEqual([])
    expect(searchStaticPages('   ')).toEqual([])
  })

  it('el catálogo estático tiene las secciones principales', () => {
    const paths = STATIC_PAGES.map((p) => p.path)
    for (const p of ['/', '/precios', '/soluciones', '/signup', '/booking']) {
      expect(paths).toContain(p)
    }
  })
})
