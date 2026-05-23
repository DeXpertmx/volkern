'use client';

import { useEffect, useState } from 'react';

/**
 * Página de documentación OpenAPI con Swagger UI
 *
 * Carga Swagger UI desde CDN para evitar dependencias pesadas.
 * Consume el endpoint /api/openapi para obtener la especificación.
 *
 * NOTA: No incluye <html>/<head>/<body> porque el RootLayout de
 * Next.js ya los proporciona automáticamente.
 */

const DOCS_STYLES = {
  container: {
    minHeight: '100vh',
    background: '#1a1a2e',
    color: '#e0e0e0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  } as const,
  header: {
    background: 'linear-gradient(135deg, #16213e 0%, #0f3460 100%)',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  } as const,
  title: {
    fontSize: 20,
    fontWeight: 600,
    color: '#e94560',
    margin: 0,
  } as const,
  version: {
    color: '#8a8a9a',
    fontSize: 13,
  } as const,
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 'calc(100vh - 60px)',
    flexDirection: 'column' as const,
    gap: 16,
  } as const,
  spinner: {
    width: 40,
    height: 40,
    border: '3px solid rgba(233, 69, 96, 0.2)',
    borderTopColor: '#e94560',
    borderRadius: '50%',
    animation: 'swagger-spin 0.8s linear infinite',
  } as const,
  error: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 'calc(100vh - 60px)',
    color: '#e94560',
    flexDirection: 'column' as const,
    gap: 8,
  } as const,
  errorHint: {
    fontSize: 14,
    color: '#8a8a9a',
  } as const,
} as const;

export default function ApiDocsPage() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Inyectar keyframes para el spinner vía style tag
    const styleEl = document.createElement('style');
    styleEl.textContent = `@keyframes swagger-spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(styleEl);

    // Cargar CSS de Swagger UI desde CDN
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui.css';
    document.head.appendChild(link);

    // Cargar script de Swagger UI
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js';
    script.onload = () => {
      try {
        (window as any).SwaggerUIBundle({
          url: '/api/openapi',
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            (window as any).SwaggerUIBundle.presets.apis,
          ],
          layout: 'BaseLayout',
          docExpansion: 'list',
          filter: true,
          showExtensions: true,
          showCommonExtensions: true,
          defaultModelsExpandDepth: 1,
          defaultModelExpandDepth: 1,
          persistAuthorization: true,
          tryItOutEnabled: process.env.NODE_ENV === 'development',
        });
        setIsLoaded(true);
      } catch (err) {
        setError('Error al inicializar Swagger UI');
        console.error('Swagger UI init error:', err);
      }
    };
    script.onerror = () => {
      setError('Error al cargar Swagger UI desde CDN');
    };
    document.body.appendChild(script);

    return () => {
      document.head.removeChild(styleEl);
      document.head.removeChild(link);
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return (
    <div style={DOCS_STYLES.container}>
      <div style={DOCS_STYLES.header}>
        <h1 style={DOCS_STYLES.title}>Volkern CRM API</h1>
        <span style={DOCS_STYLES.version}>v1.0.0</span>
      </div>

      {error ? (
        <div style={DOCS_STYLES.error}>
          <h2>⚠️ {error}</h2>
          <p style={DOCS_STYLES.errorHint}>
            Verifica que el endpoint /api/openapi esté accesible
          </p>
        </div>
      ) : !isLoaded ? (
        <div style={DOCS_STYLES.loading}>
          <div style={DOCS_STYLES.spinner} />
          <p>Cargando documentación...</p>
        </div>
      ) : null}

      <div id="swagger-ui" style={{ minHeight: 'calc(100vh - 60px)' }} />
    </div>
  );
}
