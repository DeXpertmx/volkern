'use client';

import { ComponentRenderer } from '@/components/page-builder/ComponentRenderer';
import { PageComponent } from '@/lib/page-builder';

interface PublicPageRendererProps {
    components: PageComponent[];
    tenantId: string | null;
}

export function PublicPageRenderer({ components, tenantId }: PublicPageRendererProps) {
    if (!components || components.length === 0) return null;

    return (
        <div className="w-full min-h-screen bg-white">
            {components.map((component) => (
                <ComponentRenderer
                    key={component.id}
                    component={component}
                    isSelected={false}
                    onSelect={() => { }}
                    isPublic={true}
                    tenantId={tenantId}
                />
            ))}
        </div>
    );
}
