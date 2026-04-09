
'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Check, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';

// Definición de plantillas disponibles
const templates = [
  {
    id: 'classic',
    nombre: 'Classic',
    descripcion: 'Diseño tradicional con header curvo y foto centrada',
    preview: (colorPrimario: string, colorSecundario: string) => (
      <div className="w-full h-32 rounded-lg overflow-hidden border-2 border-gray-200 relative">
        <div
          className="h-12"
          style={{ background: `linear-gradient(135deg, ${colorPrimario} 0%, ${colorSecundario} 100%)` }}
        />
        <svg className="absolute top-10 w-full" viewBox="0 0 100 10" preserveAspectRatio="none">
          <path d="M0,5 Q50,0 100,5 L100,10 L0,10 Z" fill="white" />
        </svg>
        <div className="absolute top-6 left-1/2 -translate-x-1/2">
          <div
            className="w-12 h-12 rounded-full border-2 border-white"
            style={{ backgroundColor: colorPrimario }}
          />
        </div>
        <div className="absolute bottom-2 left-3 right-3">
          <div className="h-2 bg-gray-200 rounded mb-1" style={{ width: '60%' }} />
          <div className="h-1.5 bg-gray-100 rounded" style={{ width: '45%' }} />
        </div>
      </div>
    ),
  },
  {
    id: 'modern',
    nombre: 'Modern',
    descripcion: 'Diseño minimalista y limpio con grid de información',
    preview: (colorPrimario: string, colorSecundario: string) => (
      <div className="w-full h-32 rounded-lg overflow-hidden border-2 border-gray-200 bg-white p-3">
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-10 h-10 rounded-xl"
            style={{ backgroundColor: colorPrimario }}
          />
          <div className="flex-1">
            <div className="h-2 bg-gray-200 rounded mb-1" style={{ width: '70%' }} />
            <div className="h-1.5 bg-gray-100 rounded" style={{ width: '50%' }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-6 rounded-md"
              style={{ backgroundColor: `${colorPrimario}15` }}
            />
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'elegant',
    nombre: 'Elegant',
    descripcion: 'Diseño sofisticado con bordes dorados y tipografía serif',
    preview: (colorPrimario: string, colorSecundario: string) => (
      <div className="w-full h-32 rounded-lg overflow-hidden border-4 border-amber-300 bg-gradient-to-br from-white to-amber-50 p-3 relative">
        <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/5 to-transparent" />
        <div className="relative z-10 text-center mt-4">
          <div
            className="w-14 h-14 rounded-full mx-auto mb-2 border-2 border-amber-400"
            style={{ backgroundColor: colorPrimario }}
          />
          <div className="h-2 bg-gray-300 rounded mx-auto mb-1" style={{ width: '60%' }} />
          <div className="h-1.5 bg-gray-200 rounded mx-auto" style={{ width: '40%' }} />
        </div>
        <div className="absolute bottom-2 left-2 right-2 flex justify-center gap-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-6 h-6 rounded-full bg-amber-200" />
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'minimal',
    nombre: 'Minimal',
    descripcion: 'Diseño ultra-minimalista con espaciado generoso',
    preview: (colorPrimario: string, colorSecundario: string) => (
      <div className="w-full h-32 rounded-lg overflow-hidden border border-gray-300 bg-white p-4">
        <div className="flex flex-col items-center justify-center h-full space-y-3">
          <div
            className="w-12 h-12 rounded-lg"
            style={{ backgroundColor: colorPrimario }}
          />
          <div className="w-full space-y-1.5">
            <div className="h-2 bg-gray-200 rounded mx-auto" style={{ width: '65%' }} />
            <div className="h-1.5 bg-gray-100 rounded mx-auto" style={{ width: '45%' }} />
          </div>
          <div className="w-full border-t border-gray-200 pt-2">
            <div className="h-1.5 bg-gray-100 rounded" style={{ width: '100%' }} />
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'corporate',
    nombre: 'Corporate',
    descripcion: 'Diseño corporativo profesional con sidebar',
    preview: (colorPrimario: string, colorSecundario: string) => (
      <div className="w-full h-32 rounded-lg overflow-hidden border-2 border-gray-200 flex">
        <div
          className="w-8"
          style={{ background: `linear-gradient(180deg, ${colorPrimario} 0%, ${colorSecundario} 100%)` }}
        />
        <div className="flex-1 bg-white p-3">
          <div className="flex items-start gap-2 mb-3">
            <div
              className="w-8 h-8 rounded-md"
              style={{ backgroundColor: colorPrimario }}
            />
            <div className="flex-1">
              <div className="h-2 bg-gray-200 rounded mb-1" style={{ width: '75%' }} />
              <div className="h-1.5 bg-gray-100 rounded" style={{ width: '55%' }} />
            </div>
          </div>
          <div className="space-y-1.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-4 rounded"
                style={{ backgroundColor: `${colorPrimario}10` }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'bold',
    nombre: 'Bold',
    descripcion: 'Diseño audaz con colores vibrantes y alto contraste',
    preview: (colorPrimario: string, colorSecundario: string) => (
      <div className="w-full h-32 rounded-lg overflow-hidden border-4 border-black bg-black">
        <div
          className="h-12"
          style={{ background: `linear-gradient(45deg, ${colorPrimario} 0%, ${colorSecundario} 100%)` }}
        />
        <div className="bg-white p-3">
          <div className="flex items-center gap-2">
            <div
              className="w-10 h-10 rounded-full border-4 border-black"
              style={{ backgroundColor: colorPrimario }}
            />
            <div className="flex-1">
              <div className="h-2.5 bg-black rounded mb-1.5" style={{ width: '70%' }} />
              <div
                className="h-2 rounded"
                style={{ backgroundColor: colorPrimario, width: '50%' }}
              />
            </div>
          </div>
          <div className="mt-3 flex gap-1.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex-1 h-5 rounded-md"
                style={{ backgroundColor: colorPrimario }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'glass-pro',
    nombre: 'Glass Pro (2025)',
    descripcion: 'Efecto de cristal esmerilado con profundidad 3D y orbes de luz',
    preview: (colorPrimario: string, colorSecundario: string) => (
      <div className="w-full h-32 rounded-xl overflow-hidden border-2 border-white/50 bg-slate-50 relative p-3">
        <div className="absolute top-0 right-0 w-16 h-16 bg-blue-400/20 blur-xl rounded-full" />
        <div className="absolute bottom-0 left-0 w-16 h-16 bg-purple-400/20 blur-xl rounded-full" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-white shadow-sm border border-white" style={{ background: `linear-gradient(135deg, ${colorPrimario}, ${colorSecundario})` }} />
            <div className="flex-1">
              <div className="h-1.5 bg-slate-200 rounded w-3/4 mb-1" />
              <div className="h-1 bg-slate-100 rounded w-1/2" />
            </div>
          </div>
          <div className="space-y-1.5">
            {[1, 2].map(i => <div key={i} className="h-4 bg-white/60 rounded-lg border border-white/40" />)}
          </div>
        </div>
      </div>
    ),
  },
];

interface TemplateSelectorProps {
  currentTemplate: string;
  onSelect: (templateId: string) => void;
  colorPrimario: string;
  colorSecundario: string;
}

export function TemplateSelector({
  currentTemplate,
  onSelect,
  colorPrimario,
  colorSecundario,
}: TemplateSelectorProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onSelect(template.id)}
            className={cn(
              'relative group cursor-pointer transition-all duration-200',
              'hover:scale-105',
              currentTemplate === template.id && 'ring-2 ring-primary ring-offset-2 rounded-lg'
            )}
          >
            <div className="relative">
              {template.preview(colorPrimario, colorSecundario)}

              {/* Overlay de selección */}
              {currentTemplate === template.id && (
                <div className="absolute inset-0 bg-primary/10 rounded-lg flex items-center justify-center">
                  <div className="bg-primary text-white rounded-full p-2">
                    <Check className="w-5 h-5" />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 text-center">
              <h3 className="font-semibold text-sm">{template.nombre}</h3>
              <p className="text-xs text-gray-500 mt-1">{template.descripcion}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

interface ColorSelectorProps {
  label: string;
  color: string;
  onChange: (color: string) => void;
}

export function ColorSelector({ label, color, onChange }: ColorSelectorProps) {
  const presetColors = [
    '#3B82F6', // Blue
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#EF4444', // Red
    '#F59E0B', // Amber
    '#10B981', // Green
    '#06B6D4', // Cyan
    '#6366F1', // Indigo
    '#000000', // Black
    '#FFFFFF', // White
  ];

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="flex items-center gap-4">
        {/* Color personalizado */}
        <div className="relative">
          <input
            type="color"
            value={color}
            onChange={(e) => onChange(e.target.value)}
            className="w-16 h-16 rounded-lg cursor-pointer border-2 border-gray-200 hover:border-primary transition-colors"
          />
          <Palette className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-gray-600 pointer-events-none" />
        </div>

        {/* Colores predefinidos */}
        <div className="flex-1 flex flex-wrap gap-2">
          {presetColors.map((presetColor) => (
            <button
              key={presetColor}
              type="button"
              onClick={() => onChange(presetColor)}
              className={cn(
                'w-10 h-10 rounded-lg border-2 transition-all hover:scale-110',
                color === presetColor
                  ? 'border-primary ring-2 ring-primary ring-offset-2'
                  : 'border-gray-200'
              )}
              style={{ backgroundColor: presetColor }}
              title={presetColor}
            />
          ))}
        </div>
      </div>

      {/* Mostrar código hex */}
      <div className="text-sm text-gray-500 font-mono">{color}</div>
    </div>
  );
}

interface FontSelectorProps {
  font: string;
  onChange: (font: string) => void;
}

export function FontSelector({ font, onChange }: FontSelectorProps) {
  const fonts = [
    { id: 'Inter', nombre: 'Inter', preview: 'The quick brown fox' },
    { id: 'Roboto', nombre: 'Roboto', preview: 'The quick brown fox' },
    { id: 'Montserrat', nombre: 'Montserrat', preview: 'The quick brown fox' },
    { id: 'Playfair Display', nombre: 'Playfair', preview: 'The quick brown fox' },
    { id: 'Lato', nombre: 'Lato', preview: 'The quick brown fox' },
    { id: 'Open Sans', nombre: 'Open Sans', preview: 'The quick brown fox' },
  ];

  return (
    <div className="space-y-3">
      <Label>Tipografía</Label>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {fonts.map((fontOption) => (
          <Button
            key={fontOption.id}
            type="button"
            variant={font === fontOption.id ? 'default' : 'outline'}
            onClick={() => onChange(fontOption.id)}
            className="h-auto flex-col items-start p-4 space-y-1"
          >
            <span className="font-semibold text-sm">{fontOption.nombre}</span>
            <span
              className="text-xs opacity-70 w-full text-left"
              style={{ fontFamily: fontOption.id }}
            >
              {fontOption.preview}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}

interface BackgroundPatternSelectorProps {
  pattern: string;
  onChange: (pattern: string) => void;
  colorPrimario: string;
}

export function BackgroundPatternSelector({
  pattern,
  onChange,
  colorPrimario,
}: BackgroundPatternSelectorProps) {
  const patterns = [
    {
      id: 'none',
      nombre: 'Sin Patrón',
      preview: () => <div className="w-full h-20 bg-white rounded-lg border-2 border-gray-200" />,
    },
    {
      id: 'dots',
      nombre: 'Puntos',
      preview: () => (
        <div
          className="w-full h-20 rounded-lg border-2 border-gray-200"
          style={{
            backgroundImage: `radial-gradient(circle, ${colorPrimario}30 1.5px, transparent 1.5px)`,
            backgroundSize: '16px 16px',
            backgroundColor: 'white',
          }}
        />
      ),
    },
    {
      id: 'waves',
      nombre: 'Ondas',
      preview: () => (
        <div
          className="w-full h-20 rounded-lg border-2 border-gray-200"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='20' viewBox='0 0 100 20' xmlns='https://static.vecteezy.com/system/resources/thumbnails/004/798/915/small_2x/brush-stroke-colorful-curved-wave-lines-isolated-on-white-background-for-design-element-vector.jpg d='M0 10 Q 25 0, 50 10 T 100 10' stroke='${colorPrimario.replace('#', '%23')}' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            backgroundSize: '100px 20px',
            backgroundColor: 'white',
          }}
        />
      ),
    },
    {
      id: 'gradient',
      nombre: 'Degradado',
      preview: () => (
        <div
          className="w-full h-20 rounded-lg border-2 border-gray-200"
          style={{
            background: `linear-gradient(135deg, ${colorPrimario}15 0%, transparent 100%)`,
          }}
        />
      ),
    },
    {
      id: 'geometric',
      nombre: 'Geométrico',
      preview: () => (
        <div
          className="w-full h-20 rounded-lg border-2 border-gray-200"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='https://img.freepik.com/premium-vector/black-grid_1087825-630.jpg?semt=ais_incoming&w=740&q=80 fill='${colorPrimario.replace('#', '%23')}' fill-opacity='0.1'%3E%3Cpath d='M0 0h20v20H0V0zm20 20h20v20H20V20z'/%3E%3C/g%3E%3C/svg%3E")`,
            backgroundColor: 'white',
          }}
        />
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <Label>Patrón de Fondo</Label>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {patterns.map((patternOption) => (
          <button
            key={patternOption.id}
            type="button"
            onClick={() => onChange(patternOption.id)}
            className={cn(
              'group cursor-pointer transition-all',
              pattern === patternOption.id && 'ring-2 ring-primary ring-offset-2 rounded-lg'
            )}
          >
            <div className="relative">
              {patternOption.preview()}
              {pattern === patternOption.id && (
                <div className="absolute inset-0 bg-primary/10 rounded-lg flex items-center justify-center">
                  <div className="bg-primary text-white rounded-full p-1.5">
                    <Check className="w-4 h-4" />
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs font-medium text-center mt-2">
              {patternOption.nombre}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
