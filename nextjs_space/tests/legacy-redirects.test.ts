import { describe, it, expect } from 'vitest';
import { resolveLegacyRedirect, TOP_LEVEL } from '@/lib/legacy-redirects';

describe('resolveLegacyRedirect — regla de dashboard', () => {
  it('redirige /{slug}/dashboard/* a su canónica', () => {
    expect(resolveLegacyRedirect('/empresa-de-prueba/dashboard/finanzas/proveedores')).toEqual({
      to: '/dashboard/finanzas/proveedores',
    });
    expect(resolveLegacyRedirect('/empresa/dashboard/pipeline')).toEqual({
      to: '/dashboard/pipeline',
    });
    expect(resolveLegacyRedirect('/empresa/dashboard')).toEqual({ to: '/dashboard' });
  });

  it('mapea sub-rutas legacy sin canónica directa a su sección padre', () => {
    expect(resolveLegacyRedirect('/empresa/dashboard/support/analytics')).toEqual({
      to: '/dashboard/support',
    });
    expect(resolveLegacyRedirect('/empresa/dashboard/configuracion/accounting')).toEqual({
      to: '/dashboard/configuracion',
    });
    expect(resolveLegacyRedirect('/empresa/dashboard/configuracion/agency')).toEqual({
      to: '/dashboard/configuracion',
    });
    expect(resolveLegacyRedirect('/empresa/dashboard/equality')).toEqual({
      to: '/dashboard/perfil',
    });
    expect(resolveLegacyRedirect('/empresa/dashboard/sales')).toEqual({
      to: '/dashboard/sales/billing',
    });
  });
});

describe('resolveLegacyRedirect — regla de secciones', () => {
  it('redirige /{slug}/<seccion>/* a su canónica', () => {
    expect(resolveLegacyRedirect('/empresa/academy/dashboard')).toEqual({
      to: '/academy/dashboard',
    });
    expect(resolveLegacyRedirect('/empresa/tarjeta/abc')).toEqual({ to: '/tarjeta/abc' });
    expect(resolveLegacyRedirect('/empresa/estudiante/mis-cursos')).toEqual({
      to: '/estudiante/mis-cursos',
    });
    expect(resolveLegacyRedirect('/empresa/marketing')).toEqual({ to: '/marketing' });
    expect(resolveLegacyRedirect('/empresa/portal/xyz')).toEqual({ to: '/portal/xyz' });
  });
});

describe('resolveLegacyRedirect — regla de [pageSlug]', () => {
  it('redirige /{slug}/{page} a /p/{slug}/{page}', () => {
    expect(resolveLegacyRedirect('/empresa-de-prueba/mi-pagina')).toEqual({
      to: '/p/empresa-de-prueba/mi-pagina',
    });
    expect(resolveLegacyRedirect('/empresa/otra-pagina-publica')).toEqual({
      to: '/p/empresa/otra-pagina-publica',
    });
  });
});

describe('resolveLegacyRedirect — rutas canónicas deben pasar (null)', () => {
  it('no toca rutas top-level reales con subsegmento de sección (el bug detectado en prod)', () => {
    // Estos eran los falsos positivos reales: rutas canónicas que el
    // commit anterior redirigía mal en producción.
    expect(resolveLegacyRedirect('/academy/dashboard')).toBeNull();
    expect(resolveLegacyRedirect('/soluciones/marketing')).toBeNull();
    expect(resolveLegacyRedirect('/admin/marketing')).toBeNull();
    expect(resolveLegacyRedirect('/academy/login')).toBeNull();
    expect(resolveLegacyRedirect('/cita/accion')).toBeNull();
    expect(resolveLegacyRedirect('/estudiante/mis-cursos')).toBeNull();
  });

  it('no toca las canónicas de 2 segmentos (tarjeta/{id}, booking/{slug}, etc.)', () => {
    expect(resolveLegacyRedirect('/tarjeta/abc123')).toBeNull();
    expect(resolveLegacyRedirect('/booking/xyz')).toBeNull();
    expect(resolveLegacyRedirect('/portal/xyz')).toBeNull();
    expect(resolveLegacyRedirect('/payment/success')).toBeNull();
  });

  it('no toca el portal de firma /firma/{token} (el bug detectado en prod)', () => {
    expect(resolveLegacyRedirect('/firma/e4ff1064-3684-4c75-918b-ba301e00bc89')).toBeNull();
    expect(resolveLegacyRedirect('/firma/abc123')).toBeNull();
  });

  it('no toca la orden de venta pública /orden/{token} (bug detectado en prod)', () => {
    expect(resolveLegacyRedirect('/orden/abc123')).toBeNull();
    expect(resolveLegacyRedirect('/orden/e4ff1064-3684-4c75-918b-ba301e00bc89')).toBeNull();
  });

  it('no toca páginas y rutas top-level de 1 segmento', () => {
    expect(resolveLegacyRedirect('/dashboard/finanzas/proveedores')).toBeNull();
    expect(resolveLegacyRedirect('/login')).toBeNull();
    expect(resolveLegacyRedirect('/signup')).toBeNull();
    expect(resolveLegacyRedirect('/precios')).toBeNull();
    expect(resolveLegacyRedirect('/admin')).toBeNull();
    expect(resolveLegacyRedirect('/docs/developers')).toBeNull();
    expect(resolveLegacyRedirect('/')).toBeNull();
  });

  it('no toca las rutas públicas /p/', () => {
    expect(resolveLegacyRedirect('/p/empresa/propiedades')).toBeNull();
    expect(resolveLegacyRedirect('/p/empresa/mi-pagina')).toBeNull();
    expect(resolveLegacyRedirect('/p/preview/template/abc')).toBeNull();
  });
});

