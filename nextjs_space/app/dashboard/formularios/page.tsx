'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  FileText,
  Plus,
  Trash2,
  Eye,
  Loader2,
  ArrowLeft,
  Save,
  Settings,
  Clipboard,
  Check,
  Code,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiDelete, apiPatch } from '@/lib/api-client';
import { SurveyFormRenderer } from '@/components/public/SurveyFormRenderer';

// ─── Types ──────────────────────────────────────────────
type FieldType = 'text' | 'email' | 'comment' | 'dropdown' | 'checkbox' | 'radiogroup' | 'boolean';

type FormField = {
  name: string;
  type: FieldType;
  title: string;
  isRequired: boolean;
  placeholder?: string;
  choices?: string[];
  inputType?: string;
};

type WebForm = {
  id: string;
  name: string;
  config: any;
  pageId?: string;
  createdAt: string;
  updatedAt: string;
  _count?: { submissions: number };
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Texto corto',
  email: 'Email',
  comment: 'Texto largo',
  dropdown: 'Lista desplegable',
  checkbox: 'Casilla',
  radiogroup: 'Opción única',
  boolean: 'Sí/No',
};

const DEFAULT_SURVEY_JSON = {
  title: 'Nuevo Formulario',
  pages: [{
    name: 'page1',
    elements: [
      { type: 'text', name: 'nombre', title: 'Nombre', isRequired: true },
      { type: 'text', name: 'email', title: 'Email', isRequired: true, inputType: 'email' },
      { type: 'text', name: 'telefono', title: 'Teléfono' },
      { type: 'text', name: 'empresa', title: 'Empresa' },
      { type: 'comment', name: 'notas', title: 'Mensaje' },
    ],
  }],
};

