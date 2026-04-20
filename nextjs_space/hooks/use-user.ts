'use client';

import { useSession } from 'next-auth/react';

/**
 * Hook para obtener el usuario actual y su estado de autenticación
 * en componentes de cliente (basado en next-auth).
 */
export function useUser() {
  const { data: session, status } = useSession();

  return {
    user: session?.user as any,
    session,
    status,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
  };
}
