'use client';

/**
 * Volkern Real Estate — armazón de app móvil.
 *
 * En el móvil el módulo inmobiliario se comporta como una app: barra de
 * pestañas abajo y sin menú de hamburguesa. El panel general sigue disponible
 * desde «Más», que es donde vive todo lo que no cabe en cuatro pestañas.
 *
 * La barra solo se pinta por debajo de `md`; en escritorio manda el panel de
 * siempre con su menú lateral.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  ChevronRight,
  ExternalLink,
  FileSignature,
  LayoutDashboard,
  LayoutGrid,
  MoreHorizontal,
  Settings2,
  Tag,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Pestana {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** En la raíz del módulo: así «Panel» no se marca también en sus subpáginas. */
  exacto?: boolean;
}

const PESTANAS: readonly Pestana[] = [
  { href: '/dashboard/real-estate', label: 'Panel', icon: LayoutDashboard, exacto: true },
  { href: '/dashboard/real-estate/properties', label: 'Inmuebles', icon: Building2 },
  { href: '/dashboard/real-estate/captaciones', label: 'Captaciones', icon: FileSignature },
];

interface EnlaceMas {
  href: string;
  label: string;
  descripcion: string;
  icon: typeof Users;
  externo?: boolean;
}

const ENLACES_MAS: readonly EnlaceMas[] = [
  {
    href: '/dashboard/leads',
    label: 'Leads',
    descripcion: 'Contactos del portal y del widget',
    icon: Users,
  },
  {
    href: '/dashboard/catalogo?tipo=inmueble',
    label: 'Catálogo',
    descripcion: 'Publicar y compartir inmuebles',
    icon: Tag,
  },
  {
    href: '/p/propiedades',
    label: 'Portal público',
    descripcion: 'Ver la web de propiedades',
    icon: ExternalLink,
    externo: true,
  },
  {
    href: '/dashboard/configuracion/real-estate',
    label: 'Configuración',
    descripcion: 'Datos de la oficina y del portal',
    icon: Settings2,
  },
  {
    href: '/dashboard',
    label: 'Abrir panel completo',
    descripcion: 'Resto de módulos de Volkern',
    icon: LayoutGrid,
  },
];

/** ¿La ruta actual pertenece al app inmobiliario? */
export function esRutaAppInmobiliaria(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith('/dashboard/real-estate') ||
    pathname.startsWith('/dashboard/configuracion/real-estate')
  );
}

export function RealEstateMobileApp() {
  const pathname = usePathname();
  const [masAbierto, setMasAbierto] = useState(false);

  // Mientras se navega dentro del módulo, el manifiesto PWA pasa a ser el de
  // Inmobiliaria: al instalar desde aquí, la app abre en el panel inmobiliario y
  // no en el calendario. Al salir del módulo se restaura el de toda la plataforma.
  useEffect(() => {
    const enlace = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const titulo = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const hrefPrevio = enlace?.getAttribute('href') ?? '/manifest.json';
    const tituloPrevio = titulo?.getAttribute('content') ?? 'Volkern';

    enlace?.setAttribute('href', '/manifest-inmobiliaria.json');
    titulo?.setAttribute('content', 'Inmobiliaria');

    return () => {
      enlace?.setAttribute('href', hrefPrevio);
      if (titulo) titulo.setAttribute('content', tituloPrevio);
    };
  }, []);

  // Escape cierra la hoja de «Más» y el scroll del fondo queda bloqueado
  // mientras está abierta.
  useEffect(() => {
    if (!masAbierto) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMasAbierto(false);
    };
    document.addEventListener('keydown', alPulsar);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', alPulsar);
      document.body.style.overflow = overflowPrevio;
    };
  }, [masAbierto]);

  const estaActiva = (pestana: Pestana) =>
    pestana.exacto
      ? pathname === pestana.href
      : pathname === pestana.href || pathname.startsWith(`${pestana.href}/`);

  return (
    <>
      <nav
        aria-label="Navegación inferior del módulo inmobiliario"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-background/95 backdrop-blur-xl dark:border-slate-800/70 md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid h-16 grid-cols-4">
          {PESTANAS.map((pestana) => {
            const activa = estaActiva(pestana);
            const Icon = pestana.icon;
            return (
              <Link
                key={pestana.href}
                href={pestana.href}
                aria-current={activa ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  activa ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {activa && (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" aria-hidden />
                )}
                <Icon className={cn('h-5 w-5', activa && 'stroke-[2.4]')} />
                {pestana.label}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMasAbierto(true)}
            aria-haspopup="dialog"
            aria-expanded={masAbierto}
            className={cn(
              'relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
              masAbierto ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            Más
          </button>
        </div>
      </nav>

      {masAbierto && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMasAbierto(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Más opciones del módulo inmobiliario"
            className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl border-t bg-background px-3 pt-3 shadow-2xl animate-in slide-in-from-bottom duration-200"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted" aria-hidden />
            <div className="flex items-center justify-between px-2 pb-2">
              <p className="text-sm font-semibold">Inmobiliaria</p>
              <button
                type="button"
                onClick={() => setMasAbierto(false)}
                aria-label="Cerrar"
                className="rounded-full p-2 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1">
              {ENLACES_MAS.map((enlace) => {
                const Icon = enlace.icon;
                return (
                  <Link
                    key={enlace.href}
                    href={enlace.href}
                    onClick={() => setMasAbierto(false)}
                    target={enlace.externo ? '_blank' : undefined}
                    rel={enlace.externo ? 'noopener noreferrer' : undefined}
                    className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-muted active:bg-muted"
                  >
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{enlace.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {enlace.descripcion}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