// ─── Main Page ──────────────────────────────────────────
export default function FormulariosPage() {
  const router = useRouter();
  const [forms, setForms] = useState<WebForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedForm, setSelectedForm] = useState<WebForm | null>(null);
  const [editing, setEditing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchForms = useCallback(async () => {
    try {
      const res = await apiGet('/api/formularios');
      setForms(res.forms || []);
    } catch (e) {
      toast.error('Error al cargar formularios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchForms(); }, [fetchForms]);

  const handleCreate = async () => {
    try {
      const res = await apiPost('/api/formularios', { name: 'Nuevo Formulario', config: DEFAULT_SURVEY_JSON });
      toast.success('Formulario creado');
      await fetchForms();
      setSelectedForm(res.form);
      setEditing(true);
    } catch (e) {
      toast.error('Error al crear formulario');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este formulario y todas sus submissions?')) return;
    try {
      await apiDelete(`/api/formularios/${id}`);
      toast.success('Formulario eliminado');
      if (selectedForm?.id === id) {
        setSelectedForm(null);
        setEditing(false);
      }
      await fetchForms();
    } catch (e) {
      toast.error('Error al eliminar');
    }
  };

  // ─── List View ────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // ─── Editor View ──────────────────────────────────────
  if (editing && selectedForm) {
    return <FormEditor form={selectedForm} onBack={() => { setEditing(false); setSelectedForm(null); fetchForms(); }} />;
  }

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Formularios</h1>
          <p className="text-slate-400 mt-1">Crea formularios inteligentes con lógica condicional para capturar leads</p>
        </div>
        <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-500 gap-2 rounded-xl">
          <Plus className="w-4 h-4" />
          Nuevo Formulario
        </Button>
      </div>

      {/* Forms Grid */}
      {forms.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-900/30">
          <FileText className="w-12 h-12 text-slate-600 mb-4" />
          <p className="text-slate-400 text-lg mb-4">No tienes formularios aún</p>
          <Button onClick={handleCreate} variant="outline" className="gap-2 rounded-xl border-slate-700 text-slate-300">
            <Plus className="w-4 h-4" />
            Crear primer formulario
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {forms.map((form) => (
            <Card key={form.id} className="bg-slate-900 border-slate-800 p-5 hover:border-slate-700 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{form.name}</h3>
                    <p className="text-xs text-slate-500">
                      {form._count?.submissions || 0} submissions
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-4">
                Creado: {new Date(form.createdAt).toLocaleDateString()}
              </p>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-slate-400 hover:text-white text-xs"
                  onClick={() => { setSelectedForm(form); setEditing(true); }}
                >
                  <Settings className="w-3 h-3 mr-1" /> Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-slate-400 hover:text-blue-400 text-xs"
                  onClick={() => { setSelectedForm(form); setPreviewOpen(true); }}
                >
                  <Eye className="w-3 h-3 mr-1" /> Vista previa
                </Button>
                {(form._count?.submissions || 0) > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-slate-400 hover:text-purple-400 text-xs"
                    onClick={() => router.push(`/dashboard/formularios/${form.id}/submissions`)}
                  >
                    <Users className="w-3 h-3 mr-1" />
                    {form._count?.submissions}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-slate-400 hover:text-green-400 text-xs"
                  onClick={() => { setSelectedForm(form); setEmbedOpen(true); }}
                >
                  <Code className="w-3 h-3 mr-1" /> Embed
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-slate-400 hover:text-red-400 text-xs ml-auto"
                  onClick={() => handleDelete(form.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-slate-950 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">{selectedForm?.name}</DialogTitle>
          </DialogHeader>
          {selectedForm && (
            <SurveyFormRenderer
              surveyJson={selectedForm.config}
              submitUrl={`/api/formularios/${selectedForm.id}/submit`}
              className="rounded-xl"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Embed Dialog */}
      <Dialog open={embedOpen} onOpenChange={setEmbedOpen}>
        <DialogContent className="max-w-lg bg-slate-950 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">Código Embed</DialogTitle>
          </DialogHeader>
          {selectedForm && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Código React (WebCreator)</Label>
                <div className="relative">
                  <pre className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-xs text-slate-300 overflow-x-auto">
                    {`<SurveyFormRenderer
  surveyJson={${JSON.stringify(selectedForm.config, null, 2)}}
  submitUrl="/api/formularios/${selectedForm.id}/submit"
/>`}
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2 text-slate-400"
                    onClick={() => {
                      const code = `<SurveyFormRenderer\n  surveyJson={${JSON.stringify(selectedForm.config, null, 2)}}\n  submitUrl="/api/formularios/${selectedForm.id}/submit"\n/>`;
                      navigator.clipboard.writeText(code);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Clipboard className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">URL de embed (iframe)</Label>
                <div className="relative">
                  <Input
                    readOnly
                    value={`${window.location.origin}/api/formularios/${selectedForm.id}/submit`}
                    className="bg-slate-900 border-slate-800 text-slate-300 text-xs rounded-xl pr-20"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-1 right-1 text-slate-400 text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/formularios/${selectedForm.id}/submit`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? <Check className="w-3 h-3 text-green-400" /> : 'Copiar'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Form Editor Component ──────────────────────────────
function FormEditor({ form, onBack }: { form: WebForm; onBack: () => void }) {
  const [name, setName] = useState(form.name);
  const [surveyJson, setSurveyJson] = useState<any>(
    form.config?.pages ? form.config : DEFAULT_SURVEY_JSON
  );
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [showJSON, setShowJSON] = useState(false);
  const [jsonEdit, setJsonEdit] = useState('');

  // Get pages and elements from survey JSON
  const pages = surveyJson.pages || [surveyJson];
  const currentPage = pages[0] || { name: 'page1', elements: [] };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiPatch(`/api/formularios/${form.id}`, { name, config: surveyJson });
      toast.success('Formulario guardado');
    } catch (e) {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleAddField = (type: FieldType) => {
    const label = FIELD_TYPE_LABELS[type] || type;
    const newField: FormField = {
      type,
      name: `campo_${Date.now()}`,
      title: label,
      isRequired: false,
      placeholder: '',
    };

    if (type === 'dropdown' || type === 'radiogroup') {
      newField.choices = ['Opción 1', 'Opción 2', 'Opción 3'];
    }

    if (type === 'email') {
      newField.inputType = 'email';
    }

    const updatedJson = { ...surveyJson };
    if (!updatedJson.pages) {
      updatedJson.pages = [{ name: 'page1', elements: [] }];
    }
    updatedJson.pages[0].elements = [...updatedJson.pages[0].elements, newField];
    setSurveyJson(updatedJson);
  };

  const handleUpdateField = (index: number, updates: Partial<FormField>) => {
    const updatedJson = { ...surveyJson };
    if (!updatedJson.pages) {
      updatedJson.pages = [{ name: 'page1', elements: [] }];
    }
    const elements = [...updatedJson.pages[0].elements];
    elements[index] = { ...elements[index], ...updates };
    updatedJson.pages[0].elements = elements;
    setSurveyJson(updatedJson);
  };

  const handleRemoveField = (index: number) => {
    const updatedJson = { ...surveyJson };
    if (!updatedJson.pages) return;
    updatedJson.pages[0].elements = updatedJson.pages[0].elements.filter((_: any, i: number) => i !== index);
    setSurveyJson(updatedJson);
  };

  const handleMoveField = (fromIndex: number, direction: 'up' | 'down') => {
    const updatedJson = { ...surveyJson };
    if (!updatedJson.pages) return;
    const elements = [...updatedJson.pages[0].elements];
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= elements.length) return;
    [elements[fromIndex], elements[toIndex]] = [elements[toIndex], elements[fromIndex]];
    updatedJson.pages[0].elements = elements;
    setSurveyJson(updatedJson);
  };

  const handleUpdateJSON = () => {
    try {
      const parsed = JSON.parse(jsonEdit);
      setSurveyJson(parsed);
      setShowJSON(false);
      toast.success('JSON actualizado');
    } catch (e) {
      toast.error('JSON inválido');
    }
  };

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-4 h-4 mr-2" /> Volver
          </Button>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-xl font-bold text-white bg-transparent border-0 border-b-2 border-transparent hover:border-slate-700 focus:border-blue-500 rounded-none px-0 max-w-md"
            placeholder="Nombre del formulario"
          />
        </div>
        <div className="flex items-center gap-2">
          {previewMode ? (
            <Button onClick={() => setPreviewMode(false)} variant="outline" className="gap-2 rounded-xl">
              <Settings className="w-4 h-4" /> Editor
            </Button>
          ) : (
            <Button onClick={() => setPreviewMode(true)} variant="outline" className="gap-2 rounded-xl border-slate-700 text-slate-300">
              <Eye className="w-4 h-4" /> Vista previa
            </Button>
          )}
          <Button
            onClick={() => { setShowJSON(true); setJsonEdit(JSON.stringify(surveyJson, null, 2)); }}
            variant="outline"
            className="gap-2 rounded-xl border-slate-700 text-slate-300"
          >
            <Code className="w-4 h-4" /> JSON
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-500 gap-2 rounded-xl">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </Button>
        </div>
      </div>

      {previewMode ? (
        /* ─── Preview ─────────────────────────────── */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-white mb-6 text-center">{name}</h2>
          <SurveyFormRenderer
            surveyJson={surveyJson}
            submitUrl={`/api/formularios/${form.id}/submit`}
            className="rounded-xl"
          />
        </div>
      ) : (
        /* ─── Editor ──────────────────────────────── */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Field Palette */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="bg-slate-900 border-slate-800 p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Agregar campo</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(FIELD_TYPE_LABELS).map(([type, label]) => (
                  <Button
                    key={type}
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddField(type as FieldType)}
                    className="text-xs border-slate-700 text-slate-400 hover:text-white hover:border-blue-500/50 rounded-xl justify-start"
                  >
                    <Plus className="w-3 h-3 mr-1" /> {label}
                  </Button>
                ))}
              </div>
            </Card>

            <Card className="bg-slate-900 border-slate-800 p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-2">Campos ({currentPage.elements?.length || 0})</h3>
              <p className="text-xs text-slate-500">Haz clic en un campo para editarlo</p>
            </Card>
          </div>

          {/* Right: Field Editor */}
          <div className="lg:col-span-2 space-y-4">
            {/* Form config */}
            <Card className="bg-slate-900 border-slate-800 p-4">
              <Label className="text-slate-300 text-sm">Título del formulario</Label>
              <Input
                value={surveyJson.title || ''}
                onChange={(e) => setSurveyJson({ ...surveyJson, title: e.target.value })}
                className="bg-slate-950 border-slate-700 text-white rounded-xl mt-1"
                placeholder="Título que verán los usuarios"
              />
            </Card>

            {/* Fields */}
            {currentPage.elements?.map((field: FormField, index: number) => (
              <FieldEditor
                key={`${field.name}-${index}`}
                field={field}
                index={index}
                total={currentPage.elements.length}
                onUpdate={(updates) => handleUpdateField(index, updates)}
                onRemove={() => handleRemoveField(index)}
                onMove={(dir) => handleMoveField(index, dir)}
              />
            ))}

            {(!currentPage.elements || currentPage.elements.length === 0) && (
              <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-900/30">
                <p className="text-slate-500 mb-4">Agrega campos desde la paleta izquierda</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleAddField('text')} className="text-xs rounded-xl border-slate-700">
                    <Plus className="w-3 h-3 mr-1" /> Texto
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleAddField('email')} className="text-xs rounded-xl border-slate-700">
                    <Plus className="w-3 h-3 mr-1" /> Email
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* JSON Editor Dialog */}
      <Dialog open={showJSON} onOpenChange={setShowJSON}>
        <DialogContent className="max-w-2xl max-h-[80vh] bg-slate-950 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">Editor JSON</DialogTitle>
          </DialogHeader>
          <Textarea
            value={jsonEdit}
            onChange={(e) => setJsonEdit(e.target.value)}
            className="min-h-[400px] bg-slate-900 border-slate-700 text-slate-200 font-mono text-sm rounded-xl"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowJSON(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={handleUpdateJSON} className="bg-blue-600 hover:bg-blue-500 rounded-xl">Aplicar cambios</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Field Editor Component ─────────────────────────────
function FieldEditor({
  field,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
}: {
  field: FormField;
  index: number;
  total: number;
  onUpdate: (updates: Partial<FormField>) => void;
  onRemove: () => void;
  onMove: (direction: 'up' | 'down') => void;
}) {
  const [editingChoices, setEditingChoices] = useState<string>(
    field.choices?.join('\n') || ''
  );

  const handleChoicesBlur = () => {
    const choices = editingChoices.split('\n').map((c) => c.trim()).filter(Boolean);
    onUpdate({ choices });
  };

  return (
    <Card className="bg-slate-900 border-slate-800 p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-slate-600 hover:text-white"
            onClick={() => onMove('up')}
            disabled={index === 0}
          >
            ▲
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-slate-600 hover:text-white"
            onClick={() => onMove('down')}
            disabled={index === total - 1}
          >
            ▼
          </Button>
        </div>

        <Badge variant="outline" className="text-xs border-slate-700 text-slate-400">
          {FIELD_TYPE_LABELS[field.type] || field.type}
        </Badge>

        <div className="flex-1" />

        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          className="text-slate-600 hover:text-red-400 h-8 w-8 p-0"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-slate-400 text-xs">Nombre del campo (key)</Label>
          <Input
            value={field.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="bg-slate-950 border-slate-700 text-white rounded-xl h-9 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-slate-400 text-xs">Etiqueta (label)</Label>
          <Input
            value={field.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            className="bg-slate-950 border-slate-700 text-white rounded-xl h-9 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-slate-400 text-xs">Placeholder</Label>
          <Input
            value={field.placeholder || ''}
            onChange={(e) => onUpdate({ placeholder: e.target.value })}
            className="bg-slate-950 border-slate-700 text-white rounded-xl h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch
            checked={field.isRequired}
            onCheckedChange={(checked) => onUpdate({ isRequired: checked })}
          />
          <Label className="text-slate-400 text-xs cursor-pointer" onClick={() => onUpdate({ isRequired: !field.isRequired })}>
            Requerido
          </Label>
        </div>
      </div>

      {/* Choices for dropdown/radiogroup */}
      {(field.type === 'dropdown' || field.type === 'radiogroup') && (
        <div className="space-y-2">
          <Label className="text-slate-400 text-xs">Opciones (una por línea)</Label>
          <Textarea
            value={editingChoices}
            onChange={(e) => setEditingChoices(e.target.value)}
            onBlur={handleChoicesBlur}
            className="bg-slate-950 border-slate-700 text-white rounded-xl text-sm min-h-[80px]"
          />
        </div>
      )}
    </Card>
  );
}
