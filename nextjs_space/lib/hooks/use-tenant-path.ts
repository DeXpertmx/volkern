import { useParams } from 'next/navigation';

export function useTenantPath() {
  const params = useParams();
  const tenant = params?.tenant as string;
  
  const getPath = (path: string) => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    if (!tenant) return cleanPath;
    
    // Si el path ya incluye el tenant, no lo duplicamos
    if (cleanPath.startsWith(`/${tenant}`)) return cleanPath;
    
    return `/${tenant}${cleanPath}`;
  };

  return {
    tenant,
    getPath,
    // Helper para links comunes
    dashboard: tenant ? `/${tenant}/dashboard` : '/dashboard'
  };
}
