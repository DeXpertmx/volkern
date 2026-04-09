'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Save, Globe, Mail, Clock, CreditCard, Palette, Upload, Image as ImageIcon, Key, ArrowRight, User, Lock, Calculator, Calendar, Building, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { WhitelabelConfig } from '@/components/whitelabel-config';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import HorariosMultiplesEditor, { HorariosConfig } from '@/components/HorariosMultiplesEditor';
import FiscalConfigSection from '@/components/fiscal/FiscalConfigSection';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Copy, ExternalLink, Link as LinkIcon, Sparkles, Bell, BellRing, BellOff } from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';

interface Config {
  business_name?: string;
  business_email?: string;
  timezone?: string;
  admin_email?: string;
  from_name?: string;
  stripe_publishable_key?: string;
  stripe_secret_key?: string;
  stripe_webhook_secret?: string;
  horariosAtencion?: HorariosConfig;
  logo_corporativo?: string;
  [key: string]: string | HorariosConfig | undefined;
}

export default function ConfiguracionPage() {
  const router = useRouter();
  const [config, setConfig] = useState<Config>({});
  const [tenantId, setTenantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Estado para cambio de contraseña
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Estado para datos del usuario (perfil personal)
  const [userData, setUserData] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [savingUser, setSavingUser] = useState(false);

  const [activeModules, setActiveModules] = useState<string[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);
  
  const [holdedConfig, setHoldedConfig] = useState({ apiKey: '', activo: false, conectado: false });
  const [stripeInvoicing, setStripeInvoicing] = useState({ activo: false, conectado: false });
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);

  useEffect(() => {
    fetchConfig();
    fetchUser();
    fetchModules();
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    setLoadingIntegrations(true);
    try {
      const [holdedRes, stripeRes] = await Promise.all([
        fetch('/api/integrations/holded'),
        fetch('/api/integrations/stripe-invoicing')
      ]);

      if (holdedRes.ok) {
        const data = await holdedRes.json();
        setHoldedConfig({
          apiKey: data.credenciales?.apiKey || '',
          activo: data.activo || false,
          conectado: data.conectado || false
        });
      }

      if (stripeRes.ok) {
        const data = await stripeRes.json();
        setStripeInvoicing({
          activo: data.activo || false,
          conectado: data.conectado || false
        });
      }
    } catch (error) {
      console.error('Error fetching integrations:', error);
    } finally {
      setLoadingIntegrations(false);
    }
  };

  const fetchModules = async () => {
    try {
      const res = await fetch('/api/tenant/modules');
      if (res.ok) {
        const data = await res.json();
        setActiveModules(data.modules || []);
      }
    } catch (error) {
      console.error('Error fetching modules:', error);
    } finally {
      setLoadingModules(false);
    }
  };

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/users/me');
      if (res.ok) {
        const data = await res.json();
        setUserData(data);
      }
    } catch (error) {
      console.error('Error al cargar datos de usuario:', error);
    } finally {
      setLoadingUser(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/configuracion');
      if (res.ok) {
        const data = await res.json();
        // Extraer y guardar el tenantId
        if (data._tenantId) {
          setTenantId(data._tenantId);
          delete data._tenantId; // No queremos mostrarlo en los campos de configuración
        }
        setConfig(data);
      }
    } catch (error) {
      console.error('Error al cargar configuración:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = (key: string, value: string) => {
    setConfig({ ...config, [key]: value });
  };

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    try {
      // Validar tipo de archivo
      if (!file.type.startsWith('image/')) {
        toast.error('El archivo debe ser una imagen');
        return;
      }

      // Validar tamaño (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        toast.error('El archivo es demasiado grande (máximo 5MB)');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('tipo', 'logo_corporativo');

      const res = await fetch('/api/configuracion/logo', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const urlToUse = data.downloadUrl || data.url;
        updateConfig('logo_corporativo', urlToUse);
        toast.success('Logo corporativo subido exitosamente');
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al subir logo');
      }
    } catch (error) {
      console.error('Error al subir logo:', error);
      toast.error(error instanceof Error ? error.message : 'Error al subir logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleLogoUpload(file);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    setUploadingAvatar(true);
    try {
      if (!file.type.startsWith('image/')) {
        toast.error('El archivo debe ser una imagen');
        return;
      }

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        toast.error('El archivo es demasiado grande (máximo 5MB)');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/users/avatar', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const urlToUse = data.downloadUrl || data.url;
        setUserData({ ...userData, image: urlToUse });
        toast.success('Foto de perfil subida exitosamente');
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al subir avatar');
      }
    } catch (error) {
      console.error('Error al subir avatar:', error);
      toast.error(error instanceof Error ? error.message : 'Error al subir avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleAvatarUpload(file);
    }
  };

  const guardarConfigGeneral = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/configuracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: config.business_name || 'Volkern CRM',
          business_email: config.business_email || 'admin@volkern.com',
          timezone: config.timezone || 'America/Mexico_City',
          logo_corporativo: config.logo_corporativo,
          // Nuevos campos de plantillas
          plantilla_orden_venta: config.plantilla_orden_venta || 'default',
          plantilla_contrato: config.plantilla_contrato || 'default',
          plantilla_email: config.plantilla_email || 'modern',
          plantilla_firma: config.plantilla_firma || 'simple',
        }),
      });

      if (res.ok) {
        toast.success('Configuración general guardada');
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      toast.error('Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  const guardarConfigEmail = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/configuracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_email: config.admin_email || 'admin@volkern.com',
          from_name: config.from_name || 'Volkern CRM',
        }),
      });

      if (res.ok) {
        toast.success('Configuración de email guardada');
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      toast.error('Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  const guardarHorarios = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/configuracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          horariosAtencion: config.horariosAtencion,
        }),
      });

      if (res.ok) {
        toast.success('Horarios guardados');
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      toast.error('Error al guardar horarios');
    } finally {
      setSaving(false);
    }
  };

  const handleHorariosChange = (horarios: HorariosConfig) => {
    setConfig({ ...config, horariosAtencion: horarios });
  };

  const guardarStripe = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/configuracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stripe_publishable_key: config.stripe_publishable_key,
          stripe_secret_key: config.stripe_secret_key,
          stripe_webhook_secret: config.stripe_webhook_secret,
        }),
      });

      if (res.ok) {
        toast.success('Configuración de Stripe guardada');
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      toast.error('Error al guardar configuración de Stripe');
    } finally {
      setSaving(false);
    }
  };

  const cambiarPassword = async () => {
    // Validaciones del frontend
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Por favor, completa todos los campos');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas nuevas no coinciden');
      return;
    }

    if (newPassword.length < 8) {
      toast.error('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch('/api/users/cambiar-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('✅ Contraseña actualizada exitosamente');
        // Limpiar los campos
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.error(data.error || 'Error al cambiar la contraseña');
      }
    } catch (error) {
      console.error('Error al cambiar contraseña:', error);
      toast.error('Error al cambiar la contraseña');
    } finally {
      setChangingPassword(false);
    }
  };

  const guardarPerfilUsuario = async () => {
    setSavingUser(true);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: userData.name,
          telefono: userData.telefono,
          bookingSlug: userData.bookingSlug,
          bookingTitle: userData.bookingTitle,
          bookingBio: userData.bookingBio,
          bookingEnabled: userData.bookingEnabled,
          image: userData.image
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUserData(data.user);
        }
        toast.success('Perfil actualizado correctamente');
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Error al guardar');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar perfil');
    } finally {
      setSavingUser(false);
    }
  };

  const { 
    isSupported, 
    subscription, 
    permissionState, 
    subscribe, 
    unsubscribe, 
    loading: loadingPush 
  } = usePushNotifications();

  const copyBookingUrl = () => {
    if (!userData?.bookingSlug) return;
    const url = `${window.location.origin}/booking/${userData.bookingSlug}`;
    navigator.clipboard.writeText(url);
    toast.success('URL copiada al portapapeles');
  };

  const guardarHolded = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/integrations/holded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: holdedConfig.apiKey,
          activo: holdedConfig.activo
        }),
      });

      if (res.ok) {
        toast.success('Configuración de Holded guardada');
        fetchIntegrations();
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      toast.error('Error al guardar configuración de Holded');
    } finally {
      setSaving(false);
    }
  };

  const guardarStripeInvoicing = async (activo: boolean) => {
    setSaving(true);
    try {
      const res = await fetch('/api/integrations/stripe-invoicing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo }),
      });

      if (res.ok) {
        setStripeInvoicing({ ...stripeInvoicing, activo });
        toast.success(`Facturación de Stripe ${activo ? 'activada' : 'desactivada'}`);
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      toast.error('Error al actualizar facturación de Stripe');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center">
            <Settings className="h-8 w-8 mr-3 text-primary" />
            Configuración
          </h1>
          <p className="text-muted-foreground">
            Administra la configuración general de tu CRM
          </p>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className={`grid w-full max-w-5xl ${userData?.role?.nombre === 'Superadmin' ? 'grid-cols-7' : 'grid-cols-6'}`}>
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="perfil" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Perfil</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Email</span>
          </TabsTrigger>
          <TabsTrigger value="horarios" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Horarios</span>
          </TabsTrigger>
          <TabsTrigger value="pagos" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Pagos</span>
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            <span className="hidden sm:inline">Fiscal</span>
          </TabsTrigger>
          <TabsTrigger value="facturacion" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Facturación</span>
          </TabsTrigger>
          {/* Pestaña Marca visible para Superadmin O con módulo white_label */}
          {(userData?.role?.nombre === 'Superadmin' || activeModules.includes('white_label')) && (
            <TabsTrigger value="whitelabel" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Marca</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="documentos" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Documentos</span>
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Globe className="h-5 w-5 mr-2" />
                Configuración General
              </CardTitle>
              <CardDescription>
                Información básica de tu negocio
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="business-name">Nombre del Negocio</Label>
                <Input
                  id="business-name"
                  value={config.business_name || ''}
                  onChange={(e) => updateConfig('business_name', e.target.value)}
                  placeholder="Mi Negocio"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-email">Email de Contacto</Label>
                <Input
                  id="business-email"
                  type="email"
                  value={config.business_email || ''}
                  onChange={(e) => updateConfig('business_email', e.target.value)}
                  placeholder="contacto@minegocio.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Zona Horaria</Label>
                <Input
                  id="timezone"
                  value={config.timezone || ''}
                  onChange={(e) => updateConfig('timezone', e.target.value)}
                  placeholder="America/Mexico_City"
                />
              </div>

              <div className="pt-4 border-t">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Plantillas de Documentos
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="plantilla_orden">Orden de Venta</Label>
                      <button 
                        onClick={() => {
                          const id = config.plantilla_orden_venta === 'default' || !config.plantilla_orden_venta ? 'orden-venta-modern' : config.plantilla_orden_venta;
                          router.push(`/template-editor/document/${id}`);
                        }}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-md transition-all hover:bg-indigo-100 border border-indigo-100 shadow-sm"
                      >
                        <Palette size={10} />
                        <span>PERSONALIZAR DISEÑO</span>
                      </button>
                    </div>
                    <select
                      id="plantilla_orden"
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                      value={(config.plantilla_orden_venta as string) || 'default'}
                      onChange={(e) => updateConfig('plantilla_orden_venta', e.target.value)}
                    >
                      <option value="default">Estándar Profesional</option>
                      <option value="modern">Moderno Glassmorphism</option>
                      <option value="minimal">Minimalista</option>
                      <option value="corporate">Corporativo Formal</option>
                      <option value="orden-venta-modern">Personalizada (GrapesJS)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="plantilla_contrato">Contrato</Label>
                      <button 
                        onClick={() => {
                          const id = config.plantilla_contrato === 'default' || !config.plantilla_contrato ? 'contrato-servicios' : config.plantilla_contrato;
                          router.push(`/template-editor/document/${id}`);
                        }}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-md transition-all hover:bg-indigo-100 border border-indigo-100 shadow-sm"
                      >
                        <Palette size={10} />
                        <span>PERSONALIZAR DISEÑO</span>
                      </button>
                    </div>
                    <select
                      id="plantilla_contrato"
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                      value={(config.plantilla_contrato as string) || 'default'}
                      onChange={(e) => updateConfig('plantilla_contrato', e.target.value)}
                    >
                      <option value="default">Contrato de Servicios Gral.</option>
                      <option value="nda">Acuerdo de Confidencialidad (NDA)</option>
                      <option value="saas">Términos de Servicio SaaS</option>
                      <option value="contrato-servicios">Personalizado (GrapesJS)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="plantilla_email">Estilo de Emails</Label>
                      <button 
                        onClick={() => router.push(`/template-editor/email/email-modern-newsletter`)}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-md transition-all hover:bg-indigo-100 border border-indigo-100 shadow-sm"
                      >
                        <Palette size={10} />
                        <span>PERSONALIZAR DISEÑO</span>
                      </button>
                    </div>
                    <select
                      id="plantilla_email"
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                      value={(config.plantilla_email as string) || 'modern'}
                      onChange={(e) => updateConfig('plantilla_email', e.target.value)}
                    >
                      <option value="modern">Moderno (Gradientes)</option>
                      <option value="classic">Clásico (Texto Plano)</option>
                      <option value="dark">Dark Mode</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plantilla_firma">Firma Digital</Label>
                    <select
                      id="plantilla_firma"
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                      value={(config.plantilla_firma as string) || 'simple'}
                      onChange={(e) => updateConfig('plantilla_firma', e.target.value)}
                    >
                      <option value="simple">Firma Simple (QR)</option>
                      <option value="advanced">Firma Avanzada (Certificado)</option>
                      <option value="biometric">Firma Biométrica</option>
                    </select>
                  </div>
                </div>
              </div>

              <Button onClick={guardarConfigGeneral} disabled={saving} className="mt-4">
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Guardando...' : 'Guardar Configuración'}
              </Button>
            </CardContent>
          </Card>

          {/* Logo Corporativo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <ImageIcon className="h-5 w-5 mr-2" />
                Logo Corporativo
              </CardTitle>
              <CardDescription>
                Logo que se utilizará en todas las comunicaciones, marketing, tarjetas digitales y materiales corporativos (independiente del logo de whitelabel)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-6 text-center space-y-4">
                {config.logo_corporativo && (
                  <div className="relative w-full max-w-md h-32 mx-auto bg-gray-50 rounded-lg flex items-center justify-center">
                    <Image
                      src={config.logo_corporativo}
                      alt="Logo Corporativo"
                      fill
                      className="object-contain p-4"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                  <Button
                    variant="outline"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingLogo ? 'Subiendo...' : config.logo_corporativo ? 'Cambiar Logo' : 'Subir Logo'}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Formatos aceptados: JPG, PNG, SVG • Tamaño máximo: 5MB
                  </p>
                </div>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800 font-medium">ℹ️ Uso del logo</p>
                <p className="text-xs text-blue-700 mt-1">
                  Este logo se utilizará automáticamente en: emails de campañas, tarjetas digitales, mensajes automatizados, páginas de aterrizaje y materiales de marketing.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Códigos de Embed */}
          <Card>
            <CardHeader>
              <CardTitle>Códigos de Integración</CardTitle>
              <CardDescription>
                Copia estos códigos para integrar el CRM en tu sitio web
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!tenantId && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-sm text-amber-800">
                    ⚠️ Los códigos de integración estarán disponibles después de iniciar sesión correctamente.
                  </p>
                </div>
              )}
              <div>
                <Label className="text-sm font-medium">Formulario de Contacto</Label>
                <div className="mt-2 p-3 bg-gray-50 rounded-md font-mono text-sm overflow-x-auto">
                  {`<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/embed/contact?tenantId=${tenantId}" width="100%" height="600" frameborder="0"></iframe>`}
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Sistema de Agendamiento</Label>
                <div className="mt-2 p-3 bg-gray-50 rounded-md font-mono text-sm overflow-x-auto">
                  {`<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/embed/booking?tenantId=${tenantId}" width="100%" height="800" frameborder="0"></iframe>`}
                </div>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-800 font-medium">ℹ️ Instrucciones de uso</p>
                <ul className="text-xs text-blue-700 mt-2 space-y-1 list-disc list-inside">
                  <li>Copia el código completo del iframe que desees usar</li>
                  <li>Pégalo en el HTML de tu sitio web donde quieras mostrar el formulario</li>
                  <li>Los leads y citas se registrarán automáticamente en tu CRM</li>
                  <li>No es necesario que los visitantes tengan cuenta en Volkern</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Perfil & Seguridad Tab */}
        <TabsContent value="perfil" className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              {/* Notificaciones Push (NUEVO) */}
              <Card className="border-blue-500/20 shadow-lg shadow-blue-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Bell className="h-5 w-5 mr-2" />
                    Notificaciones en el Navegador
                  </CardTitle>
                  <CardDescription>
                    Recibe alertas en tiempo real de nuevos leads y citas incluso con el navegador cerrado
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {!isSupported ? (
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-4">
                      <BellOff className="h-6 w-6 text-amber-500 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-amber-900">Navegador no compatible</p>
                        <p className="text-xs text-amber-700">Tu navegador actual no soporta notificaciones Push. Intenta con Chrome, Edge o Safari (iOS 16.4+).</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex gap-4">
                        {subscription ? (
                          <BellRing className="h-6 w-6 text-green-500 shrink-0" />
                        ) : (
                          <Bell className="h-6 w-6 text-slate-400 shrink-0" />
                        )}
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {subscription ? 'Notificaciones Activas' : 'Notificaciones Desactivadas'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {permissionState === 'denied' 
                              ? 'Has bloqueado las notificaciones. Debes resetear los permisos en tu navegador.' 
                              : 'Suscríbete para recibir alertas de actividad crítica.'}
                          </p>
                        </div>
                      </div>
                      <Switch 
                        checked={!!subscription} 
                        disabled={loadingPush || permissionState === 'denied'}
                        onCheckedChange={(checked) => {
                          if (checked) subscribe();
                          else unsubscribe();
                        }}
                      />
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 gap-3">
                    <div className="p-3 bg-white border rounded-xl flex items-center gap-3">
                      <div className="h-8 w-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">Alertas de nuevos leads asignados</p>
                      </div>
                    </div>
                    <div className="p-3 bg-white border rounded-xl flex items-center gap-3">
                      <div className="h-8 w-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">Recordatorios de citas agendadas</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Información Personal (EXISTENTE) */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <User className="h-5 w-5 mr-2" />
                    Información Personal
                  </CardTitle>
                  <CardDescription>
                    Tus datos básicos de perfil
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Foto de Perfil */}
                  <div className="flex flex-col items-center space-y-4 pb-4 border-b">
                    <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-primary/20 bg-muted flex items-center justify-center">
                      {userData?.image ? (
                        <Image
                          src={userData.image}
                          alt="Avatar"
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <User className="h-12 w-12 text-muted-foreground" />
                      )}
                      {uploadingAvatar && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-center space-y-2">
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarChange}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={uploadingAvatar}
                      >
                        <Upload className="h-3 w-3 mr-2" />
                        {uploadingAvatar ? 'Subiendo...' : userData?.image ? 'Cambiar Foto' : 'Subir Foto'}
                      </Button>
                      <p className="text-[10px] text-muted-foreground text-center">
                        Imagen usada para tarjetas digitales y comunicaciones personales
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="user-name">Nombre</Label>
                    <Input
                      id="user-name"
                      value={userData?.name || ''}
                      onChange={(e) => setUserData({ ...userData, name: e.target.value })}
                      placeholder="Tu nombre"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="user-email">Email</Label>
                    <Input
                      id="user-email"
                      value={userData?.email || ''}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="user-phone">Teléfono / WhatsApp</Label>
                    <Input
                      id="user-phone"
                      value={userData?.telefono || ''}
                      onChange={(e) => setUserData({ ...userData, telefono: e.target.value })}
                      placeholder="+34 ..."
                    />
                  </div>
                  <Button onClick={guardarPerfilUsuario} disabled={savingUser}>
                    <Save className="h-4 w-4 mr-2" />
                    {savingUser ? 'Guardando...' : 'Guardar Datos Personales'}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Lock className="h-5 w-5 mr-2" />
                    Cambiar Contraseña
                  </CardTitle>
                  <CardDescription>
                    Actualiza tu contraseña para mantener tu cuenta segura
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">Contraseña Actual</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Ingresa tu contraseña actual"
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Nueva Contraseña</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirmar Nueva Contraseña</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirma tu nueva contraseña"
                      autoComplete="new-password"
                    />
                  </div>
                  <Button
                    onClick={cambiarPassword}
                    disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                    className="w-full"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    {changingPassword ? 'Actualizando...' : 'Cambiar Contraseña'}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              {/* Agendamiento Personal (BOOKING) */}
              <Card className="border-purple-500/20 shadow-lg shadow-purple-500/5">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-purple-500/10 rounded-lg">
                        <Calendar className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <CardTitle>Página de Agendamiento</CardTitle>
                        <CardDescription>Tu link personal para recibir citas</CardDescription>
                      </div>
                    </div>
                    <Switch
                      checked={userData?.bookingEnabled || false}
                      onCheckedChange={(checked) => setUserData({ ...userData, bookingEnabled: checked })}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <AnimatePresence>
                    {!userData?.bookingEnabled && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                        <span>⚠️ Tu página de agendamiento está desactivada.</span>
                      </div>
                    )}
                  </AnimatePresence>

                  <div className="space-y-2">
                    <Label htmlFor="booking-slug">URL Personalizada</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="booking-slug"
                          value={userData?.bookingSlug || ''}
                          onChange={(e) => setUserData({ ...userData, bookingSlug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                          placeholder="juan-perez"
                          className="pl-9"
                        />
                      </div>
                      <Button variant="outline" size="icon" onClick={copyBookingUrl} title="Copiar URL">
                        <Copy className="h-4 w-4" />
                      </Button>
                      {userData?.bookingSlug && (
                        <Link href={`/booking/${userData.bookingSlug}`} target="_blank">
                          <Button variant="outline" size="icon" title="Ver página">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground ml-1">
                      Tu link será: {typeof window !== 'undefined' ? window.location.origin : ''}/booking/{userData?.bookingSlug || 'tu-slug'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="booking-title">Título Profesional</Label>
                    <div className="relative">
                      <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400" />
                      <Input
                        id="booking-title"
                        value={userData?.bookingTitle || ''}
                        onChange={(e) => setUserData({ ...userData, bookingTitle: e.target.value })}
                        placeholder="Director Comercial / Especialista en Energía"
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="booking-bio">Biografía Corta (Pública)</Label>
                    <Textarea
                      id="booking-bio"
                      value={userData?.bookingBio || ''}
                      onChange={(e) => setUserData({ ...userData, bookingBio: e.target.value })}
                      placeholder="Cuéntales a tus clientes quién eres y cómo puedes ayudarlos..."
                      className="min-h-[100px] resize-none"
                    />
                  </div>

                  <Button
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0 shadow-md transition-all active:scale-[0.98]"
                    onClick={guardarPerfilUsuario}
                    disabled={savingUser}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {savingUser ? 'Guardando...' : 'Guardar Configuración de Booking'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Email Tab */}
        <TabsContent value="email" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Mail className="h-5 w-5 mr-2" />
                Configuración de Email
              </CardTitle>
              <CardDescription>
                Configuración de envío de emails
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-email">Email del Administrador</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={config.admin_email || ''}
                  onChange={(e) => updateConfig('admin_email', e.target.value)}
                  placeholder="admin@minegocio.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="from-name">Nombre del Remitente</Label>
                <Input
                  id="from-name"
                  value={config.from_name || ''}
                  onChange={(e) => updateConfig('from_name', e.target.value)}
                  placeholder="Mi Negocio"
                />
              </div>
              <Button onClick={guardarConfigEmail} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Horarios Tab */}
        <TabsContent value="horarios" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                Horarios de Atención
              </CardTitle>
              <CardDescription>
                Configura los horarios de atención de tu negocio. Puedes agregar múltiples rangos de horario por día (ej: mañana y tarde).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <HorariosMultiplesEditor
                value={config.horariosAtencion}
                onChange={handleHorariosChange}
              />
              <Button onClick={guardarHorarios} disabled={saving} className="mt-4">
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Guardando...' : 'Guardar Horarios'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pagos Tab */}
        <TabsContent value="pagos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CreditCard className="h-5 w-5 mr-2" />
                Configuración de Pagos
              </CardTitle>
              <CardDescription>
                Configuración de Stripe para procesar pagos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="stripe-pk">Stripe Publishable Key</Label>
                <Input
                  id="stripe-pk"
                  placeholder="pk_test_..."
                  type="password"
                  value={config.stripe_publishable_key || ''}
                  onChange={(e) => updateConfig('stripe_publishable_key', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stripe-sk">Stripe Secret Key</Label>
                <Input
                  id="stripe-sk"
                  placeholder="sk_test_..."
                  type="password"
                  value={config.stripe_secret_key || ''}
                  onChange={(e) => updateConfig('stripe_secret_key', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="webhook-secret">Webhook Secret (Opcional)</Label>
                <Input
                  id="webhook-secret"
                  placeholder="whsec_..."
                  type="password"
                  value={config.stripe_webhook_secret || ''}
                  onChange={(e) => updateConfig('stripe_webhook_secret', e.target.value)}
                />
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-sm text-yellow-800 font-medium">⚠️ Configuración pendiente</p>
                <p className="text-xs text-yellow-700">Configura tus claves de Stripe para habilitar los pagos</p>
              </div>
              <Button onClick={guardarStripe} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Guardando...' : 'Guardar Claves'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fiscal Tab */}
        <TabsContent value="fiscal" className="space-y-6">
          <FiscalConfigSection />
        </TabsContent>

        {/* Facturación e Integraciones Tab */}
        <TabsContent value="facturacion" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Holded Integration */}
            <Card className={holdedConfig.activo ? "border-primary/50 shadow-sm" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                      <Building className="h-6 w-6 text-orange-600" />
                    </div>
                    <div>
                      <CardTitle>Holded</CardTitle>
                      <CardDescription>ERP y Facturación (España)</CardDescription>
                    </div>
                  </div>
                  <Switch 
                    checked={holdedConfig.activo} 
                    onCheckedChange={(checked) => setHoldedConfig({ ...holdedConfig, activo: checked })}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Conecta tu cuenta de Holded para generar facturas automáticamente. Ideal para cumplir con la normativa española (TicketBAI, etc).
                </p>
                <div className="space-y-2">
                  <Label htmlFor="holded-api-key">API Key de Holded</Label>
                  <div className="flex gap-2">
                    <Input
                      id="holded-api-key"
                      type="password"
                      placeholder="Tu API Key de Holded"
                      value={holdedConfig.apiKey}
                      onChange={(e) => setHoldedConfig({ ...holdedConfig, apiKey: e.target.value })}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <ArrowRight className="h-2 w-2" />
                    Consíguela en Configuración {">"} Desarrolladores dentro de Holded.
                  </p>
                </div>
                <Button 
                  className="w-full" 
                  onClick={guardarHolded} 
                  disabled={saving || !holdedConfig.apiKey}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Guardar Configuración Holded
                </Button>
                {holdedConfig.conectado && (
                  <div className="p-2 bg-green-50 border border-green-100 rounded-md flex items-center gap-2 text-xs text-green-700">
                    <CheckCircle2 className="h-3 w-3" />
                    Conexión establecida con Holded
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stripe Invoicing */}
            <Card className={stripeInvoicing.activo ? "border-primary/50 shadow-sm" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <CreditCard className="h-6 w-6 text-indigo-600" />
                    </div>
                    <div>
                      <CardTitle>Stripe Invoicing</CardTitle>
                      <CardDescription>Facturación Global</CardDescription>
                    </div>
                  </div>
                  <Switch 
                    checked={stripeInvoicing.activo} 
                    onCheckedChange={guardarStripeInvoicing}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Usa tu integración de Stripe para emitir facturas y cobrar a tus clientes mediante enlaces de pago automáticos.
                </p>
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg space-y-2">
                  <h4 className="text-xs font-bold text-indigo-900 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Ventajas de Stripe Invoicing:
                  </h4>
                  <ul className="text-[11px] text-indigo-700 space-y-1 list-disc list-inside">
                    <li>Cobro integrado por tarjeta, SEPA y más</li>
                    <li>Recordatorios de pago automáticos</li>
                    <li>Reconciliación bancaria automática</li>
                  </ul>
                </div>
                {!config.stripe_secret_key && (
                  <div className="p-2 bg-amber-50 border border-amber-100 rounded-md flex items-start gap-2 text-xs text-amber-700">
                    <AlertCircle className="h-3 w-3 mt-0.5" />
                    <div>
                      <strong>Stripe no configurado:</strong> Debes configurar tus claves de Stripe en la pestaña "Pagos" antes de activar la facturación.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">¿Cómo funciona la facturación automática?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Una vez configurado un proveedor, puedes crear automatizaciones (Workflows) que disparen la acción <b>"Generar Factura"</b> cuando ocurra un evento relevante, como:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="p-3 border rounded-lg text-xs">
                  <div className="font-bold mb-1">Cita Pagada</div>
                  Se genera la factura al marcar una cita como pagada.
                </div>
                <div className="p-3 border rounded-lg text-xs">
                  <div className="font-bold mb-1">Lead Ganado</div>
                  Se genera la factura al cerrar una oportunidad de venta.
                </div>
                <div className="p-3 border rounded-lg text-xs">
                  <div className="font-bold mb-1">Nueva Inscripción</div>
                  Facturación inmediata al inscribirse un estudiante en un curso.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Whitelabel Tab - Solo visible para Superadmin */}
        {/* Whitelabel Tab */}
        {(userData?.role?.nombre === 'Superadmin' || activeModules.includes('white_label')) && (
          <TabsContent value="whitelabel" className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Palette className="h-6 w-6 text-primary" />
                  Personalización de Marca Blanca
                </h2>
                <p className="text-muted-foreground text-sm">
                  {userData?.role?.nombre === 'Superadmin' 
                    ? 'Configura el branding global de la plataforma para todos los clientes'
                    : 'Personaliza la identidad visual de tu plataforma para tus clientes finales'}
                </p>
              </div>
              {userData?.role?.nombre === 'Superadmin' && (
                <div className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold border border-amber-200">
                  Modo Superadmin: Editando Global
                </div>
              )}
            </div>
            <WhitelabelConfig />
          </TabsContent>
        )}
      </Tabs>

      {/* API Keys Section */}
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Key className="h-5 w-5 mr-2" />
            API Keys
          </CardTitle>
          <CardDescription>
            Gestiona las claves de API para integrar con herramientas externas como n8n, Zapier, Make, etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Key className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold">Claves de API</h4>
                <p className="text-sm text-muted-foreground">
                  Crea y gestiona API keys para acceder a Volkern CRM desde aplicaciones externas
                </p>
              </div>
            </div>
            <Link href="/dashboard/configuracion/api-keys">
              <Button>
                Gestionar API Keys
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div className="flex items-start gap-2 text-sm">
              <div className="h-5 w-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <span className="text-green-600 text-xs">✓</span>
              </div>
              <p className="text-muted-foreground">Permisos granulares por módulo</p>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <div className="h-5 w-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <span className="text-green-600 text-xs">✓</span>
              </div>
              <p className="text-muted-foreground">Integración con n8n, Zapier, Make</p>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <div className="h-5 w-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <span className="text-green-600 text-xs">✓</span>
              </div>
              <p className="text-muted-foreground">Métricas y estadísticas de uso</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
