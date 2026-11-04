import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TemplatePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const template = await prisma.pageTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return notFound();
    }

    // Extraer el HTML y CSS del contenido (GrapesJS format)
    const contenido: any = template.contenido;
    const html = contenido?.html || "";
    const css = contenido?.css || "";

    if (!html && !css) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
          <div className="text-center p-8 bg-white rounded-3xl shadow-xl border border-slate-100 max-w-md">
            <h2 className="text-xl font-bold text-slate-800 mb-2">Plantilla Vacía</h2>
            <p className="text-slate-500 text-sm">Esta plantilla aún no tiene contenido visual. Comienza a diseñarla en el editor.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    );
  } catch (error) {
    console.error("[TemplatePreview] Error:", error);
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500 font-bold">Error al cargar la previsualización</p>
      </div>
    );
  }
}
