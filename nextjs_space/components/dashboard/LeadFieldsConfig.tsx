'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Settings2, 
  GripVertical, 
  Check, 
  ChevronRight,
  Type,
  Hash,
  CalendarDays,
  ListFilter,
  ToggleLeft,
  X,
  Save,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from 'sonner';

interface FieldDefinition {
  id?: string;
  fieldKey: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[] | any;
  placeholder?: string;
  valorDefecto?: string;
  orden: number;
}

export function LeadFieldsConfig() {
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);
  const [newField, setNewField] = useState<FieldDefinition>({
    fieldKey: '',
    label: '',
    type: 'text',
    required: false,
    orden: 0
  });

  const fetchFields = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/leads/custom-fields');
      if (res.ok) {
        const data = await res.json();
        setFields(data);
      }
    } catch (error) {
      console.error('Error fetching fields:', error);
      toast.error('Error al cargar campos personalizados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFields();
  }, []);

  const handleAddField = async () => {
    if (!newField.fieldKey || !newField.label) {
      toast.error('Clave y etiqueta son requeridas');
      return;
    }

    // Asegurar que la clave sea segura para JSON
    const sanitizedKey = newField.fieldKey.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    
    try {
      setLoading(true);
      const res = await fetch('/api/leads/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newField, fieldKey: sanitizedKey, orden: fields.length })
      });

      if (res.ok) {
        toast.success('Campo añadido');
        setIsAdding(false);
        setNewField({ fieldKey: '', label: '', type: 'text', required: false, orden: 0 });
        fetchFields();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al añadir campo');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteField = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este campo? No se eliminarán los datos ya guardados en los leads, pero el campo dejará de aparecer.')) return;

    try {
      const res = await fetch(`/api/leads/custom-fields?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Campo eliminado');
        fetchFields();
      }
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'number': return <Hash size={16} />;
      case 'date': return <CalendarDays size={16} />;
      case 'select': return <ListFilter size={16} />;
      case 'boolean': return <ToggleLeft size={16} />;
      default: return <Type size={16} />;
    }
  };

  if (loading && fields.length === 0) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  return (
    <Card className="shadow-2xl border-none bg-white rounded-3xl overflow-hidden">
      <CardHeader className="bg-slate-50 border-b p-8">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl font-black text-slate-800">Campos Personalizados para Leads</CardTitle>
            <CardDescription className="text-slate-500 font-medium">Define información extra que necesitas capturar de tus prospectos.</CardDescription>
          </div>
          <Button 
            onClick={() => setIsAdding(true)} 
            className="rounded-full px-6 premium-gradient-primary shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
          >
            <Plus className="mr-2 h-4 w-4" /> Nuevo Campo
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-8">
        {isAdding && (
          <div className="mb-8 p-6 bg-slate-50 border border-slate-200 rounded-3xl space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <h3 className="font-bold text-slate-700 flex items-center">
              <Plus className="mr-2 h-4 w-4 text-primary" /> Configurar Nuevo Campo
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label>Nombre del Campo (Label)</Label>
                <Input 
                  placeholder="Ej: Presupuesto Estimado" 
                  value={newField.label}
                  onChange={e => setNewField({...newField, label: e.target.value})}
                  className="rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-2">
                <Label>Identificador (Key - único)</Label>
                <Input 
                  placeholder="ej: presupuesto_leads" 
                  value={newField.fieldKey}
                  onChange={e => setNewField({...newField, fieldKey: e.target.value})}
                  className="rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Dato</Label>
                <Select value={newField.type} onValueChange={v => setNewField({...newField, type: v})}>
                  <SelectTrigger className="rounded-xl border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto Corto</SelectItem>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="date">Fecha</SelectItem>
                    <SelectItem value="boolean">Interruptor (Sí/No)</SelectItem>
                    <SelectItem value="select">Selector (Menú desplegable)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {newField.type === 'select' && (
              <div className="space-y-2 pt-2">
                <Label>Opciones (separadas por comas)</Label>
                <Input 
                  placeholder="Alta, Media, Baja" 
                  onChange={e => setNewField({...newField, options: e.target.value.split(',').map(o => o.trim())})}
                  className="rounded-xl border-slate-200"
                />
              </div>
            )}

            <div className="flex items-center gap-4 pt-4 border-t border-slate-200">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="required" 
                  checked={newField.required} 
                  onCheckedChange={v => setNewField({...newField, required: v})}
                />
                <Label htmlFor="required">Es obligatorio</Label>
              </div>
              <div className="flex-grow"></div>
              <Button variant="ghost" onClick={() => setIsAdding(false)} className="rounded-full text-slate-500">Cancelar</Button>
              <Button onClick={handleAddField} className="rounded-full px-8 premium-gradient-primary shadow-md" disabled={loading}>
                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : "Crear Campo"}
              </Button>
            </div>
          </div>
        )}

        {fields.length === 0 && !isAdding ? (
          <div className="text-center py-20 border-2 border-dashed border-slate-100 rounded-3xl">
            <Settings2 className="h-12 w-12 mx-auto text-slate-300 mb-4" />
            <h3 className="text-xl font-bold text-slate-800">No hay campos personalizados</h3>
            <p className="text-slate-500 mb-6">Añade campos para capturar información específica de tu negocio.</p>
            <Button onClick={() => setIsAdding(true)} variant="outline" className="rounded-full border-primary text-primary hover:bg-primary/5">
              Configurar primer campo
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.map((field) => (
              <div 
                key={field.id} 
                className="group p-5 bg-white border border-slate-100 rounded-2xl flex items-center gap-4 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300"
              >
                <div className="p-3 bg-slate-50 rounded-xl text-slate-500 group-hover:bg-primary group-hover:text-white transition-colors duration-500">
                  {getIconForType(field.type)}
                </div>
                <div className="flex-grow">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-800">{field.label}</h4>
                    {field.required && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-black uppercase">Obligatorio</span>}
                  </div>
                  <p className="text-xs text-slate-400 font-mono">{field.fieldKey}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-red-500 hover:bg-red-50 rounded-lg"
                    onClick={() => field.id && handleDeleteField(field.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      
      <CardFooter className="bg-slate-50 px-8 py-4 text-xs text-slate-400 font-medium">
        Estos campos aparecerán dinámicamente en la ficha y formularios de creación de Leads.
      </CardFooter>
    </Card>
  );
}
