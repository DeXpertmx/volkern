# Plan de Modularización - Volkern Next.js

## Estado Actual

| Métrica | Valor |
|--------|-------|
| Build output | 183 MB |
| API routes | 100+ |
| Dependencies | 180+ packages |
| Build time | ~5-10+ min |

## Fases de Implementación

### Fase 1: Configuración Inmediata (Quick Wins)
**Objetivo:** Reducir build time ~30%

- [ ] 1.1 Habilitar `output: 'standalone'`
- [ ] 1.2 Configurar `experimental.compileMaxMemory` 
- [ ] 1.3 Agregar lazy loading a librerías pesadas
- [ ] 1.4 Excluir rutas no usadas del build

### Fase 2: Code Splitting por Dominio
**Objetivo:** Separar código por módulos

- [ ] 2.1 Crear estructura de monorepo:
  ```
  apps/
    web/          (dashboard público)
    api-core/     (auth, users, tenants)
    api-crm/      (contacts, deals, leads)
    api-erp/      (projects, inventory)
    api-analytics/(metrics, reports)
  ```
- [ ] 2.2 Mover API routes a paquetes separados
- [ ] 2.3 Configurar shared packages

### Fase 3: Optimización de Dependencias
**Objetivo:** Reducir tamaño ~50%

- [ ] 3.1 Identificar librerías no usadas
- [ ] 3.2 Reemplazar librerías pesadas:
  - `plotly.js` → `recharts` o `chart.js`
  - `grapesjs` → solo si es necesario
- [ ] 3.3 Implementar tree-shaking

### Fase 4: CI/CD Modular
**Objetivo:** Build paralelo por módulo

- [ ] 4.1 Configurar Turborepo
- [ ] 4.2 Crear pipeline paralelo
- [ ] 4.3 Cache de builds

---

## Implementación Fase 1

### 1.1 standalone mode
```javascript
// next.config.js
output: 'standalone',
```

### 1.2 Lazy imports
```typescript
// En lugar de:
// import { HeavyLib } from 'heavy-lib'

// Usar:
const HeavyLib = dynamic(() => import('heavy-lib').then(m => m.HeavyLib))
```

### 1.3 Webpack splitting
```javascript
// next.config.js
experimental: {
  optimizePackageImports: ['@radix-ui/react-*', 'lucide-react'],
}
```

---

## Timeline Estimado

| Fase | Tiempo | Impacto |
|------|--------|---------|
| Fase 1 | 1-2 días | -30% build |
| Fase 2 | 1-2 semanas | -50% build |
| Fase 3 | 1 semana | -30% bundle |
| Fase 4 | 1-2 semanas | -70% deploy |

---

## Riesgo y Mitigación

| Riesgo | Mitigation |
|--------|-------------|
| Breaking changes | Testing exhaustivo |
| Complejidad nueva | Docs + ejemplos |
| Performance runtime | Benchmarks antes/después |

---

## Done Criteria

- [ ] Build < 3 minutos
- [ ] Bundle < 100MB
- [ ] Deploy sin timeout
- [ ] Todos los tests pasando