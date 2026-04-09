
'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  DollarSign,
  Settings,
  Building2,
  LogOut,
  Menu,
  X,
  Sparkles
} from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;

    if (!session?.user) {
      router.replace('/auth/login');
      return;
    }

    // Check if user is superadmin
    fetch('/api/users/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.role?.nombre !== 'Superadmin') {
          router.replace('/dashboard');
        } else {
          setIsAuthorized(true);
        }
      })
      .catch(() => {
        router.replace('/dashboard');
      });
  }, [session, status, router]);

  if (status === 'loading' || !isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const navigation = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Tenants', href: '/admin/tenants', icon: Building2 },
    { name: 'Marketing', href: '/admin/marketing', icon: Sparkles },
    { name: 'Planes', href: '/admin/planes', icon: CreditCard },
    { name: 'Billing Global', href: '/admin/billing', icon: DollarSign },
    { name: 'Configuración', href: '/admin/settings', icon: Settings }
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div
        className={`${
          isSidebarOpen ? 'w-64' : 'w-20'
        } bg-gradient-to-b from-indigo-900 to-indigo-800 text-white transition-all duration-300 flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-indigo-700">
          {isSidebarOpen && (
            <div>
              <h1 className="text-xl font-bold">Volkern Admin</h1>
              <p className="text-xs text-indigo-300">Backoffice Global</p>
            </div>
          )}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-indigo-700 text-white'
                    : 'text-indigo-100 hover:bg-indigo-700/50'
                }`}
              >
                <Icon size={20} />
                {isSidebarOpen && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-indigo-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
              <Users size={20} />
            </div>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{session?.user?.name || 'Admin'}</p>
                <p className="text-xs text-indigo-300 truncate">{session?.user?.email}</p>
              </div>
            )}
          </div>
          {isSidebarOpen && (
            <button
              onClick={() => router.push('/api/auth/signout')}
              className="mt-3 flex items-center gap-2 text-sm text-indigo-300 hover:text-white transition-colors w-full"
            >
              <LogOut size={16} />
              <span>Cerrar sesión</span>
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto p-8">{children}</div>
      </div>
    </div>
  );
}
