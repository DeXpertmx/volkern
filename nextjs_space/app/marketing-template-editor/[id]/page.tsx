"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import EditorWorkspace from "@/components/webcreator/EditorWorkspace";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function GlobalTemplateEditorPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templateData, setTemplateData] = useState<{
    id: string;
    nombre: string;
    descripcion?: string;
    categoria: string;
    etiquetas: string[];
    contenido: any;
  } | null>(null);

  const loadTemplate = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/templates/${id}`);
      if (!response.ok) {
        throw new Error("Plantilla no encontrada");
      }
      const data = await response.json();

      setTemplateData({
        id: data.id,
        nombre: data.nombre,
        descripcion: data.descripcion,
        categoria: data.categoria,
        etiquetas: data.etiquetas || [],
        contenido: data.contenido || {},
      });
    } catch (err) {
      console.error('[GlobalTemplateEditor] Error loading:', err);
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  const handleSave = async (data: { projectData: any; html?: string; css?: string; estado?: string }) => {
    try {
      const payload = {
        nombre: templateData?.nombre,
        descripcion: templateData?.descripcion,
        categoria: templateData?.categoria,
        etiquetas: templateData?.etiquetas,
        contenido: {
          projectData: data.projectData,
          html: data.html,
          css: data.css
        },
        esPublica: data.estado === 'published',
      };

      const response = await fetch(`/api/admin/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Error al guardar");
      }

      toast.success("Plantilla global guardada correctamente");
    } catch (error: any) {
      console.error('[GlobalTemplateEditor] Save Error:', error);
      toast.error(error.message || "Error al guardar");
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-white">
        <Loader2 className="w-10 h-10 animate-spin text-[#1A365D]" />
        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest animate-pulse">Abriendo Estructura Global...</p>
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
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Ops! No pudimos abrir la plantilla</h2>
          <p className="text-gray-500">{error || "La plantilla no está disponible."}</p>
        </div>
        <Button onClick={() => router.back()} className="rounded-xl px-8">Volver</Button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-white">
      <EditorWorkspace 
        pageId={templateData.id}
        pageTitle={templateData.nombre}
        initialData={templateData.contenido?.projectData || templateData.contenido}
        backUrl="/admin/marketing"
        previewUrl={`/p/preview/template/${templateData.id}`}
        onSave={handleSave}
      />
    </div>
  );
}
