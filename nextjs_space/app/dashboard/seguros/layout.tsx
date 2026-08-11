'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, FileText, Building2, LayoutDashboard, RefreshCw, BarChart3, ShieldAlert, Plug } from 'lucide-react';

const NAV_ITEMS = [
  {
    href: '/dashboard/seguros',
    label: 'Dashboard',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: '/dashboard/seguros/polizas',
    label: 'Pólizas',
    icon: FileText,
  },
  {
    href: '/dashboard/seguros/renovaciones',
    label: 'Renovaciones',
    icon: RefreshCw,
  },
  {
    href: '/dashboard/seguros/cartera',
    label: 'Cartera IA',
    icon: BarChart3,
  },
  {
    href: '/dashboard/seguros/aseguradoras',
    label: 'Aseguradoras',
    icon: Building2,
  },
  {
    href: '/dashboard/seguros/siniestros',
    label: 'Siniestros',
    icon: ShieldAlert,
  },
  {
    href: '/dashboard/seguros/aseguradoras/conectores',
    label: 'Conectores',
    icon: Plug,
  },
];

export default function SegurosLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      {/* Header with sub-navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-sky-100 flex items-center justify-center">
            <Shield className="h-5 w-5 text-sky-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Volkern Insurance</h1>
            <p className="text-sm text-muted-foreground">Gestión de seguros y cartera</p>
          </div>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
