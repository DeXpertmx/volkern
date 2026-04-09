"use client";

import { useState, useCallback, useEffect } from "react";
import { Puck, type Data } from "@measured/puck";
import "@measured/puck/puck.css";
import { puckConfig } from "@/lib/puck/puck-config";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Save,
  Eye,
  Globe,
  ArrowLeft,
  Sparkles,
  Loader2,
  Settings,
  Smartphone,
  Tablet,
  Monitor,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface PuckEditorProps {
  pageId: string;
  initialData: Data;
  pageTitle: string;
  pageSlug: string;
  tenantSlug?: string;
  onBack?: () => void;
}

export function PuckEditor({
  pageId,
  initialData,
  pageTitle,
  pageSlug,
  tenantSlug,
  onBack,
}: PuckEditorProps) {
  const [data, setData] = useState<Data>(initialData);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiComponentType, setAiComponentType] = useState("");
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  
  const [settings, setSettings] = useState({
    metaTitulo: pageTitle,
    metaDescripcion: "",
    metaImagen: "",
    scriptsHead: "",
    scriptsBody: "",
  });

  // Guardar datos
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/cms/pages/${pageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contenido: data,
          ...settings,
        }),
      });

      if (!response.ok) throw new Error("Error al guardar");
      toast.success("Página guardada correctamente");
    } catch (error) {
      toast.error("Error al guardar la página");
    } finally {
      setSaving(false);
    }
  }, [pageId, data, settings]);

  // Publicar página
  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
      const response = await fetch(`/api/cms/pages/${pageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contenido: data,
          estado: "published",
          ...settings,
        }),
      });

      if (!response.ok) throw new Error("Error al publicar");
      toast.success("Página publicada correctamente");
    } catch (error) {
      toast.error("Error al publicar la página");
    } finally {
      setPublishing(false);
    }
  }, [pageId, data, settings]);

  // Sugerencia de IA
  const handleAISuggest = useCallback(async () => {
    if (!aiPrompt.trim()) {
      toast.error("Escribe qué tipo de contenido necesitas");
      return;
    }

    setAiLoading(true);
    try {
      const response = await fetch(`/api/cms/pages/${pageId}/ai-suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          componentType: aiComponentType || undefined,
        }),
      });

      if (!response.ok) throw new Error("Error al generar");
      
      const result = await response.json();
      toast.success("Contenido generado. Revisa la sugerencia.");
      
      // Mostrar resultado
      console.log("AI Suggestion:", result.suggestion);
      
      // Cerrar diálogo y mostrar resultado
      setAiDialogOpen(false);
      setAiPrompt("");
      
      // TODO: Aplicar sugerencia automáticamente al componente seleccionado
      toast.info("Sugerencia generada - revisa la consola para ver el contenido");
      
    } catch (error) {
      toast.error("Error al generar contenido con IA");
    } finally {
      setAiLoading(false);
    }
  }, [pageId, aiPrompt, aiComponentType]);

  // Full-screen editor mode: add class to body to hide sidebar & expand canvas
  useEffect(() => {
    document.body.classList.add("puck-editor-active");
    return () => {
      document.body.classList.remove("puck-editor-active");
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  // Custom header con controles
  const HeaderActions = () => (
    <div className="flex items-center gap-2">
      {/* Viewport selector */}
      <div className="flex items-center border rounded-lg p-1 bg-muted/50">
        <button
          onClick={() => setViewport("desktop")}
          className={cn(
            "p-1.5 rounded transition-colors",
            viewport === "desktop" ? "bg-background shadow-sm" : "hover:bg-background/50"
          )}
          title="Desktop"
        >
          <Monitor className="w-4 h-4" />
        </button>
        <button
          onClick={() => setViewport("tablet")}
          className={cn(
            "p-1.5 rounded transition-colors",
            viewport === "tablet" ? "bg-background shadow-sm" : "hover:bg-background/50"
          )}
          title="Tablet"
        >
          <Tablet className="w-4 h-4" />
        </button>
        <button
          onClick={() => setViewport("mobile")}
          className={cn(
            "p-1.5 rounded transition-colors",
            viewport === "mobile" ? "bg-background shadow-sm" : "hover:bg-background/50"
          )}
          title="Mobile"
        >
          <Smartphone className="w-4 h-4" />
        </button>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setAiDialogOpen(true)}
        className="gap-2"
      >
        <Sparkles className="w-4 h-4" />
        IA
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setSettingsOpen(true)}
        className="gap-2"
      >
        <Settings className="w-4 h-4" />
        SEO
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => window.open(tenantSlug ? `/p/${tenantSlug}/${pageSlug}` : `/p/${pageSlug}`, "_blank")}
        className="gap-2"
      >
        <Eye className="w-4 h-4" />
        Preview
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleSave}
        disabled={saving}
        className="gap-2"
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        Guardar
      </Button>

      <Button
        size="sm"
        onClick={handlePublish}
        disabled={publishing}
        className="gap-2"
      >
        {publishing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Globe className="w-4 h-4" />
        )}
        Publicar
      </Button>
    </div>
  );

  return (
    <div className="puck-fullscreen-wrapper flex flex-col">
      {/* Header personalizado */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack} className="h-8">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Volver
            </Button>
          )}
          <div className="leading-tight">
            <h1 className="font-semibold text-sm">{pageTitle}</h1>
            <p className="text-[11px] text-muted-foreground">/p/{pageSlug}</p>
          </div>
        </div>
        <HeaderActions />
      </div>

      {/* Editor Puck */}
      <div className="flex-1 overflow-hidden">
        <Puck
          config={puckConfig}
          data={data}
          onPublish={handleSave}
          onChange={(newData) => setData(newData)}
          overrides={{
            header: (() => null) as any,
          }}
        />
      </div>

      {/* Diálogo de configuración SEO */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configuración SEO</DialogTitle>
            <DialogDescription>
              Configura los metadatos para buscadores y redes sociales
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="seo">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="seo">SEO</TabsTrigger>
              <TabsTrigger value="scripts">Scripts</TabsTrigger>
            </TabsList>
            <TabsContent value="seo" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Título SEO</Label>
                <Input
                  value={settings.metaTitulo}
                  onChange={(e) => setSettings({ ...settings, metaTitulo: e.target.value })}
                  placeholder="Título de la página"
                />
              </div>
              <div className="space-y-2">
                <Label>Meta Descripción</Label>
                <Textarea
                  value={settings.metaDescripcion}
                  onChange={(e) => setSettings({ ...settings, metaDescripcion: e.target.value })}
                  placeholder="Descripción para buscadores (150-160 caracteres)"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Imagen OG (para compartir)</Label>
                <Input
                  value={settings.metaImagen}
                  onChange={(e) => setSettings({ ...settings, metaImagen: e.target.value })}
                  placeholder="https://kaydee.net/wp-content/uploads/2020/06/open-graph-image.jpg"
                />
              </div>
            </TabsContent>
            <TabsContent value="scripts" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Scripts en &lt;head&gt;</Label>
                <Textarea
                  value={settings.scriptsHead}
                  onChange={(e) => setSettings({ ...settings, scriptsHead: e.target.value })}
                  placeholder="<script>...</script>"
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Scripts en &lt;body&gt;</Label>
                <Textarea
                  value={settings.scriptsBody}
                  onChange={(e) => setSettings({ ...settings, scriptsBody: e.target.value })}
                  placeholder="<script>...</script>"
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>
            </TabsContent>
          </Tabs>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => { handleSave(); setSettingsOpen(false); }}>
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de IA */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              Asistente IA
            </DialogTitle>
            <DialogDescription>
              Describe qué contenido necesitas y la IA lo generará por ti
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de contenido (opcional)</Label>
              <select
                value={aiComponentType}
                onChange={(e) => setAiComponentType(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="">General</option>
                <option value="Hero">Hero / Banner principal</option>
                <option value="Features">Características</option>
                <option value="FAQ">Preguntas frecuentes</option>
                <option value="Testimonial">Testimonio</option>
                <option value="Pricing">Tabla de precios</option>
                <option value="Heading">Título</option>
                <option value="Text">Párrafo</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Describe lo que necesitas</Label>
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Ej: Un hero para una agencia inmobiliaria que vende propiedades de lujo en México..."
                rows={4}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setAiDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAISuggest} disabled={aiLoading}>
              {aiLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generar
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
