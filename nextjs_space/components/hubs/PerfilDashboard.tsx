'use client'

import { useState, useEffect, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
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
  Trash2,
  Cpu,
  Zap,
  CreditCard,
  Smartphone,
  QrCode,
  ExternalLink,
  Share2,
  ChevronRight,
  FileWarning,
  X
} from "lucide-react";
import { ComplaintForm } from "@/components/equality/ComplaintForm";
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
  const [currentPassword, setCurrentPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [copying, setCopying] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/users/avatar", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        toast.success("Avatar actualizado");
        fetchUser();
      } else {
        const error = await res.json();
        toast.error(error.error || "Error al subir avatar");
      }
    } catch (err) {
      toast.error("Error de conexión");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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
    url: "",
    active: false
  });

  const [timezone, setTimezone] = useState('Europe/Madrid');
  const [showTimezoneModal, setShowTimezoneModal] = useState(false);
  const [horariosDisponibles, setHorariosDisponibles] = useState<any>(null);
  
  // Estados para horarios de disponibilidad
  const [horarios, setHorarios] = useState<any[]>([]);
  const [showHorariosModal, setShowHorariosModal] = useState(false);
  const [savingHorarios, setSavingHorarios] = useState(false);
  
  // Estados para ausencias
  const [ausencias, setAusencias] = useState<any[]>([]);
  const [showAusenciaModal, setShowAusenciaModal] = useState(false);
  const [nuevaAusencia, setNuevaAusencia] = useState({ titulo: '', fechaInicio: '', fechaFin: '', tipo: 'vacaciones', razon: '' });
  const [savingAusencia, setSavingAusencia] = useState(false);

  const [cardUrl, setCardUrl] = useState("");

  const [telegramChatId, setTelegramChatId] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Agent Skills State
  const [skillKey, setSkillKey] = useState<any>(null);
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (!userData || !userData.tenant) return;

    const protocol = window.location.protocol;
    const host = window.location.host;
    let domain = "";
    if (host.includes('localhost')) {
      domain = 'localhost:3000';
    } else {
      const parts = window.location.hostname.split('.');
      domain = parts.length >= 2 ? parts.slice(-2).join('.') : window.location.hostname;
    }

    const bSlug = userData.bookingSlug || userData.id;
    setBooking(prev => ({
      ...prev,
      url: `${protocol}//${userData.tenant.subdomain}.${domain}/booking/${bSlug}`,
      active: userData.bookingEnabled || false
    }));
  }, [userData?.bookingSlug, userData?.bookingEnabled, userData?.id, userData?.tenant]);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/users/me");
      if (res.ok) {
        const data = await res.json();
        setUserData(data);
        setTelegramChatId(data.metadata?.telegram_chat_id || "");
        if (data.metadata?.notifications) {
          setNotifications(data.metadata.notifications);
        }
        setTimezone(data.timezone || 'America/Mexico_City');
        
        // 2. Configurar link de tarjeta digital
        try {
          const protocol = window.location.protocol;
          const host = window.location.host;
          let domain = "";
          if (host.includes('localhost')) {
            domain = 'localhost:3000';
          } else {
            const parts = window.location.hostname.split('.');
            domain = parts.length >= 2 ? parts.slice(-2).join('.') : window.location.hostname;
          }

          const cardRes = await fetch("/api/tarjetas-digitales");
          if (cardRes.ok) {
            const cardData = await cardRes.json();
            if (cardData.digitalCard?.urlUnica && data.tenant?.subdomain) {
              setCardUrl(`${protocol}//${data.tenant.subdomain}.${domain}/tarjeta/${cardData.digitalCard.urlUnica}`);
            }
          }
        } catch (e) {
          console.warn("Error fetching card data:", e);
        }
        
        // 3. Obtener horarios de disponibilidad
        try {
          const horariosRes = await fetch("/api/disponibilidad");
          if (horariosRes.ok) {
            const horariosData = await horariosRes.json();
            setHorarios(horariosData);
          }
        } catch (e) {
          console.warn("Error fetching horarios:", e);
        }
        
        // 4. Obtener ausencias
        try {
          const hoy = new Date();
          const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
          const ausenciasRes = await fetch(`/api/ausencias?mes=${mesActual}`);
          if (ausenciasRes.ok) {
            const ausenciasData = await ausenciasRes.json();
            setAusencias(ausenciasData);
          }
        } catch (e) {
          console.warn("Error fetching ausencias:", e);
        }
      }
    } catch (error) {
      console.error("Error fetching user:", error);
    } finally {
      setLoadingUser(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword) {
      toast.error("Debes ingresar tu contraseña actual");
      return;
    }

    if (!newPassword || newPassword !== confirmPassword) {
      toast.error("Las nuevas contraseñas no coinciden o están vacías");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      toast.error("La contraseña debe incluir mayúsculas, minúsculas y un carácter especial");
      return;
    }

    setUpdatingPassword(true);
    try {
      const res = await fetch("/api/users/cambiar-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success("Contraseña actualizada correctamente");
        setNewPassword("");
        setConfirmPassword("");
        setCurrentPassword("");
      } else {
        toast.error(data.error || "Error al actualizar la contraseña");
      }
    } catch (error) {
      toast.error("Error de conexión al servidor");
    } finally {
      setUpdatingPassword(false);
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
          bookingTitle: userData?.bookingTitle,
          bookingSlug: userData?.bookingSlug,
          bookingBio: userData?.bookingBio,
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

  const updateNotificationSetting = async (key: string, value: boolean) => {
    const newNotifications = { ...notifications, [key]: value };
    setNotifications(newNotifications);
    
    try {
      const metadata = {
        ...userData?.metadata,
        notifications: newNotifications
      };

      await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata })
      });
      fetchUser();
    } catch (error) {
      toast.error("Error al guardar preferencia");
    }
  };

  const handleGenerateSkillKey = async () => {
    setGeneratingKey(true);
    try {
      const res = await fetch("/api/users/me/skill-key", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSkillKey(data);
        setShowSkillModal(true);
        toast.success("Nueva llave de conexión generada");
      } else {
        toast.error("Error al generar llave");
      }
    } catch (error) {
      toast.error("Error de conexión");
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleSaveTimezone = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone })
      });
      
      if (res.ok) {
        toast.success("Zona horaria guardada");
        fetchUser();
        setShowTimezoneModal(false);
      } else {
        const data = await res.json();
        toast.error(data.error || "Error al guardar zona horaria");
      }
    } catch (error) {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveHorarios = async () => {
    setSavingHorarios(true);
    try {
      const res = await fetch("/api/disponibilidad", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horarios })
      });
      
      if (res.ok) {
        toast.success("Horarios guardados");
        setShowHorariosModal(false);
      } else {
        const data = await res.json();
        toast.error(data.error || "Error al guardar horarios");
      }
    } catch (error) {
      toast.error("Error de conexión");
    } finally {
      setSavingHorarios(false);
    }
  };

  const handleSaveAusencia = async () => {
    if (!nuevaAusencia.titulo || !nuevaAusencia.fechaInicio || !nuevaAusencia.fechaFin) {
      toast.error("Completa todos los campos requeridos");
      return;
    }
    
    setSavingAusencia(true);
    try {
      const res = await fetch("/api/ausencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nuevaAusencia)
      });
      
      if (res.ok) {
        const data = await res.json();
        setAusencias([...ausencias, data]);
        setNuevaAusencia({ titulo: '', fechaInicio: '', fechaFin: '', tipo: 'vacaciones', razon: '' });
        setShowAusenciaModal(false);
        toast.success("Ausencia creada");
      } else {
        const data = await res.json();
        toast.error(data.error || "Error al crear ausencia");
      }
    } catch (error) {
      toast.error("Error de conexión");
    } finally {
      setSavingAusencia(false);
    }
  };

  const handleDeleteAusencia = async (id: string) => {
    if (!confirm("¿Eliminar esta ausencia?")) return;
    
    try {
      const res = await fetch(`/api/ausencias?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setAusencias(ausencias.filter(a => a.id !== id));
        toast.success("Ausencia eliminada");
      } else {
        toast.error("Error al eliminar ausencia");
      }
    } catch (error) {
      toast.error("Error de conexión");
    }
  };

  return (
    <div className="space-y-12 pb-20">
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
                <div className="h-32 w-32 rounded-3xl bg-background border-4 border-background shadow-2xl flex items-center justify-center text-5xl font-black text-primary overflow-hidden transition-transform group-hover:scale-[1.02] relative">
                  {userData?.image ? (
                    <img src={userData.image} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    userData?.name?.charAt(0) || "U"
                  )}
                  {uploadingAvatar && (
                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  )}
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  ref={fileInputRef} 
                  accept="image/png, image/jpeg, image/jpg, image/webp" 
                  onChange={handleAvatarUpload} 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute bottom-1 right-1 p-2.5 bg-primary text-white rounded-xl shadow-lg hover:scale-110 active:scale-95 transition-all border-2 border-background disabled:opacity-50"
                >
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
                  <Input 
                    value={userData?.name || ""} 
                    onChange={e => setUserData({...userData, name: e.target.value})}
                    className="h-12 rounded-xl border-slate-200" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Correo Electrónico</Label>
                  <Input value={userData?.email || ""} disabled className="bg-slate-50 border-slate-200 h-12 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Cargo / Título</Label>
                  <Input 
                    value={userData?.bookingTitle || ""} 
                    onChange={e => setUserData({...userData, bookingTitle: e.target.value})}
                    placeholder="Ej. Director Comercial" 
                    className="h-12 rounded-xl border-slate-200" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Teléfono Institucional</Label>
                  <Input 
                    value={userData?.telefono || ""} 
                    onChange={e => setUserData({...userData, telefono: e.target.value})}
                    placeholder="+52 XXX XXX XXXX" 
                    className="h-12 rounded-xl border-slate-200" 
                  />
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
            <div className="flex items-center justify-between p-6 bg-indigo-50/50 border border-indigo-100 rounded-3xl">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-lg text-slate-900">Autenticación de Dos Factores (MFA)</h3>
                  <Badge variant={userData?.isTwoFactorEnabled ? "default" : "secondary"} className="rounded-full">
                    {userData?.isTwoFactorEnabled ? "Activado" : "Desactivado"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 font-medium">Añade una capa extra de seguridad enviando un código único a tu email al iniciar sesión.</p>
              </div>
              <Switch 
                checked={userData?.isTwoFactorEnabled || false} 
                onCheckedChange={async (checked) => {
                  setSaving(true);
                  try {
                    const res = await fetch("/api/users/me/2fa", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ enabled: checked })
                    });
                    const data = await res.json();
                    if (res.ok) {
                      toast.success(`2FA ${checked ? 'activado' : 'desactivado'} correctamente`);
                      fetchUser();
                    } else {
                      toast.error(data.error || "Error al cambiar configuración de 2FA");
                    }
                  } catch (error) {
                    toast.error("Error de conexión");
                  } finally {
                    setSaving(false);
                  }
                }} 
              />
            </div>

            <div className="grid grid-cols-1 gap-8">
              <div className="space-y-2 max-w-md">
                <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Contraseña Actual</Label>
                <Input 
                  type="password" 
                  value={currentPassword} 
                  onChange={e => setCurrentPassword(e.target.value)} 
                  placeholder="Tu contraseña actual" 
                  className="h-12 rounded-xl border-slate-200" 
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Nueva Contraseña</Label>
                  <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 8 caracteres" className="h-12 rounded-xl border-slate-200" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Confirmar Nueva Contraseña</Label>
                  <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repite la nueva contraseña" className="h-12 rounded-xl border-slate-200" />
                </div>
              </div>
            </div>
            <div className="pt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500 font-medium max-w-md">La contraseña debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas y caracteres especiales para mayor seguridad.</p>
              <Button 
                className="rounded-full px-10 h-12 premium-gradient-primary shadow-xl shadow-primary/20" 
                onClick={handleUpdatePassword}
                disabled={updatingPassword}
              >
                {updatingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {updatingPassword ? "Actualizando..." : "Actualizar Contraseña"}
              </Button>
            </div>

            <div className="pt-8 mt-8 border-t border-slate-100 space-y-6">
              <div className="space-y-1">
                <h3 className="font-black text-lg text-slate-900">Sesiones Activas</h3>
                <p className="text-xs text-slate-500 font-medium">Si sospechas que alguien ha accedido a tu cuenta o has dejado tu sesión abierta en otro equipo, puedes cerrarla en todos los dispositivos.</p>
              </div>
              <Button 
                variant="outline" 
                className="rounded-full px-8 h-12 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-all font-bold"
                onClick={async () => {
                  if (confirm("¿Estás seguro de que quieres cerrar sesión en todos los dispositivos? Tendrás que volver a entrar incluso en este equipo.")) {
                    try {
                      const res = await fetch("/api/auth/logout-all", { method: "POST" });
                      if (res.ok) {
                        toast.success("Todas las sesiones han sido cerradas");
                        window.location.href = "/auth/login";
                      } else {
                        toast.error("Error al invalidar sesiones");
                      }
                    } catch (e) {
                      toast.error("Error de conexión");
                    }
                  }
                }}
              >
                Cerrar sesión en todos los dispositivos
              </Button>
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
              <Switch 
                checked={booking.active} 
                onCheckedChange={async (val) => {
                  setBooking({...booking, active: val});
                  try {
                    const res = await fetch("/api/users/me", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ bookingEnabled: val })
                    });
                    if (res.ok) {
                      toast.success(val ? "Agendamiento activado" : "Agendamiento desactivado");
                    }
                  } catch (e) {
                    toast.error("Error al guardar estado");
                  }
                }} 
              />
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
                <Button 
                  className="h-12 px-6 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                  onClick={() => booking.url && window.open(booking.url, '_blank')}
                  disabled={!booking.url}
                >
                  Probar Link
                </Button>
              </div>
            </div>

            <div className="space-y-4 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center">
                  <Share2 className="h-4 w-4" />
                </div>
                <h4 className="font-bold text-slate-900">Personalizar URL</h4>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Slug Personalizado</Label>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-slate-400 font-mono hidden md:block">/booking/</div>
                  <Input 
                    value={userData?.bookingSlug || ""} 
                    onChange={e => setUserData({...userData, bookingSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})}
                    placeholder="ej. juan-perez"
                    className="h-12 rounded-xl border-slate-200" 
                  />
                </div>
                <p className="text-[10px] text-slate-500 italic">Si se deja vacío, se usará tu ID de usuario por defecto.</p>
              </div>
              <div className="pt-4 flex justify-end">
                <Button 
                  onClick={handleUpdateProfile}
                  disabled={saving}
                  className="rounded-full px-8 h-10 premium-gradient-primary shadow-lg shadow-primary/20 text-xs font-bold"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                  Actualizar URL
                </Button>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 space-y-6">
              {/* Horarios de disponibilidad */}
              <div 
                className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => setShowHorariosModal(true)}
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">Horarios de Disponibilidad</h4>
                    <p className="text-xs text-slate-500">Define tu horario laboral para citas</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{horarios.length} días configurados</span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
              </div>
              
              {/* Ausencias/Vacaciones */}
              <div 
                className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => setShowAusenciaModal(true)}
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">Ausencias / Vacaciones</h4>
                    <p className="text-xs text-slate-500">Bloquea fechas en las que no estás disponible</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{ausencias.length} períodos</span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
              </div>
              
              {/* Zona horaria */}
              <div 
                className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => setShowTimezoneModal(true)}
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
                    <Globe className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">Zona Horaria</h4>
                    <p className="text-xs text-slate-500">Configura tu zona para correcta visualización de horarios</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-blue-600 font-medium">{timezone}</span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
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
                     <Switch checked={notifications.browser} onCheckedChange={(val) => updateNotificationSetting('browser', val)} />
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
                    <Switch checked={notifications.calls} onCheckedChange={(val) => updateNotificationSetting('calls', val)} />
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
                    <Switch checked={notifications.leads} onCheckedChange={(val) => updateNotificationSetting('leads', val)} />
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
      {activeSection === "agent-skills" && (
        <SectionWrapper 
          key="agent-skills"
          title="IA Agent Skills" 
          description="Conecta tu asistente IA personal (Gemma/Gemma local) directamente a tus capacidades operativas."
          icon={Cpu}
        >
          <div className="space-y-6">
            <Card className="border-none shadow-xl ring-1 ring-border/50 p-8">
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-1 space-y-4">
                  <div className="h-14 w-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
                    <Zap className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Conexión con Asistente IA</h3>
                    <p className="text-slate-500 text-sm mt-1">
                      Utiliza Volkern como el "cerebro operativo" de tu asistente local. Expone herramientas de gestión de leads, tareas y finanzas mediante el protocolo MCP.
                    </p>
                  </div>
                  
                  <div className="pt-4 flex flex-wrap gap-3">
                    <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold uppercase tracking-wider">Secured by The Vault 2.0</span>
                    <span className="px-3 py-1 bg-blue-100 text-blue-600 rounded-full text-[10px] font-bold uppercase tracking-wider">Gemma optimized</span>
                    <span className="px-3 py-1 bg-green-100 text-green-600 rounded-full text-[10px] font-bold uppercase tracking-wider">Audit logs enabled</span>
                  </div>
                </div>

                <div className="w-full md:w-auto pt-6 md:pt-0">
                  <Button 
                    onClick={handleGenerateSkillKey}
                    disabled={generatingKey}
                    className="w-full md:w-auto rounded-full px-10 h-14 premium-gradient-primary shadow-xl shadow-primary/20"
                  >
                    {generatingKey ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <ShieldCheck className="h-5 w-5 mr-2" />}
                    Generar Nueva Conexión
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="border-none shadow-xl ring-1 ring-border/50 overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                <CardTitle className="text-sm font-black uppercase text-slate-400 tracking-widest">Información de Endpoint</CardTitle>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="space-y-4">
                  <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Root Directory URL (Para App Móvil / Manage Skills)</Label>
                  <div className="flex gap-2">
                     <div className="flex-1 h-12 bg-slate-900 text-slate-300 border border-slate-800 rounded-xl flex items-center px-4 font-mono text-xs overflow-hidden truncate">
                       {mounted ? window.location.origin : ''}/api/skills/user/{userData?.id}/
                     </div>
                     <Button 
                      variant="outline" 
                      className="h-12 w-12 rounded-xl border-slate-200" 
                      onClick={() => copyToClipboard(`${mounted ? window.location.origin : ''}/api/skills/user/${userData?.id}/`)}
                     >
                       <Copy className="h-4 w-4" />
                     </Button>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium italic">
                    * Esta URL sirve como el directorio raíz que expone el manifest.json y la especificación OpenAPI.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Modal de éxito para la API Key */}
          <AnimatePresence>
            {showSkillModal && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }} 
                  onClick={() => setShowSkillModal(false)}
                  className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                />
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }} 
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100"
                >
                  <div className="p-10 space-y-8">
                     <div className="text-center space-y-4">
                        <div className="h-20 w-20 bg-green-100 text-green-600 rounded-3xl mx-auto flex items-center justify-center">
                          <ShieldCheck className="h-10 w-10" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">¡Conexión Generada!</h3>
                        <p className="text-slate-500 font-medium pb-4">
                          Copia esta llave ahora. Por seguridad, <span className="text-red-500 font-bold">no volverá a mostrarse</span>.
                        </p>
                     </div>

                     <div className="space-y-6">
                       <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Root Directory URL</Label>
                          <div className="flex gap-2">
                             <div className="flex-1 h-12 bg-slate-50 border border-slate-200 rounded-xl flex items-center px-4 font-mono text-[10px] text-slate-600 truncate">
                                {mounted ? window.location.origin : ''}/api/skills/user/{userData?.id}/
                             </div>
                             <Button variant="outline" className="h-12 w-12 rounded-xl" onClick={() => copyToClipboard(`${mounted ? window.location.origin : ''}/api/skills/user/${userData?.id}/`)}>
                                <Copy className="h-4 w-4" />
                             </Button>
                          </div>
                       </div>

                       <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">API Key (Bearer Token)</Label>
                          <div className="flex gap-2">
                             <div className="flex-1 h-12 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center px-4 font-mono text-[10px] text-indigo-600 truncate">
                                {skillKey?.key}
                             </div>
                             <Button className="h-12 w-12 rounded-xl premium-gradient-primary" onClick={() => copyToClipboard(skillKey?.key)}>
                                <Copy className="h-4 w-4" />
                             </Button>
                          </div>
                       </div>
                     </div>

                     <Button onClick={() => setShowSkillModal(false)} className="w-full h-14 rounded-2xl bg-slate-900 text-white font-bold text-lg hover:bg-slate-800">
                       He guardado mi llave
                     </Button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </SectionWrapper>
      )}

      {activeSection === "mi-tarjeta" && (
        <SectionWrapper 
          key="mi-tarjeta"
          title="Mi Tarjeta Digital" 
          description="Gestiona tu identidad profesional y tarjeta de presentación con QR."
          icon={CreditCard}
        >
          <Card className="border-none shadow-xl ring-1 ring-border/50 p-8">
            <div className="flex flex-col md:flex-row gap-10 items-center">
              <div className="w-full md:w-64 aspect-[9/16] bg-slate-100 rounded-[2.5rem] border-8 border-slate-900 shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent" />
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="w-20 h-20 rounded-full bg-white shadow-lg flex items-center justify-center">
                    <Smartphone className="h-10 w-10 text-slate-400" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-900">{userData?.name}</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Identidad Digital</p>
                  </div>
                  <div className="w-24 h-24 bg-white p-2 rounded-xl shadow-sm">
                    <QrCode className="w-full h-full text-slate-900" />
                  </div>
                </div>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                   <Button variant="secondary" className="rounded-full font-bold" onClick={() => window.location.href='/dashboard/mi-tarjeta'}>
                     <ExternalLink className="h-4 w-4 mr-2" /> Editar Tarjeta
                   </Button>
                </div>
              </div>

              <div className="flex-1 space-y-6">
                <div className="space-y-2">
                  <h3 className="text-xl font-black text-slate-900">Tu Hub de Identidad</h3>
                  <p className="text-slate-500 text-sm">
                    Personaliza cómo te ven tus clientes. Tu tarjeta digital incluye tus redes sociales, datos de contacto y un código QR único que puedes imprimir en tus tarjetas físicas.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
                       <div className="p-2 bg-white rounded-lg shadow-sm">
                          <QrCode className="h-5 w-5 text-primary" />
                       </div>
                       <div className="text-xs">
                          <p className="font-bold text-slate-900">QR Dinámico</p>
                          <p className="text-slate-500">Siempre actualizado</p>
                       </div>
                    </div>
                    <div 
                      className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => cardUrl && copyToClipboard(cardUrl)}
                    >
                       <div className="p-2 bg-white rounded-lg shadow-sm">
                          <Share2 className="h-5 w-5 text-green-600" />
                       </div>
                       <div className="text-xs">
                          <p className="font-bold text-slate-900">Compartir Link</p>
                          <p className="text-slate-500">{cardUrl ? 'Copiar link branding' : 'Vía WhatsApp o NFC'}</p>
                       </div>
                    </div>
                 </div>

                 {cardUrl && (
                   <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-2">
                     <Label className="text-[10px] font-black uppercase text-blue-400 tracking-wider">Tu Link de Tarjeta Brandeado</Label>
                     <div className="flex gap-2">
                       <div className="flex-1 h-10 bg-white border border-blue-100 rounded-xl flex items-center px-4 font-mono text-[12px] text-blue-600 overflow-hidden truncate">
                         {cardUrl}
                       </div>
                       <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-10 w-10 p-0 text-blue-600 hover:bg-blue-100"
                        onClick={() => copyToClipboard(cardUrl)}
                       >
                         <Copy className="h-4 w-4" />
                       </Button>
                     </div>
                   </div>
                 )}

                <div className="pt-4">
                  <Button 
                    onClick={() => window.location.href='/dashboard/mi-tarjeta'}
                    className="rounded-full px-10 h-14 premium-gradient-primary shadow-xl shadow-primary/20 w-full md:w-auto font-bold"
                  >
                    Abrir Editor de Tarjeta
                    <ChevronRight className="h-5 w-5 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </SectionWrapper>
      )}

      {activeSection === "denuncias" && (
        <SectionWrapper 
          key="denuncias"
          title="Canal de Denuncias" 
          description="Buzón seguro e inmutable para reportar irregularidades o casos de acoso/discriminación."
          icon={FileWarning}
        >
          <div className="max-w-2xl mx-auto">
            <ComplaintForm />
          </div>
        </SectionWrapper>
      )}
      
      {/* Modal de Zona Horaria */}
      <AnimatePresence>
        {showTimezoneModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setShowTimezoneModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-100"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-slate-900">Zona Horaria</h3>
                  <Button variant="ghost" size="icon" onClick={() => setShowTimezoneModal(false)}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                
                <p className="text-sm text-slate-500">
                  Selecciona la zona horaria para mostrar correctamente las citas y horarios de disponibilidad.
                </p>
                
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Zona Horaria</Label>
                  <select 
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full h-12 px-3 rounded-xl border border-slate-200 bg-background text-sm"
                  >
                    <option value="America/Mexico_City">Ciudad de México (UTC-5/UTC-6)</option>
                    <option value="America/Monterrey">Monterrey (UTC-5/UTC-6)</option>
                    <option value="America/Tijuana">Tijuana (UTC-7/UTC-8)</option>
                    <option value="America/Chihuahua">Chihuahua (UTC-6/UTC-7)</option>
                    <option value="America/Mazatlan">Mazatlán (UTC-6/UTC-7)</option>
                    <option value="America/Hermosillo">Hermosillo (UTC-7)</option>
                    <option value="America/Cancun">Cancún (UTC-5)</option>
                    <option value="America/Bogota">Bogotá (UTC-5)</option>
                    <option value="America/Lima">Lima (UTC-5)</option>
                    <option value="America/Santiago">Santiago (UTC-4)</option>
                    <option value="America/Buenos_Aires">Buenos Aires (UTC-3)</option>
                    <option value="America/New_York">New York (UTC-5)</option>
                    <option value="America/Los_Angeles">Los Ángeles (UTC-8)</option>
                    <option value="America/Denver">Denver (UTC-7)</option>
                    <option value="Europe/Madrid">Madrid (UTC+1)</option>
                    <option value="Europe/London">London (UTC+0)</option>
                    <option value="Europe/Paris">Paris (UTC+1)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
                
                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setShowTimezoneModal(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSaveTimezone} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Guardar
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Modal de Horarios de Disponibilidad */}
      <AnimatePresence>
        {showHorariosModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setShowHorariosModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-slate-100"
            >
              <div className="p-8 space-y-6 overflow-y-auto max-h-[85vh]">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-slate-900">Horarios de Disponibilidad</h3>
                  <Button variant="ghost" size="icon" onClick={() => setShowHorariosModal(false)}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                
                <p className="text-sm text-slate-500">
                  Define tu horario de atención para cada día de la semana.
                </p>
                
                <div className="space-y-4">
                  {['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((dia, index) => {
                    const horario = horarios.find(h => h.diaSemana === index);
                    const activo = horario?.activo ?? (index >= 1 && index <= 5);
                    const bloques = horario?.bloques || [{ inicio: '09:00', fin: '18:00' }];
                    
                    return (
                      <div key={index} className="p-4 bg-slate-50 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={activo}
                              onChange={(e) => {
                                const updated = [...horarios];
                                const existing = updated.find(h => h.diaSemana === index);
                                if (existing) {
                                  existing.activo = e.target.checked;
                                } else {
                                  updated.push({ diaSemana: index, bloques: [{ inicio: '09:00', fin: '18:00' }], activo: e.target.checked });
                                }
                                setHorarios(updated);
                              }}
                              className="w-4 h-4"
                            />
                            <span className="text-sm font-bold">{dia}</span>
                          </label>
                          {activo && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                const updated = [...horarios];
                                const existing = updated.find(h => h.diaSemana === index);
                                if (existing) {
                                  existing.bloques.push({ inicio: '12:00', fin: '13:00' });
                                } else {
                                  updated.push({ diaSemana: index, bloques: [{ inicio: '09:00', fin: '18:00' }], activo: true });
                                }
                                setHorarios(updated);
                              }}
                              className="text-blue-600 text-xs h-7"
                            >
                              + Agregar horario
                            </Button>
                          )}
                        </div>
                        {activo && (
                          <div className="space-y-2 pl-6">
                            {bloques.map((bloque: any, bIdx: number) => (
                              <div key={bIdx} className="flex items-center gap-2">
                                <span className="text-xs text-slate-400 w-16">Bloque {bIdx + 1}</span>
                                <input 
                                  type="time" 
                                  value={bloque.inicio}
                                  onChange={(e) => {
                                    const updated = [...horarios];
                                    let existing = updated.find(h => h.diaSemana === index);
                                    if (!existing) {
                                      existing = { diaSemana: index, bloques: [], activo: true };
                                      updated.push(existing);
                                    }
                                    existing.bloques[bIdx] = { ...existing.bloques[bIdx], inicio: e.target.value };
                                    setHorarios(updated);
                                  }}
                                  className="h-9 px-3 rounded-lg border border-slate-200 text-sm"
                                />
                                <span className="text-slate-400">a</span>
                                <input 
                                  type="time" 
                                  value={bloque.fin}
                                  onChange={(e) => {
                                    const updated = [...horarios];
                                    let existing = updated.find(h => h.diaSemana === index);
                                    if (!existing) {
                                      existing = { diaSemana: index, bloques: [], activo: true };
                                      updated.push(existing);
                                    }
                                    existing.bloques[bIdx] = { ...existing.bloques[bIdx], fin: e.target.value };
                                    setHorarios(updated);
                                  }}
                                  className="h-9 px-3 rounded-lg border border-slate-200 text-sm"
                                />
                                {bloques.length > 1 && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => {
                                      const updated = [...horarios];
                                      const existing = updated.find(h => h.diaSemana === index);
                                      if (existing) {
                                        existing.bloques = existing.bloques.filter((_: any, i: number) => i !== bIdx);
                                      }
                                      setHorarios(updated);
                                    }}
                                    className="text-red-500 hover:text-red-700 p-1 h-7"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {!activo && <span className="text-xs text-slate-400 ml-6">No disponible</span>}
                      </div>
                    );
                  })}
                </div>
                
                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setShowHorariosModal(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSaveHorarios} disabled={savingHorarios}>
                    {savingHorarios ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Guardar Horarios
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Modal de Ausencias */}
      <AnimatePresence>
        {showAusenciaModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setShowAusenciaModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-100"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-slate-900">Ausencias / Vacaciones</h3>
                  <Button variant="ghost" size="icon" onClick={() => setShowAusenciaModal(false)}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                
                <p className="text-sm text-slate-500">
                  Agrega períodos en los que no estarás disponible para citas.
                </p>
                
                {/* Lista de ausencias existentes */}
                {ausencias.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {ausencias.map((a) => (
                      <div key={a.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
                        <div>
                          <p className="font-medium text-sm">{a.titulo}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(a.fechaInicio).toLocaleDateString('es-MX')} - {new Date(a.fechaFin).toLocaleDateString('es-MX')}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteAusencia(a.id)} className="text-red-500 hover:text-red-700">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Formulario para nueva ausencia */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Título</Label>
                    <Input 
                      value={nuevaAusencia.titulo}
                      onChange={(e) => setNuevaAusencia({...nuevaAusencia, titulo: e.target.value})}
                      placeholder="Ej. Vacaciones de verano"
                      className="h-12 rounded-xl"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Desde</Label>
                      <Input 
                        type="date"
                        value={nuevaAusencia.fechaInicio}
                        onChange={(e) => setNuevaAusencia({...nuevaAusencia, fechaInicio: e.target.value})}
                        className="h-12 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Hasta</Label>
                      <Input 
                        type="date"
                        value={nuevaAusencia.fechaFin}
                        onChange={(e) => setNuevaAusencia({...nuevaAusencia, fechaFin: e.target.value})}
                        className="h-12 rounded-xl"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Tipo</Label>
                    <select 
                      value={nuevaAusencia.tipo}
                      onChange={(e) => setNuevaAusencia({...nuevaAusencia, tipo: e.target.value})}
                      className="w-full h-12 px-3 rounded-xl border border-slate-200"
                    >
                      <option value="vacaciones">Vacaciones</option>
                      <option value="enfermedad">Enfermedad</option>
                      <option value="personal">Día personal</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                </div>
                
                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setShowAusenciaModal(false)}>
                    Cerrar
                  </Button>
                  <Button onClick={handleSaveAusencia} disabled={savingAusencia}>
                    {savingAusencia ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Agregar
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

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
