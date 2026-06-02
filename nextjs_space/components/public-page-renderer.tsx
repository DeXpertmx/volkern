'use client';

import { useEffect, useRef } from 'react';

interface PublicPageRendererProps {
    projectData: Record<string, unknown> | null;
    html: string | null;
    css: string | null;
}

export function PublicPageRenderer({ projectData, html, css }: PublicPageRendererProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        
        // Execute scripts inside the injected HTML
        const scripts = containerRef.current.querySelectorAll('script');
        scripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
            newScript.appendChild(document.createTextNode(oldScript.innerHTML));
            oldScript.parentNode?.replaceChild(newScript, oldScript);
        });
    }, [html]);

    if (!html) return null;

    return (
        <div className="w-full min-h-screen bg-white">
            <link href="https://unpkg.com/tailwindcss@3.4.1/dist/tailwind.min.css" rel="stylesheet" />
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap" rel="stylesheet" />
            <div
                ref={containerRef}
                dangerouslySetInnerHTML={{ __html: css ? `<style>${css}</style>${html}` : html }}
            />
        </div>
    );
}
