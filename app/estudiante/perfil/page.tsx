'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { 
  User, Mail, Phone, Globe, Clock, 
  Bell, ShieldCheck, Save, CheckCircle2,
  Calendar, Award, CreditCard, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { PAISES, TIMEZONES } from '@/lib/constants/geo';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';

export default function StudentProfilePage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/estudiantes/perfil');
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/estudiantes/perfil', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });

      if (res.ok) {
        toast({
          title: 'Perfil actualizado',
          description: 'Tus preferencias se han guardado correctamente.',
        });
        fetchProfile();
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo guardar el perfil.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground font-black text-xs uppercase tracking-widest animate-pulse">Cargando tu perfil...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
        <div className="flex items-center gap-6">
          <div className="h-20 w-20 bg-gradient-to-br from-primary to-blue-600 rounded-3xl flex items-center justify-center text-white text-3xl font-black shadow-xl shadow-primary/20">
            {profile?.primerNombre?.[0] || profile?.nombre?.[0] || 'U'}
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Mi Perfil Académico</h1>
            <p className="text-muted-foreground font-medium flex items-center gap-2 mt-1">
              {profile?.email} 
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/10 ml-2 uppercase font-black text-[10px]">
                {profile?.tipoAcceso}
              </Badge>
            </p>
          </div>
        </div>
        <Button 
          disabled={saving} 
          onClick={handleSave}
          className="rounded-2xl h-14 px-8 font-black uppercase text-xs tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-all"
        >
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Guardar Cambios
        </Button>
      </div>

      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="bg-slate-100/50 p-1.5 rounded-2xl h-14 mb-8">
          <TabsTrigger value="personal" className="rounded-xl px-8 font-black text-xs uppercase tracking-widest h-full data-[state=active]:bg-white data-[state=active]:shadow-sm">Información Personal</TabsTrigger>
          <TabsTrigger value="location" className="rounded-xl px-8 font-black text-xs uppercase tracking-widest h-full data-[state=active]:bg-white data-[state=active]:shadow-sm">Ubicación</TabsTrigger>
          <TabsTrigger value="security" className="rounded-xl px-8 font-black text-xs uppercase tracking-widest h-full data-[state=active]:bg-white data-[state=active]:shadow-sm">Privacidad</TabsTrigger>
          <TabsTrigger value="academic" className="rounded-xl px-8 font-black text-xs uppercase tracking-widest h-full data-[state=active]:bg-white data-[state=active]:shadow-sm">Académico</TabsTrigger>
        </TabsList>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-8">
            <TabsContent value="personal" className="mt-0 space-y-6">
              <Card className="border-none shadow-sm rounded-[2rem]">
                <CardHeader>
                  <CardTitle className="text-xl font-black flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" /> Identificación
                  </CardTitle>
                  <CardDescription>Información básica de tu cuenta de alumno.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="primerNombre" className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Primer Nombre</Label>
                      <Input 
                        id="primerNombre"
                        value={profile?.primerNombre || ''} 
                        onChange={(e) => setProfile({...profile, primerNombre: e.target.value})}
                        className="rounded-xl h-12 font-bold focus-visible:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apellidoPaterno" className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Apellido Paterno</Label>
                      <Input 
                        id="apellidoPaterno"
                        value={profile?.apellidoPaterno || ''} 
                        onChange={(e) => setProfile({...profile, apellidoPaterno: e.target.value})}
                        className="rounded-xl h-12 font-bold focus-visible:ring-primary/20"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telefono" className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Teléfono / WhatsApp</Label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="telefono"
                        value={profile?.telefono || ''} 
                        onChange={(e) => setProfile({...profile, telefono: e.target.value})}
                        className="rounded-xl h-12 pl-12 font-bold focus-visible:ring-primary/20"
                        placeholder="+52 ..."
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm rounded-[2rem] bg-slate-900 text-white">
                <CardHeader>
                  <CardTitle className="text-xl font-black flex items-center gap-2">
                    <Mail className="h-5 w-5 text-primary" /> Cuenta
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                    <div>
                      <p className="text-[10px] font-black uppercase text-white/50 tracking-tighter">Email Principal (No editable)</p>
                      <p className="font-bold text-lg">{profile?.email}</p>
                    </div>
                    <CheckCircle2 className="h-6 w-6 text-primary" />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="location" className="mt-0 space-y-6">
              <Card className="border-none shadow-sm rounded-[2rem]">
                <CardHeader>
                  <CardTitle className="text-xl font-black flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" /> Preferencias Regionales
                  </CardTitle>
                  <CardDescription>Configura tu zona horaria para agendar mentorías y lecciones en vivo.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">País</Label>
                    <Select 
                      value={profile?.pais || ''} 
                      onValueChange={(val) => setProfile({...profile, pais: val})}
                    >
                      <SelectTrigger className="rounded-xl h-12 font-bold border-slate-200">
                        <SelectValue placeholder="Selecciona tu país" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <ScrollArea className="h-[200px]">
                          {PAISES.map(p => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                          ))}
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Zona Horaria</Label>
                    <Select 
                      value={profile?.zonaHoraria || ''} 
                      onValueChange={(val) => setProfile({...profile, zonaHoraria: val})}
                    >
                      <SelectTrigger className="rounded-xl h-12 font-bold border-slate-200">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <SelectValue placeholder="Selecciona tu zona horaria" />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <ScrollArea className="h-[200px]">
                          {TIMEZONES.map(tz => (
                            <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                          ))}
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security" className="mt-0 space-y-6">
              <Card className="border-none shadow-sm rounded-[2rem]">
                <CardHeader>
                  <CardTitle className="text-xl font-black flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary" /> Notificaciones
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { key: 'email', label: 'Notificaciones por Email', desc: 'Recibe alertas sobre nuevas lecciones e inscripciones.' },
                    { key: 'whatsapp', label: 'Alertas vía WhatsApp', desc: 'Recibe recordatorios de mentorías directamente en tu móvil.' },
                    { key: 'push', label: 'Notificaciones Push', desc: 'Alertas en tiempo real en tu navegador.' },
                  ].map((pref) => (
                    <div key={pref.key} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="space-y-0.5">
                        <Label className="font-bold text-slate-900">{pref.label}</Label>
                        <p className="text-xs text-muted-foreground font-medium">{pref.desc}</p>
                      </div>
                      <Switch 
                        checked={profile?.preferenciasNotificacion?.[pref.key] || false}
                        onCheckedChange={(checked) => {
                          const prefs = { ...(profile?.preferenciasNotificacion || {}), [pref.key]: checked };
                          setProfile({...profile, preferenciasNotificacion: prefs});
                        }}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm rounded-[2rem] border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-xl font-black flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" /> Privacidad y GDPR
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                   <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-primary/10">
                      <div className="space-y-0.5">
                        <Label className="font-bold text-slate-900">Consentimiento de Datos</Label>
                        <p className="text-xs text-muted-foreground font-medium">Acepto el tratamiento de mis datos personales según la política de privacidad.</p>
                      </div>
                      <Switch 
                        checked={profile?.consentimientoGDPR || false}
                        onCheckedChange={(checked) => setProfile({...profile, consentimientoGDPR: checked})}
                      />
                   </div>
                   {profile?.fechaConsentimiento && (
                     <p className="text-[10px] font-bold text-muted-foreground uppercase text-center">
                        Última actualización: {new Date(profile.fechaConsentimiento).toLocaleDateString()}
                     </p>
                   )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="academic" className="mt-0 space-y-6">
              <Card className="border-none shadow-sm rounded-[2rem]">
                <CardHeader>
                  <CardTitle className="text-xl font-black flex items-center gap-2">
                    <Award className="h-5 w-5 text-primary" /> Estado de la Cuenta
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                     <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-center">
                        <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Tipo de Acceso</p>
                        <Badge className="bg-primary text-white border-none font-black px-4 py-1">{profile?.tipoAcceso?.toUpperCase()}</Badge>
                     </div>
                     <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-center">
                        <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Fecha de Renovación</p>
                        <p className="font-black text-slate-900">{profile?.fechaRenovacion ? new Date(profile.fechaRenovacion).toLocaleDateString() : 'Plan Vitalicio'}</p>
                     </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>

          <div className="space-y-8">
            <Card className="border-none shadow-xl rounded-[2rem] bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8">
               <div className="space-y-6 text-center">
                  <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Calendar className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-white/50 tracking-widest mb-1">Miembro desde</p>
                    <p className="text-xl font-black">{profile?.fechaCreacion ? new Date(profile.fechaCreacion).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) : '...'}</p>
                  </div>
                  <div className="pt-6 border-t border-white/10">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-white/70">Progreso Global</span>
                      <span className="text-xs font-black">75%</span>
                    </div>
                    <Progress value={75} className="h-2 bg-white/10" />
                  </div>
               </div>
            </Card>

            <Card className="border-none shadow-sm rounded-[2rem] p-6">
               <h4 className="font-black text-slate-900 uppercase text-[10px] tracking-widest mb-4 flex items-center gap-2">
                 <CreditCard className="h-4 w-4 text-primary" /> Método de Pago
               </h4>
               <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    <CreditCard className="h-5 w-5 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{profile?.metodoPagoToken ? '•••• 4242' : 'No registrado'}</p>
                    <p className="text-[10px] font-bold text-muted-foreground">Stripe Secure Connection</p>
                  </div>
               </div>
               <Button variant="link" className="text-primary font-black text-xs uppercase p-0 mt-4 mx-auto w-full">Configurar Facturación</Button>
            </Card>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
