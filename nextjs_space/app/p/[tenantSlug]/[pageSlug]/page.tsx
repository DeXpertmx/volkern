'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { PuckRenderer } from '@/components/cms/PuckRenderer';
import { Loader2 } from 'lucide-react';
import type { Data } from "@measured/puck";
 
 interface PageComponent {
   id: string;
   type: string;
   props: any;
 }

interface PageData {
  id: string;
  titulo: string;
  slug: string;
  descripcion: string | null;
  contenido: {
    format?: string;
    html?: string;
    projectData?: any;
    components?: PageComponent[];
    content?: any[];
    root?: any;
  };
  cssPersonalizado: string | null;
  metaTitulo: string | null;
  metaDescripcion: string | null;
  metaImagen: string | null;
  estado: string;
  subdomain: string | null;
  tenantId: string;
  scriptsHead?: string | null;
  scriptsBody?: string | null;
}

export default function PublicPageView() {
  const params = useParams();
  const tenantSlug = params.tenantSlug as string;
  const pageSlug = params.pageSlug as string;
  
  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPage = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/public/pages/${pageSlug}?tenant=${encodeURIComponent(tenantSlug)}`);
        
        if (!response.ok) {
          throw new Error('Página no encontrada');
        }

        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }

        setPage(data);
        
        // Incrementar vistas
        fetch(`/api/public/pages/${pageSlug}/view?tenant=${encodeURIComponent(tenantSlug)}`, { method: 'POST' }).catch(() => {});
      } catch (err: any) {
        console.error('Error cargando página:', err);
        setError(err.message || 'Error al cargar la página');
      } finally {
        setLoading(false);
      }
    };

    if (pageSlug && tenantSlug) {
      fetchPage();
    }
  }, [tenantSlug, pageSlug]);

  // Inyectar scripts personalizados
  useEffect(() => {
    if (!page) return;

    // Scripts en head
    if (page.scriptsHead) {
      const headScript = document.createElement('div');
      headScript.innerHTML = page.scriptsHead;
      Array.from(headScript.children).forEach((child) => {
        document.head.appendChild(child.cloneNode(true));
      });
    }

    // Scripts en body
    if (page.scriptsBody) {
      const bodyScript = document.createElement('div');
      bodyScript.innerHTML = page.scriptsBody;
      Array.from(bodyScript.children).forEach((child) => {
        document.body.appendChild(child.cloneNode(true));
      });
    }
  }, [page]);

  // Inyectar CSS y Fuentes dinámicamente
  useEffect(() => {
    if (!page) return;

    // Para páginas GrapesJS (bloques Volkern/Premium) NO cargamos Tailwind
    // porque su Preflight sobreescribe todos los estilos personalizados de los componentes.
    // Solo cargamos Tailwind para contenido legacy (Puck / ComponentRenderer).
    const isGrapes = page.contenido?.format === 'grapesjs';

    // 1. Inyectar Fuentes (siempre) + Tailwind solo para contenido no-GrapesJS
    const links = [
      ...(!isGrapes ? ["https://unpkg.com/tailwindcss@3.4.1/dist/tailwind.min.css"] : []),
      "https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,700;0,800;0,900;1,700;1,800;1,900&display=swap",
      "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;700;800&display=swap",
      "https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap",
      "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap"
    ];

    links.forEach(href => {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
      }
    });

    // 2. Inyectar CSS Personalizado (GrapesJS)
    if (page.cssPersonalizado) {
      const styleId = 'grapesjs-custom-css';
      let styleEl = document.getElementById(styleId);
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      styleEl.innerHTML = page.cssPersonalizado;
    }

    // 3. Reset básico para SVG en contenido compilado (evitar iconos gigantes)
    const resetStyleId = 'grapesjs-reset-css';
    let resetStyleEl = document.getElementById(resetStyleId);
    if (!resetStyleEl) {
      resetStyleEl = document.createElement('style');
      resetStyleEl.id = resetStyleId;
      document.head.appendChild(resetStyleEl);
    }
    resetStyleEl.innerHTML = `
      .grapesjs-compiled-content .custom-block-icon svg,
      .grapesjs-compiled-content .gjs-block-icon svg {
        width: 24px !important;
        height: 24px !important;
      }
    `;

    // Actualizar título
    document.title = page?.metaTitulo || page?.titulo || '';

  }, [page]);

  // Ref for GrapesJS content container — needed to execute inline scripts
  const grapesContainerRef = useRef<HTMLDivElement>(null);

  // Detect content format (must be before early returns since useEffect below depends on it)
  const isGrapesContent = page?.contenido?.format === 'grapesjs';
  const isPuckContent = !isGrapesContent && page?.contenido?.content !== undefined && Array.isArray(page?.contenido?.content);
  const isLegacyContent = !isGrapesContent && !isPuckContent && page?.contenido?.components !== undefined && Array.isArray(page?.contenido?.components);
  const grapesHtml = isGrapesContent ? (page?.contenido as any)?.html : null;

  // After mounting, inject GrapesJS HTML and execute its scripts + styles
  useEffect(() => {
    if (!isGrapesContent || !grapesHtml || !grapesContainerRef.current) return;

    const container = grapesContainerRef.current;
    container.innerHTML = grapesHtml;

    // --- HYDRATION LOGIC: Catalog Data ---
    const searchParams = new URLSearchParams(window.location.search);
    const itemId = searchParams.get('id') || searchParams.get('item');
    
    const hydrateCatalogData = async (id: string) => {
      try {
        const res = await fetch(`/api/cms/catalogo/data?itemId=${id}`);
        if (!res.ok) return;
        const { item } = await res.json();
        if (!item) return;

        // Populate fields
        const fields = container.querySelectorAll('[data-volkern-field]');
        fields.forEach((el: any) => {
          const fieldKey = el.getAttribute('data-volkern-field');
          let value = '';

          if (fieldKey === 'nombre') value = item.nombre;
          else if (fieldKey === 'descripcion') value = item.descripcion || '';
          else if (fieldKey === 'precio') value = new Intl.NumberFormat('es-ES').format(item.precioBase) + ' ' + item.moneda;
          else if (fieldKey === 'sku') value = item.sku || '';
          else {
            // Check custom fields
            const custom = item.customFieldValues || {};
            value = custom[fieldKey] !== undefined ? custom[fieldKey] : `{{${fieldKey}}}`;
          }

          el.textContent = value;
          el.classList.add('v-hydrated');
        });

        // Update main images if any
        if (item.media?.imagenes?.[0]) {
          const heroImg = container.querySelector('.v-hero-img, [data-volkern-type="hero-image"]');
          if (heroImg) (heroImg as HTMLImageElement).src = item.media.imagenes[0];
        }
      } catch (err) {
        console.error('Hydration error:', err);
      }
    };

    if (itemId) {
      hydrateCatalogData(itemId);
    }

    // 1. Move <style> tags from the HTML up to <head> so they apply globally.
    const styles = container.querySelectorAll('style');
    styles.forEach((styleEl) => {
      const cloned = styleEl.cloneNode(true) as HTMLStyleElement;
      document.head.appendChild(cloned);
    });

    // 2. Re-execute <script> tags
    const scripts = container.querySelectorAll('script');
    scripts.forEach((oldScript) => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    });

  }, [isGrapesContent, grapesHtml]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-4" />
          <p className="text-gray-600">Cargando página...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !page) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Página no encontrada</h1>
          <p className="text-gray-600 mb-6">
            {error || 'La página que buscas no existe o no está publicada.'}
          </p>
          <a 
            href="/"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Volver al inicio
          </a>
        </div>
      </div>
    );
  }

   // Render page content
   return (
     <div className="min-h-screen">
         {isGrapesContent ? (
           // Renderizar GrapesJS — usamos ref para poder ejecutar los scripts embebidos
           <div 
             id="wrapper"
             ref={grapesContainerRef}
             className="grapesjs-compiled-content"
           />
         ) : isPuckContent ? (
           <PuckRenderer data={page.contenido as Data} />
         ) : isLegacyContent ? (
           <div className="w-full">
             {page.contenido.components!.map((component) => (
               <div key={component.id} />
             ))}
           </div>
         ) : (
           <div className="min-h-screen flex items-center justify-center">
             <div className="text-center text-gray-500">
               <p>Esta página aún no tiene contenido.</p>
             </div>
           </div>
         )}
      </div>
    );
}
