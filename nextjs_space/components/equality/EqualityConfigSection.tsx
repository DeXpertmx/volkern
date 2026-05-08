
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  ShieldCheck, 
  Send, 
  UserCog, 
  Bot, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Lock
} from 'lucide-react';
import { toast } from 'sonner';

export default function EqualityConfigSection() {
  const [config, setConfig] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [configRes, usersRes] = await Promise.all([
        fetch('/api/equality/config'),
        fetch('/api/users')
      ]);
      
      if (configRes.ok) setConfig(await configRes.json());
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData.users || []);
      }
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/equality/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        toast.success('Configuración de igualdad actualizada');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al guardar');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  const testBot = async () => {
    if (!config?.telegramBotToken || !config?.telegramChatId) {
      toast.error('Token y Chat ID son requeridos para la prueba');
      return;
    }
    setTesting(true);
    try {
      const res = await fetch('/api/equality/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: config.telegramBotToken,
          chatId: config.telegramChatId
        })
      });
      if (res.ok) {
        toast.success('¡Mensaje de prueba enviado con éxito!');
      } else {
        toast.error('Fallo en la conexión con Telegram');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="p-12 text-center animate-pulse">Cargando configuración de igualdad...</div>;

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-xl rounded-[2rem] overflow-hidden">
        <div className="h-2 bg-emerald-500" />
        <CardHeader className="p-8 pb-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-xl font-black uppercase tracking-tight text-slate-900">Módulo de Igualdad</CardTitle>
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400">Canal de Denuncias e Inmutabilidad</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8 space-y-8">
          {/* Responsable Section */}
          <div className="space-y-4 p-6 rounded-3xl bg-slate-50 border border-slate-100">
             <div className="flex items-center gap-2 mb-2">
                <UserCog className="w-4 h-4 text-primary" />
                <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900">Responsable del Canal</h4>
             </div>
             <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                   <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Usuario Encargado</Label>
                   <select 
                     className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                     value={config?.responsibleId || ''}
                     onChange={(e) => setConfig({ ...config, responsibleId: e.target.value })}
                   >
                     <option value="">Seleccionar responsable...</option>
                     {users.map(u => (
                       <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                     ))}
                   </select>
                </div>
             </div>
          </div>

          {/* Telegram Bot Section */}
          <div className="space-y-6 p-6 rounded-3xl border-2 border-dashed border-slate-100">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <Bot className="w-4 h-4 text-indigo-500" />
                   <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900">Notificaciones Telegram</h4>
                </div>
                <Switch 
                  checked={config?.isActive || false}
                  onCheckedChange={(val) => setConfig({ ...config, isActive: val })}
                />
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                   <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Bot Token</Label>
                   <Input 
                     type="password"
                     placeholder="123456:ABC-DEF..."
                     className="h-12 rounded-xl border-slate-200 font-mono text-xs"
                     value={config?.telegramBotToken || ''}
                     onChange={(e) => setConfig({ ...config, telegramBotToken: e.target.value })}
                   />
                </div>
                <div className="space-y-2">
                   <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Chat ID / Group ID</Label>
                   <Input 
                     placeholder="987654321"
                     className="h-12 rounded-xl border-slate-200 font-mono text-xs"
                     value={config?.telegramChatId || ''}
                     onChange={(e) => setConfig({ ...config, telegramChatId: e.target.value })}
                   />
                </div>
             </div>

             <div className="flex justify-end pt-2">
                <Button 
                  variant="outline" 
                  onClick={testBot}
                  disabled={testing}
                  className="rounded-xl font-black uppercase text-[9px] tracking-widest px-6"
                >
                  {testing ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Send className="w-3 h-3 mr-2" />}
                  Probar Bot
                </Button>
             </div>
          </div>

          {/* Inmutabilidad Info */}
          <div className="p-6 rounded-3xl bg-slate-900 text-white relative overflow-hidden">
             <div className="absolute right-0 top-0 opacity-10">
                <Lock className="w-32 h-32" />
             </div>
             <div className="relative z-10 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400">
                   <CheckCircle2 className="w-4 h-4" />
                   <h4 className="text-[10px] font-black uppercase tracking-widest">Protocolo de Inmutabilidad Activo</h4>
                </div>
                <p className="text-[11px] font-medium text-slate-400 leading-relaxed max-w-md">
                   Todas las denuncias son firmadas digitalmente con un hash SHA-256 (Verifactu-Ready). 
                   Cualquier alteración manual en la base de datos invalidará el reporte automáticamente.
                </p>
             </div>
          </div>

          <div className="flex justify-end pt-4">
             <Button 
               onClick={handleSave}
               disabled={saving}
               className="rounded-full px-12 h-14 premium-gradient-primary shadow-xl shadow-primary/20 font-black uppercase text-[11px] tracking-widest"
             >
               {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
               Guardar Configuración
             </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
