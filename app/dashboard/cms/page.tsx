"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  FileText,
  Edit,
  Trash2,
  Eye,
  Globe,
  Search,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Page {
  id: string;
  titulo: string;
  slug: string;
  tipo: string;
  estado: string;
  vistas: number;
  conversiones: number;
  publicadoEn: string | null;
  fechaCreacion: string;
  fechaActualizacion: string;
}

export default function CMSPage() {
  const router = useRouter();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPageData, setNewPageData] = useState({
    titulo: "",
    tipo: "landing",
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Cargar páginas
  useEffect(() => {
    loadPages();
  }, []);

  async function loadPages() {
    try {
      const response = await fetch("/api/cms/pages");
      if (!response.ok) throw new Error("Error al cargar");
      const data = await response.json();
      setPages(data.pages || []);
    } catch (error) {
      toast.error("Error al cargar las páginas");
    } finally {
      setLoading(false);
    }
  }

  // Crear nueva página
  async function handleCreate() {
    if (!newPageData.titulo.trim()) {
      toast.error("El título es requerido");
      return;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/cms/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPageData),
      });

      if (!response.ok) throw new Error("Error al crear");
      
      const data = await response.json();
      toast.success("Página creada correctamente");
      setCreateDialogOpen(false);
      setNewPageData({ titulo: "", tipo: "landing" });
      
      // Ir al editor
      router.push(`/dashboard/cms/editor/${data.page.id}`);
    } catch (error) {
      toast.error("Error al crear la página");
    } finally {
      setCreating(false);
    }
  }

  // Eliminar página
  async function handleDelete() {
    if (!deleteId) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/cms/pages/${deleteId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Error al eliminar");
      
      toast.success("Página eliminada");
      setDeleteId(null);
      loadPages();
    } catch (error) {
      toast.error("Error al eliminar la página");
    } finally {
      setDeleting(false);
    }
  }

  // Filtrar páginas
  const filteredPages = pages.filter((page) => {
    const matchesSearch =
      page.titulo.toLowerCase().includes(search.toLowerCase()) ||
      page.slug.toLowerCase().includes(search.toLowerCase());
    const matchesEstado = filterEstado === "all" || page.estado === filterEstado;
    return matchesSearch && matchesEstado;
  });

  const estadoBadge = (estado: string) => {
    switch (estado) {
      case "published":
        return <Badge className="bg-green-100 text-green-800">Publicado</Badge>;
      case "draft":
        return <Badge variant="secondary">Borrador</Badge>;
      case "archived":
        return <Badge variant="outline">Archivado</Badge>;
      default:
        return <Badge variant="secondary">{estado}</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">CMS</h1>
          <p className="text-muted-foreground">
            Crea y gestiona tus landing pages y páginas web
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Página
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Páginas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pages.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Publicadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {pages.filter((p) => p.estado === "published").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Visitas Totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pages.reduce((acc, p) => acc + p.vistas, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Conversiones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {pages.reduce((acc, p) => acc + p.conversiones, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar páginas..."
            className="pl-10"
          />
        </div>
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="published">Publicado</SelectItem>
            <SelectItem value="archived">Archivado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla de páginas */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filteredPages.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                {pages.length === 0
                  ? "No tienes páginas aún. Crea tu primera página."
                  : "No se encontraron páginas con esos criterios."}
              </p>
              {pages.length === 0 && (
                <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Página
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Visitas</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                  <TableHead>Actualizado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPages.map((page) => (
                  <TableRow key={page.id}>
                    <TableCell className="font-medium">{page.titulo}</TableCell>
                    <TableCell className="text-muted-foreground">
                      /p/{page.slug}
                    </TableCell>
                    <TableCell>{estadoBadge(page.estado)}</TableCell>
                    <TableCell className="text-right">{page.vistas}</TableCell>
                    <TableCell className="text-right">{page.conversiones}</TableCell>
                    <TableCell>
                      {format(new Date(page.fechaActualizacion), "d MMM yyyy", {
                        locale: es,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/dashboard/cms/editor/${page.id}`)}
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(`/p/${page.slug}`, "_blank")}
                          title="Ver página"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(page.id)}
                          title="Eliminar"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Diálogo crear página */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Página</DialogTitle>
            <DialogDescription>
              Crea una nueva página para tu sitio web
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título de la página</Label>
              <Input
                value={newPageData.titulo}
                onChange={(e) =>
                  setNewPageData({ ...newPageData, titulo: e.target.value })
                }
                placeholder="Mi nueva landing page"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de página</Label>
              <Select
                value={newPageData.tipo}
                onValueChange={(value) =>
                  setNewPageData({ ...newPageData, tipo: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="landing">Landing Page</SelectItem>
                  <SelectItem value="page">Página Estática</SelectItem>
                  <SelectItem value="blog">Artículo de Blog</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                "Crear y Editar"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo eliminar */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Página</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que quieres eliminar esta página? Esta acción no se
              puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                "Eliminar"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
