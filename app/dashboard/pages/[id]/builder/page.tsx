

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Eye,
  Smartphone,
  Tablet,
  Monitor,
  Undo,
  Redo,
  Globe,
  ArrowLeft,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { ComponentLibrary } from "@/components/page-builder/ComponentLibrary";
import { ComponentRenderer } from "@/components/page-builder/ComponentRenderer";
import { EnhancedPropertiesPanel } from "@/components/page-builder/EnhancedPropertiesPanel";
import {
  PageComponent,
  PageData,
  COMPONENT_TYPES,
  DEFAULT_COMPONENT_PROPS,
  generateComponentId,
  findComponentById,
  updateComponent,
  removeComponent,
  addComponent,
  moveComponent,
  findParentId,
} from "@/lib/page-builder";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface PageBuilderProps {
  params: { id: string };
}

type DeviceMode = "desktop" | "tablet" | "mobile";

export default function PageBuilder({ params }: PageBuilderProps) {
  const router = useRouter();
  const [pagina, setPagina] = useState<any>(null);
  const [components, setComponents] = useState<PageComponent[]>([]);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(
    null
  );
  const [activeComponentId, setActiveComponentId] = useState<string | null>(null);
  const [deviceMode, setDeviceMode] = useState<DeviceMode>("desktop");
  const [zoom, setZoom] = useState(100);
  const [history, setHistory] = useState<PageComponent[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [publishData, setPublishData] = useState({
    subdominio: "",
    generarEmbed: false,
  });
  const [scriptsHead, setScriptsHead] = useState("");
  const [scriptsBody, setScriptsBody] = useState("");

  // Sincronizar con el estado del sidebar del dashboard
  useEffect(() => {
    const checkSidebarState = () => {
      const saved = localStorage.getItem('sidebar-collapsed')
      setSidebarCollapsed(saved === 'true')
    }

    checkSidebarState()

    // Escuchar cambios en el localStorage
    window.addEventListener('storage', checkSidebarState)

    // También escuchar eventos personalizados desde el mismo tab
    const handleSidebarToggle = (e: CustomEvent) => {
      setSidebarCollapsed(e.detail.isCollapsed)
    }
    window.addEventListener('sidebar-toggle' as any, handleSidebarToggle as any)

    return () => {
      window.removeEventListener('storage', checkSidebarState)
      window.removeEventListener('sidebar-toggle' as any, handleSidebarToggle as any)
    }
  }, [])

  useEffect(() => {
    cargarPagina();
  }, [params.id]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      // Ctrl/Cmd + Z to undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Ctrl/Cmd + Shift + Z to redo
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z") {
        e.preventDefault();
        handleRedo();
      }
      // Delete/Backspace to delete selected component
      if ((e.key === "Delete" || e.key === "Backspace") && selectedComponentId) {
        e.preventDefault();
        handleDeleteComponent();
      }
      // Ctrl/Cmd + + to zoom in
      if ((e.ctrlKey || e.metaKey) && e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      }
      // Ctrl/Cmd + - to zoom out
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        handleZoomOut();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedComponentId, historyIndex, history, zoom]);

  // Mouse wheel zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          handleZoomIn();
        } else {
          handleZoomOut();
        }
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [zoom]);

  const cargarPagina = async () => {
    try {
      const response = await fetch(`/api/pages/${params.id}`);
      if (response.ok) {
        const data = await response.json();
        setPagina(data);
        const contenido = data.contenido as PageData;
        setComponents(contenido.components || []);
        // Load scripts
        setScriptsHead(data.scriptsHead || "");
        setScriptsBody(data.scriptsBody || "");
        // Initialize history
        setHistory([contenido.components || []]);
        setHistoryIndex(0);
      } else {
        toast.error("Error al cargar la página");
        router.push("/dashboard/pages");
      }
    } catch (error) {
      console.error("Error cargando página:", error);
      toast.error("Error al cargar la página");
    } finally {
      setLoading(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveComponentId(active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;
    setActiveComponentId(null);

    if (active) {
      const activeId = active.id as string;
      const activeComponent = findComponentById(components, activeId);

      if (activeComponent) {
        // Calcular nuevas coordenadas basadas en el delta del arrastre
        const currentX = activeComponent.props.x || 0;
        const currentY = activeComponent.props.y || 0;

        const newX = currentX + delta.x;
        const newY = currentY + delta.y;

        const newComponents = updateComponent(components, activeId, {
          props: {
            ...activeComponent.props,
            x: Math.round(newX),
            y: Math.round(newY)
          },
        });

        setComponents(newComponents);
        addToHistory(newComponents);
      }
    }
  };

  const addToHistory = (newComponents: PageComponent[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newComponents);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleAddComponent = (type: string) => {
    const newComponent: PageComponent = {
      id: generateComponentId(),
      type,
      props: { ...DEFAULT_COMPONENT_PROPS[type] },
    };

    const newComponents = [...components, newComponent];
    setComponents(newComponents);
    addToHistory(newComponents);
    setSelectedComponentId(newComponent.id);
    toast.success("Componente añadido");
  };

  const handleSelectComponent = (id: string) => {
    setSelectedComponentId(id);
  };

  const handleUpdateProps = (props: Record<string, any>) => {
    if (!selectedComponentId) return;

    const newComponents = updateComponent(components, selectedComponentId, {
      props,
    });
    setComponents(newComponents);
    addToHistory(newComponents);
  };

  const handleDeleteComponent = () => {
    if (!selectedComponentId) return;

    const newComponents = removeComponent(components, selectedComponentId);
    setComponents(newComponents);
    addToHistory(newComponents);
    setSelectedComponentId(null);
    toast.success("Componente eliminado");
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setComponents(history[historyIndex - 1]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setComponents(history[historyIndex + 1]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/pages/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contenido: { components },
          scriptsHead: scriptsHead || null,
          scriptsBody: scriptsBody || null,
        }),
      });

      if (response.ok) {
        toast.success("Página guardada exitosamente");
      } else {
        toast.error("Error al guardar la página");
      }
    } catch (error) {
      console.error("Error guardando página:", error);
      toast.error("Error al guardar la página");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    try {
      // First save
      await handleSave();

      // Then publish
      const response = await fetch(`/api/pages/${params.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(publishData),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success("Página publicada exitosamente");
        setPublishDialogOpen(false);
        if (data.urlPublica) {
          toast.success(`URL: ${data.urlPublica}`);
        }
        cargarPagina();
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || "Error al publicar la página");
      }
    } catch (error) {
      console.error("Error publicando página:", error);
      toast.error("Error al publicar la página");
    }
  };

  const handlePreview = () => {
    setPreviewMode(true);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 10, 200));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 10, 50));
  };

  const getDeviceWidth = () => {
    switch (deviceMode) {
      case "mobile":
        return 375;
      case "tablet":
        return 768;
      case "desktop":
      default:
        return "100%";
    }
  };

  const getCanvasContainerStyle = () => {
    if (deviceMode === "desktop") {
      return {
        width: "100%",
        height: "100%",
        padding: "0",
      };
    } else {
      return {
        width: `${getDeviceWidth()}px`,
        maxWidth: "100%",
        height: "100%",
        margin: "0 auto",
        padding: "1rem 0",
      };
    }
  };

  const getCanvasStyle = () => {
    const scale = zoom / 100;

    return {
      width: "100%",
      minHeight: "100%",
      transform: `scale(${scale})`,
      transformOrigin: "top center",
    };
  };

  const selectedComponent = selectedComponentId
    ? findComponentById(components, selectedComponentId)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-700 font-medium">Cargando constructor...</p>
        </div>
      </div>
    );
  }

  if (previewMode) {
    return (
      <div className={cn(
        "fixed inset-0 flex flex-col bg-white transition-all duration-300",
        sidebarCollapsed ? "md:left-20" : "md:left-64"
      )}>
        {/* Preview Toolbar */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white p-4 flex items-center justify-between shadow-lg">
          <h2 className="text-lg font-semibold">Vista Previa</h2>
          <div className="flex items-center gap-3">
            {/* Device Mode Selector */}
            <div className="flex bg-gray-800 rounded-lg p-1 gap-1">
              <button
                onClick={() => setDeviceMode("desktop")}
                className={`p-2 rounded-md transition ${deviceMode === "desktop" ? "bg-gray-700 shadow-md" : "hover:bg-gray-700/50"
                  }`}
              >
                <Monitor className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDeviceMode("tablet")}
                className={`p-2 rounded-md transition ${deviceMode === "tablet" ? "bg-gray-700 shadow-md" : "hover:bg-gray-700/50"
                  }`}
              >
                <Tablet className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDeviceMode("mobile")}
                className={`p-2 rounded-md transition ${deviceMode === "mobile" ? "bg-gray-700 shadow-md" : "hover:bg-gray-700/50"
                  }`}
              >
                <Smartphone className="w-4 h-4" />
              </button>
            </div>
            <Button
              onClick={() => setPreviewMode(false)}
              variant="outline"
              size="sm"
              className="bg-white text-gray-900 border-none hover:bg-gray-100"
            >
              Cerrar Preview
            </Button>
          </div>
        </div>

        {/* Preview Canvas */}
        <div className="flex-1 overflow-auto bg-gray-100">
          <div
            className="bg-white min-h-full"
            style={{
              width: deviceMode === "desktop" ? "100%" : `${getDeviceWidth()}px`,
              margin: deviceMode === "desktop" ? "0" : "0 auto"
            }}
          >
            {components.map((component) => (
              <ComponentRenderer
                key={component.id}
                component={component}
                isSelected={false}
                onSelect={() => { }}
                deviceMode={deviceMode}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn(
        "fixed inset-0 flex flex-col bg-gray-50 transition-all duration-300",
        sidebarCollapsed ? "md:left-20" : "md:left-64"
      )}>
        {/* Top Toolbar */}
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                onClick={() => router.push("/dashboard/pages")}
                variant="ghost"
                size="sm"
                className="hover:bg-gray-100"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver
              </Button>
              <div className="border-l border-gray-300 h-6"></div>
              <h2 className="text-base font-semibold text-gray-900">
                {pagina?.titulo || "Sin título"}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {/* Device Mode Selector */}
              <div className="flex bg-gray-100 rounded-lg p-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setDeviceMode("desktop")}
                      className={`p-2 rounded-md transition ${deviceMode === "desktop" ? "bg-white shadow-sm" : "hover:bg-gray-200"
                        }`}
                    >
                      <Monitor className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Desktop</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setDeviceMode("tablet")}
                      className={`p-2 rounded-md transition ${deviceMode === "tablet" ? "bg-white shadow-sm" : "hover:bg-gray-200"
                        }`}
                    >
                      <Tablet className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Tablet (768px)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setDeviceMode("mobile")}
                      className={`p-2 rounded-md transition ${deviceMode === "mobile" ? "bg-white shadow-sm" : "hover:bg-gray-200"
                        }`}
                    >
                      <Smartphone className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Mobile (375px)</TooltipContent>
                </Tooltip>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleZoomOut}
                      disabled={zoom <= 50}
                      className="p-2 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Alejar (Ctrl + -)</TooltipContent>
                </Tooltip>

                <span className="text-sm text-gray-600 px-3 min-w-[55px] text-center font-medium">
                  {zoom}%
                </span>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleZoomIn}
                      disabled={zoom >= 200}
                      className="p-2 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Acercar (Ctrl + +)</TooltipContent>
                </Tooltip>
              </div>

              {/* History Controls */}
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleUndo}
                      disabled={historyIndex <= 0}
                      variant="outline"
                      size="sm"
                      className="hover:bg-gray-100"
                    >
                      <Undo className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Deshacer (Ctrl + Z)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleRedo}
                      disabled={historyIndex >= history.length - 1}
                      variant="outline"
                      size="sm"
                      className="hover:bg-gray-100"
                    >
                      <Redo className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Rehacer (Ctrl + Shift + Z)</TooltipContent>
                </Tooltip>
              </div>

              <div className="border-l border-gray-300 h-6"></div>

              {/* Preview, Save & Publish */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handlePreview}
                    variant="outline"
                    size="sm"
                    className="hover:bg-gray-100"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Preview
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Vista previa (sin editor)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    variant="outline"
                    size="sm"
                    className="hover:bg-blue-50 hover:border-blue-300"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? "Guardando..." : "Guardar"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Guardar cambios (Ctrl + S)</TooltipContent>
              </Tooltip>

              <Button
                onClick={() => setPublishDialogOpen(true)}
                className="bg-green-600 hover:bg-green-700 shadow-sm"
                size="sm"
              >
                <Globe className="w-4 h-4 mr-2" />
                Publicar
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content - Full Width Canvas with Right Sidebar */}
        <div className="flex-1 flex overflow-hidden">
          {/* Canvas - Full Width & Height */}
          <div className="flex-1 overflow-auto bg-gray-100">
            <div
              className="h-full w-full"
              style={getCanvasContainerStyle()}
            >
              <div
                className="bg-white transition-all duration-300 w-full min-h-full"
                style={getCanvasStyle()}
              >
                {components.length === 0 ? (
                  <div className="flex items-center justify-center min-h-[600px] text-center p-12">
                    <div>
                      <div className="text-6xl mb-6">🎨</div>
                      <p className="text-gray-700 text-xl mb-2 font-medium">Canvas Vacío</p>
                      <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed">
                        Comienza añadiendo componentes desde el panel de la derecha para crear tu página profesional
                      </p>
                    </div>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    <div
                      onClick={() => setSelectedComponentId(null)}
                      className="relative w-full"
                      style={{ minHeight: "100vh", paddingBottom: "100px" }}
                    >
                      <div
                        onClick={() => setSelectedComponentId(null)}
                        style={{ minHeight: "100vh", paddingBottom: "100px" }}
                      >
                        {components.map((component) => (
                          <ComponentRenderer
                            key={component.id}
                            component={component}
                            isSelected={component.id === selectedComponentId}
                            onSelect={handleSelectComponent}
                            deviceMode={deviceMode}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Overlay para Feedback Visual al Arrastrar */}
                    <DragOverlay>
                      {activeComponentId ? (
                        <div className="opacity-80 scale-105 shadow-2xl pointer-events-none ring-2 ring-blue-500 rounded-md">
                          <ComponentRenderer
                            component={findComponentById(components, activeComponentId)!}
                            isSelected={true}
                            onSelect={() => { }}
                            deviceMode={deviceMode}
                            isOverlay={true}
                          />
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar - Unified Tabs Panel */}
          <Tabs defaultValue="componentes" className="w-80 border-l border-gray-200 bg-white flex flex-col">
            <TabsList className="w-full rounded-none border-b border-gray-200 bg-gray-50 h-12 p-0">
              <TabsTrigger
                value="componentes"
                className="flex-1 rounded-none data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-600 h-full text-xs"
              >
                Componentes
              </TabsTrigger>
              <TabsTrigger
                value="propiedades"
                className="flex-1 rounded-none data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-600 h-full text-xs"
                disabled={!selectedComponent}
              >
                Propiedades
              </TabsTrigger>
              <TabsTrigger
                value="avanzado"
                className="flex-1 rounded-none data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-600 h-full text-xs"
              >
                Avanzado
              </TabsTrigger>
            </TabsList>

            <TabsContent value="componentes" className="flex-1 m-0 overflow-hidden">
              <ComponentLibrary onAddComponent={handleAddComponent} />
            </TabsContent>

            <TabsContent value="propiedades" className="flex-1 m-0 overflow-hidden">
              {selectedComponent ? (
                <EnhancedPropertiesPanel
                  component={selectedComponent}
                  onUpdateProps={handleUpdateProps}
                  onDelete={handleDeleteComponent}
                  isCollapsed={false}
                  onToggleCollapse={() => { }}
                />
              ) : (
                <div className="flex items-center justify-center h-full p-6 text-center">
                  <div className="text-gray-400">
                    <p className="text-sm">Selecciona un componente para ver sus propiedades</p>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="avanzado" className="flex-1 m-0 overflow-hidden">
              <div className="h-full overflow-y-auto p-4 space-y-6">
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Scripts & Tracking</h3>
                  <p className="text-xs text-muted-foreground">
                    Agrega scripts personalizados y códigos de seguimiento a tu página
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="scriptsHead" className="text-sm font-medium">
                      Scripts en &lt;head&gt;
                    </Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Scripts que se cargan antes de renderizar la página (Meta Pixel, GA4, etc.)
                    </p>
                    <textarea
                      id="scriptsHead"
                      value={scriptsHead}
                      onChange={(e) => setScriptsHead(e.target.value)}
                      placeholder={`<!-- Meta Pixel Code -->
<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', 'TU_PIXEL_ID');
</script>
<!-- End Meta Pixel Code -->`}
                      className="min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scriptsBody" className="text-sm font-medium">
                      Scripts al final de &lt;body&gt;
                    </Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Scripts que se cargan después del contenido (widgets, chatbots, etc.)
                    </p>
                    <textarea
                      id="scriptsBody"
                      value={scriptsBody}
                      onChange={(e) => setScriptsBody(e.target.value)}
                      placeholder={`<!-- Ejemplo: Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>`}
                      className="min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <p className="text-xs text-blue-800">
                      <strong>💡 Tip:</strong> Si ya configuraste integraciones en la sección de Integraciones,
                      puedes usar aquí los códigos de seguimiento. Asegúrate de reemplazar los IDs de ejemplo
                      con tus propios valores.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Publish Dialog */}
        <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Publicar Página</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="subdominio">Subdominio Volkern</Label>
                <div className="flex gap-2 items-center mt-2">
                  <Input
                    id="subdominio"
                    value={publishData.subdominio}
                    onChange={(e) =>
                      setPublishData({
                        ...publishData,
                        subdominio: e.target.value,
                      })
                    }
                    placeholder="mi-empresa"
                  />
                  <span className="text-sm text-gray-500 whitespace-nowrap">
                    .volkern.app
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => setPublishDialogOpen(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handlePublish}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  Publicar Ahora
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
