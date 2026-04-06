'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Settings,
  Hash,
  Type,
  List,
  ToggleLeft,
  Calendar,
  Link,
  AlignLeft,
  ChevronLeft,
  Save,
  Sparkles,
  Building2,
  ShoppingCart,
  Briefcase,
  Car,
  Plane,
  X,
  AlertCircle,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface FieldDefinition {
  id: string;
  fieldKey: string;
  label: string;
  type: string;
  options: string[] | null;
  required: boolean;
  orden: number;
  categoria: string | null;
  placeholder: string | null;
  unidad: string | null;
  valorDefecto: string | null;
  activo: boolean;
}

interface Preset {
  key: string;
  label: string;
  totalCampos: number;
}

const TIPO_ICONS: Record<string, React.ReactNode> = {
  text: <Type className="w-4 h-4" />,
  number: <Hash className="w-4 h-4" />,
  select: <List className="w-4 h-4" />,
  boolean: <ToggleLeft className="w-4 h-4" />,
  date: <Calendar className="w-4 h-4" />,
  url: <Link className="w-4 h-4" />,
  textarea: <AlignLeft className="w-4 h-4" />,
};

const PRESET_ICONS: Record<string, React.ReactNode> = {
  inmobiliaria: <Building2 className="w-6 h-6" />,
  ecommerce: <ShoppingCart className="w-6 h-6" />,
  servicios_profesionales: <Briefcase className="w-6 h-6" />,
  automotriz: <Car className="w-6 h-6" />,
  turismo: <Plane className="w-6 h-6" />,
};

const emptyField: Partial<FieldDefinition> = {
  fieldKey: '',
  label: '',
  type: 'text',
  options: null,
  required: false,
  categoria: null,
  placeholder: null,
  unidad: null,
  valorDefecto: null,
};

