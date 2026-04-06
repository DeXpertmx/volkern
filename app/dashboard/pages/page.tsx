
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  FileText,
  Eye,
  Edit,
  Trash2,
  Globe,
  Copy,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { TemplatePreview } from "@/components/page-builder/TemplatePreview";

interface Pagina {
  id: string;
  titulo: string;
  slug: string;
  descripcion?: string;
  tipo: string;
  estado: string;
  vistas: number;
  conversiones: number;
  publicadoEn?: Date;
  subdomain?: string;
  dominioPersonalizado?: string;
  fechaCreacion: Date;
  fechaActualizacion: Date;
}

interface Template {
  id: string;
  nombre: string;
  descripcion?: string;
  categoria: string;
  imagenPreview?: string;
  contenido: any;
}

export default function PaginasPage() {
  const router = useRouter();
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    titulo: "",
    slug: "",
    descripcion: "",
    tipo: "landing",
  });

  useEffect(() => {
    cargarPaginas();
    cargarTemplates();
  }, []);

  const cargarTemplates = async () => {
    try {
      const response = await fetch("/api/templates");
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error("Error cargando templates:", error);
    }
  };

  const cargarPaginas = async () => {
    try {
      const response = await fetch("/api/pages");
      if (response.ok) {
        const data = await response.json();
        setPaginas(data);
      }
    } catch (error) {
      console.error("Error cargando páginas:", error);
      toast.error("Error al cargar las páginas");
    } finally {
      setLoading(false);
    }
  };

  const crearPagina = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const pageData: any = {
        ...formData,
      };

      // If a template is selected, use its content
      if (selectedTemplate) {
        pageData.contenido = selectedTemplate.contenido;
        pageData.plantillaId = selectedTemplate.id;
      }

      const response = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pageData),
      });

      if (response.ok) {
        const nuevaPagina = await response.json();
        toast.success("Página creada exitosamente");
        setDialogOpen(false);
        setShowTemplates(false);
        setSelectedTemplate(null);
        setFormData({ titulo: "", slug: "", descripcion: "", tipo: "landing" });
        router.push(`/dashboard/pages/${nuevaPagina.id}/builder`);
      } else {
        const error = await response.json();
        toast.error(error.error || "Error al crear la página");
      }
    } catch (error) {
      console.error("Error creando página:", error);
      toast.error("Error al crear la página");
    }
  };

  const eliminarPagina = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta página?")) return;

    try {
      const response = await fetch(`/api/pages/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Página eliminada");
        cargarPaginas();
      } else {
        toast.error("Error al eliminar la página");
      }
    } catch (error) {
      console.error("Error eliminando página:", error);
      toast.error("Error al eliminar la página");
    }
  };

  const duplicarPagina = async (pagina: Pagina) => {
    try {
      const response = await fetch(`/api/pages/${pagina.id}`);
      if (!response.ok) return;

      const paginaCompleta = await response.json();

      const nuevaPagina = {
        titulo: `${pagina.titulo} (Copia)`,
        slug: `${pagina.slug}-copia-${Date.now()}`,
        descripcion: pagina.descripcion,
        tipo: pagina.tipo,
        contenido: paginaCompleta.contenido,
      };

      const createResponse = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nuevaPagina),
      });

      if (createResponse.ok) {
        toast.success("Página duplicada exitosamente");
        cargarPaginas();
      }
    } catch (error) {
      console.error("Error duplicando página:", error);
      toast.error("Error al duplicar la página");
    }
  };

  const getEstadoBadge = (estado: string) => {
    const estados: Record<string, { label: string; color: string }> = {
      draft: { label: "Borrador", color: "bg-gray-100 text-gray-800" },
      published: { label: "Publicado", color: "bg-green-100 text-green-800" },
      archived: { label: "Archivado", color: "bg-red-100 text-red-800" },
    };
    const est = estados[estado] || estados.draft;
    return (
      <Badge className={est.color} variant="secondary">
        {est.label}
      </Badge>
    );
  };

  const getTipoBadge = (tipo: string) => {
    const tipos: Record<string, { label: string; icon: any }> = {
      landing: { label: "Landing Page", icon: FileText },
      service: { label: "Página de Servicio", icon: Globe },
      membership: { label: "Membresía", icon: Globe },
      course: { label: "Curso", icon: Globe },
      custom: { label: "Personalizada", icon: FileText },
    };
    const tip = tipos[tipo] || tipos.custom;
    const Icon = tip.icon;
    return (
      <div className="flex items-center gap-1 text-sm text-gray-600">
        <Icon className="w-4 h-4" />
        <span>{tip.label}</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando páginas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Constructor de Páginas
          </h1>
          <p className="text-gray-600 mt-1">
            Crea landing pages, páginas de servicios y más sin código
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Nueva Página
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {!showTemplates ? "Crear Nueva Página" : "Elige una Plantilla"}
              </DialogTitle>
            </DialogHeader>

            {!showTemplates ? (
              <form onSubmit={crearPagina} className="space-y-4">
                <div>
                  <Label htmlFor="titulo">Título</Label>
                  <Input
                    id="titulo"
                    value={formData.titulo}
                    onChange={(e) =>
                      setFormData({ ...formData, titulo: e.target.value })
                    }
                    placeholder="Mi Landing Page"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="slug">Slug (URL)</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData({ ...formData, slug: e.target.value })
                    }
                    placeholder="mi-landing-page"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Deja vacío para generarlo automáticamente
                  </p>
                </div>
                <div>
                  <Label htmlFor="descripcion">Descripción</Label>
                  <Textarea
                    id="descripcion"
                    value={formData.descripcion}
                    onChange={(e) =>
                      setFormData({ ...formData, descripcion: e.target.value })
                    }
                    placeholder="Breve descripción de la página"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="tipo">Tipo de Página</Label>
                  <Select
                    value={formData.tipo}
                    onValueChange={(value) =>
                      setFormData({ ...formData, tipo: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="landing">Landing Page</SelectItem>
                      <SelectItem value="service">Página de Servicio</SelectItem>
                      <SelectItem value="membership">Membresía</SelectItem>
                      <SelectItem value="course">Curso</SelectItem>
                      <SelectItem value="custom">Personalizada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Template Selection */}
                <div className="border-t pt-4">
                  <Label>Usar Plantilla (Opcional)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowTemplates(true)}
                    className="w-full mt-2"
                  >
                    {selectedTemplate
                      ? `Plantilla: ${selectedTemplate.nombre}`
                      : "Seleccionar Plantilla Prediseñada"}
                  </Button>
                  {selectedTemplate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedTemplate(null)}
                      className="w-full mt-1 text-red-600"
                    >
                      Limpiar Plantilla
                    </Button>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1 bg-blue-600">
                    Crear Página
                  </Button>
                </div>
              </form>
            ) : (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {templates.map((template) => (
                    <TemplatePreview
                      key={template.id}
                      template={template}
                      isSelected={selectedTemplate?.id === template.id}
                      onClick={() => setSelectedTemplate(template)}
                    />
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => setShowTemplates(false)}
                    variant="outline"
                    className="flex-1"
                  >
                    Volver
                  </Button>
                  <Button
                    onClick={() => setShowTemplates(false)}
                    disabled={!selectedTemplate}
                    className="flex-1 bg-blue-600"
                  >
                    Usar Esta Plantilla
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {paginas.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No hay páginas creadas
          </h3>
          <p className="text-gray-600 mb-6">
            Comienza creando tu primera página con nuestro constructor visual
          </p>
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Crear Primera Página
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginas.map((pagina) => (
            <Card key={pagina.id} className="p-6 hover:shadow-lg transition">
              <div className="flex justify-between items-start mb-4">
                {getTipoBadge(pagina.tipo)}
                {getEstadoBadge(pagina.estado)}
              </div>

              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {pagina.titulo}
              </h3>
              <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                {pagina.descripcion || "Sin descripción"}
              </p>

              <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                <div className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  <span>{pagina.vistas}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>
                    {new Date(pagina.fechaActualizacion).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {(pagina.subdomain || pagina.dominioPersonalizado) && (
                <div className="mb-4 p-2 bg-green-50 rounded text-xs">
                  <Globe className="w-3 h-3 inline mr-1" />
                  <span className="text-green-700">
                    {pagina.subdomain
                      ? `${pagina.subdomain}.volkern.app`
                      : pagina.dominioPersonalizado}
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    router.push(`/dashboard/pages/${pagina.id}/builder`)
                  }
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  size="sm"
                >
                  <Edit className="w-4 h-4 mr-1" />
                  Editar
                </Button>
                <Button
                  onClick={() => duplicarPagina(pagina)}
                  variant="outline"
                  size="sm"
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => eliminarPagina(pagina.id)}
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
