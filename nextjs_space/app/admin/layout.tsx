
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
  ShieldAlert,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  Sparkles,
  TrendingUp,
  BarChart3
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
        const roleName = data.role?.nombre;
        if (data.email === 'demo@volkern.app') {
          router.replace('/dashboard');
        } else if (roleName !== 'Superadmin' && roleName !== 'Admin' && roleName !== 'Administrador') {
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
    { name: 'SaaS Metrics', href: '/admin/saas', icon: TrendingUp },
    { name: 'Tenants', href: '/admin/saas/tenants', icon: Building2 },
    { name: 'Churn', href: '/admin/saas/churn', icon: Users },
    { name: 'Revenue', href: '/admin/saas/revenue', icon: DollarSign },
    { name: 'Marketing', href: '/admin/marketing', icon: Sparkles },
    { name: 'Planes', href: '/admin/planes', icon: CreditCard },
    { name: 'Billing Global', href: '/admin/billing', icon: BarChart3 },
    { name: 'Seguridad', href: '/admin/seguridad', icon: ShieldAlert },
    { name: 'Auditoría IA', href: '/admin/auditoria', icon: ShieldCheck },
    { name: 'Configuración', href: '/admin/settings', icon: Settings }
  ];

  return (
    <div className="flex h-screen bg-[#F7FAFC]">
      {/* Sidebar - VOLKERN ENTERPRISE WHITE */}
      <div
        className={`${
          isSidebarOpen ? 'w-64' : 'w-20'
        } bg-white border-r border-[#E2E8F0] text-[#2D3748] transition-all duration-300 flex flex-col z-50`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0]">
          {isSidebarOpen && (
            <div>
              <h1 className="text-xl font-black tracking-tighter italic text-[#1A365D] uppercase">Volkern Admin</h1>
              <p className="text-[9px] font-black text-[#4A5568] uppercase tracking-widest opacity-60">Backoffice Global</p>
            </div>
          )}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-lg hover:bg-slate-50 transition-colors text-slate-400"
          >
            {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all group relative overflow-hidden ${
                  isActive
                    ? 'bg-[#F8FAFC] text-[#1A365D]'
                    : 'text-[#4A5568] hover:bg-[#F8FAFC] hover:text-[#1A365D]'
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#1A365D]" />
                )}
                <Icon size={18} className={isActive ? 'text-[#1A365D]' : 'text-[#4A5568] group-hover:text-[#1A365D]'} />
                {isSidebarOpen && (
                  <span className={`text-sm font-bold tracking-tight ${isActive ? 'text-[#1A365D]' : 'text-[#4A5568] group-hover:text-[#1A365D]'}`}>
                    {item.name}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-[#E2E8F0] bg-slate-50/50">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-xl bg-[#1A365D] flex items-center justify-center text-white shadow-inner">
              <Users size={16} />
            </div>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-[#1A365D] truncate">{session?.user?.name || 'Admin'}</p>
                <p className="text-[10px] text-[#4A5568] font-bold truncate opacity-70">{session?.user?.email}</p>
              </div>
            )}
          </div>
          {isSidebarOpen && (
            <button
              onClick={() => router.push('/api/auth/signout')}
              className="mt-4 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#4A5568] hover:text-[#1A365D] transition-colors w-full py-2 border border-slate-200 rounded-xl bg-white"
            >
              <LogOut size={12} />
              <span>Cerrar sesión</span>
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto px-10 py-8">{children}</div>
      </div>
    </div>
  );
}
