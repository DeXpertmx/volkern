
"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";

interface Template {
  id: string;
  nombre: string;
  descripcion?: string;
  categoria: string;
  imagenPreview?: string;
  contenido: any;
}

interface TemplatePreviewProps {
  template: Template;
  isSelected: boolean;
  onClick: () => void;
}

// Generate a visual preview based on template content
function generatePreviewThumbnail(template: Template) {
  const components = template.contenido?.components || [];
  
  // Determine the template type and style
  const hasHero = components.some((c: any) => c.type === "hero");
  const hasFeatures = components.some((c: any) => c.type === "features");
  const hasTestimonials = components.some((c: any) => c.type === "testimonials");
  const hasPricing = components.some((c: any) => c.type === "pricing");
  
  // Extract hero props if available
  const heroComponent = components.find((c: any) => c.type === "hero");
  const heroTitle = heroComponent?.props?.titulo || template.nombre;
  const heroSubtitle = heroComponent?.props?.subtitulo || template.descripcion || "";
  
  // Color scheme based on category
  const colorSchemes: Record<string, { bg: string; accent: string; text: string }> = {
    landing: { bg: "from-blue-500 to-blue-700", accent: "bg-blue-600", text: "text-blue-600" },
    servicio: { bg: "from-purple-500 to-purple-700", accent: "bg-purple-600", text: "text-purple-600" },
    membresia: { bg: "from-green-500 to-green-700", accent: "bg-green-600", text: "text-green-600" },
    curso: { bg: "from-orange-500 to-orange-700", accent: "bg-orange-600", text: "text-orange-600" },
  };
  
  const colors = colorSchemes[template.categoria] || colorSchemes.landing;
  
  return (
    <div className="w-full h-full bg-gray-50 rounded overflow-hidden text-[4px] leading-tight">
      {/* Hero Section Preview */}
      {hasHero && (
        <div className={`bg-gradient-to-r ${colors.bg} p-4 text-white`}>
          <div className="font-bold mb-1 text-[5px]">{heroTitle.substring(0, 40)}</div>
          <div className="text-[3px] opacity-90 mb-2">{heroSubtitle.substring(0, 60)}</div>
          <div className="bg-white/20 rounded px-2 py-1 inline-block text-[3px]">CTA Button</div>
        </div>
      )}
      
      {/* Features Section Preview */}
      {hasFeatures && (
        <div className="p-3 bg-white">
          <div className="text-center mb-2">
            <div className="font-semibold text-[4px] text-gray-800">Características</div>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="text-center">
                <div className={`w-3 h-3 ${colors.accent} rounded-full mx-auto mb-1`}></div>
                <div className="h-1 bg-gray-200 rounded w-full mb-0.5"></div>
                <div className="h-1 bg-gray-100 rounded w-3/4 mx-auto"></div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Testimonials Section Preview */}
      {hasTestimonials && (
        <div className="p-3 bg-gray-50">
          <div className="text-center mb-2">
            <div className="font-semibold text-[4px] text-gray-800">Testimonios</div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded p-1.5">
                <div className="h-1 bg-gray-200 rounded w-full mb-0.5"></div>
                <div className="h-1 bg-gray-100 rounded w-4/5 mb-1"></div>
                <div className="flex items-center gap-0.5">
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
                  <div className="h-0.5 bg-gray-200 rounded w-3"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Pricing Section Preview */}
      {hasPricing && (
        <div className="p-3 bg-white">
          <div className="text-center mb-2">
            <div className="font-semibold text-[4px] text-gray-800">Planes</div>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`rounded p-1.5 ${i === 2 ? `${colors.accent} text-white` : "bg-gray-100"}`}>
                <div className={`h-1 ${i === 2 ? "bg-white/50" : "bg-gray-300"} rounded w-2/3 mb-1`}></div>
                <div className={`text-[5px] font-bold mb-1`}>$99</div>
                <div className={`h-0.5 ${i === 2 ? "bg-white/30" : "bg-gray-200"} rounded w-full mb-0.5`}></div>
                <div className={`h-0.5 ${i === 2 ? "bg-white/30" : "bg-gray-200"} rounded w-full mb-0.5`}></div>
                <div className={`mt-1 h-1.5 ${i === 2 ? "bg-white" : colors.accent} rounded text-[3px]`}></div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Generic content if no specific sections */}
      {!hasHero && !hasFeatures && !hasTestimonials && !hasPricing && (
        <div className="p-4">
          <div className="h-8 bg-gradient-to-r from-gray-200 to-gray-300 rounded mb-2"></div>
          <div className="space-y-1">
            <div className="h-1 bg-gray-200 rounded w-full"></div>
            <div className="h-1 bg-gray-200 rounded w-5/6"></div>
            <div className="h-1 bg-gray-200 rounded w-4/5"></div>
          </div>
        </div>
      )}
      
      {/* Footer indicator */}
      <div className="bg-gray-800 p-1.5">
        <div className="h-0.5 bg-gray-600 rounded w-1/2 mx-auto"></div>
      </div>
    </div>
  );
}

export function TemplatePreview({ template, isSelected, onClick }: TemplatePreviewProps) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-lg ${
        isSelected ? "ring-2 ring-blue-500 shadow-lg" : ""
      }`}
      onClick={onClick}
    >
      <div className="relative">
        {/* Template Preview Thumbnail */}
        <div className="aspect-video bg-white rounded-t-lg border-b">
          {generatePreviewThumbnail(template)}
        </div>
        
        {/* Selection Indicator */}
        {isSelected && (
          <div className="absolute top-2 right-2 bg-blue-600 rounded-full p-1">
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
        )}
      </div>
      
      <div className="p-4">
        <h4 className="font-semibold text-gray-900 mb-1">
          {template.nombre}
        </h4>
        <p className="text-sm text-gray-600 mb-2 line-clamp-2">
          {template.descripcion || "Plantilla profesional lista para usar"}
        </p>
        <Badge variant="secondary">{template.categoria}</Badge>
      </div>
    </Card>
  );
}
