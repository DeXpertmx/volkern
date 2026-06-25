/**
 * Shared navigation constants — safe for both server and client components.
 * No 'use client' directive, no React icon imports.
 */
export interface VerticalLink {
  name: string
  href: string
}

export const verticalLinks: VerticalLink[] = [
  { name: 'Inmobiliarias', href: '/soluciones/real-estate' },
  { name: 'Asesorías Contables', href: '/soluciones/accounting' },
  { name: 'Agencias Marketing', href: '/soluciones/marketing' },
  { name: 'Academias (LMS)', href: '/soluciones/academy' },
  { name: 'Industria', href: '/soluciones/industria' },
  { name: 'Recursos Humanos', href: '/soluciones/rrhh' },
  { name: 'CRM Ventas', href: '/soluciones/crm-ventas' },
  { name: 'Facturación', href: '/soluciones/facturacion' },
]
