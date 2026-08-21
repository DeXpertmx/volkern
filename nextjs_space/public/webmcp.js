/**
 * WebMCP — expone las tools de Volkern a agentes del navegador.
 *
 * Registra tools en navigator.modelContext.registerTool() (WebMCP API) en
 * el document raíz. Cada tool tiene name, description, inputSchema (JSON
 * Schema) y execute. Un AbortController por tool permite desregistrarlas.
 *
 * API: https://webmachinelearning.github.io/webmcp/
 */
(function () {
  'use strict';

  var registry = [];

  var tools = [
    {
      name: 'volkern_search_site',
      title: 'Buscar en Volkern',
      description:
        'Busca en el contenido público de Volkern (soluciones, precios, ecosistema, landings) y devuelve enlaces y texto relevante para la consulta.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Términos de búsqueda' },
          limit: { type: 'number', description: 'Máximo de resultados (default 5)', default: 5 }
        },
        required: ['query'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      async execute(args) {
        var query = String(args && args.query || '').trim();
        if (!query) return { content: [{ type: 'text', text: JSON.stringify({ error: 'query requerido' }) }] };
        var limit = Math.min(Number(args && args.limit) || 5, 20);
        try {
          var res = await fetch('/api/public/search?q=' + encodeURIComponent(query) + '&limit=' + limit);
          var data = await res.json();
          return { content: [{ type: 'text', text: JSON.stringify(data) }] };
        } catch (e) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: String(e) }) }] };
        }
      }
    },
    {
      name: 'volkern_list_resources',
      title: 'Recursos del sitio',
      description:
        'Devuelve los recursos legibles por máquina publicados por Volkern (robots, sitemap, api-catalog, agent-skills, mcp server card, docs) y las secciones principales del sitio.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      async execute() {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              resources: [
                '/robots.txt',
                '/sitemap.xml',
                '/.well-known/api-catalog',
                '/.well-known/agent-skills/index.json',
                '/.well-known/mcp/server-card.json',
                '/.well-known/agent-card.json',
                '/.well-known/oauth-authorization-server',
                '/.well-known/oauth-protected-resource',
                '/auth.md',
                '/docs/developers',
                '/openapi.json'
              ],
              secciones: ['/', '/precios', '/soluciones', '/ecosistema', '/signup', '/booking']
            })
          }]
        };
      }
    },
    {
      name: 'volkern_get_page',
      title: 'Leer página',
      description:
        'Devuelve el contenido principal de una página pública de Volkern (ruta relativa, p.ej. /precios, /soluciones) como texto.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Ruta relativa de la página (p.ej. /precios)' }
        },
        required: ['path'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      async execute(args) {
        var path = String(args && args.path || '').trim();
        if (!path || path[0] !== '/') {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'path relativo requerido (ej: /precios)' }) }] };
        }
        try {
          var res = await fetch(path);
          var html = await res.text();
          // Extraer texto legible aproximado
          var text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          return { content: [{ type: 'text', text: text.slice(0, 6000) }] };
        } catch (e) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: String(e) }) }] };
        }
      }
    },
    {
      name: 'volkern_get_health',
      title: 'Estado del sistema',
      description:
        'Devuelve el estado de salud del sistema Volkern (API, base de datos, latencia) desde /api/health.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      async execute() {
        try {
          var res = await fetch('/api/health');
          var data = await res.json();
          return { content: [{ type: 'text', text: JSON.stringify(data) }] };
        } catch (e) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: String(e) }) }] };
        }
      }
    }
  ];

  function register(tool) {
    var ac = new AbortController();
    if (navigator.modelContext && typeof navigator.modelContext.registerTool === 'function') {
      navigator.modelContext
        .registerTool(tool, { signal: ac.signal })
        .catch(function (err) {
          // Duplicado o API no disponible — no es fatal para la página
          console.warn('[webmcp] no se pudo registrar', tool.name, err);
        });
    } else {
      // API aún no disponible en este navegador — mantener polyfill ligero
      var self = navigator;
      if (!self.modelContextTesting) {
        Object.defineProperty(self, 'modelContextTesting', {
          configurable: true,
          value: {
            listTools: async function () {
              return registry.map(function (t) { var c = Object.assign({}, t); delete c.execute; return c; });
            }
          }
        });
      }
    }
    registry.push({ name: tool.name, controller: ac, tool: tool });
    return ac;
  }

  function registerAll() {
    // Desregistrar previos si se recarga la página en SPA
    unregisterAll();
    tools.forEach(register);
  }

  function unregisterAll() {
    registry.forEach(function (entry) {
      try { entry.controller.abort(); } catch (e) { /* noop */ }
    });
    registry = [];
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerAll);
  } else {
    registerAll();
  }

  // En SPAs, re-registrar tras cambios de ruta; el AbortController limpia
  // las tools de páginas anteriores cuando ya no se necesitan.
  window.addEventListener('pagehide', unregisterAll);
})();
