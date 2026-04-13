'use client'

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  ShieldCheck, 
  Camera, 
  Calendar, 
  Phone, 
  Bell, 
  Globe, 
  Copy, 
  Check, 
  Loader2,
  Trash2
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";

interface PerfilDashboardProps {
  activeSection: string;
}

export function PerfilDashboard({ activeSection }: PerfilDashboardProps) {
  const [userData, setUserData] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [copying, setCopying] = useState(false);

  // States for new sections
  const [notifications, setNotifications] = useState({
    browser: true,
    email: true,
    calls: true,
    leads: true
  });

  const [zadarma, setZadarma] = useState({
    extension: "123456",
    apiKey: "ZD-XXXX-XXXX",
    apiSecret: "••••••••••••",
    status: "connected"
  });

  const [booking, setBooking] = useState({
    url: "https://volkern.com/b/bruno-hess",
    active: true
  });

  const [telegramChatId, setTelegramChatId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/users/me");
      if (res.ok) {
        const data = await res.json();
        setUserData(data);
        setTelegramChatId(data.metadata?.telegram_chat_id || "");
      }
    } catch (error) {
      console.error("Error fetching user:", error);
    } finally {
      setLoadingUser(false);
    }
  };

  const handleUpdatePassword = () => {
    if(newPassword && newPassword === confirmPassword) {
      toast.success("Seguridad actualizada correctamente");
      setNewPassword("")
      setConfirmPassword("")
    } else {
      toast.error("Las contraseñas no coinciden");
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopying(true);
    toast.success("Copiado al portapapeles");
    setTimeout(() => setCopying(false), 2000);
  }

  const handleUpdateProfile = async () => {
    setSaving(true);
    try {
      const metadata = {
        ...userData?.metadata,
        telegram_chat_id: telegramChatId
      };

      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userData?.name,
          telefono: userData?.telefono,
          metadata
        })
      });

      if (res.ok) {
        toast.success("Perfil actualizado correctamente");
        fetchUser();
      } else {
        toast.error("Error al actualizar perfil");
      }
    } catch (error) {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const SectionWrapper = ({ title, description, children, icon: Icon }: any) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-primary/10 rounded-2xl text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">{title}</h2>
          <p className="text-muted-foreground text-sm font-medium">{description}</p>
        </div>
      </div>
      {children}
    </motion.div>
  );

  return (
    <div className="w-full max-w-4xl mx-auto py-4">
      <AnimatePresence mode="wait">
        {activeSection === "datos" && (
          <SectionWrapper 
            key="datos"
            title="Datos Personales" 
            description="Gestiona tu información pública e identidad en el sistema."
            icon={Globe}
          >
            <Card className="border-none shadow-xl ring-1 ring-border/50 overflow-hidden">
              <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-20" />
              <CardHeader className="-mt-16 relative px-8 flex flex-row items-end gap-6 pb-8">
                <div className="relative group">
                  <div className="h-32 w-32 rounded-3xl bg-background border-4 border-background shadow-2xl flex items-center justify-center text-5xl font-black text-primary overflow-hidden transition-transform group-hover:scale-[1.02]">
                    {userData?.name?.charAt(0) || "U"}
                  </div>
                  <button className="absolute bottom-1 right-1 p-2.5 bg-primary text-white rounded-xl shadow-lg hover:scale-110 active:scale-95 transition-all border-2 border-background">
                    <Camera className="h-4 w-4" />
                  </button>
                </div>
                <div className="mb-2">
                  <CardTitle className="text-3xl font-black tracking-tight text-slate-900">{userData?.name || "Usuario"}</CardTitle>
                  <CardDescription className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Administrador de Cuenta</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Nombre Completo</Label>
                    <Input value={userData?.name || ""} disabled className="bg-slate-50 border-slate-200 h-12 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Correo Electrónico</Label>
                    <Input value={userData?.email || ""} disabled className="bg-slate-50 border-slate-200 h-12 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Cargo / Título</Label>
                    <Input placeholder="Ej. Director Comercial" className="h-12 rounded-xl border-slate-200" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Teléfono Institucional</Label>
                    <Input placeholder="+52 XXX XXX XXXX" className="h-12 rounded-xl border-slate-200" />
                  </div>
                </div>
                <div className="pt-6 border-t border-slate-100 flex justify-end">
                  <Button 
                    onClick={handleUpdateProfile}
                    disabled={saving}
                    className="rounded-full px-10 h-12 premium-gradient-primary shadow-xl shadow-primary/20"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {saving ? "Guardando..." : "Guardar Cambios"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </SectionWrapper>
        )}

        {activeSection === "seguridad" && (
          <SectionWrapper 
            key="seguridad"
            title="Seguridad" 
            description="Protege tu cuenta actualizando tu contraseña periódicamente."
            icon={ShieldCheck}
          >
            <Card className="border-none shadow-xl ring-1 ring-border/50 p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Nueva Contraseña</Label>
                  <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" className="h-12 rounded-xl border-slate-200" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Confirmar Contraseña</Label>
                  <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" className="h-12 rounded-xl border-slate-200" />
                </div>
              </div>
              <div className="pt-4 flex items-center justify-between">
                <p className="text-xs text-slate-500 font-medium max-w-md">La contraseña debe tener al menos 8 caracteres e incluir letras y números para mayor seguridad.</p>
                <Button className="rounded-full px-10 h-12 premium-gradient-primary shadow-xl shadow-primary/20" onClick={handleUpdatePassword}>Actualizar Contraseña</Button>
              </div>
            </Card>
          </SectionWrapper>
        )}

        {activeSection === "agendamiento" && (
          <SectionWrapper 
            key="agendamiento"
            title="Agendamiento" 
            description="Configura tu link de reserva personal para que tus prospectos agenden citas directamente."
            icon={Calendar}
          >
            <Card className="border-none shadow-xl ring-1 ring-border/50 p-8 space-y-8">
              <div className="flex items-center justify-between p-6 bg-slate-50 border border-slate-100 rounded-3xl">
                <div className="space-y-1">
                  <h3 className="font-black text-lg text-slate-900">Estado del Link de Reserva</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{booking.active ? 'Activo y recibiendo citas' : 'Inactivo temporalmente'}</p>
                </div>
                <Switch checked={booking.active} onCheckedChange={(val) => setBooking({...booking, active: val})} />
              </div>

              <div className="space-y-4">
                <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Tu Link de Booking Personal</Label>
                <div className="flex gap-2">
                  <div className="flex-1 h-12 bg-slate-100 border border-slate-200 rounded-xl flex items-center px-4 font-mono text-sm text-slate-600 overflow-hidden truncate">
                    {booking.url}
                  </div>
                  <Button variant="outline" className="h-12 w-12 rounded-xl border-slate-200" onClick={() => copyToClipboard(booking.url)}>
                    {copying ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button className="h-12 px-6 rounded-xl bg-slate-900 text-white hover:bg-slate-800">
                    Probar Link
                  </Button>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2 text-center p-6 border border-slate-100 rounded-3xl hover:bg-slate-50 transition-colors cursor-pointer group">
                  <div className="h-12 w-12 bg-blue-100 text-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <h4 className="font-bold text-slate-900">Editar Horarios</h4>
                  <p className="text-xs text-slate-500">Define tu disponibilidad semanal para citas.</p>
                </div>
                <div className="space-y-2 text-center p-6 border border-slate-100 rounded-3xl hover:bg-slate-50 transition-colors cursor-pointer group">
                  <div className="h-12 w-12 bg-purple-100 text-purple-600 rounded-2xl mx-auto flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Globe className="h-6 w-6" />
                  </div>
                  <h4 className="font-bold text-slate-900">Widgets Web</h4>
                  <p className="text-xs text-slate-500">Ver códigos para insertar en tu sitio web.</p>
                </div>
              </div>
            </Card>
          </SectionWrapper>
        )}

        {activeSection === "zadarma" && (
          <SectionWrapper 
            key="zadarma"
            title="Telefonía (Zadarma)" 
            description="Gestión de tu extensión personal y credenciales para llamadas VoIP."
            icon={Phone}
          >
            <Card className="border-none shadow-xl ring-1 ring-border/50 p-8 space-y-8">
              <div className="flex items-center gap-4 p-4 bg-green-50 border border-green-100 rounded-2xl">
                <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-bold text-green-700">EXTENSIÓN {zadarma.extension} CONECTADA</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Zadarma API Key (Personal)</Label>
                  <Input value={zadarma.apiKey} onChange={e => setZadarma({...zadarma, apiKey: e.target.value})} className="h-12 rounded-xl border-slate-200 font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">API Secret</Label>
                  <Input type="password" value={zadarma.apiSecret} onChange={e => setZadarma({...zadarma, apiSecret: e.target.value})} className="h-12 rounded-xl border-slate-200" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Extensión / Usuario</Label>
                  <Input value={zadarma.extension} onChange={e => setZadarma({...zadarma, extension: e.target.value})} className="h-12 rounded-xl border-slate-200" />
                </div>
                <div className="space-y-2">
                  <div className="h-full flex flex-col justify-center gap-2 pt-6">
                    <div className="flex items-center justify-between">
                       <Label className="text-sm font-bold text-slate-700">Grabación habilitada</Label>
                       <Switch defaultChecked />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
                <p>⚠️ Estas credenciales son privadas y permiten realizar llamadas comerciales.</p>
                <Button className="rounded-full px-10 h-12 bg-slate-900 text-white hover:bg-slate-800">Probar Conexión</Button>
              </div>
            </Card>
          </SectionWrapper>
        )}

        {activeSection === "notificaciones" && (
          <SectionWrapper 
            key="notificaciones"
            title="Notificaciones" 
            description="Controla cómo y cuándo recibes alertas sobre tus leads e interacciones."
            icon={Bell}
          >
            <Card className="border-none shadow-xl ring-1 ring-border/50 overflow-hidden">
              <div className="p-8 space-y-8">
                <div className="space-y-6">
                   <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                      <div className="flex items-center gap-4">
                         <div className="p-2 bg-white rounded-lg shadow-sm">
                            <Bell className="h-5 w-5 text-blue-600" />
                         </div>
                         <div>
                            <h4 className="font-bold text-slate-900 text-sm">Notificaciones de Escritorio</h4>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Alertas en tiempo real en tu PC/Mac</p>
                         </div>
                      </div>
                      <Switch checked={notifications.browser} onCheckedChange={(val) => setNotifications({...notifications, browser: val})} />
                   </div>

                   <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                      <div className="flex items-center gap-4">
                         <div className="p-2 bg-white rounded-lg shadow-sm">
                            <Phone className="h-5 w-5 text-green-600" />
                         </div>
                         <div>
                            <h4 className="font-bold text-slate-900 text-sm">Llamadas Entrantes</h4>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">CTI Pop-up para llamadas Zadarma</p>
                         </div>
                      </div>
                      <Switch checked={notifications.calls} onCheckedChange={(val) => setNotifications({...notifications, calls: val})} />
                   </div>

                   <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                      <div className="flex items-center gap-4">
                         <div className="p-2 bg-white rounded-lg shadow-sm">
                            <Globe className="h-5 w-5 text-orange-600" />
                         </div>
                         <div>
                            <h4 className="font-bold text-slate-900 text-sm">Nuevos Leads</h4>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Aviso instantáneo al asignar prospecto</p>
                         </div>
                      </div>
                      <Switch checked={notifications.leads} onCheckedChange={(val) => setNotifications({...notifications, leads: val})} />
                   </div>
                    <div className="pt-4 space-y-4">
                       <div className="flex flex-col gap-2">
                          <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Telegram Chat ID (Personal)</Label>
                          <div className="flex gap-2">
                             <Input 
                                value={telegramChatId} 
                                onChange={e => setTelegramChatId(e.target.value)} 
                                placeholder="Ej. 123456789"
                                className="h-12 rounded-xl border-slate-200" 
                             />
                             <Button 
                               onClick={handleUpdateProfile}
                               disabled={saving}
                               className="h-12 premium-gradient-primary rounded-xl px-6"
                             >
                               {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Vincular"}
                             </Button>
                          </div>
                          <p className="text-[10px] text-slate-500 font-medium">
                            Obtén tu ID hablando con nuestro bot de Volkern. Tus récords y alertas se enviarán aquí.
                          </p>
                       </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-slate-100 flex justify-end">
                   <Button variant="outline" className="rounded-full px-8 text-red-500 border-red-100 hover:bg-red-50 hover:text-red-600 gap-2">
                     <Trash2 className="h-4 w-4" /> Resetear Permisos
                   </Button>
                </div>
              </div>
            </Card>
          </SectionWrapper>
        )}
      </AnimatePresence>
    </div>
  );
}
