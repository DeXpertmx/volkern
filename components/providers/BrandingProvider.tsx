
'use client';

import { useEffect } from 'react';
import { useWhitelabel } from '@/hooks/use-whitelabel';

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { config, loading } = useWhitelabel();

  useEffect(() => {
    if (!loading && config) {
      // 1. Aplicar colores a variables CSS
      const root = document.documentElement;
      
      if (config.colorPrimario) {
        root.style.setProperty('--primary', hexToHsl(config.colorPrimario));
        // Ajustar color de texto sobre el primario (negro o blanco)
        const isDark = isColorDark(config.colorPrimario);
        root.style.setProperty('--primary-foreground', isDark ? '0 0% 100%' : '222.2 47.4% 11.2%');
      }

      if (config.colorSecundario) {
        root.style.setProperty('--secondary', hexToHsl(config.colorSecundario));
      }

      // 2. Actualizar Título de la Pestaña
      if (config.nombreEmpresa) {
        const currentTitle = document.title;
        if (!currentTitle.includes(config.nombreEmpresa)) {
          // Solo si el título actual contiene "Volkern", lo reemplazamos
          document.title = currentTitle.replace('Volkern CRM', config.nombreEmpresa);
        }
      }

      // 3. Actualizar Favicon
      if (config.iconoUrl) {
        let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.href = config.iconoUrl;
      }
    }
  }, [config, loading]);

  return <>{children}</>;
}

// Helpers útiles
function hexToHsl(hex: string): string {
  // Eliminar # si existe
  hex = hex.replace('#', '');
  
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function isColorDark(hex: string): boolean {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Fórmula de luminancia
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq < 128;
}
