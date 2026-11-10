"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PuckEditor } from "@/components/cms/PuckEditor";
import type { Data } from "@measured/puck";
import { Loader2 } from "lucide-react";

interface EditorPageProps {
  params: { id: string };
}

import { useResolvedParams } from "@/lib/hooks/useResolvedParams";

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = useResolvedParams(params);
  if (!resolvedParams) return null;
  return <EditorPageInner params={resolvedParams} />;
}

function EditorPageInner({ params }: EditorPageProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageData, setPageData] = useState<{
    id: string;
    titulo: string;
    slug: string;
    contenido: Data;
    tenantSlug?: string;
  } | null>(null);

  useEffect(() => {
    async function loadPage() {
      try {
        const response = await fetch(`/api/cms/pages/${params.id}`);
        if (!response.ok) {
          throw new Error("Página no encontrada");
        }
        const data = await response.json();
        
        // Asegurar que el contenido tenga la estructura correcta para Puck
        let contenido = data.page.contenido;
        if (!contenido || !contenido.content) {
          contenido = {
            content: [],
            root: {
              props: {
                title: data.page.titulo,
                description: "",
              },
            },
          };
        }

        setPageData({
          id: data.page.id,
          titulo: data.page.titulo,
          slug: data.page.slug,
          contenido,
          tenantSlug: data.tenantSlug,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar");
      } finally {
        setLoading(false);
      }
    }

    loadPage();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !pageData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-lg text-muted-foreground">{error || "Error al cargar la página"}</p>
        <button
          onClick={() => router.push("/dashboard/cms")}
          className="text-primary hover:underline"
        >
          Volver al CMS
        </button>
      </div>
    );
  }

  return (
    <PuckEditor
      pageId={pageData.id}
      initialData={pageData.contenido}
      pageTitle={pageData.titulo}
      pageSlug={pageData.slug}
      tenantSlug={pageData.tenantSlug}
      onBack={() => router.push("/dashboard/cms")}
    />
  );
}
