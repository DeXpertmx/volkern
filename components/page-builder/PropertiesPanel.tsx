
"use client";

import { PageComponent } from "@/lib/page-builder";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface PropertiesPanelProps {
  component: PageComponent | null;
  onUpdateProps: (props: Record<string, any>) => void;
  onDelete: () => void;
}

export function PropertiesPanel({
  component,
  onUpdateProps,
  onDelete,
}: PropertiesPanelProps) {
  if (!component) {
    return (
      <div className="w-80 bg-white border-l border-gray-200 p-6">
        <p className="text-center text-gray-500">
          Selecciona un componente para editar sus propiedades
        </p>
      </div>
    );
  }

  const updateProp = (key: string, value: any) => {
    onUpdateProps({ ...component.props, [key]: value });
  };

  const renderProperties = () => {
    const { type, props } = component;

    // Common properties for most components
    const commonFields = (
      <div className="space-y-4">
        {props.padding !== undefined && (
          <div>
            <Label>Padding</Label>
            <Input
              value={props.padding || ""}
              onChange={(e) => updateProp("padding", e.target.value)}
              placeholder="20px"
            />
          </div>
        )}
        {props.margin !== undefined && (
          <div>
            <Label>Margin</Label>
            <Input
              value={props.margin || ""}
              onChange={(e) => updateProp("margin", e.target.value)}
              placeholder="0"
            />
          </div>
        )}
        {props.backgroundColor !== undefined && (
          <div>
            <Label>Color de Fondo</Label>
            <Input
              type="color"
              value={props.backgroundColor || "#ffffff"}
              onChange={(e) => updateProp("backgroundColor", e.target.value)}
            />
          </div>
        )}
      </div>
    );

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
                rows={4}
              />
            </div>
            {type === "heading" && (
              <div>
                <Label>Nivel</Label>
                <Select
                  value={props.level || "h2"}
                  onValueChange={(value) => updateProp("level", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="h1">H1</SelectItem>
                    <SelectItem value="h2">H2</SelectItem>
                    <SelectItem value="h3">H3</SelectItem>
                    <SelectItem value="h4">H4</SelectItem>
                    <SelectItem value="h5">H5</SelectItem>
                    <SelectItem value="h6">H6</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Tamaño de Fuente</Label>
              <Input
                value={props.fontSize || ""}
                onChange={(e) => updateProp("fontSize", e.target.value)}
                placeholder="16px"
              />
            </div>
            <div>
              <Label>Color</Label>
              <Input
                type="color"
                value={props.color || "#1f2937"}
                onChange={(e) => updateProp("color", e.target.value)}
              />
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
                  <SelectItem value="300">Ligera</SelectItem>
                  <SelectItem value="400">Normal</SelectItem>
                  <SelectItem value="600">Semi-Bold</SelectItem>
                  <SelectItem value="700">Bold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Alineación</Label>
              <Select
                value={props.textAlign || "left"}
                onValueChange={(value) => updateProp("textAlign", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Izquierda</SelectItem>
                  <SelectItem value="center">Centro</SelectItem>
                  <SelectItem value="right">Derecha</SelectItem>
                  <SelectItem value="justify">Justificado</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            </div>
            <div>
              <Label>Texto Alternativo</Label>
              <Input
                value={props.alt || ""}
                onChange={(e) => updateProp("alt", e.target.value)}
                placeholder="Descripción de la imagen"
              />
            </div>
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
                  <SelectItem value="cover">Cover</SelectItem>
                  <SelectItem value="contain">Contain</SelectItem>
                  <SelectItem value="fill">Fill</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Border Radius</Label>
              <Input
                value={props.borderRadius || ""}
                onChange={(e) => updateProp("borderRadius", e.target.value)}
                placeholder="0px"
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
              <Label>Enlace</Label>
              <Input
                value={props.link || ""}
                onChange={(e) => updateProp("link", e.target.value)}
                placeholder="#"
              />
            </div>
            <div>
              <Label>Color de Fondo</Label>
              <Input
                type="color"
                value={props.backgroundColor || "#3b82f6"}
                onChange={(e) => updateProp("backgroundColor", e.target.value)}
              />
            </div>
            <div>
              <Label>Color de Texto</Label>
              <Input
                type="color"
                value={props.color || "#ffffff"}
                onChange={(e) => updateProp("color", e.target.value)}
              />
            </div>
            <div>
              <Label>Padding</Label>
              <Input
                value={props.padding || ""}
                onChange={(e) => updateProp("padding", e.target.value)}
                placeholder="12px 24px"
              />
            </div>
            <div>
              <Label>Border Radius</Label>
              <Input
                value={props.borderRadius || ""}
                onChange={(e) => updateProp("borderRadius", e.target.value)}
                placeholder="6px"
              />
            </div>
          </div>
        );

      case "spacer":
        return (
          <div className="space-y-4">
            <div>
              <Label>Altura</Label>
              <Input
                value={props.height || ""}
                onChange={(e) => updateProp("height", e.target.value)}
                placeholder="40px"
              />
            </div>
          </div>
        );

      case "lead_form":
        return (
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
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
                rows={2}
              />
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
              <Label>Color del Botón</Label>
              <Input
                type="color"
                value={props.colorBoton || "#10b981"}
                onChange={(e) => updateProp("colorBoton", e.target.value)}
              />
            </div>
          </div>
        );

      case "hero":
        return (
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input
                value={props.titulo || ""}
                onChange={(e) => updateProp("titulo", e.target.value)}
              />
            </div>
            <div>
              <Label>Subtítulo</Label>
              <Input
                value={props.subtitulo || ""}
                onChange={(e) => updateProp("subtitulo", e.target.value)}
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea
                value={props.descripcion || ""}
                onChange={(e) => updateProp("descripcion", e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <Label>Imagen de Fondo</Label>
              <Input
                value={props.imagenFondo || ""}
                onChange={(e) => updateProp("imagenFondo", e.target.value)}
                placeholder="URL de imagen"
              />
            </div>
            <div>
              <Label>Texto del Botón</Label>
              <Input
                value={props.textoBoton || ""}
                onChange={(e) => updateProp("textoBoton", e.target.value)}
              />
            </div>
          </div>
        );

      case "section":
      case "container":
        return commonFields;

      default:
        return (
          <div className="text-gray-500 text-sm">
            Propiedades no disponibles para este componente
          </div>
        );
    }
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-gray-900">Propiedades</h3>
          <p className="text-xs text-gray-500 mt-1">{component.type}</p>
        </div>
        <Button
          onClick={onDelete}
          variant="ghost"
          size="sm"
          className="text-red-600 hover:text-red-700"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="p-4">{renderProperties()}</div>
    </div>
  );
}
