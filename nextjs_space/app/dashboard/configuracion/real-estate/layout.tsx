import type { Metadata } from 'next';

/**
 * Configuración del módulo inmobiliario: pertenece al app aunque cuelgue de
 * «configuracion», así que también declara el manifiesto de Inmobiliaria. Sin
 * esto, instalar desde aquí instalaba la app de toda la plataforma.
 */
export const metadata: Metadata = {
  manifest: '/manifest-inmobiliaria.json',
};

export default function RealEstateConfigLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
