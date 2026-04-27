'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Settings, 
  CheckCircle2, 
  RotateCw, 
  BarChart3, 
  Info,
  Save,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';

interface User {
  id: string;
  name: string;
  email: string;
  role?: {
    nombre: string;
  };
}

interface LeadAssignmentConfigData {
  enabled: boolean;
  method: 'round_robin' | 'load_balanced';
  agentIds: string[];
}

export function LeadAssignmentConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [config, setConfig] = useState<LeadAssignmentConfigData>({
    enabled: false,
    method: 'round_robin',
    agentIds: []
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, configRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/leads/assignment/config')
      ]);

      const usersData = await usersRes.json();
      const configData = await configRes.json();

      if (usersRes.ok) setUsers(usersData.users || []);
      if (configRes.ok) setConfig(configData);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar la configuración');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/leads/assignment/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (res.ok) {
        toast.success('Configuración guardada correctamente');
      } else {
        toast.error('Error al guardar la configuración');
      }
    } catch (error) {
      toast.error('Error al conectar con el servidor');
    } finally {
      setSaving(false);
    }
  };

  const toggleAgent = (userId: string) => {
    setConfig(prev => ({
      ...prev,
      agentIds: prev.agentIds.includes(userId)
        ? prev.agentIds.filter(id => id !== userId)
        : [...prev.agentIds, userId]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <Card className="border-blue-100 shadow-sm overflow-hidden">
      <CardHeader className="bg-slate-50/50 border-b pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <RotateCw size={20} />
            </div>
            <div>
              <CardTitle className="text-lg">Asignación Inteligente de Leads</CardTitle>
              <CardDescription>Automatiza el reparto de leads entre tu equipo de ventas.</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="enabled" className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {config.enabled ? 'Activado' : 'Desactivado'}
            </Label>
            <Switch 
              id="enabled" 
              checked={config.enabled} 
              onCheckedChange={(val) => setConfig({...config, enabled: val})}
            />
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-6 space-y-8">
        {/* Method Section */}
        <div className={config.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}>
          <Label className="text-sm font-bold mb-4 block">1. Selecciona el método de distribución</Label>
          <RadioGroup 
            value={config.method} 
            onValueChange={(val: any) => setConfig({...config, method: val})}
            className="grid md:grid-cols-2 gap-4"
          >
            <div>
              <Label
                htmlFor="round_robin"
                className={cn(
                  "flex flex-col items-start gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all hover:bg-slate-50",
                  config.method === 'round_robin' ? "border-blue-600 bg-blue-50/20" : "border-slate-100"
                )}
              >
                <div className="flex items-center gap-2 font-bold mb-1">
                  <RotateCw size={16} className="text-blue-600" />
                  <RadioGroupItem value="round_robin" id="round_robin" className="sr-only" />
                  Reparto por Turnos (Round Robin)
                </div>
                <span className="text-xs text-slate-500 leading-relaxed">
                  Los leads se asignan uno a uno siguiendo el orden de la lista. Reparto equitativo garantizado.
                </span>
              </Label>
            </div>

            <div>
              <Label
                htmlFor="load_balanced"
                className={cn(
                  "flex flex-col items-start gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all hover:bg-slate-50",
                  config.method === 'load_balanced' ? "border-blue-600 bg-blue-50/20" : "border-slate-100"
                )}
              >
                <div className="flex items-center gap-2 font-bold mb-1">
                  <BarChart3 size={16} className="text-blue-600" />
                  <RadioGroupItem value="load_balanced" id="load_balanced" className="sr-only" />
                  Carga Equilibrada
                </div>
                <span className="text-xs text-slate-500 leading-relaxed">
                  Se asigna el lead al agente con menos tareas activas. Ideal para no saturar al equipo.
                </span>
              </Label>
            </div>
          </RadioGroup>
        </div>

        <Separator />

        {/* Agents Section */}
        <div className={config.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <Label className="text-sm font-bold">2. Agentes disponibles en la rotación</Label>
              <p className="text-xs text-slate-500">Selecciona los miembros del equipo que recibirán leads automáticamente.</p>
            </div>
            <div className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded-full uppercase text-slate-500 italic">
              {config.agentIds.length} agentes seleccionados
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {users.map((user) => (
              <div 
                key={user.id} 
                className={cn(
                  "flex items-center space-x-3 p-3 rounded-lg border transition-all",
                  config.agentIds.includes(user.id) ? "border-blue-200 bg-blue-50/10 shadow-sm" : "border-slate-100"
                )}
              >
                <Checkbox 
                  id={`user-${user.id}`} 
                  checked={config.agentIds.includes(user.id)}
                  onCheckedChange={() => toggleAgent(user.id)}
                />
                <div className="grid gap-0.5 leading-none">
                  <label
                    htmlFor={`user-${user.id}`}
                    className="text-xs font-bold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {user.name}
                  </label>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                    {user.role?.nombre || 'Usuario'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-blue-50/50 p-4 rounded-lg flex gap-3 border border-blue-100">
          <Info className="text-blue-500 shrink-0" size={18} />
          <div className="text-xs text-blue-800 leading-relaxed">
            <strong>¿Cómo funciona?</strong> Una vez activado, cualquier lead que entre al CRM (vía formularios web o webhooks) será asignado inmediatamente al responsable correspondiente. Si desmarcas a todos los agentes, el sistema no realizará asignaciones automáticas.
          </div>
        </div>
      </CardContent>

      <CardFooter className="bg-slate-50/80 border-t p-4 flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={saving}
          className="gap-2 font-bold px-6 shadow-md hover:shadow-lg transition-all active:scale-95"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
          Guardar Configuración
        </Button>
      </CardFooter>
    </Card>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
