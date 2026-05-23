export const dynamic = 'force-dynamic';

/**
 * GET /api/docs — Swagger UI
 *
 * Sirve la página de documentación interactiva Swagger UI
 * que carga el spec desde /api/openapi.json.
 */
export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Volkern CRM — API Docs</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📋</text></svg>" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f172a; }
    .topbar { display: none; }
    .swagger-ui .topbar { background: #1e293b; padding: 12px 24px; display: flex; align-items: center; gap: 12px; }
    .swagger-ui .topbar .link img { display: none; }
    .swagger-ui .topbar::before {
      content: 'Volkern CRM API';
      color: #e2e8f0;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.5px;
    }
    .swagger-ui .topbar .link::after {
      content: 'v1.0';
      color: #94a3b8;
      font-size: 12px;
      background: #334155;
      padding: 2px 8px;
      border-radius: 4px;
      margin-left: 8px;
    }
    .swagger-ui { filter: invert(88%) hue-rotate(180deg); }
    .swagger-ui .microlight { filter: invert(100%) hue-rotate(180deg); }
    .swagger-ui .opblock-tag { filter: invert(100%) hue-rotate(180deg); }
    .swagger-ui .opblock-tag:hover { filter: invert(92%) hue-rotate(180deg); }
    .swagger-ui .opblock-summary { filter: invert(100%) hue-rotate(180deg); }
    .swagger-ui .opblock-summary:hover { filter: invert(92%) hue-rotate(180deg); }
    .swagger-ui .btn { filter: invert(100%) hue-rotate(180deg); }
    .swagger-ui select { filter: invert(100%) hue-rotate(180deg); }
    .swagger-ui input[type="text"] { filter: invert(100%) hue-rotate(180deg); }
    .swagger-ui textarea { filter: invert(100%) hue-rotate(180deg); }
    .swagger-ui .model-box { filter: invert(88%) hue-rotate(180deg); }
    .swagger-ui section.models { filter: invert(88%) hue-rotate(180deg); }
    .loading-container {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; color: #94a3b8; font-family: system-ui, sans-serif;
      gap: 16px;
    }
    .spinner {
      width: 40px; height: 40px; border: 3px solid #334155;
      border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    SwaggerUIBundle({
      url: '/api/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
      plugins: [SwaggerUIBundle.plugins.DownloadUrl],
      layout: 'StandaloneLayout',
      defaultModelsExpandDepth: 2,
      defaultModelExpandDepth: 2,
      docExpansion: 'list',
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      tryItOutEnabled: true,
      supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
