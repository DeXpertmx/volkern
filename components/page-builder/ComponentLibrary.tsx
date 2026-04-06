

"use client";

import { useState } from "react";
import {
  Layout,
  Type,
  Image as ImageIcon,
  Square,
  CreditCard,
  Calendar,
  Mail,
  Minus,
  MousePointer,
  FileText,
  AlignLeft,
  Menu,
  Share2,
  Video,
  MessageCircle,
  Instagram,
  Facebook,
  Youtube,
  Twitter,
  Linkedin,
} from "lucide-react";
import { COMPONENT_TYPES } from "@/lib/page-builder";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ComponentLibraryProps {
  onAddComponent: (type: string) => void;
}

// Reorganized component categories with professional icons
const componentCategories = [
  {
    name: "Layout",
    icon: Layout,
    color: "text-purple-600",
    components: [
      { type: COMPONENT_TYPES.SECTION, label: "Sección", icon: Square, emoji: "📦" },
      { type: COMPONENT_TYPES.CONTAINER, label: "Contenedor", icon: Square, emoji: "⬜" },
      { type: COMPONENT_TYPES.ROW, label: "Fila", icon: Layout, emoji: "➖" },
      { type: COMPONENT_TYPES.COLUMN, label: "Columna", icon: Layout, emoji: "▯" },
      { type: COMPONENT_TYPES.SPACER, label: "Espaciador", icon: Minus, emoji: "⬚" },
      { type: COMPONENT_TYPES.DIVIDER, label: "Separador", icon: Minus, emoji: "─" },
    ],
  },
  {
    name: "Texto",
    icon: Type,
    color: "text-blue-600",
    components: [
      { type: COMPONENT_TYPES.HEADING, label: "Título", icon: Type, emoji: "📝" },
      { type: COMPONENT_TYPES.TEXT, label: "Texto", icon: AlignLeft, emoji: "✏️" },
      { type: COMPONENT_TYPES.PARAGRAPH, label: "Párrafo", icon: FileText, emoji: "📄" },
    ],
  },
  {
    name: "Imágenes",
    icon: ImageIcon,
    color: "text-green-600",
    components: [
      { type: COMPONENT_TYPES.IMAGE, label: "Imagen", icon: ImageIcon, emoji: "🖼️" },
      { type: COMPONENT_TYPES.VIDEO, label: "Video", icon: Video, emoji: "🎥" },
      { type: COMPONENT_TYPES.HERO, label: "Hero Banner", icon: ImageIcon, emoji: "🎯" },
    ],
  },
  {
    name: "Botones",
    icon: MousePointer,
    color: "text-orange-600",
    components: [
      { type: COMPONENT_TYPES.BUTTON, label: "Botón", icon: MousePointer, emoji: "🔘" },
      { type: COMPONENT_TYPES.PAYMENT_BUTTON, label: "Botón de Pago", icon: CreditCard, emoji: "💳" },
    ],
  },
  {
    name: "Formularios",
    icon: Mail,
    color: "text-pink-600",
    components: [
      { type: COMPONENT_TYPES.LEAD_FORM, label: "Formulario Lead", icon: Mail, emoji: "📧" },
      { type: COMPONENT_TYPES.CONTACT, label: "Formulario Contacto", icon: MessageCircle, emoji: "💬" },
    ],
  },
  {
    name: "Integraciones CRM",
    icon: Calendar,
    color: "text-teal-600",
    components: [
      { type: COMPONENT_TYPES.BOOKING_CALENDAR, label: "Calendario", icon: Calendar, emoji: "📅" },
      { type: COMPONENT_TYPES.FEATURES, label: "Características", icon: Layout, emoji: "⭐" },
      { type: COMPONENT_TYPES.TESTIMONIALS, label: "Testimonios", icon: MessageCircle, emoji: "💬" },
      { type: COMPONENT_TYPES.PRICING, label: "Precios", icon: CreditCard, emoji: "💰" },
    ],
  },
];

export function ComponentLibrary({ onAddComponent }: ComponentLibraryProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>("Layout");

  return (
    <div className="w-full bg-white flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-gray-200">
        <p className="text-sm text-gray-600">
          Arrastra o haz clic para añadir
        </p>
      </div>

      {/* Categories */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          <TooltipProvider>
            {componentCategories.map((category) => {
              const CategoryIcon = category.icon;
              const isExpanded = expandedCategory === category.name;
              
              return (
                <div key={category.name} className="bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
                  {/* Category Header */}
                  <button
                    onClick={() => setExpandedCategory(isExpanded ? null : category.name)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-100 transition"
                  >
                    <div className="flex items-center gap-2">
                      <CategoryIcon className={`w-4 h-4 ${category.color}`} />
                      <span className="text-sm font-semibold text-gray-800">
                        {category.name}
                      </span>
                      <span className="text-xs text-gray-500">
                        ({category.components.length})
                      </span>
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-500 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Components List */}
                  {isExpanded && (
                    <div className="p-2 space-y-1 bg-white">
                      {category.components.map((component) => {
                        const Icon = component.icon;
                        
                        return (
                          <Tooltip key={component.type}>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => onAddComponent(component.type)}
                                className="w-full flex items-center gap-3 p-2.5 rounded hover:bg-blue-50 hover:border-blue-200 transition text-left group border border-transparent"
                              >
                                <div className="flex items-center justify-center w-8 h-8 rounded bg-gradient-to-br from-gray-100 to-gray-200 group-hover:from-blue-100 group-hover:to-blue-200 transition">
                                  <span className="text-lg">{component.emoji}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700 block truncate">
                                    {component.label}
                                  </span>
                                </div>
                                <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              <p className="font-medium">{component.label}</p>
                              <p className="text-xs text-gray-400 mt-1">Haz clic para añadir</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </TooltipProvider>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-600 text-center leading-relaxed">
          💡 <strong>Tip:</strong> Selecciona un componente para editar sus propiedades
        </p>
      </div>
    </div>
  );
}