export default function CamposPage() {
  const router = useRouter();
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Modal states
  const [isFieldModalOpen, setIsFieldModalOpen] = useState(false);
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<Partial<FieldDefinition> | null>(null);
  const [deletingField, setDeletingField] = useState<FieldDefinition | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<Partial<FieldDefinition>>(emptyField);
  const [optionsText, setOptionsText] = useState('');
  
  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchFields();
    fetchPresets();
  }, []);

  const fetchFields = async () => {
    try {
      const res = await fetch('/api/catalogo/field-definitions?activos=false');
      const data = await res.json();
      if (data.success) {
        setFields(data.fieldDefinitions);
      }
    } catch (error) {
      toast.error('Error al cargar campos');
    } finally {
      setLoading(false);
    }
  };

  const fetchPresets = async () => {
    try {
      const res = await fetch('/api/catalogo/field-definitions/presets');
      const data = await res.json();
      if (data.success) {
        setPresets(data.industrias);
      }
    } catch (error) {
      console.error('Error loading presets:', error);
    }
  };

  const openFieldModal = (field?: FieldDefinition) => {
    if (field) {
      setEditingField(field);
      setFormData(field);
      setOptionsText(field.options?.join('\n') || '');
    } else {
      setEditingField(null);
      setFormData(emptyField);
      setOptionsText('');
    }
    setIsFieldModalOpen(true);
  };

  const handleSaveField = async () => {
    if (!formData.fieldKey || !formData.label || !formData.type) {
      toast.error('Completa los campos requeridos');
      return;
    }

    // Validar fieldKey
    const fieldKeyRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!fieldKeyRegex.test(formData.fieldKey)) {
      toast.error('La clave debe empezar con letra y solo contener letras, números y guiones bajos');
      return;
    }

    // Parsear options si es select
    let options: string[] | null = null;
    if (formData.type === 'select') {
      options = optionsText.split('\n').map(o => o.trim()).filter(o => o);
      if (options.length === 0) {
        toast.error('Para campos tipo "select", debes agregar al menos una opción');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        options,
      };

      const url = editingField?.id 
        ? `/api/catalogo/field-definitions/${editingField.id}`
        : '/api/catalogo/field-definitions';
      
      const method = editingField?.id ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      
      if (data.success) {
        toast.success(editingField?.id ? 'Campo actualizado' : 'Campo creado');
        setIsFieldModalOpen(false);
        fetchFields();
      } else {
        toast.error(data.error || 'Error al guardar campo');
      }
    } catch (error) {
      toast.error('Error al guardar campo');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteField = async () => {
    if (!deletingField) return;

    try {
      const res = await fetch(`/api/catalogo/field-definitions/${deletingField.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success('Campo desactivado');
        setIsDeleteDialogOpen(false);
        setDeletingField(null);
        fetchFields();
      } else {
        toast.error(data.error || 'Error al eliminar campo');
      }
    } catch (error) {
      toast.error('Error al eliminar campo');
    }
  };

  const handleToggleActive = async (field: FieldDefinition) => {
    try {
      const res = await fetch(`/api/catalogo/field-definitions/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !field.activo }),
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success(field.activo ? 'Campo desactivado' : 'Campo activado');
        fetchFields();
      }
    } catch (error) {
      toast.error('Error al cambiar estado');
    }
  };

  const handleApplyPreset = async (industria: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/catalogo/field-definitions/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industria }),
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success(`${data.creados} campos creados del preset "${industria}"`);
        if (data.camposOmitidos?.length > 0) {
          toast.info(`${data.camposOmitidos.length} campos ya existían y fueron omitidos`);
        }
        setIsPresetModalOpen(false);
        fetchFields();
      } else {
        toast.error(data.error || 'Error al aplicar preset');
      }
    } catch (error) {
      toast.error('Error al aplicar preset');
    } finally {
      setSaving(false);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const newFields = [...fields];
    const draggedField = newFields[draggedIndex];
    newFields.splice(draggedIndex, 1);
    newFields.splice(index, 0, draggedField);
    setFields(newFields);
    setDraggedIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null) return;
    
    setDraggedIndex(null);
    
    // Guardar nuevo orden
    try {
      const orderedIds = fields.map(f => f.id);
      await fetch('/api/catalogo/field-definitions/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });
      toast.success('Orden guardado');
    } catch (error) {
      toast.error('Error al guardar orden');
      fetchFields(); // Revertir
    }
  };

  const activeFields = fields.filter(f => f.activo);
  const inactiveFields = fields.filter(f => !f.activo);

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => router.push('/dashboard/catalogo')}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Campos Personalizados</h1>
          <p className="text-muted-foreground">
            Define los campos que estarán disponibles para todos los productos de tu catálogo
          </p>
        </div>
        <Button variant="outline" onClick={() => setIsPresetModalOpen(true)}>
          <Sparkles className="w-4 h-4 mr-2" />
          Presets
        </Button>
        <Button onClick={() => openFieldModal()}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Campo
        </Button>
      </div>

      {/* Info Card */}
      {fields.length === 0 && !loading && (
        <Card className="mb-6 border-dashed">
          <CardContent className="py-8 text-center">
            <Settings className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No hay campos definidos</h3>
            <p className="text-muted-foreground mb-4">
              Crea campos personalizados que se mostrarán en todos los productos de tu catálogo.
              Por ejemplo: superficie, habitaciones, color, talla, etc.
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => setIsPresetModalOpen(true)}>
                <Sparkles className="w-4 h-4 mr-2" />
                Usar Preset por Industria
              </Button>
              <Button onClick={() => openFieldModal()}>
                <Plus className="w-4 h-4 mr-2" />
                Crear Campo Manual
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Fields */}
      {activeFields.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Campos Activos ({activeFields.length})</CardTitle>
            <CardDescription>Arrastra para reordenar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeFields.map((field, index) => (
              <div
                key={field.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors cursor-move ${
                  draggedIndex === index ? 'opacity-50 border-primary' : ''
                }`}
              >
                <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="p-1.5 rounded bg-muted">
                    {TIPO_ICONS[field.type] || <Type className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{field.label}</span>
                      {field.required && (
                        <Badge variant="secondary" className="text-xs">Requerido</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <code className="bg-muted px-1 rounded">{field.fieldKey}</code>
                      <span>•</span>
                      <span>{field.type}</span>
                      {field.unidad && (
                        <>
                          <span>•</span>
                          <span>{field.unidad}</span>
                        </>
                      )}
                      {field.categoria && (
                        <>
                          <span>•</span>
                          <Badge variant="outline" className="text-xs">{field.categoria}</Badge>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8"
                    onClick={() => openFieldModal(field)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      setDeletingField(field);
                      setIsDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Inactive Fields */}
      {inactiveFields.length > 0 && (
        <Card className="opacity-60">
          <CardHeader>
            <CardTitle className="text-lg">Campos Inactivos ({inactiveFields.length})</CardTitle>
            <CardDescription>Estos campos no se mostrarán en el formulario</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {inactiveFields.map((field) => (
              <div
                key={field.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
              >
                <div className="p-1.5 rounded bg-muted">
                  {TIPO_ICONS[field.type] || <Type className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-medium truncate">{field.label}</span>
                  <div className="text-xs text-muted-foreground">
                    <code className="bg-muted px-1 rounded">{field.fieldKey}</code>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleToggleActive(field)}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Activar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Field Modal */}
      <Dialog open={isFieldModalOpen} onOpenChange={setIsFieldModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingField?.id ? 'Editar Campo' : 'Nuevo Campo Personalizado'}
            </DialogTitle>
            <DialogDescription>
              Define las propiedades del campo que se mostrará en el formulario de productos
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Clave (fieldKey) *</Label>
                <Input
                  placeholder="ej: superficie_m2"
                  value={formData.fieldKey || ''}
                  onChange={(e) => setFormData({ ...formData, fieldKey: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  disabled={!!editingField?.id}
                />
                <p className="text-xs text-muted-foreground">Identificador único, sin espacios</p>
              </div>
              <div className="space-y-2">
                <Label>Etiqueta *</Label>
                <Input
                  placeholder="ej: Superficie (m²)"
                  value={formData.label || ''}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Campo *</Label>
                <Select
                  value={formData.type || 'text'}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">
                      <div className="flex items-center gap-2">
                        <Type className="w-4 h-4" /> Texto
                      </div>
                    </SelectItem>
                    <SelectItem value="number">
                      <div className="flex items-center gap-2">
                        <Hash className="w-4 h-4" /> Número
                      </div>
                    </SelectItem>
                    <SelectItem value="select">
                      <div className="flex items-center gap-2">
                        <List className="w-4 h-4" /> Selección
                      </div>
                    </SelectItem>
                    <SelectItem value="boolean">
                      <div className="flex items-center gap-2">
                        <ToggleLeft className="w-4 h-4" /> Sí/No
                      </div>
                    </SelectItem>
                    <SelectItem value="date">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> Fecha
                      </div>
                    </SelectItem>
                    <SelectItem value="url">
                      <div className="flex items-center gap-2">
                        <Link className="w-4 h-4" /> URL
                      </div>
                    </SelectItem>
                    <SelectItem value="textarea">
                      <div className="flex items-center gap-2">
                        <AlignLeft className="w-4 h-4" /> Texto Largo
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unidad (opcional)</Label>
                <Input
                  placeholder="ej: m², kg, años"
                  value={formData.unidad || ''}
                  onChange={(e) => setFormData({ ...formData, unidad: e.target.value })}
                />
              </div>
            </div>

            {formData.type === 'select' && (
              <div className="space-y-2">
                <Label>Opciones (una por línea) *</Label>
                <textarea
                  className="w-full min-h-[100px] p-2 border rounded-md text-sm"
                  placeholder="Venta\nRenta\nTraspaso"
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Placeholder (texto de ayuda)</Label>
              <Input
                placeholder="ej: Ingresa la superficie total"
                value={formData.placeholder || ''}
                onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Categoría (opcional)</Label>
              <Input
                placeholder="ej: Inmuebles (dejar vacío para aplicar a todos)"
                value={formData.categoria || ''}
                onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Solo mostrar este campo para productos de esta categoría</p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.required || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, required: checked })}
                />
                <Label>Campo requerido</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFieldModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveField} disabled={saving}>
              {saving ? 'Guardando...' : <><Save className="w-4 h-4 mr-2" /> Guardar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preset Modal */}
      <Dialog open={isPresetModalOpen} onOpenChange={setIsPresetModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Presets por Industria</DialogTitle>
            <DialogDescription>
              Selecciona una industria para agregar campos predefinidos a tu catálogo
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            {presets.map((preset) => (
              <button
                key={preset.key}
                onClick={() => handleApplyPreset(preset.key)}
                disabled={saving}
                className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
              >
                <div className="p-3 rounded-lg bg-primary/10 text-primary">
                  {PRESET_ICONS[preset.key] || <Settings className="w-6 h-6" />}
                </div>
                <div>
                  <div className="font-medium">{preset.label}</div>
                  <div className="text-sm text-muted-foreground">
                    {preset.totalCampos} campos predefinidos
                  </div>
                </div>
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPresetModalOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desactivar campo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de desactivar el campo "{deletingField?.label}"?
              El campo no se eliminará permanentemente y podrás reactivarlo después.
              Los productos que ya tienen valores para este campo los conservarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteField} className="bg-destructive text-destructive-foreground">
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
