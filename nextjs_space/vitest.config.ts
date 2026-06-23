import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    alias: {
      '@': path.resolve(__dirname, './'),
    },
    setupFiles: ['./tests/setup.ts'],
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
      // Umbrales actuales basados en cobertura real (179 tests en 10 archivos).
      // Meta progresiva: subir 5pp por sprint hasta llegar al 60% en todos los métricos.
      thresholds: {
        lines: 3,
        branches: 40,
        functions: 8,
        statements: 3,
      },
    },
  },
})
