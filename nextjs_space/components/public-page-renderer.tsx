'use client';

interface PublicPageRendererProps {
    projectData: Record<string, unknown> | null;
    html: string | null;
    css: string | null;
}

export function PublicPageRenderer({ projectData, html, css }: PublicPageRendererProps) {
    if (!html) return null;

    return (
        <div className="w-full min-h-screen bg-white">
            <div
                dangerouslySetInnerHTML={{ __html: css ? `<style>${css}</style>${html}` : html }}
            />
        </div>
    );
}
