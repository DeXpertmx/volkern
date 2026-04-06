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
  Globe,
  Search,
  Loader2,
  ExternalLink,
  Sparkles,
  Layout,
  Filter,
  Calendar,
  BarChart3,
  Users,
  Clock
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
  fechaActualizacion: string;
}

export default function WebcreatorDashboard() {
  const router = useRouter();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPageData, setNewPageData] = useState({
    titulo: "",
    tipo: "volkern-webcreator",
    template: "_blank", // '_blank', 'blank', 'landing', 'portfolio', 'tienda'
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadPages();
  }, []);

  async function loadPages() {
    try {
      // Filtrar por tipo volkern-webcreator
      const response = await fetch("/api/cms/pages?tipo=volkern-webcreator");
      if (!response.ok) throw new Error("Error al cargar");
      const data = await response.json();
      setPages(data.pages || []);
    } catch (error) {
      toast.error("Error al cargar las páginas");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleteId(id);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    
    console.log('[WebcreatorDashboard] Deleting page:', deleteId);
    try {
      const response = await fetch(`/api/cms/pages/${deleteId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Error al eliminar");

      toast.success("Proyecto eliminado");
      setDeleteId(null);
      loadPages();
    } catch (error) {
      console.error("Error al eliminar:", error);
      toast.error("Error al eliminar el proyecto");
    }
  }

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

      // Ir al nuevo editor con el template seleccionado
      router.push(`/webcreator/editor/${data.page.id}?template=${newPageData.template}`);
    } catch (error) {
      toast.error("Error al crear la página");
    } finally {
      setCreating(false);
    }
  }

  const filteredPages = pages.filter((page) =>
    page.titulo.toLowerCase().includes(search.toLowerCase()) ||
    page.slug.toLowerCase().includes(search.toLowerCase())
  );

  // Calculate stats
  const totalViews = pages.reduce((acc, p) => acc + p.vistas, 0);
  const totalConversions = pages.reduce((acc, p) => acc + p.conversiones, 0);
  const publishedPages = pages.filter(p => p.estado === 'published').length;
  const draftPages = pages.filter(p => p.estado !== 'published').length;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg">
              <Sparkles className="w-4 h-4 text-white fill-white" />
            </div>
            <span className="text-xs font-bold text-purple-600 uppercase tracking-widest">Volkern Webcreator</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">Constructor Web</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-lg">
            Crea sitios web y landings de alto impacto con nuestro editor visual inteligente y bloques de CRM integrados.
          </p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-gradient-to-r from-gray-900 to-gray-700 hover:from-gray-800 hover:to-gray-600 text-white px-6 py-6 rounded-2xl font-bold flex gap-2 shadow-xl transition-all hover:-translate-y-1 active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Nueva Página
        </Button>
      </div>

      {/* Enhanced Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-none bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/20 dark:to-white/5 shadow-sm rounded-3xl overflow-hidden relative border border-purple-100 dark:border-purple-900/50">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Layout className="w-24 h-24" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-purple-600 dark:text-purple-400 uppercase tracking-tight flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Total Sitios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-gray-900 dark:text-white">{pages.length}</div>
            <div className="flex gap-4 mt-2">
              <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                <Globe className="w-3 h-3" />
                {publishedPages} publicados
              </span>
              <span className="text-xs text-orange-600 dark:text-orange-400 font-medium flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {draftPages} borradores
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-white/5 shadow-sm rounded-3xl overflow-hidden relative border border-blue-100 dark:border-blue-900/50">
           <div className="absolute top-0 right-0 p-4 opacity-10">
            <Users className="w-24 h-24" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-tight flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Vistas Totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-gray-900 dark:text-white">{totalViews}</div>
            <div className="flex gap-4 mt-2">
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                {pages.length > 0 ? (totalViews / pages.length).toFixed(0) : 0} por sitio
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none bg-gradient-to-br from-green-50 to-white dark:from-green-900/20 dark:to-white/5 shadow-sm rounded-3xl overflow-hidden relative border border-green-100 dark:border-green-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-green-600 dark:text-green-400 uppercase tracking-tight flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Conversiones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-gray-900 dark:text-white">{totalConversions}</div>
            <div className="flex gap-4 mt-2">
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                {totalViews > 0 ? ((totalConversions / totalViews) * 100).toFixed(2) : 0}% tasa
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none bg-gradient-to-br from-amber-50 to-white dark:from-amber-900/20 dark:to-white/5 shadow-sm rounded-3xl overflow-hidden relative border border-amber-100 dark:border-amber-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-amber-600 dark:text-amber-400 uppercase tracking-tight flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Última Edición
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-black text-gray-900 dark:text-white">
              {pages.length > 0 ?
                format(new Date(pages[0]?.fechaActualizacion || new Date()), "dd MMM", { locale: es }) :
                "N/A"}
            </div>
            <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-2">
              {pages.length > 0 ? pages[0]?.titulo : "Sin páginas"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Search and Filter */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o URL..."
            className="pl-12 py-6 rounded-2xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm focus:ring-purple-100 dark:focus:ring-purple-900 transition-all font-medium"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl font-bold px-4 py-6 flex items-center gap-2 border-gray-200 dark:border-gray-700">
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filtros</span>
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-4">
        <Card className="border-gray-100 dark:border-gray-800 shadow-xl rounded-3xl overflow-hidden bg-white dark:bg-gray-800">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
                <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Cargando constructor...</span>
              </div>
            ) : filteredPages.length === 0 ? (
              <div className="text-center py-24 px-6">
                <div className="w-20 h-20 bg-gray-50 dark:bg-gray-700 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <Layout className="w-10 h-10 text-gray-300 dark:text-gray-500" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Diseña algo increíble</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto mb-8">Empieza creando tu primera landing page con el editor más potente de Volkern.</p>
                <Button onClick={() => setCreateDialogOpen(true)} variant="outline" className="rounded-xl font-bold px-8 py-6 border-gray-200 dark:border-gray-700">
                  Crear Primera Página
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-gray-50/50 dark:bg-gray-700/50">
                  <TableRow className="hover:bg-transparent border-gray-100 dark:border-gray-700">
                    <TableHead className="font-bold text-gray-400 dark:text-gray-400 py-6 pl-8">Proyecto</TableHead>
                    <TableHead className="font-bold text-gray-400 dark:text-gray-400 py-6">Estado</TableHead>
                    <TableHead className="font-bold text-gray-400 dark:text-gray-400 py-6">Última Edición</TableHead>
                    <TableHead className="font-bold text-gray-400 dark:text-gray-400 py-6 text-right">Rendimiento</TableHead>
                    <TableHead className="font-bold text-gray-400 dark:text-gray-400 py-6 text-right pr-8">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPages.map((page) => (
                    <TableRow key={page.id} className="group border-gray-50 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors">
                      <TableCell className="py-6 pl-8">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center text-gray-400 dark:text-gray-400 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/30 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-all">
                              <FileText size={24} />
                           </div>
                           <div>
                             <p className="font-bold text-gray-900 dark:text-white">{page.titulo}</p>
                             <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">/p/{page.slug}</p>
                           </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`rounded-lg px-3 py-1 font-bold text-[10px] uppercase tracking-wider ${
                          page.estado === 'published' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                        }`}>
                          {page.estado === 'published' ? 'En Vivo' : 'Borrador'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-500 dark:text-gray-400">
                        {format(new Date(page.fechaActualizacion), "dd MMM yyyy", { locale: es })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-bold text-gray-900 dark:text-white">{page.vistas} <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">VISTAS</span></span>
                          <span className="text-xs text-green-600 dark:text-green-400 font-bold">{page.conversiones} <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">LEADS</span></span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex justify-end gap-2 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="bg-white dark:bg-gray-700 shadow-sm border border-gray-100 dark:border-gray-600 rounded-xl hover:text-purple-600 dark:hover:text-purple-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/webcreator/editor/${page.id}`);
                            }}
                            title="Editar proyecto"
                          >
                            <Edit size={18} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="bg-white dark:bg-gray-700 shadow-sm border border-gray-100 dark:border-gray-600 rounded-xl hover:text-blue-500 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`/p/${page.slug}`, "_blank");
                            }}
                            title="Ver en vivo"
                          >
                            <ExternalLink size={18} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="bg-white dark:bg-gray-700 shadow-sm border border-gray-100 dark:border-gray-600 rounded-xl hover:text-red-500 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(page.id);
                            }}
                            title="Eliminar proyecto"
                          >
                            <Trash2 size={18} />
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
      </div>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl p-8 border-none shadow-2xl bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-gray-900 dark:text-white">Nuevo Proyecto</DialogTitle>
            <DialogDescription className="font-medium text-gray-500 dark:text-gray-400">
              Escribe un nombre para identificar tu landing page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <div className="space-y-3">
              <Label className="font-bold text-gray-700 dark:text-gray-300 ml-1">Título de la página</Label>
              <Input
                value={newPageData.titulo}
                onChange={(e) => setNewPageData({ ...newPageData, titulo: e.target.value })}
                placeholder="Ej: Lanzamiento Curso IA"
                className="py-6 rounded-2xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 focus:bg-white dark:focus:bg-gray-700 focus:ring-2 focus:ring-purple-500/20 transition-all font-semibold text-gray-900 dark:text-white"
                autoFocus
              />
            </div>
          </div>
          <div className="flex gap-3 pt-6">
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              className="flex-1 rounded-xl font-bold py-6 border-gray-200 dark:border-gray-700"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newPageData.titulo.trim()}
              className="flex-1 bg-gradient-to-r from-gray-900 to-gray-700 hover:from-gray-800 hover:to-gray-600 text-white rounded-xl font-bold py-6 shadow-xl disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Empezar a Diseñar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl p-8 border-none shadow-2xl bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
                <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              ¿Eliminar Proyecto?
            </DialogTitle>
            <DialogDescription className="font-medium text-gray-500 dark:text-gray-400 pt-2">
              Esta acción no se puede deshacer. Se eliminarán permanentemente todos los datos de este proyecto.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-6">
            <Button
              variant="outline"
              onClick={() => setDeleteId(null)}
              className="flex-1 rounded-xl font-bold py-6 border-gray-200 dark:border-gray-700"
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmDelete}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold py-6 shadow-red-200 dark:shadow-none"
            >
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
