"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import EditorWorkspace from "@/components/webcreator/EditorWorkspace";
import { dedupeProjectData } from "@/components/webcreator/dedupe";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function WebcreatorEditorPage() {
  const params = useParams<{ id: string }>();
  // En Next 16 `params` es una promesa: el prop síncrono llegaba vacío y el
  // editor acababa pidiendo /api/cms/pages/undefined.
  const pageId = params?.id && params.id !== 'undefined' ? params.id : null;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageData, setPageData] = useState<{
    id: string;
    titulo: string;
    slug: string;
    contenido: any;
    estado: string;
    tenantId?: string | null;
    metaTitulo?: string;
    metaDescripcion?: string;
    metaKeywords?: string;
    metaImagen?: string;
    scriptsHead?: string;
    scriptsBody?: string;
  } | null>(null);

  // Get template from URL query params or determine based on page content
  // Si hay datos guardados (componentes, estilos, etc.), usar "blank" para no sobrescribir
  // Si no hay datos, usar "_blank" (plantilla vacía con título)
  const templateId = searchParams.get("template") || (
    pageData?.contenido &&
    (pageData.contenido.pages?.length > 0 ||
     pageData.contenido.components?.length > 0 ||
     pageData.contenido.styles?.length > 0 ||
     (pageData.contenido.assets?.length > 0))
      ? "_blank" // Si ya tiene datos, no sobrescribir cargando plantilla
      : "_blank"  // Si no tiene datos, usar _blank como fallback
  );

  const loadPage = useCallback(async () => {
    if (!pageId) {
      setError("No se indicó qué proyecto abrir.");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/cms/pages/${pageId}`);
      if (!response.ok) {
        throw new Error("Página no encontrada");
      }
      const data = await response.json();

      // Extraer projectData del contenido guardado
      // El contenido puede tener la estructura: { format: 'grapesjs', projectData: {...}, html: '...' }
      // o ser directamente el projectData en proyectos antiguos
      let projectData = {};
      if (data.page.contenido) {
        if (data.page.contenido.format === 'grapesjs' && data.page.contenido.projectData) {
          projectData = data.page.contenido.projectData;
        } else if (data.page.contenido.pages || data.page.contenido.components || data.page.contenido.styles || data.page.contenido.assets) {
          // Formato antiguo o directo: projectData
          projectData = data.page.contenido;
        }
      }

      console.log('[WebcreatorEditor] Loaded page data:', {
        id: data.page.id,
        contenidoType: typeof data.page.contenido,
        hasProjectData: !!projectData,
        projectDataKeys: projectData ? Object.keys(projectData) : []
      });

      setPageData({
        id: data.page.id,
        titulo: data.page.titulo,
        slug: data.page.slug,
        contenido: projectData,
        estado: data.page.estado || "draft",
        tenantId: data.page.tenantId,
        metaTitulo: data.page.metaTitulo || "",
        metaDescripcion: data.page.metaDescripcion || "",
        metaKeywords: data.page.metaKeywords || "",
        metaImagen: data.page.metaImagen || "",
        scriptsHead: data.page.scriptsHead || "",
        scriptsBody: data.page.scriptsBody || "",
      });
    } catch (err) {
      console.error('[WebcreatorEditor] Error loading page:', err);
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const handleSave = async (data: { 
    projectData: any; 
    html?: string; 
    css?: string; 
    estado?: string;
    seo?: {
      metaTitulo?: string;
      metaDescripcion?: string;
      metaKeywords?: string;
      metaImagen?: string;
      scriptsHead?: string;
      scriptsBody?: string;
    };
  }) => {
    try {
      console.log('[WebcreatorEditor] Saving project data:', {
        hasProjectData: !!data.projectData,
        projectDataKeys: data.projectData ? Object.keys(data.projectData) : [],
        htmlLength: data.html?.length,
        cssLength: data.css?.length,
      });

      // Última defensa: fusionar componentes idénticos añadidos en la misma acción
      // antes del PUT (cubre también duplicados históricos ya persistidos).
      const { projectData: cleanProjectData, removed: dupRemoved } = dedupeProjectData(data.projectData);
      if (dupRemoved > 0) {
        console.log(`[WebcreatorEditor] Guardado: ${dupRemoved} componente(s) duplicado(s) fusionado(s)`);
      }

      const payload = {
        contenido: {
          format: 'grapesjs',
          html: data.html,
          projectData: cleanProjectData,
        },
        cssPersonalizado: data.css,
        estado: data.estado || pageData?.estado,
        metaTitulo: data.seo?.metaTitulo,
        metaDescripcion: data.seo?.metaDescripcion,
        metaKeywords: data.seo?.metaKeywords,
        metaImagen: data.seo?.metaImagen,
        scriptsHead: data.seo?.scriptsHead,
        scriptsBody: data.seo?.scriptsBody,
      };

      const response = await fetch(`/api/cms/pages/${pageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[WebcreatorEditor] Save failed:', errorData);
        throw new Error(errorData.error || "Failed to save");
      }

      const responseData = await response.json();
      console.log('[WebcreatorEditor] Save successful:', responseData);

      // Actualizar el estado local con los datos guardados
      if (data.projectData) {
        setPageData(prev => prev ? {
          ...prev,
          contenido: cleanProjectData,
          estado: data.estado || prev.estado,
          metaTitulo: data.seo?.metaTitulo || prev.metaTitulo,
          metaDescripcion: data.seo?.metaDescripcion || prev.metaDescripcion,
          metaKeywords: data.seo?.metaKeywords || prev.metaKeywords,
          metaImagen: data.seo?.metaImagen || prev.metaImagen,
          scriptsHead: data.seo?.scriptsHead || prev.scriptsHead,
          scriptsBody: data.seo?.scriptsBody || prev.scriptsBody,
        } : prev);
      }

      toast.success("Proyecto guardado correctamente");
    } catch (error) {
      console.error("[WebcreatorEditor] Save Error:", error);
      toast.error("Error al guardar el proyecto");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-white">
        <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest animate-pulse">Iniciando Webcreator...</p>
      </div>
    );
  }

  if (error || !pageData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6 bg-white p-6 text-center">
        <div className="p-4 bg-red-50 rounded-full text-red-500">
          <ArrowLeft size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Ops! No pudimos abrir el editor</h2>
          <p className="text-gray-500">{error || "La página solicitada no está disponible."}</p>
        </div>
        <Button
          onClick={() => router.push("/dashboard/webcreator")}
          className="rounded-xl px-8"
        >
          Volver al Constructor
        </Button>
      </div>
    );
  }

  const isHomePage = pageData.slug === 'home';
  const backUrl = isHomePage ? "/admin/marketing" : "/dashboard/webcreator";

  return (
    <div className="h-screen w-screen overflow-hidden bg-white">
      <EditorWorkspace 
        pageId={pageData.id}
        pageTitle={pageData.titulo}
        slug={pageData.slug}
        initialData={pageData.contenido}
        initialSeo={{
          metaTitulo: pageData.metaTitulo,
          metaDescripcion: pageData.metaDescripcion,
          metaKeywords: pageData.metaKeywords,
          metaImagen: pageData.metaImagen,
          scriptsHead: pageData.scriptsHead,
          scriptsBody: pageData.scriptsBody,
        }}
        templateId={templateId}
        backUrl={backUrl}
        onSave={handleSave}
      />
    </div>
  );
}