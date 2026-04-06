
"use client";

import { useState, useEffect } from "react";
import { PageComponent } from "@/lib/page-builder";
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
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Trash2,
  ChevronLeft,
  ChevronRight,
  Palette,
  Layout,
  Type,
  Image as ImageIcon,
  MousePointer2,
  Layers,
  Maximize,
  Move,
  ChevronDown,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { VisualSpacingInput } from "./VisualSpacingInput";
import { ShadowBuilder } from "./ShadowBuilder";
import { GradientPicker } from "./GradientPicker";

interface EnhancedPropertiesPanelProps {
  component: PageComponent | null;
  onUpdateProps: (props: Record<string, any>) => void;
  onDelete: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function EnhancedPropertiesPanel({
  component,
  onUpdateProps,
  onDelete,
  isCollapsed,
  onToggleCollapse,
}: EnhancedPropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState("content");
  const [servicios, setServicios] = useState<any[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    layout: false, // Initialize layout section as collapsed
  });

  const toggleSection = (sectionName: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionName]: !prev[sectionName],
    }));
  };

  useEffect(() => {
    // Load services for calendar and payment components
    if (component?.type === "booking_calendar" || component?.type === "payment_button") {
      cargarServicios();
    }
  }, [component?.type]);

  const cargarServicios = async () => {
    try {
      const response = await fetch("/api/servicios");
      if (response.ok) {
        const data = await response.json();
        setServicios(data);
      }
    } catch (error) {
      console.error("Error cargando servicios:", error);
    }
  };



  if (!component) {
    return (
      <div className="w-full bg-white flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-center text-gray-500 text-sm">
            Selecciona un componente para editar sus propiedades
          </p>
        </div>
      </div>
    );
  }

  const updateProp = (key: string, value: any) => {
    onUpdateProps({ ...component.props, [key]: value });
  };

  const renderContentTab = () => {
    const { type, props } = component;

    switch (type) {
      case "text":
      case "heading":
      case "paragraph":
        return (
          <div className="space-y-4">
            <div>
              <Label>Contenido</Label>
              <Textarea
                value={props.content || ""}
                onChange={(e) => updateProp("content", e.target.value)}
                rows={6}
                className="resize-none"
              />
            </div>
            {type === "heading" && (
              <div>
                <Label>Nivel del Título</Label>
                <Select
                  value={props.level || "h2"}
                  onValueChange={(value) => updateProp("level", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="h1">H1 - Principal</SelectItem>
                    <SelectItem value="h2">H2 - Sección</SelectItem>
                    <SelectItem value="h3">H3 - Subsección</SelectItem>
                    <SelectItem value="h4">H4 - Menor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        );

      case "image":
        return (
          <div className="space-y-4">
            <div>
              <Label>URL de Imagen</Label>
              <Input
                value={props.src || ""}
                onChange={(e) => updateProp("src", e.target.value)}
                placeholder="https://..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Pega la URL de tu imagen
              </p>
            </div>
            <div>
              <Label>Texto Alternativo (SEO)</Label>
              <Input
                value={props.alt || ""}
                onChange={(e) => updateProp("alt", e.target.value)}
                placeholder="Descripción de la imagen"
              />
            </div>
          </div>
        );

      case "button":
        return (
          <div className="space-y-4">
            <div>
              <Label>Texto del Botón</Label>
              <Input
                value={props.text || ""}
                onChange={(e) => updateProp("text", e.target.value)}
                placeholder="Haz Clic Aquí"
              />
            </div>
            <div>
              <Label>Enlace de Destino</Label>
              <Input
                value={props.link || ""}
                onChange={(e) => updateProp("link", e.target.value)}
                placeholder="#contacto"
              />
              <p className="text-xs text-gray-500 mt-1">
                Usa # para anclas internas o URLs completas
              </p>
            </div>
          </div>
        );

      case "lead_form":
        return (
          <div className="space-y-4">
            <div>
              <Label>Título del Formulario</Label>
              <Input
                value={props.titulo || ""}
                onChange={(e) => updateProp("titulo", e.target.value)}
                placeholder="¿Interesado?"
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea
                value={props.descripcion || ""}
                onChange={(e) => updateProp("descripcion", e.target.value)}
                rows={3}
                placeholder="Déjanos tus datos y te contactaremos"
              />
            </div>

            <div className="border-t pt-4">
              <Label className="mb-3 block">Campos del Formulario</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="campo-nombre"
                    checked={props.campoNombre !== false}
                    onCheckedChange={(checked) => updateProp("campoNombre", checked)}
                  />
                  <label htmlFor="campo-nombre" className="text-sm">
                    Nombre completo
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="campo-email"
                    checked={props.campoEmail !== false}
                    onCheckedChange={(checked) => updateProp("campoEmail", checked)}
                  />
                  <label htmlFor="campo-email" className="text-sm">
                    Email (se enviará al CRM)
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="campo-telefono"
                    checked={props.campoTelefono !== false}
                    onCheckedChange={(checked) => updateProp("campoTelefono", checked)}
                  />
                  <label htmlFor="campo-telefono" className="text-sm">
                    Teléfono (se enviará al CRM)
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="campo-empresa"
                    checked={props.campoEmpresa || false}
                    onCheckedChange={(checked) => updateProp("campoEmpresa", checked)}
                  />
                  <label htmlFor="campo-empresa" className="text-sm">
                    Empresa
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="campo-mensaje"
                    checked={props.campoMensaje || false}
                    onCheckedChange={(checked) => updateProp("campoMensaje", checked)}
                  />
                  <label htmlFor="campo-mensaje" className="text-sm">
                    Mensaje
                  </label>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Los datos se enviarán automáticamente al CRM como nuevo lead
              </p>
            </div>

            <div>
              <Label>Texto del Botón</Label>
              <Input
                value={props.textoBoton || ""}
                onChange={(e) => updateProp("textoBoton", e.target.value)}
                placeholder="Enviar"
              />
            </div>
            <div>
              <Label>Mensaje de Éxito</Label>
              <Input
                value={props.mensajeExito || ""}
                onChange={(e) => updateProp("mensajeExito", e.target.value)}
                placeholder="¡Gracias! Te contactaremos pronto"
              />
            </div>
          </div>
        );

      case "booking_calendar":
        return (
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input
                value={props.titulo || ""}
                onChange={(e) => updateProp("titulo", e.target.value)}
                placeholder="Agenda una Cita"
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea
                value={props.descripcion || ""}
                onChange={(e) => updateProp("descripcion", e.target.value)}
                rows={2}
                placeholder="Selecciona el mejor horario para ti"
              />
            </div>

            <div className="border-t pt-4">
              <Label>Servicio Asociado</Label>
              <Select
                value={props.servicioId || ""}
                onValueChange={(value) => updateProp("servicioId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un servicio" />
                </SelectTrigger>
                <SelectContent>
                  {servicios.map((servicio) => (
                    <SelectItem key={servicio.id} value={servicio.id}>
                      {servicio.nombre} - {servicio.precio} {servicio.moneda}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                Las citas reservadas se registrarán en el CRM con el servicio y precio seleccionado
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label>Mostrar Precio en Calendario</Label>
              <Switch
                checked={props.mostrarPrecio || false}
                onCheckedChange={(checked) =>
                  updateProp("mostrarPrecio", checked)
                }
              />
            </div>

            <div>
              <Label>Duración de la Cita (minutos)</Label>
              <Input
                type="number"
                value={props.duracion || 60}
                onChange={(e) => updateProp("duracion", parseInt(e.target.value))}
                placeholder="60"
              />
            </div>
          </div>
        );

      case "payment_button":
        return (
          <div className="space-y-4">
            <div>
              <Label>Texto del Botón</Label>
              <Input
                value={props.texto || ""}
                onChange={(e) => updateProp("texto", e.target.value)}
                placeholder="Comprar Ahora"
              />
            </div>

            <div className="border-t pt-4">
              <Label>Producto/Servicio a Cobrar</Label>
              <Select
                value={props.servicioId || ""}
                onValueChange={(value) => {
                  const servicio = servicios.find((s) => s.id === value);
                  updateProp("servicioId", value);
                  if (servicio) {
                    updateProp("precio", servicio.precio);
                    updateProp("moneda", servicio.moneda);
                    updateProp("productoNombre", servicio.nombre);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona producto/servicio" />
                </SelectTrigger>
                <SelectContent>
                  {servicios.map((servicio) => (
                    <SelectItem key={servicio.id} value={servicio.id}>
                      {servicio.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                El pago se procesará mediante Stripe
              </p>
            </div>

            <div>
              <Label>Precio</Label>
              <Input
                type="number"
                value={props.precio || 0}
                onChange={(e) => updateProp("precio", parseFloat(e.target.value))}
                placeholder="0.00"
              />
            </div>

            <div>
              <Label>Moneda</Label>
              <Select
                value={props.moneda || "EUR"}
                onValueChange={(value) => updateProp("moneda", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MXN">MXN - Peso Mexicano</SelectItem>
                  <SelectItem value="USD">USD - Dólar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="COP">COP - Peso Colombiano</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-blue-50 p-3 rounded-md">
              <p className="text-xs text-blue-800">
                <strong>Vista Previa:</strong><br />
                {props.texto || "Comprar Ahora"} - {props.precio || 0} {props.moneda || "EUR"}
              </p>
            </div>
          </div>
        );

      case "hero":
        return (
          <div className="space-y-4">
            <div>
              <Label>Título Principal</Label>
              <Input
                value={props.titulo || ""}
                onChange={(e) => updateProp("titulo", e.target.value)}
                placeholder="Transforma Tu Negocio con Nuestra Solución"
              />
              <p className="text-xs text-gray-500 mt-1">
                El título principal del hero (H1)
              </p>
            </div>

            <div>
              <Label>Subtítulo</Label>
              <Input
                value={props.subtitulo || ""}
                onChange={(e) => updateProp("subtitulo", e.target.value)}
                placeholder="La plataforma todo-en-uno para impulsar tu crecimiento"
              />
              <p className="text-xs text-gray-500 mt-1">
                Subtítulo secundario (H2)
              </p>
            </div>

            <div>
              <Label>Descripción</Label>
              <Textarea
                value={props.descripcion || ""}
                onChange={(e) => updateProp("descripcion", e.target.value)}
                rows={4}
                placeholder="Descubre cómo miles de empresas están automatizando sus procesos..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Descripción detallada que aparece debajo del subtítulo
              </p>
            </div>

            <div className="border-t pt-4">
              <Label>Texto del Botón</Label>
              <Input
                value={props.textoBoton || ""}
                onChange={(e) => updateProp("textoBoton", e.target.value)}
                placeholder="Comenzar Gratis"
              />
            </div>

            <div>
              <Label>Enlace del Botón</Label>
              <Input
                value={props.linkBoton || ""}
                onChange={(e) => updateProp("linkBoton", e.target.value)}
                placeholder="#contacto o https://..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Usa # para anclas internas o URLs completas
              </p>
            </div>

            <div className="border-t pt-4">
              <Label>Imagen de Fondo</Label>
              <Input
                value={props.imagenFondo || ""}
                onChange={(e) => updateProp("imagenFondo", e.target.value)}
                placeholder="https://images.unsplash.com/photo-1673526759327-54f1f5b27322?fm=jpg&q=60&w=3000&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8Z3JhZGllbnQlMjBwdXJwbGV8ZW58MHx8MHx8fDA%3D o deja vacío para gradiente"
              />
              <p className="text-xs text-gray-500 mt-1">
                URL de la imagen de fondo. Si se deja vacío, se usará un gradiente morado
              </p>
            </div>

            <div className="bg-blue-50 p-3 rounded-md">
              <p className="text-xs text-blue-800">
                <strong>💡 Consejo:</strong> Para mejores resultados, usa imágenes de alta resolución (mínimo 1920x1080px) y asegúrate de que el texto sea legible sobre la imagen.
              </p>
            </div>
          </div>
        );

      default:
        return (
          <div className="text-sm text-gray-500">
            No hay propiedades de contenido para este componente
          </div>
        );
    }
  };

  const renderStylesTab = () => {
    const { props } = component;

    return (
      <div className="space-y-4">
        {/* Typography Styles */}
        {(component.type === "text" ||
          component.type === "heading" ||
          component.type === "paragraph" ||
          component.type === "button") && (
            <>
              <div>
                <Label>Tamaño de Fuente</Label>
                <div className="flex gap-2 items-center">
                  <Slider
                    value={[parseInt(props.fontSize) || 16]}
                    onValueChange={(value) => updateProp("fontSize", `${value[0]}px`)}
                    min={8}
                    max={72}
                    step={1}
                    className="flex-1"
                  />
                  <Input
                    type="text"
                    value={props.fontSize || "16px"}
                    onChange={(e) => updateProp("fontSize", e.target.value)}
                    className="w-20"
                  />
                </div>
              </div>

              <div>
                <Label>Color de Texto</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={props.color || "#1f2937"}
                    onChange={(e) => updateProp("color", e.target.value)}
                    className="w-16 h-10 p-1"
                  />
                  <Input
                    type="text"
                    value={props.color || "#1f2937"}
                    onChange={(e) => updateProp("color", e.target.value)}
                    className="flex-1"
                    placeholder="#1f2937"
                  />
                </div>
              </div>

              <div>
                <Label>Peso de Fuente</Label>
                <Select
                  value={props.fontWeight || "400"}
                  onValueChange={(value) => updateProp("fontWeight", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="300">Ligera (300)</SelectItem>
                    <SelectItem value="400">Normal (400)</SelectItem>
                    <SelectItem value="600">Semi-Bold (600)</SelectItem>
                    <SelectItem value="700">Bold (700)</SelectItem>
                    <SelectItem value="800">Extra Bold (800)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Alineación de Texto</Label>
                <div className="flex gap-2">
                  {["left", "center", "right", "justify"].map((align) => (
                    <Button
                      key={align}
                      type="button"
                      variant={props.textAlign === align ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => updateProp("textAlign", align)}
                    >
                      {align === "left" && "⬅"}
                      {align === "center" && "⬌"}
                      {align === "right" && "➡"}
                      {align === "justify" && "⬌⬌"}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}

        {/* Posicionamiento y Tamaño (Pixel Perfect) */}
        <div className="border-b border-gray-100 last:border-0">
          <button
            onClick={() => toggleSection("layout")}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Move className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-semibold text-gray-700">Posición y Tamaño (PX)</span>
            </div>
            {expandedSections.layout ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {expandedSections.layout && (
            <div className="px-4 pb-4 space-y-4 animate-in slide-in-from-top-1 duration-200">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">X (Izq)</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={props.x || 0}
                      onChange={(e) => updateProp("x", parseInt(e.target.value) || 0)}
                      className="h-8 pl-6 text-xs"
                    />
                    <span className="absolute left-2 top-1.5 text-[10px] text-gray-400">X</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Y (Top)</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={props.y || 0}
                      onChange={(e) => updateProp("y", parseInt(e.target.value) || 0)}
                      className="h-8 pl-6 text-xs"
                    />
                    <span className="absolute left-2 top-1.5 text-[10px] text-gray-400">Y</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Ancho</Label>
                  <div className="relative">
                    <Input
                      type="text"
                      value={props.width || "auto"}
                      onChange={(e) => updateProp("width", e.target.value)}
                      className="h-8 pl-7 text-xs"
                    />
                    <span className="absolute left-2 top-1.5 text-[10px] text-gray-400">W</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Alto</Label>
                  <div className="relative">
                    <Input
                      type="text"
                      value={props.height || "auto"}
                      onChange={(e) => updateProp("height", e.target.value)}
                      className="h-8 pl-7 text-xs"
                    />
                    <span className="absolute left-2 top-1.5 text-[10px] text-gray-400">H</span>
                  </div>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Z-Index (Capas)</Label>
                  <div className="flex items-center gap-3">
                    <Layers className="w-4 h-4 text-gray-400" />
                    <Input
                      type="number"
                      value={props.zIndex || 0}
                      onChange={(e) => updateProp("zIndex", parseInt(e.target.value) || 0)}
                      className="h-8 text-xs flex-1"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-blue-50/50 p-2 rounded-md border border-blue-100 flex items-start gap-2">
                <span className="text-[10px] text-blue-700 leading-tight">
                  💡 Puedes arrastrar y redimensionar los elementos directamente en el canvas.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Background & Colors */}
        {(component.type === "button" ||
          component.type === "section" ||
          component.type === "container" ||
          component.type === "lead_form" ||
          component.type === "payment_button") && (
            <>
              <div>
                <Label>Color de Fondo</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={props.backgroundColor || "#ffffff"}
                    onChange={(e) => updateProp("backgroundColor", e.target.value)}
                    className="w-16 h-10 p-1"
                  />
                  <Input
                    type="text"
                    value={props.backgroundColor || "#ffffff"}
                    onChange={(e) => updateProp("backgroundColor", e.target.value)}
                    className="flex-1"
                    placeholder="#ffffff"
                  />
                </div>
              </div>

              {component.type === "button" && (
                <div>
                  <Label>Color al Pasar Mouse (Hover)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={props.hoverBackgroundColor || props.backgroundColor || "#3b82f6"}
                      onChange={(e) =>
                        updateProp("hoverBackgroundColor", e.target.value)
                      }
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      type="text"
                      value={props.hoverBackgroundColor || ""}
                      onChange={(e) =>
                        updateProp("hoverBackgroundColor", e.target.value)
                      }
                      className="flex-1"
                      placeholder="Auto"
                    />
                  </div>
                </div>
              )}

              {/* Gradient Picker se muestra debajo de los colores solidos */}
              <div className="pt-2">
                <GradientPicker
                  value={props.backgroundImage || ""}
                  onChange={(val) => updateProp("backgroundImage", val)}
                />
              </div>
            </>
          )}

        {/* Spacing */}
        <div className="pt-2 border-t">
          <Label className="text-sm font-semibold mb-4 block">Modelo de Caja (Box Model)</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <VisualSpacingInput
              label="Margin (Externo)"
              value={props.margin || "0"}
              onChange={(val) => updateProp("margin", val)}
            />
            <VisualSpacingInput
              label="Padding (Interno)"
              value={props.padding || "0"}
              onChange={(val) => updateProp("padding", val)}
            />
          </div>
        </div>

        {/* Border Radius */}
        {(component.type === "button" ||
          component.type === "image" ||
          component.type === "video" ||
          component.type === "lead_form") && (
            <div>
              <Label>Border Radius (Esquinas Redondeadas)</Label>
              <div className="flex gap-2 items-center">
                <Slider
                  value={[parseInt(props.borderRadius) || 0]}
                  onValueChange={(value) =>
                    updateProp("borderRadius", `${value[0]}px`)
                  }
                  min={0}
                  max={50}
                  step={1}
                  className="flex-1"
                />
                <Input
                  type="text"
                  value={props.borderRadius || "0px"}
                  onChange={(e) => updateProp("borderRadius", e.target.value)}
                  className="w-20"
                />
              </div>
            </div>
          )}

        {/* Image/Video specific */}
        {component.type === "image" && (
          <>
            <div>
              <Label>Ancho</Label>
              <Input
                value={props.width || ""}
                onChange={(e) => updateProp("width", e.target.value)}
                placeholder="100%"
              />
            </div>
            <div>
              <Label>Ajuste de Objeto</Label>
              <Select
                value={props.objectFit || "cover"}
                onValueChange={(value) => updateProp("objectFit", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover">Cover (Cubrir)</SelectItem>
                  <SelectItem value="contain">Contain (Contener)</SelectItem>
                  <SelectItem value="fill">Fill (Llenar)</SelectItem>
                  <SelectItem value="none">None (Original)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Aspect Ratio</Label>
              <Select
                value={props.aspectRatio || "16/9"}
                onValueChange={(value) => updateProp("aspectRatio", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16/9">16:9 (Horizontal)</SelectItem>
                  <SelectItem value="4/3">4:3 (Clásico)</SelectItem>
                  <SelectItem value="1/1">1:1 (Cuadrado)</SelectItem>
                  <SelectItem value="3/4">3:4 (Vertical)</SelectItem>
                  <SelectItem value="21/9">21:9 (Ultra Wide)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {component.type === "spacer" && (
          <div>
            <Label>Altura del Espaciador</Label>
            <div className="flex gap-2 items-center">
              <Slider
                value={[parseInt(props.height) || 40]}
                onValueChange={(value) => updateProp("height", `${value[0]}px`)}
                min={10}
                max={200}
                step={10}
                className="flex-1"
              />
              <Input
                type="text"
                value={props.height || "40px"}
                onChange={(e) => updateProp("height", e.target.value)}
                className="w-20"
              />
            </div>
          </div>
        )}

        {component.type === "divider" && (
          <>
            <div>
              <Label>Color del Divisor</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={props.color || "#e5e7eb"}
                  onChange={(e) => updateProp("color", e.target.value)}
                  className="w-16 h-10 p-1"
                />
                <Input
                  type="text"
                  value={props.color || "#e5e7eb"}
                  onChange={(e) => updateProp("color", e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
            <div>
              <Label>Grosor</Label>
              <div className="flex gap-2 items-center">
                <Slider
                  value={[parseInt(props.height) || 1]}
                  onValueChange={(value) => updateProp("height", `${value[0]}px`)}
                  min={1}
                  max={10}
                  step={1}
                  className="flex-1"
                />
                <Input
                  type="text"
                  value={props.height || "1px"}
                  onChange={(e) => updateProp("height", e.target.value)}
                  className="w-20"
                />
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderAdvancedTab = () => {
    const { props } = component;

    return (
      <div className="space-y-4">
        <div>
          <Label>ID del Componente (Ancla)</Label>
          <Input
            value={props.id || ""}
            onChange={(e) => updateProp("id", e.target.value)}
            placeholder="seccion-contacto"
          />
          <p className="text-xs text-gray-500 mt-1">
            Úsalo para anclas de navegación (#id)
          </p>
        </div>

        <div>
          <Label>Clase CSS Personalizada</Label>
          <Input
            value={props.className || ""}
            onChange={(e) => updateProp("className", e.target.value)}
            placeholder="mi-clase-custom"
          />
        </div>

        <div className="pt-2 border-t space-y-4">
          <Label className="text-sm font-semibold">Diseño y Posicionamiento</Label>

          <div>
            <Label>Z-Index (Capa)</Label>
            <div className="flex gap-2 items-center">
              <Slider
                value={[props.zIndex || 0]}
                onValueChange={(value) => updateProp("zIndex", value[0])}
                min={0}
                max={100}
                step={1}
                className="flex-1"
              />
              <Input
                type="number"
                value={props.zIndex || 0}
                onChange={(e) => updateProp("zIndex", parseInt(e.target.value))}
                className="w-20"
              />
            </div>
          </div>

          <div>
            <Label>Opacidad ({Math.round((props.opacity !== undefined ? props.opacity : 1) * 100)}%)</Label>
            <Slider
              value={[props.opacity !== undefined ? props.opacity : 1]}
              onValueChange={(value) => updateProp("opacity", value[0])}
              min={0}
              max={1}
              step={0.01}
            />
          </div>

          <div className="pt-2">
            <ShadowBuilder
              value={props.boxShadow || "none"}
              onChange={(val) => updateProp("boxShadow", val)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Ancho de Borde</Label>
              <Input
                type="text"
                value={props.borderWidth || "0px"}
                onChange={(e) => updateProp("borderWidth", e.target.value)}
                placeholder="1px"
              />
            </div>
            <div>
              <Label>Estilo de Borde</Label>
              <Select
                value={props.borderStyle || "solid"}
                onValueChange={(value) => updateProp("borderStyle", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">Sólido</SelectItem>
                  <SelectItem value="dashed">Guiones</SelectItem>
                  <SelectItem value="dotted">Puntos</SelectItem>
                  <SelectItem value="double">Doble</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Color de Borde</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={props.borderColor || "#e5e7eb"}
                onChange={(e) => updateProp("borderColor", e.target.value)}
                className="w-12 h-10 p-1"
              />
              <Input
                type="text"
                value={props.borderColor || "#e5e7eb"}
                onChange={(e) => updateProp("borderColor", e.target.value)}
                className="flex-1 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Animation Options */}
        <div>
          <Label>Animación al Entrar</Label>
          <Select
            value={props.animation || "none"}
            onValueChange={(value) => updateProp("animation", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin Animación</SelectItem>
              <SelectItem value="fade">Fade In</SelectItem>
              <SelectItem value="slide-up">Slide Up</SelectItem>
              <SelectItem value="slide-left">Slide Left</SelectItem>
              <SelectItem value="zoom">Zoom In</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Visibility Options */}
        <div className="space-y-3 pt-2 border-t">
          <Label className="text-sm font-semibold">Visibilidad por Dispositivo</Label>
          <div className="flex items-center justify-between">
            <Label htmlFor="hide-mobile" className="text-sm font-normal">
              Ocultar en Móvil
            </Label>
            <Switch
              id="hide-mobile"
              checked={props.hideMobile || false}
              onCheckedChange={(checked) => updateProp("hideMobile", checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="hide-tablet" className="text-sm font-normal">
              Ocultar en Tablet
            </Label>
            <Switch
              id="hide-tablet"
              checked={props.hideTablet || false}
              onCheckedChange={(checked) => updateProp("hideTablet", checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="hide-desktop" className="text-sm font-normal">
              Ocultar en Desktop
            </Label>
            <Switch
              id="hide-desktop"
              checked={props.hideDesktop || false}
              onCheckedChange={(checked) => updateProp("hideDesktop", checked)}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Oculta componentes según el dispositivo del usuario para crear experiencias responsive personalizadas
          </p>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          Las opciones avanzadas permiten un control preciso sobre el comportamiento
          y apariencia del componente.
        </p>
      </div>
    );
  };

  return (
    <div className="w-full bg-white flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 flex justify-between items-center">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-700">
            {component.type.replace("_", " ").toUpperCase()}
          </p>
        </div>
        <Button
          onClick={onDelete}
          variant="ghost"
          size="sm"
          className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <TabsList className="w-full grid grid-cols-3 rounded-none border-b">
          <TabsTrigger value="content" className="text-xs">
            Contenido
          </TabsTrigger>
          <TabsTrigger value="styles" className="text-xs">
            Estilos
          </TabsTrigger>
          <TabsTrigger value="advanced" className="text-xs">
            Avanzado
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="content" className="p-4 m-0">
            {renderContentTab()}
          </TabsContent>

          <TabsContent value="styles" className="p-4 m-0">
            {renderStylesTab()}
          </TabsContent>

          <TabsContent value="advanced" className="p-4 m-0">
            {renderAdvancedTab()}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
