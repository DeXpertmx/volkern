import { Metadata } from 'next';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  params: Promise<{ tenantSlug: string }>;
}

/**
 * Layout compartido para todas las páginas del portal público del tenant.
 * Aplica el favicon dinámico con el color de marca + inicial del tenant.
 */
export async function generateMetadata({ params }: { params: Promise<{ tenantSlug: string }> }): Promise<Metadata> {
  // En Next 16 `params` es una promesa; sin await el slug llega undefined.
  const { tenantSlug } = await params;
  return {
    icons: {
      icon: `/p/${tenantSlug}/favicon`,
      shortcut: `/p/${tenantSlug}/favicon`,
      apple: `/p/${tenantSlug}/favicon`,
    },
  };
}

export default async function TenantPortalLayout({ children }: Props) {
  return <>{children}</>;
}
