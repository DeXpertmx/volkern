"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Edit,
  Trash2,
  Plus,
  Loader2,
  AlertCircle,
  Clock,
  ArrowRight,
  Eye
} from "lucide-react";
import { TemplatePreviewModal } from "@/components/documents/TemplatePreviewModal";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Template {
  id: string;
  titulo: string;
  numero: string;
  estado: string;
  fechaActualizacion: string;
  clausulas?: string;
  templateData?: any;
}

export function DocumentTemplatesList() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/cms/templates?type=document");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      } else {
        throw new Error("Error al cargar plantillas");
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("No se pudieron cargar las plantillas");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/cms/templates?id=${deleteId}&type=document`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Plantilla eliminada");
        setTemplates(templates.filter((t) => t.id !== deleteId));
        setDeleteId(null);
      } else {
        throw new Error("Error al eliminar");
      }
    } catch (error) {
      toast.error("Error al eliminar la plantilla");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Tus Plantillas Personalizadas
        </h3>
        <Button 
          onClick={() => router.push("/template-editor/document/new")}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva Plantilla
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 border-2 border-dashed rounded-xl">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mr-2" />
          <span className="text-muted-foreground font-medium text-sm">Cargando plantillas...</span>
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/30">
          <div className="h-12 w-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-gray-500">Aún no tienes plantillas propias.</p>
          <p className="text-xs text-gray-400 mt-1">Crea tu primer contrato o diseño con el editor visual.</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => router.push("/template-editor/document/new")}
          >
            Empezar a Diseñar
          </Button>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden shadow-sm bg-white">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-bold">Nombre de Plantilla</TableHead>
                <TableHead className="font-bold">Estado</TableHead>
                <TableHead className="font-bold">Última Modificación</TableHead>
                <TableHead className="text-right font-bold">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-semibold">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                        <FileText className="h-4 w-4" />
                      </div>
                      {template.titulo}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 border-none capitalize">
                      {template.estado}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(template.fechaActualizacion), "dd MMM, yyyy HH:mm", { locale: es })}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hover:text-indigo-600 hover:bg-indigo-50"
                        onClick={() => router.push(`/template-editor/document/${template.id}`)}
                        title="Editar Plantilla"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hover:text-amber-600 hover:bg-amber-50"
                        onClick={() => setPreviewTemplate(template)}
                        title="Previsualizar"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hover:text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteId(template.id)}
                        title="Eliminar Plantilla"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hover:text-primary hover:bg-primary/5"
                        onClick={() => router.push("/dashboard/contratos/nuevo")}
                        title="Usar plantilla ahora"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              ¿Estás seguro de eliminar esta plantilla?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán los datos de diseño de la plantilla permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white rounded-xl"
            >
              {deleting ? "Eliminando..." : "Eliminar Plantilla"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {previewTemplate && (
        <TemplatePreviewModal
            isOpen={!!previewTemplate}
            onClose={() => setPreviewTemplate(null)}
            templateName={previewTemplate.titulo}
            html={previewTemplate.clausulas || ""}
            css={previewTemplate.templateData?.css || ""}
        />
      )}
    </div>
  );
}
