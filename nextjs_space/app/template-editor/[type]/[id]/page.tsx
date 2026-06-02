"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import EditorWorkspace from "@/components/webcreator/EditorWorkspace";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function TemplateEditorPage() {
  const router = useRouter();
  const params = useParams();
  const type = params.type as 'email' | 'document';
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templateData, setTemplateData] = useState<{
    id: string;
    nombre: string;
    contenido: any;
    tipo?: string;
  } | null>(null);

  const loadTemplate = useCallback(async () => {
    try {
      if (id === 'new') {
        setTemplateData({
          id: 'new',
          nombre: type === 'email' ? 'Nueva Plantilla de Email' : 'Nuevo Documento Legal',
          contenido: {},
        });
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/cms/templates?type=${type}&id=${id}`);
      if (!response.ok) {
        throw new Error("Plantilla no encontrada");
      }
      const data = await response.json();

      if (!data) {
        throw new Error("La plantilla no existe en la base de datos");
      }

      let projectData = {};
      if (type === 'email') {
        projectData = data.contenidoJSON || {};
      } else {
        projectData = data.templateData || {};
      }

      setTemplateData({
        id: data.id,
        nombre: data.nombre || data.titulo || "Sin título",
        contenido: projectData,
        tipo: type === 'email' ? data.categoria : data.tipo,
      });
    } catch (err) {
      console.error('[TemplateEditor] Error loading:', err);
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [type, id]);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  const handleSave = async (data: { projectData: any; html?: string; css?: string; category?: string; nombre?: string }) => {
    try {
      const nuevoNombre = data.nombre || templateData?.nombre || '';
      const payload = {
        type,
        id: id === 'new' ? null : id,
        nombre: nuevoNombre,
        projectData: data.projectData,
        html: data.html,
        css: data.css,
        category: data.category
      };

      const response = await fetch(`/api/cms/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || responseData.details || "Error al guardar la plantilla");
      }

      toast.success("Plantilla guardada correctamente");

      // SYNC: Update local state with the saved data
      if (responseData.id) {
        setTemplateData(prev => ({
          id: responseData.id,
          nombre: responseData.nombre || responseData.titulo || nuevoNombre || "Sin título",
          contenido: data.projectData,
          tipo: data.category || prev?.tipo,
        }));

        // Redirect if it was a 'new' template to reflect the real ID in the URL
        if (id === 'new') {
          router.replace(`/template-editor/${type}/${responseData.id}`);
        }
      }
    } catch (error: any) {
      console.error('[CMS Templates] POST Error:', error);
      const msg = error instanceof Error ? error.message : "Error al guardar la plantilla";
      toast.error(msg);
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-white">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest animate-pulse">Iniciando Editor de Plantillas...</p>
      </div>
    );
  }

  if (error || !templateData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6 bg-white p-6 text-center">
        <div className="p-4 bg-red-50 rounded-full text-red-500">
          <ArrowLeft size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Ops! No pudimos abrir el editor</h2>
          <p className="text-gray-500">{error || "La plantilla solicitada no está disponible."}</p>
        </div>
        <Button
          onClick={() => router.back()}
          className="rounded-xl px-8"
        >
          Volver
        </Button>
      </div>
    );
  }

  const backUrl = type === 'email' ? "/dashboard/email-campanas" : "/dashboard/contratos";

  return (
    <div className="h-screen w-screen overflow-hidden bg-white">
      <EditorWorkspace 
        pageId={templateData.id}
        pageTitle={templateData.nombre}
        initialData={templateData.contenido}
        initialCategory={templateData.tipo}
        backUrl={backUrl}
        mode={type === 'email' ? 'email' : 'document'}
        onSave={handleSave}
      />
    </div>
  );
}
