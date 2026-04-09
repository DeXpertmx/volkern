"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Layout,
  Edit,
  Globe,
  Loader2,
  BarChart3,
  Users,
  MousePointer2,
  Settings,
  ArrowRight,
  Plus
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Page {
  id: string;
  titulo: string;
  slug: string;
  estado: string;
  vistas: number;
  conversiones: number;
  fechaActualizacion: string;
}

export default function AdminMarketingPage() {
  const router = useRouter();
  const [homePage, setHomePage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    loadHomePage();
  }, []);

  async function loadHomePage() {
    try {
      const response = await fetch("/api/cms/pages?slug=home&global=true");
      if (!response.ok) throw new Error("Error al cargar");
      const data = await response.json();
      
      // CMS API might return an array, find the one with slug 'home'
      const home = data.pages?.find((p: Page) => p.slug === 'home');
      setHomePage(home || null);
    } catch (error) {
      console.error("Error loading home page:", error);
      toast.error("Error al cargar la información de la landing");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateHome() {
    setCreating(true);
    try {
      const response = await fetch("/api/cms/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: "Landing Page Principal",
          slug: "home",
          tipo: "volkern-webcreator",
          global: true,
          template: "landing" // Usar el template de landing como base
        }),
      });

      if (!response.ok) throw new Error("Error al crear");

      const data = await response.json();
      toast.success("Landing principal inicializada");
      
      // Ir al editor
      router.push(`/webcreator/editor/${data.page.id}?template=landing`);
    } catch (error) {
      toast.error("Error al inicializar la landing");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Cargando configuración de marketing...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 rounded-lg">
              <Sparkles className="w-4 h-4 text-white fill-white" />
            </div>
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Marketing Global</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900">Gestión de Sitio Web</h1>
          <p className="text-gray-500 mt-2 max-w-xl">
            Controla la presencia pública de la plataforma. Configura la landing page principal que ven todos los visitantes.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Control Card */}
        <Card className="lg:col-span-2 border-none shadow-xl rounded-3xl overflow-hidden bg-white ring-1 ring-gray-100">
          <CardHeader className="bg-gradient-to-r from-indigo-600/5 to-transparent pb-8">
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl font-black flex items-center gap-2">
                <Globe className="w-6 h-6 text-indigo-600" />
                Landing Page Principal (/)
              </CardTitle>
              {homePage && (
                <Badge className={`rounded-lg px-3 py-1 font-bold text-[10px] uppercase tracking-wider ${
                  homePage.estado === 'published' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                }`}>
                  {homePage.estado === 'published' ? 'En Vivo' : 'Borrador'}
                </Badge>
              )}
            </div>
            <CardDescription className="text-base font-medium mt-1">
              Esta es la página que se muestra en el dominio raíz de Volkern.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {!homePage ? (
              <div className="text-center py-12 px-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                <Layout className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-900 mb-2">Aún no hay una landing dinámica</h3>
                <p className="text-slate-500 max-w-md mx-auto mb-8">
                  Actualmente se está mostrando la versión estática programada por defecto. Al activar la landing dinámica, podrás editarla visualmente sin tocar código.
                </p>
                <Button 
                  onClick={handleCreateHome}
                  disabled={creating}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-6 rounded-2xl font-bold shadow-lg transition-all"
                >
                  {creating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Plus className="w-5 h-5 mr-2" />}
                  Activar Constructor para Home
                </Button>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="flex flex-col md:flex-row items-center gap-6 p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100">
                  <div className="w-20 h-20 bg-white rounded-2xl shadow-sm flex items-center justify-center text-indigo-600">
                    <Layout size={40} />
                  </div>
                  <div className="flex-1 text-center md:text-left">
                    <h4 className="text-lg font-bold text-gray-900 mb-1">{homePage.titulo}</h4>
                    <p className="text-sm text-gray-500 font-medium">Gestionada mediante Constructor Web</p>
                    <div className="flex items-center justify-center md:justify-start gap-4 mt-3">
                      <span className="text-xs text-gray-400 flex items-center gap-1 font-bold">
                        <Users className="w-3 h-3" />
                        {homePage.vistas} Vistas
                      </span>
                      <span className="text-xs text-indigo-600 flex items-center gap-1 font-bold">
                        <MousePointer2 className="w-3 h-3" />
                        {homePage.conversiones} Conversiones
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button 
                      variant="outline"
                      onClick={() => window.open("/", "_blank")}
                      className="rounded-xl font-bold border-gray-200"
                    >
                      Ver sitio
                    </Button>
                    <Button 
                      onClick={() => router.push(`/webcreator/editor/${homePage.id}`)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md px-6"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Editar Visualmente
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="border-gray-100 shadow-none bg-slate-50/50 p-4 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg shadow-sm">
                        <BarChart3 className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Tasa de Conversión</p>
                        <p className="text-lg font-black text-gray-900">
                          {homePage.vistas > 0 ? ((homePage.conversiones / homePage.vistas) * 100).toFixed(2) : 0}%
                        </p>
                      </div>
                    </div>
                  </Card>
                  <Card className="border-gray-100 shadow-none bg-slate-50/50 p-4 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg shadow-sm">
                        <Settings className="w-4 h-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Configuración</p>
                        <p className="text-sm font-bold text-gray-900">SEO & Meta Tags</p>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sidebar Features/Tips */}
        <div className="space-y-6">
          <Card className="border-none shadow-lg rounded-3xl bg-indigo-900 text-white overflow-hidden p-6 relative">
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
            <h3 className="text-xl font-bold mb-4 relative z-10 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-300 fill-indigo-300" />
              Smart Landing
            </h3>
            <p className="text-indigo-100 text-sm mb-6 relative z-10 leading-relaxed">
              Utiliza nuestro constructor inteligente para realizar pruebas A/B de tu landing principal y maximizar las conversiones de nuevos clientes.
            </p>
            <Button 
              onClick={() => setShowGuide(true)}
              variant="secondary" 
              className="w-full bg-white text-indigo-900 hover:bg-slate-100 rounded-xl font-bold shadow-lg"
            >
              Ver Guía de Diseño
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Card>

          <Card className="border-none shadow-lg rounded-3xl bg-white p-6 ring-1 ring-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-400" />
              Estado del Sistema
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 font-medium whitespace-nowrap overflow-hidden text-ellipsis mr-2">Slug Reservado:</span>
                <Badge variant="outline" className="text-[10px] font-black uppercase text-indigo-600 border-indigo-100 bg-indigo-50 whitespace-nowrap">/home</Badge>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 font-medium whitespace-nowrap overflow-hidden text-ellipsis mr-2">Modo Editor:</span>
                <span className="text-green-600 font-bold whitespace-nowrap">Habilitado</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 font-medium whitespace-nowrap overflow-hidden text-ellipsis mr-2">Fallback Estático:</span>
                <span className="text-gray-900 font-bold whitespace-nowrap">Activo</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Design Guide Modal */}
      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent className="max-w-2xl rounded-3xl p-8 border-none shadow-2xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black text-gray-900 flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-xl">
                <Sparkles className="w-6 h-6 text-indigo-600" />
              </div>
              Guía de Diseño Smart Landing
            </DialogTitle>
            <DialogDescription className="text-base font-medium pt-2">
              Sigue estos principios para convertir visitantes en clientes.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 mt-6">
            <div className="flex gap-4 p-4 bg-slate-50 rounded-2xl">
              <div className="w-10 h-10 bg-white rounded-xl flex-shrink-0 flex items-center justify-center shadow-sm font-bold text-indigo-600">1</div>
              <div>
                <h4 className="font-bold text-gray-900">Propuesta de Valor Clara</h4>
                <p className="text-sm text-gray-500">Tu "Hero Section" debe responder en menos de 3 segundos: ¿Qué haces?, ¿A quién ayudas? y ¿Cómo lo haces?.</p>
              </div>
            </div>

            <div className="flex gap-4 p-4 bg-slate-50 rounded-2xl">
              <div className="w-10 h-10 bg-white rounded-xl flex-shrink-0 flex items-center justify-center shadow-sm font-bold text-indigo-600">2</div>
              <div>
                <h4 className="font-bold text-gray-900">Jerarquía Visual y CTA</h4>
                <p className="text-sm text-gray-500">Mantén un solo objetivo por landing. Asegura que tu botón de acción resaltre con un color contrastante (ej. Naranja sobre Azul).</p>
              </div>
            </div>

            <div className="flex gap-4 p-4 bg-slate-50 rounded-2xl">
              <div className="w-10 h-10 bg-white rounded-xl flex-shrink-0 flex items-center justify-center shadow-sm font-bold text-indigo-600">3</div>
              <div>
                <h4 className="font-bold text-gray-900">Prueba Social (Social Proof)</h4>
                <p className="text-sm text-gray-500">Incluye logos de clientes y testimonios reales. La credibilidad es el factor #1 para que un usuario decida probar tu CRM.</p>
              </div>
            </div>

            <div className="flex gap-4 p-4 bg-slate-50 rounded-2xl">
              <div className="w-10 h-10 bg-white rounded-xl flex-shrink-0 flex items-center justify-center shadow-sm font-bold text-indigo-600">4</div>
              <div>
                <h4 className="font-bold text-gray-900">Optimización Mobile-First</h4>
                <p className="text-sm text-gray-500">Casi el 70% de tus visitas vendrán desde el móvil. Utiliza el conmutador de dispositivos en el editor para asegurar una experiencia fluida.</p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <Button 
              onClick={() => setShowGuide(false)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold px-8 py-4"
            >
              Entendido
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

