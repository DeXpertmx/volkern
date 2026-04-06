
'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';

// Importar React Quill dinámicamente para evitar SSR issues
const ReactQuill = dynamic(() => import('react-quill'), {
  ssr: false,
  loading: () => <div className="h-64 bg-muted animate-pulse rounded-md" />
});

interface EmailEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// Variables disponibles para insertar en emails
const EMAIL_VARIABLES = [
  { key: '{nombre}', label: 'Nombre del lead', description: 'Nombre completo' },
  { key: '{email}', label: 'Email', description: 'Correo electrónico' },
  { key: '{empresa}', label: 'Empresa', description: 'Nombre de la empresa' },
  { key: '{cargo}', label: 'Cargo', description: 'Puesto o cargo' },
  { key: '{telefono}', label: 'Teléfono', description: 'Número telefónico' },
  { key: '{link_agendamiento}', label: 'Link Agendamiento', description: 'URL para agendar citas' },
];

export function EmailEditor({ value, onChange, placeholder }: EmailEditorProps) {
  const [mounted, setMounted] = useState(false);
  const quillRef = useRef<any>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const insertVariable = (variable: string) => {
    // Simply append to the end of the content
    onChange(value + variable);
    toast.success(`Variable ${variable} insertada`);
  };

  const modules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ color: [] }, { background: [] }],
      [{ align: [] }],
      ['link', 'image'],
      ['clean']
    ]
  };

  const formats = [
    'header',
    'bold',
    'italic',
    'underline',
    'strike',
    'list',
    'bullet',
    'color',
    'background',
    'align',
    'link',
    'image'
  ];

  if (!mounted) {
    return <div className="h-64 bg-muted animate-pulse rounded-md" />;
  }

  return (
    <div className="space-y-4">
      {/* Variables disponibles */}
      <div className="border rounded-lg p-4 bg-muted/30">
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Copy className="h-4 w-4" />
          Variables Disponibles (clic para insertar)
        </h4>
        <div className="flex flex-wrap gap-2">
          {EMAIL_VARIABLES.map((variable) => (
            <button
              key={variable.key}
              type="button"
              onClick={() => insertVariable(variable.key)}
              className="group relative"
            >
              <Badge
                variant="secondary"
                className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                {variable.key}
              </Badge>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-popover text-popover-foreground text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 border">
                <div className="font-semibold">{variable.label}</div>
                <div className="text-muted-foreground">{variable.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="border rounded-lg overflow-hidden">
        <ReactQuill
          theme="snow"
          value={value}
          onChange={onChange}
          modules={modules}
          formats={formats}
          placeholder={placeholder || 'Escribe tu email aquí...'}
          className="bg-background"
          style={{ minHeight: '400px' }}
        />
      </div>

      {/* Info */}
      <p className="text-xs text-muted-foreground">
        💡 Las variables se reemplazarán automáticamente con los datos de cada lead al enviar
      </p>
    </div>
  );
}
