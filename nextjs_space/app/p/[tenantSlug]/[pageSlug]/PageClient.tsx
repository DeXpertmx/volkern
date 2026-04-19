'use client';

import { useEffect, useRef } from 'react';
import { PuckRenderer } from '@/components/cms/PuckRenderer';
import type { Data } from "@measured/puck";

interface PageClientProps {
  page: any;
}

export default function PageClient({ page }: PageClientProps) {
  const grapesContainerRef = useRef<HTMLDivElement>(null);

  const isGrapesContent = page?.contenido?.format === 'grapesjs';
  const isPuckContent = !isGrapesContent && page?.contenido?.content !== undefined && Array.isArray(page?.contenido?.content);
  const isLegacyContent = !isGrapesContent && !isPuckContent && page?.contenido?.components !== undefined && Array.isArray(page?.contenido?.components);
  const grapesHtml = isGrapesContent ? (page?.contenido as any)?.html : null;

  useEffect(() => {
    if (!isGrapesContent || !grapesHtml || !grapesContainerRef.current) return;

    const container = grapesContainerRef.current;

    // --- HYDRATION LOGIC: Catalog Data ---
    const searchParams = new URLSearchParams(window.location.search);
    const itemId = searchParams.get('id') || searchParams.get('item');
    
    const hydrateCatalogData = async (id: string) => {
      try {
        const res = await fetch(`/api/cms/catalogo/data?itemId=${id}`);
        if (!res.ok) return;
        const { item } = await res.json();
        if (!item) return;

        const fields = container.querySelectorAll('[data-volkern-field]');
        fields.forEach((el: any) => {
          const fieldKey = el.getAttribute('data-volkern-field');
          let value = '';
          if (fieldKey === 'nombre') value = item.nombre;
          else if (fieldKey === 'descripcion') value = item.descripcion || '';
          else if (fieldKey === 'precio') value = new Intl.NumberFormat('es-ES').format(item.precioBase) + ' ' + item.moneda;
          else if (fieldKey === 'sku') value = item.sku || '';
          else {
            const custom = item.customFieldValues || {};
            value = custom[fieldKey] !== undefined ? custom[fieldKey] : `{{${fieldKey}}}`;
          }
          el.textContent = value;
          el.classList.add('v-hydrated');
        });

        if (item.media?.imagenes?.[0]) {
          const heroImg = container.querySelector('.v-hero-img, [data-volkern-type="hero-image"]');
          if (heroImg) (heroImg as HTMLImageElement).src = item.media.imagenes[0];
        }
      } catch (err) {
        console.error('Hydration error:', err);
      }
    };

    if (itemId) hydrateCatalogData(itemId);

    // Re-execute scripts
    const scripts = container.querySelectorAll('script');
    scripts.forEach((oldScript) => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    });

  }, [isGrapesContent, grapesHtml]);

  return (
    <div className="min-h-screen">
      {isGrapesContent ? (
        <div 
          id="wrapper"
          ref={grapesContainerRef}
          className="grapesjs-compiled-content"
          dangerouslySetInnerHTML={{ __html: grapesHtml }}
        />
      ) : isPuckContent ? (
        <PuckRenderer data={page.contenido as Data} />
      ) : isLegacyContent ? (
        <div className="w-full">
          {page.contenido.components!.map((component: any) => (
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
