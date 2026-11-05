import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { AVAILABLE_SCOPES } from '@/lib/api-keys';

/**
 * Guardia de integración: ningún endpoint de la API puede exigir un scope que no
 * se pueda otorgar a una API key.
 *
 * Históricamente hubo módulos (catálogo, seguros, contratos, marketing…) cuyos
 * endpoints usaban scopes que NO existían en AVAILABLE_SCOPES, por lo que ninguna
 * clave podía conceder acceso y la integración por API quedaba rota sin aviso.
 * Este test recorre todas las rutas de app/api, recoge los scopes literalmente
 * declarados y falla si alguno no está en el catálogo.
 */

// Scopes del área de PLATAFORMA (Superadmin). Excluidos deliberadamente del
// catálogo de tenant: una API key de tenant jamás debe poder otorgarlos.
// Solo se toleran en rutas bajo app/api/admin.
const PLATFORM_ONLY_SCOPES = new Set(['admin:read', 'admin:write']);
const PLATFORM_PATH_SEGMENT = join('app', 'api', 'admin');

// El módulo admite dígitos (p. ej. n8n:read) pero debe contener al menos una
// letra, para no confundir horas ('10:00') o ratios ('16:9') con scopes.
const SCOPE_LITERAL_RE = /['"]((?=[a-z0-9_]*[a-z])[a-z0-9_]+:[a-z_]+)['"]/g;
// El guion es parte del nombre del módulo (`real-estate:read`), igual que en la
// ruta `/api/real-estate`. Se exige que el recurso empiece por letra.
const SCOPE_FORMAT_RE = /^(?=[a-z0-9_-]*[a-z])[a-z0-9_-]+:[a-z_]+$/;

function findApiDir(): string {
  const candidates = [
    join(process.cwd(), 'app', 'api'),
    join(process.cwd(), 'nextjs_space', 'app', 'api'),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isDirectory()) return c;
    } catch {
      // intentar siguiente
    }
  }
  throw new Error('No se encontró el directorio app/api. Revisa el cwd del test.');
}

function walkRouteFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkRouteFiles(full, out);
    } else if (entry.endsWith('.ts') && full.includes('route.')) {
      out.push(full);
    }
  }
  return out;
}

interface Usage {
  file: string;
  line: number;
}

function collectUsedScopes(): Map<string, Usage[]> {
  const apiDir = findApiDir();
  const scopes = new Map<string, Usage[]>();
  for (const file of walkRouteFiles(apiDir)) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      // Ignorar líneas que son solo comentario para no generar falsos positivos.
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        return;
      }
      SCOPE_LITERAL_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = SCOPE_LITERAL_RE.exec(line)) !== null) {
        const scope = m[1];
        if (!SCOPE_FORMAT_RE.test(scope)) continue;
        if (!scopes.has(scope)) scopes.set(scope, []);
        scopes.get(scope)!.push({ file: relative(process.cwd(), file), line: idx + 1 });
      }
    });
  }
  return scopes;
}

describe('Guardia de scopes de API keys', () => {
  it('todo scope usado en las rutas de API existe en AVAILABLE_SCOPES', () => {
    const used = collectUsedScopes();
    const catalog = new Set<string>(AVAILABLE_SCOPES);

    const problemas: string[] = [];
    for (const [scope, usages] of used) {
      if (catalog.has(scope)) continue;

      const esPlataforma =
        PLATFORM_ONLY_SCOPES.has(scope) &&
        usages.every((u) => u.file.includes(PLATFORM_PATH_SEGMENT));

      if (esPlataforma) continue;

      const ejemplos = usages
        .slice(0, 3)
        .map((u) => `${u.file}:${u.line}`)
        .join(', ');
      problemas.push(`- '${scope}' usado en ${ejemplos}`);
    }

    expect(problemas, [
      'Hay scopes exigidos por endpoints que NO están en AVAILABLE_SCOPES (lib/api-keys.ts).',
      'Resultado: ninguna API key puede concederlos y el módulo queda sin conexión por API.',
      'Solución: añade cada scope al catálogo, o inclúyelo en PLATFORM_ONLY_SCOPES solo si',
      'es del área de plataforma (Superadmin) y las rutas están bajo app/api/admin.',
      '',
      ...problemas,
    ].join('\n')).toEqual([]);
  });

  it('el catálogo no tiene duplicados y todos los scopes tienen formato módulo:acción', () => {
    const catalog = new Set<string>(AVAILABLE_SCOPES);
    expect(catalog.size).toBe(new Set(AVAILABLE_SCOPES).size);
    for (const scope of AVAILABLE_SCOPES) {
      expect(scope, `Scope inválido en el catálogo: ${scope}`).toMatch(SCOPE_FORMAT_RE);
    }
  });

  it('el catálogo NO expone scopes de la plataforma (admin:*) a claves de tenant', () => {
    const expuestos = AVAILABLE_SCOPES.filter((s) => s.startsWith('admin:'));
    expect(expuestos, 'admin:* es área de Superadmin y no debe estar en AVAILABLE_SCOPES').toEqual([]);
  });
});
