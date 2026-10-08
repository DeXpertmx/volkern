import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_MODULES } from '@/lib/plans';
import { HUBS } from '@/lib/navigation-config';
import { MODULE_GROUPS, PERFIL_SUGGESTED_MODULES, getAllModuleIds } from '@/lib/onboarding-modules';
import { VERTICAL_DEFINITIONS } from '@/lib/plans';

/**
 * Guardia del módulo Compras.
 *
 * Un módulo «existe» cuando pasa las cuatro puertas: está en el catálogo (para
 * poder activarlo), en el menú (para poder llegar), en el alta (para que la
 * vertical lo encienda) y tiene pantalla de verdad detrás. Si una se queda
 * atrás, no falla nada visible: el hub simplemente no aparece nunca, que es
 * exactamente lo que pasó con Hospitality en el onboarding self-serve.
 *
 * La prueba cruza esas fuentes en vez de comprobar cada una por su lado: un id
 * escrito de otra forma en el menú (`compra`, `purchases`) deja el hub
 * invisible para siempre y ninguna de las dos listas se queja sola.
 */

const RAIZ = path.resolve(__dirname, '..');

describe('Compras · catálogo de módulos', () => {
  it('el módulo está en el catálogo que se puede activar', () => {
    const modulo = ALL_MODULES.find((m) => m.id === 'compras');
    expect(modulo).toBeDefined();
    expect(modulo?.label).toBe('Compras');
    expect(modulo?.group).toBe('ERP');
  });

  it('aparece en el selector de módulos del onboarding', () => {
    expect(getAllModuleIds()).toContain('compras');
  });

  it('la vertical Hospitality y el perfil del alta lo encienden', () => {
    expect(VERTICAL_DEFINITIONS.hospitality.modules).toContain('compras');
    expect(PERFIL_SUGGESTED_MODULES.hospitality).toContain('compras');
    expect(PERFIL_SUGGESTED_MODULES.industria).toContain('compras');
  });

  it('todo módulo del menú existe en el catálogo', () => {
    const ids = new Set(ALL_MODULES.map((m) => m.id));
    const desconocidos: string[] = [];

    for (const hub of HUBS) {
      if (hub.requiredModule && !ids.has(hub.requiredModule)) {
        desconocidos.push(`hub ${hub.id} → requiredModule ${hub.requiredModule}`);
      }
      for (const item of hub.items) {
        if (item.planModule && !ids.has(item.planModule)) {
          desconocidos.push(`hub ${hub.id} → item ${item.name} → planModule ${item.planModule}`);
        }
      }
    }

    expect(desconocidos).toEqual([]);
  });
});

describe('Compras · navegación', () => {
  const hub = HUBS.find((h) => h.id === 'compras');

  it('el hub existe, es de negocio y depende de su módulo', () => {
    expect(hub).toBeDefined();
    expect(hub?.requiredAccountType).toBe('BUSINESS');
    expect(hub?.requiredModule).toBe('compras');
    expect(hub?.href).toBe('/dashboard/compras');
    expect(hub?.basePaths).toContain('/dashboard/compras');
  });

  it('ofrece pedidos, recepciones y proveedores', () => {
    const nombres = (hub?.items ?? []).map((i) => i.name);
    expect(nombres).toEqual(['Pedidos', 'Recepciones', 'Proveedores']);
    for (const item of hub?.items ?? []) {
      expect(item.planModule).toBe('compras');
    }
  });

  it('cada entrada del menú tiene pantalla detrás', () => {
    const faltantes = (hub?.items ?? [])
      .map((item) => item.href.split('?')[0])
      .filter((href) => {
        const ruta = path.join(RAIZ, 'app', href.replace(/^\//, ''), 'page.tsx');
        return !fs.existsSync(ruta);
      });

    expect(faltantes).toEqual([]);
  });

  it('el hub tiene guardia de servidor en su layout', () => {
    const layout = fs.readFileSync(path.join(RAIZ, 'app/dashboard/compras/layout.tsx'), 'utf8');
    expect(layout).toContain("exigirHub('compras')");
  });
});

describe('Compras · puertas de la API', () => {
  const rutas = [
    'app/api/compras/route.ts',
    'app/api/compras/[id]/route.ts',
    'app/api/compras/[id]/recibir/route.ts',
    'app/api/compras/sugerencias/route.ts',
  ];

  it('ninguna ruta del hub escribe sin exigir sesión de tenant', () => {
    for (const ruta of rutas) {
      const contenido = fs.readFileSync(path.join(RAIZ, ruta), 'utf8');
      expect(contenido, ruta).toContain('withTenantAuth');
    }
  });
});

describe('Compras · la automatización ya no escribe en un modelo fantasma', () => {
  it('crear_orden_compra pasa por el servicio real de compras', () => {
    const acciones = fs.readFileSync(path.join(RAIZ, 'lib/automation/actions/inventory.ts'), 'utf8');

    // El modelo `Compra` existe, pero el acceso a datos se hace desde el
    // servicio: la acción no debe volver a construir el pedido a mano.
    expect(acciones).not.toContain('.compra.create(');
    expect(acciones).toContain("import('@/lib/compras/service')");
  });
});
