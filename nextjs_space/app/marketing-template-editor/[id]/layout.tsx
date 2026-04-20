"use client";

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function MarketingEditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;

    if (!session?.user) {
      router.replace('/auth/login');
      return;
    }

    // Check if user is superadmin (Global templates are superadmin only)
    fetch('/api/users/me')
      .then((res) => res.json())
      .then((data) => {
        const roleName = data.role?.nombre;
        if (roleName !== 'Superadmin') {
          router.replace('/admin/marketing');
        } else {
          setIsAuthorized(true);
        }
      })
      .catch(() => {
        router.replace('/admin/marketing');
      });
  }, [session, status, router]);

  if (status === 'loading' || !isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1A365D]"></div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-white">
      {children}
    </div>
  );
}
