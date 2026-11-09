'use client';

/**
 * Volkern Real Estate — Navegación interna del panel inmobiliario.
 *
 * El módulo inmobiliario no tiene hub propio: su única entrada de menú es
 * «Configuración → Inmobiliaria», y las pantallas operativas (dashboard,
 * inmuebles, captaciones) quedaban sin forma de alcanzarse entre ellas. Esta
 * tira de pestañas es el hub que faltaba, y por eso se pinta en todas las
 * pantallas del módulo en vez de duplicar enlaces sueltos en cada una.
 *
 * En el móvil no se pinta: allí la navegación del módulo es la barra inferior
 * del app (`RealEstateMobileApp`) y dos menús apilados sobran.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, FileSignature, Home, LayoutDashboard, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SeccionPanel {
  href: string;
  label: string;
  icon: typeof Home;
  /** `true` en la raíz del panel: así «Dashboard» no se marca en las subpáginas. */
  exacto?: boolean;
}

const SECCIONES: readonly SeccionPanel[] = [
  { href: '/dashboard/real-estate', label: 'Dashboard', icon: LayoutDashboard, exacto: true },
  { href: '/dashboard/real-estate/properties', label: 'Inmuebles', icon: Building2 },
  { href: '/dashboard/real-estate/captaciones', label: 'Captaciones', icon: FileSignature },
  { href: '/dashboard/configuracion/real-estate', label: 'Configuración', icon: Settings2 },
];

export function RealEstateModuleNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Secciones del panel inmobiliario"
      className="hidden items-center gap-1 overflow-x-auto border-b md:flex"
    >
      {SECCIONES.map((seccion) => {
        const activa = seccion.exacto
          ? pathname === seccion.href
          : pathname === seccion.href || pathname.startsWith(`${seccion.href}/`);
        const Icon = seccion.icon;

        return (
          <Link
            key={seccion.href}
            href={seccion.href}
            aria-current={activa ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors',
              activa
                ? 'border-primary font-semibold text-primary'
                : 'border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {seccion.label}
          </Link>
        );
      })}
    </nav>
  );
}
