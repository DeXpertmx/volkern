import type { Metadata } from 'next';

/**
 * Manifiesto propio del módulo inmobiliario.
 *
 * Se declara aquí, en el servidor, para que el HTML de estas pantallas ya salga
 * con el manifiesto de Inmobiliaria: al instalar la app desde el panel del
 * módulo, `start_url` la abre directamente en `/dashboard/real-estate` en vez de
 * en el panel general. Antes solo se cambiaba desde JavaScript al hidratar, y
 * una instalación lanzada antes de ese cambio instalaba la app de toda la
 * plataforma.
 *
 * El `RealEstateMobileApp` sigue restaurando el manifiesto al salir del módulo,
 * que es lo que necesitan las rutas que no cuelgan de aquí.
 */
export const metadata: Metadata = {
  manifest: '/manifest-inmobiliaria.json',
};

export default function RealEstateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
