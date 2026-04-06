'use client';

import { useState, useEffect } from 'react';
import { 
  Card, CardContent, CardDescription, CardHeader, CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { 
  Settings, Bell, Lock, ShieldCheck, Mail, 
  MessageCircle, Smartphone, Loader2, Save,
  AlertTriangle, CheckCircle2, UserCog, UserCheck,
  ExternalLink
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { BellRing, BellOff } from 'lucide-react';

export default function ConfiguracionEstudiantePage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState({
    notificarEmail: true,
    notificarWhatsApp: false,
    notificarPush: true,
  });

  const { 
    isSupported, 
    subscription, 
    permissionState, 
    subscribe, 
    unsubscribe, 
    loading: loadingPush 
  } = usePushNotifications();

  useEffect(() => {
    cargarConfiguracion();
  }, []);

  const cargarConfiguracion = async () => {
    try {
      const res = await fetch('/api/estudiantes/perfil');
      if (res.ok) {
        const data = await res.json();
        setPrefs({
          notificarEmail: data.notificarEmail ?? true,
          notificarWhatsApp: data.notificarWhatsApp ?? false,
          notificarPush: data.notificarPush ?? true,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlesave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/estudiantes/perfil', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs)
      });
      if (res.ok) {
        toast({ title: 'Configuración Guardada', description: 'Tus preferencias de notificación han sido actualizadas.' });
      }
    } catch (err) {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
         <Loader2 className="h-10 w-10 animate-spin text-primary/20" />
         <p className="text-xs font-black uppercase text-muted-foreground tracking-widest">Cargando preferencias...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
           <Settings className="h-9 w-9 text-slate-400" />
           Configuración de la Cuenta
        </h1>
        <p className="text-muted-foreground font-medium mt-1">
           Personaliza tu experiencia y gestiona tu seguridad.
        </p>
      </div>

      <div className="grid gap-8">
        {/* Notificaciones */}
        <Card className="border-none shadow-sm rounded-[2.5rem] bg-white overflow-hidden">
          <CardHeader className="bg-slate-50/50 p-8 border-b">
             <div className="flex items-center gap-4">
                <div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-sm">
                   <Bell className="h-6 w-6" />
                </div>
                <div>
                   <CardTitle className="text-xl font-black">Notificaciones y Alertas</CardTitle>
                   <CardDescription className="font-bold uppercase text-[10px] tracking-widest mt-1">Cómo quieres recibir nuestras actualizaciones</CardDescription>
                </div>
             </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
             <div className="flex items-center justify-between p-6 bg-slate-50 rounded-[1.5rem] border border-slate-100 hover:bg-white transition-all group">
                <div className="flex items-center gap-4">
                   <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors">
                      <Mail className="h-5 w-5" />
                   </div>
                   <div>
                      <Label className="text-base font-black text-slate-900 leading-none mb-1 block">Correo Electrónico</Label>
                      <p className="text-xs text-muted-foreground font-medium">Recibe avisos de nuevas lecciones y comentarios.</p>
                   </div>
                </div>
                <Switch 
                  checked={prefs.notificarEmail} 
                  onCheckedChange={(val) => setPrefs({...prefs, notificarEmail: val})} 
                />
             </div>

             <div className="flex items-center justify-between p-6 bg-slate-50 rounded-[1.5rem] border border-slate-100 hover:bg-white transition-all group">
                <div className="flex items-center gap-4">
                   <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-green-500 transition-colors">
                      <MessageCircle className="h-5 w-5" />
                   </div>
                   <div>
                      <Label className="text-base font-black text-slate-900 leading-none mb-1 block">WhatsApp</Label>
                      <p className="text-xs text-muted-foreground font-medium">Alertas directas a tu móvil para eventos críticos.</p>
                   </div>
                </div>
                <Switch 
                  checked={prefs.notificarWhatsApp} 
                  onCheckedChange={(val) => setPrefs({...prefs, notificarWhatsApp: val})} 
                />
             </div>

             <div className="flex items-center justify-between p-6 bg-slate-50 rounded-[1.5rem] border border-slate-100 hover:bg-white transition-all group">
                <div className="flex items-center gap-4">
                   <div className={cn(
                     "h-10 w-10 bg-white rounded-xl flex items-center justify-center transition-colors",
                     subscription ? "text-blue-500" : "text-slate-400 group-hover:text-blue-500"
                   )}>
                      {subscription ? <BellRing className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
                   </div>
                   <div>
                      <Label className="text-base font-black text-slate-900 leading-none mb-1 block">
                        Notificaciones Push {subscription && <Badge className="ml-2 bg-blue-50 text-blue-600 border-none text-[10px]">Activo</Badge>}
                      </Label>
                      <p className="text-xs text-muted-foreground font-medium">
                        {!isSupported 
                          ? 'No soportado en este navegador.' 
                          : permissionState === 'denied'
                          ? 'Permiso denegado en el navegador.'
                          : 'Avisos instantáneos en tu navegador.'}
                      </p>
                   </div>
                </div>
                <Switch 
                  disabled={!isSupported || permissionState === 'denied' || loadingPush}
                  checked={!!subscription} 
                  onCheckedChange={(val) => {
                    if (val) subscribe();
                    else unsubscribe();
                  }} 
                />
             </div>

             <div className="flex justify-end pt-4">
                <Button 
                  onClick={handlesave} 
                  disabled={saving}
                  className="rounded-2xl h-12 px-8 font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20"
                >
                   {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                   Guardar Preferencias
                </Button>
             </div>
          </CardContent>
        </Card>

        {/* Seguridad */}
        <Card className="border-none shadow-sm rounded-[2.5rem] bg-white overflow-hidden opacity-80 hover:opacity-100 transition-opacity">
           <CardHeader className="p-8 flex flex-row items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="h-12 w-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-500">
                    <Lock className="h-6 w-6" />
                 </div>
                 <div>
                    <CardTitle className="text-xl font-black">Seguridad y Acceso</CardTitle>
                    <CardDescription className="font-bold uppercase text-[10px] tracking-widest mt-1">Protege tu cuenta y datos personales</CardDescription>
                 </div>
              </div>
              <Badge className="rounded-lg bg-slate-50 text-slate-500 border-none font-black text-[9px] h-7 px-3 uppercase">Autenticación Segura</Badge>
           </CardHeader>
           <CardContent className="p-8 pt-0 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Contraseña Actual</Label>
                    <Input type="password" placeholder="••••••••" disabled className="rounded-xl bg-slate-50 border-slate-100" />
                 </div>
                 <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Nueva Contraseña</Label>
                    <Input type="password" placeholder="Mínimo 8 caracteres" disabled className="rounded-xl bg-slate-50 border-slate-100" />
                 </div>
              </div>
              <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex items-start gap-4">
                 <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                 <p className="text-xs font-semibold text-amber-700 leading-relaxed">
                    La gestión de contraseñas está vinculada a <strong>Google/GitHub</strong> (SSO). Para cambiar tu contraseña externa o habilitar 2FA, dirígete a tu proveedor de identidad o contacta a soporte.
                 </p>
              </div>
              <div className="flex justify-start">
                 <Button variant="outline" className="rounded-xl border-slate-100 font-bold hover:bg-slate-50" disabled>
                    Cambiar Contraseña
                 </Button>
              </div>
           </CardContent>
        </Card>

        {/* Protección de Datos */}
        <div className="flex items-center justify-between p-8 bg-slate-900 rounded-[2.5rem] text-white">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                 <ShieldCheck className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                 <p className="font-black text-lg leading-none">Protección de Datos GDPR</p>
                 <p className="text-xs font-bold text-white/50 uppercase tracking-widest mt-1">Cumplimiento y Privacidad Europea</p>
              </div>
           </div>
           <Button variant="link" className="text-white hover:text-emerald-400 font-bold text-xs p-0 h-auto uppercase tracking-widest">
              Leer Políticas <ExternalLink className="h-3 w-3 ml-2" />
           </Button>
        </div>
      </div>
    </div>
  );
}
