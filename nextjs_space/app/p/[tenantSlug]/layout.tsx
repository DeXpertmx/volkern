import { Metadata } from 'next';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  params: { tenantSlug: string };
}

/**
 * Layout compartido para todas las páginas del portal público del tenant.
 * Aplica el favicon dinámico con el color de marca + inicial del tenant.
 */
export async function generateMetadata({ params }: { params: { tenantSlug: string } }): Promise<Metadata> {
  return {
    icons: {
      icon: `/p/${params.tenantSlug}/favicon`,
      shortcut: `/p/${params.tenantSlug}/favicon`,
      apple: `/p/${params.tenantSlug}/favicon`,
    },
  };
}

export default async function TenantPortalLayout({ children }: Props) {
  return <>{children}</>;
}
