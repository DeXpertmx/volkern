import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: true,
    environment: 'node',
    alias: {
      '@': path.resolve(__dirname, './'),
    },
    setupFiles: ['./tests/setup.ts'],
    // Aborta la suite antes del primer archivo si `DATABASE_URL` apunta a la base
    // de producción (ver tests/global-setup.ts y su guardia de tests).
    globalSetup: ['./tests/global-setup.ts'],
    exclude: [
      '**/node_modules/**', // recursive: cubre gemma-app/node_modules/, mcp-server/node_modules/, etc.
      'app-movil/**',
      '.opencode/**',
      'mcp-server/**',
      'dist/**',
      '.next/**',
      'coverage/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'lib/**/*.ts',
        'app/api/webhooks/**/*.ts',
      ],
      exclude: [
        'lib/agents/intents/**',
        'lib/automation/actions/**',
        'node_modules/**',
        'tests/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.d.ts',
      ],
      // Umbrales globales basados en cobertura real de la suite completa
      // (201+ archivos, 5200+ tests): stmts 38%, branches 72%, funcs 45%.
      // Se fijan ligeramente por debajo para no romper en variaciones
      // locales, con meta progresiva de subirlos por sprint.
      thresholds: {
        lines: 32,
        branches: 68,
        functions: 40,
        statements: 32,
        // La lógica de redirects legacy es pura y debe mantenerse al 100%:
        // cualquier nueva rama sin test rompe el coverage.
        'lib/legacy-redirects.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  },
})
