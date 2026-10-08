'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, PackageCheck, Building2 } from 'lucide-react';

const PESTANAS = [
  { href: '/dashboard/compras', label: 'Pedidos', icon: ClipboardList, exacto: true },
  { href: '/dashboard/compras/recepciones', label: 'Recepciones', icon: PackageCheck, exacto: false },
  { href: '/dashboard/compras/proveedores', label: 'Proveedores', icon: Building2, exacto: false },
];

export default function ComprasTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit overflow-x-auto">
      {PESTANAS.map((pestana) => {
        const activa = pestana.exacto ? pathname === pestana.href : pathname.startsWith(pestana.href);
        const Icono = pestana.icon;
        return (
          <Link
            key={pestana.href}
            href={pestana.href}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activa ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icono className="h-4 w-4" />
            {pestana.label}
          </Link>
        );
      })}
    </div>
  );
}