describe('resolveLegacyRedirect — casos límite', () => {
  it('maneja slugs de tenant con guiones en todas las reglas', () => {
    expect(resolveLegacyRedirect('/mi-empresa-sa/dashboard/gastos')).toEqual({
      to: '/dashboard/gastos',
    });
    expect(resolveLegacyRedirect('/mi-empresa-sa/academy/dashboard')).toEqual({
      to: '/academy/dashboard',
    });
    expect(resolveLegacyRedirect('/mi-empresa-sa/mi-pagina-publica')).toEqual({
      to: '/p/mi-empresa-sa/mi-pagina-publica',
    });
  });

  it('no redirige rutas de 3+ segmentos que no son legacy (pageSlug es exactamente 2)', () => {
    expect(resolveLegacyRedirect('/empresa/a/b')).toBeNull();
    expect(resolveLegacyRedirect('/empresa/a/b/c')).toBeNull();
    expect(resolveLegacyRedirect('/p/empresa/mi-pagina/sub')).toBeNull();
  });

  it('ignora query strings (la función recibe solo el pathname)', () => {
    expect(resolveLegacyRedirect('/empresa/dashboard/gastos?mes=2026-08')).toEqual({
      to: '/dashboard/gastos',
    });
    expect(resolveLegacyRedirect('/empresa/mi-pagina?utm_source=x&ref=1')).toEqual({
      to: '/p/empresa/mi-pagina',
    });
  });

  it('maneja slugs numéricos y con puntos', () => {
    expect(resolveLegacyRedirect('/empresa-123/dashboard')).toEqual({ to: '/dashboard' });
    expect(resolveLegacyRedirect('/empresa.dev/mi-pagina')).toEqual({
      to: '/p/empresa.dev/mi-pagina',
    });
  });

  it('no redirige si el slug coincide con una ruta top-level (colisión total)', () => {
    // Un slug hipotético llamado igual que una sección canónica NO debe
    // redirigir: la ruta canónica gana.
    expect(resolveLegacyRedirect('/tarjeta/mi-pagina')).toBeNull();
    expect(resolveLegacyRedirect('/portal/xyz')).toBeNull();
  });
});

describe('resolveLegacyRedirect — coherencia del set TOP_LEVEL', () => {
  it('contiene todas las secciones legacy (no se pueden auto-redirigir)', () => {
    const sections = [
      'academy', 'booking', 'cita', 'contrato', 'estudiante', 'member',
      'marketing', 'portal', 'tarjeta', 'webcreator',
    ];
    for (const s of sections) {
      expect(TOP_LEVEL.has(s), `TOP_LEVEL debe incluir '${s}'`).toBe(true);
    }
  });

  it('contiene los nombres de subdominio reservados', () => {
    for (const r of ['www', 'app', 'api', 'auth', 'login', 'register', 'dashboard', 'admin']) {
      expect(TOP_LEVEL.has(r), `TOP_LEVEL debe incluir '${r}'`).toBe(true);
    }
  });
});
