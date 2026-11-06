import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HUBS } from '@/lib/navigation-config';
import { hubDeRuta } from '@/lib/navigation-visibility';

/**
 * Guardia por ruta del panel.
 *
 * El corte tiene que ocurrir en el layout raíz (`app/dashboard/layout.tsx`), no
 * solo en el de cada sección: si se hace más abajo, el armazón del panel ya se
 * ha enviado en streaming y la redirección acaba dentro del payload, con un 200,
 * en vez de en la cabecera. Y para eso el layout necesita el pathname, que llega
 * en `x-pathname` desde el middleware.
 */

const RAIZ = path.resolve(__dirname, '..');

describe('hubDeRuta', () => {
  it('asigna cada ruta del panel a su hub', () => {
    expect(hubDeRuta('/dashboard/seguros')?.id).toBe('seguros');
    expect(hubDeRuta('/dashboard/seguros/polizas')?.id).toBe('seguros');
    expect(hubDeRuta('/dashboard/hospitality/reservas')?.id).toBe('hospitality');
    expect(hubDeRuta('/dashboard/support')?.id).toBe('taskforce');
    expect(hubDeRuta('/dashboard/support/abc')?.id).toBe('taskforce');
    expect(hubDeRuta('/dashboard/real-estate/properties')?.id).toBe('inmobiliaria');
    expect(hubDeRuta('/dashboard/ventas/ordenes')?.id).toBe('ventas');
  });

  it('gana el prefijo más largo', () => {
    // Configuración tiene una entrada de inmobiliaria dentro, pero la ruta sigue
    // siendo de Configuración.
    expect(hubDeRuta('/dashboard/configuracion/real-estate')?.id).toBe('configuracion');
    expect(hubDeRuta('/dashboard/inventario/almacenes')?.id).toBe('inventario');
  });

  it('el panel de inicio y las rutas sin hub no se tocan', () => {
    expect(hubDeRuta('/dashboard')).toBeUndefined();
    expect(hubDeRuta('/dashboard/')).toBeUndefined();
    expect(hubDeRuta('/dashboard/ruta-que-no-es-de-ningun-hub')).toBeUndefined();
  });

  it('no confunde un prefijo con una ruta que solo empieza igual', () => {
    // `/dashboard/ventas-extra` no es `/dashboard/ventas`.
    expect(hubDeRuta('/dashboard/ventas-extra')).toBeUndefined();
    // `/dashboard/segurosx` tampoco.
    expect(hubDeRuta('/dashboard/segurosx')).toBeUndefined();
  });

  it('ignora la query string y las barras finales', () => {
    expect(hubDeRuta('/dashboard/seguros?tab=polizas')?.id).toBe('seguros');
    expect(hubDeRuta('/dashboard/seguros/')?.id).toBe('seguros');
  });

  it('todo hub del menú tiene al menos una ruta asociada', () => {
    for (const hub of HUBS) {
      expect(hubDeRuta(hub.href)?.id, hub.id).toBe(hub.id);
    }
  });
});

describe('el corte ocurre antes de enviar el armazón', () => {
  it('el layout raíz del panel aplica la guardia por ruta', () => {
    const layout = fs.readFileSync(path.join(RAIZ, 'app/dashboard/layout.tsx'), 'utf8');

    // Next 15+ entrega `headers()` como promesa: sin el await no hay `.get`.
    expect(layout).toContain('await headers()');
    expect(layout).toContain(".get('x-pathname')");
    expect(layout).toContain('exigirHubDeRuta(pathname)');
    expect(layout).toMatch(/export default async function/);
  });

  it('el middleware publica el pathname como cabecera de petición', () => {
    const middleware = fs.readFileSync(path.join(RAIZ, 'middleware.ts'), 'utf8');

    expect(middleware).toContain("headers.set('x-pathname', request.nextUrl.pathname)");
    // Cabecera de PETICIÓN: `res.headers` no la ven los Server Components.
    expect(middleware).toMatch(/NextResponse\.next\(conRutaVisible\(request\)\)/);
  });
});
