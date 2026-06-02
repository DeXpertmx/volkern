'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Palette, Upload, Save, Globe, Mail, CheckCircle2, AlertCircle, Info,
  Building2, ImageIcon, Type, Hash, Loader2, ChevronRight, Eye,
  Linkedin, Facebook, Instagram, Twitter, ExternalLink, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface WhitelabelConfig {
  id: string;
  nombreEmpresa: string;
  logoUrl: string | null;
  iconoUrl: string | null;
  colorPrimario: string;
  colorSecundario: string;
  colorAcento: string;
  emailRemitente: string | null;
  nombreRemitente: string | null;
  eslogan: string | null;
  descripcion: string | null;
  dominio: string | null;
  urlFacebook: string | null;
  urlInstagram: string | null;
  urlTwitter: string | null;
  urlLinkedIn: string | null;
  urlWebsite: string | null;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 59;
  const g = parseInt(clean.substring(2, 4), 16) || 130;
  const b = parseInt(clean.substring(4, 6), 16) || 246;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getContrastText(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1e293b' : '#ffffff';
}

export function WhitelabelConfig() {
  const [config, setConfig] = useState<WhitelabelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [activeTab, setActiveTab] = useState('informacion');
  const [dragOverLogo, setDragOverLogo] = useState(false);
  const [dragOverIcon, setDragOverIcon] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/whitelabel');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      } else {
        toast.error('Error al cargar configuración');
      }
    } catch (error) {
      console.error('Error al cargar configuración:', error);
      toast.error('Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = (key: keyof WhitelabelConfig, value: string) => {
    if (config) {
      setConfig({ ...config, [key]: value });
    }
  };

  const handleFileUpload = async (file: File, tipo: 'logo' | 'icono') => {
    if (tipo === 'logo') setUploadingLogo(true);
    else setUploadingIcon(true);

    try {
      if (!file.type.startsWith('image/')) {
        toast.error('El archivo debe ser una imagen');
        return;
      }

      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error('El archivo es demasiado grande (máximo 5MB)');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('tipo', tipo);

      const res = await fetch('/api/whitelabel', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const urlToUse = data.downloadUrl || data.url;
        if (tipo === 'logo') updateConfig('logoUrl', urlToUse);
        else updateConfig('iconoUrl', urlToUse);
        toast.success(`${tipo === 'logo' ? 'Logo' : 'Icono'} subido exitosamente`);
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al subir archivo');
      }
    } catch (error) {
      console.error('Error al subir archivo:', error);
      toast.error(error instanceof Error ? error.message : 'Error al subir archivo');
    } finally {
      if (tipo === 'logo') setUploadingLogo(false);
      else setUploadingIcon(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, 'logo');
  };

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, 'icono');
  };

  const handleDrop = async (e: React.DragEvent, tipo: 'logo' | 'icono') => {
    e.preventDefault();
    if (tipo === 'logo') setDragOverLogo(false);
    else setDragOverIcon(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    handleFileUpload(file, tipo);
  };

  const guardarConfiguracion = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/whitelabel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config }),
      });

      if (res.ok) {
        toast.success('Configuración guardada exitosamente');
        window.location.reload();
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      console.error('Error al guardar configuración:', error);
      toast.error('Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  // --- Loading skeleton ---
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-xl" />
          <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-xl" />
          <div className="h-48 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
        <p className="text-lg font-medium text-slate-700 dark:text-slate-300">No se pudo cargar la configuración</p>
        <Button variant="outline" className="mt-4" onClick={fetchConfig}>
          Reintentar
        </Button>
      </div>
    );
  }

  const colors = [
    { key: 'colorPrimario' as const, label: 'Primario', value: config.colorPrimario || '#3b82f6' },
    { key: 'colorSecundario' as const, label: 'Secundario', value: config.colorSecundario || '#8b5cf6' },
    { key: 'colorAcento' as const, label: 'Acento', value: config.colorAcento || '#10b981' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* ════════════════════════════════════════
         PREVIEW EN VIVO
      ════════════════════════════════════════ */}
      <Card className={cn(
        "overflow-hidden transition-all duration-300",
        showPreview ? "ring-1 ring-slate-200 dark:ring-slate-700" : "ring-0"
      )}>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="w-full flex items-center justify-between px-6 py-3 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Vista previa en vivo</span>
          </div>
          <ChevronRight className={cn(
            "h-4 w-4 text-slate-400 transition-transform duration-200",
            showPreview && "rotate-90"
          )} />
        </button>

        {showPreview && (
          <div className="p-6 transition-all duration-300 animate-in fade-in slide-in-from-top-2">
            {/* Mock Navbar */}
            <div
              className="rounded-xl overflow-hidden shadow-lg border border-white/10"
              style={{ backgroundColor: config.colorPrimario || '#3b82f6' }}
            >
              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {config.logoUrl ? (
                    <div className="relative h-8 w-8 bg-white/20 rounded-lg overflow-hidden flex-shrink-0">
                      <Image
                        src={config.logoUrl}
                        alt="Logo preview"
                        fill
                        className="object-contain p-0.5"
                      />
                    </div>
                  ) : (
                    <div className="h-8 w-8 bg-white/20 rounded-lg flex items-center justify-center">
                      <Building2 className="h-4 w-4" style={{ color: getContrastText(config.colorPrimario || '#3b82f6') }} />
                    </div>
                  )}
                  <span
                    className="font-semibold text-sm"
                    style={{ color: getContrastText(config.colorPrimario || '#3b82f6') }}
                  >
                    {config.nombreEmpresa || 'Tu Marca'}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className="text-xs opacity-80 hidden sm:block"
                    style={{ color: getContrastText(config.colorPrimario || '#3b82f6') }}
                  >
                    {config.eslogan || 'Inicio'}
                  </span>
                  <button
                    className="px-4 py-1.5 rounded-lg text-xs font-medium transition-transform hover:scale-105 active:scale-95"
                    style={{
                      backgroundColor: config.colorAcento || '#10b981',
                      color: getContrastText(config.colorAcento || '#10b981'),
                    }}
                  >
                    {config.eslogan || 'Comenzar'}
                  </button>
                </div>
              </div>
            </div>

            {/* Color Palette Preview */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {colors.map((c) => (
                <div key={c.key} className="space-y-1">
                  <div
                    className="h-8 rounded-lg transition-all duration-200 hover:scale-[1.02]"
                    style={{ backgroundColor: c.value }}
                  />
                  <div className="flex items-center justify-between px-0.5">
                    <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{c.label}</span>
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{c.value}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Mock Card */}
            <div className="mt-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
              <div className="flex items-center gap-3">
                {config.iconoUrl ? (
                  <div className="relative h-10 w-10 rounded-lg overflow-hidden flex-shrink-0"
                    style={{
                      boxShadow: `0 0 0 2px ${config.colorSecundario || '#8b5cf6'}, 0 0 0 3px white`,
                    }}
                  >
                    <Image
                      src={config.iconoUrl}
                      alt="Icono preview"
                      fill
                      className="object-contain p-1"
                    />
                  </div>
                ) : (
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: hexToRgba(config.colorSecundario || '#8b5cf6', 0.15) }}
                  >
                    <Palette className="h-5 w-5" style={{ color: config.colorSecundario || '#8b5cf6' }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {config.nombreEmpresa || 'Nombre de Empresa'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {config.descripcion || 'Descripción de tu negocio...'}
                  </p>
                </div>
                <div
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    backgroundColor: config.colorSecundario || '#8b5cf6',
                    color: getContrastText(config.colorSecundario || '#8b5cf6'),
                  }}
                >
                  {config.nombreRemitente || 'Contacto'}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ════════════════════════════════════════
         TABS DE NAVEGACIÓN
      ════════════════════════════════════════ */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-md mx-auto mb-6">
          <TabsTrigger value="informacion" className="text-xs sm:text-sm gap-1.5">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Información</span>
          </TabsTrigger>
          <TabsTrigger value="marca-visual" className="text-xs sm:text-sm gap-1.5">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Marca Visual</span>
          </TabsTrigger>
          <TabsTrigger value="configuracion" className="text-xs sm:text-sm gap-1.5">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">Email & DNS</span>
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════
           TAB 1: INFORMACIÓN DE LA EMPRESA
        ════════════════════════════════════════ */}
        <TabsContent value="informacion" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                  <Building2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Información de la Empresa</CardTitle>
                  <CardDescription>
                    Los datos básicos que identifican tu marca
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="nombreEmpresa" className="text-sm font-medium">
                  Nombre de la Empresa
                </Label>
                <Input
                  id="nombreEmpresa"
                  placeholder="Ej: Volkern Properties"
                  value={config.nombreEmpresa || ''}
                  onChange={(e) => updateConfig('nombreEmpresa', e.target.value)}
                  className="transition-all focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="eslogan" className="text-sm font-medium">
                  Eslogan
                </Label>
                <Input
                  id="eslogan"
                  placeholder="Tu eslogan o frase distintiva"
                  value={config.eslogan || ''}
                  onChange={(e) => updateConfig('eslogan', e.target.value)}
                  className="transition-all focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descripcion" className="text-sm font-medium">
                  Descripción
                </Label>
                <Textarea
                  id="descripcion"
                  placeholder="Describe brevemente tu empresa y qué te hace única..."
                  value={config.descripcion || ''}
                  onChange={(e) => updateConfig('descripcion', e.target.value)}
                  rows={3}
                  className="transition-all focus:ring-2 focus:ring-blue-500/20 resize-none"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  {config.descripcion?.length || 0}/500 caracteres
                </p>
              </div>

              {/* Redes Sociales */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-sm font-medium mb-3 text-slate-700 dark:text-slate-300">
                  Redes Sociales
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    <Input
                      id="url-website"
                      placeholder="https://tusitio.com"
                      value={config.urlWebsite || ''}
                      onChange={(e) => updateConfig('urlWebsite', e.target.value)}
                      className="text-xs h-9 transition-all focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Facebook className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <Input
                      id="url-facebook"
                      placeholder="URL de Facebook"
                      value={config.urlFacebook || ''}
                      onChange={(e) => updateConfig('urlFacebook', e.target.value)}
                      className="text-xs h-9 transition-all focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Instagram className="h-4 w-4 text-pink-600 flex-shrink-0" />
                    <Input
                      id="url-instagram"
                      placeholder="URL de Instagram"
                      value={config.urlInstagram || ''}
                      onChange={(e) => updateConfig('urlInstagram', e.target.value)}
                      className="text-xs h-9 transition-all focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Twitter className="h-4 w-4 text-sky-500 flex-shrink-0" />
                    <Input
                      id="url-twitter"
                      placeholder="URL de Twitter / X"
                      value={config.urlTwitter || ''}
                      onChange={(e) => updateConfig('urlTwitter', e.target.value)}
                      className="text-xs h-9 transition-all focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Linkedin className="h-4 w-4 text-blue-700 flex-shrink-0" />
                    <Input
                      id="url-linkedin"
                      placeholder="URL de LinkedIn"
                      value={config.urlLinkedIn || ''}
                      onChange={(e) => updateConfig('urlLinkedIn', e.target.value)}
                      className="text-xs h-9 transition-all focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════
           TAB 2: MARCA VISUAL
        ════════════════════════════════════════ */}
        <TabsContent value="marca-visual" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-sm">
                  <Palette className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Logos e Imágenes</CardTitle>
                  <CardDescription>
                    Sube el logo principal y el icono de tu marca
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Logo Upload */}
                <div className="space-y-3">
                  <Label htmlFor="logo-upload" className="text-sm font-medium">
                    Logo Principal
                  </Label>
                  <div
                    className={cn(
                      "relative border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 group",
                      "hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10",
                      dragOverLogo
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-[1.02]"
                        : "border-slate-300 dark:border-slate-600",
                      uploadingLogo && "opacity-60 pointer-events-none"
                    )}
                    onDragOver={(e) => { e.preventDefault(); setDragOverLogo(true); }}
                    onDragLeave={() => setDragOverLogo(false)}
                    onDrop={(e) => handleDrop(e, 'logo')}
                  >
                    {uploadingLogo && (
                      <div className="absolute inset-0 bg-white/60 dark:bg-black/60 rounded-xl flex items-center justify-center z-10">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                          <span className="text-xs text-slate-600 dark:text-slate-400">Subiendo...</span>
                        </div>
                      </div>
                    )}

                    {config.logoUrl ? (
                      <div className="space-y-3">
                        <div className="relative w-full h-28 bg-slate-50 dark:bg-slate-800/50 rounded-lg overflow-hidden
                          group-hover:ring-2 ring-blue-400/50 transition-all">
                          <Image
                            src={config.logoUrl}
                            alt="Logo"
                            fill
                            className="object-contain p-3"
                          />
                        </div>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => logoInputRef.current?.click()}
                            className="group/btn"
                          >
                            <Upload className="h-3.5 w-3.5 mr-1.5 transition-transform group-hover/btn:-translate-y-0.5" />
                            Cambiar Logo
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateConfig('logoUrl', '')}
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3" onClick={() => logoInputRef.current?.click()}>
                        <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center
                          group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-colors cursor-pointer">
                          <ImageIcon className="h-7 w-7 text-slate-400 group-hover:text-blue-500 transition-colors" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-blue-600 transition-colors">
                            Haz clic para subir
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                            PNG, JPG o WebP · Máx 5MB
                          </p>
                        </div>
                      </div>
                    )}

                    <input
                      ref={logoInputRef}
                      id="logo-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoChange}
                    />
                  </div>
                </div>

                {/* Icono Upload */}
                <div className="space-y-3">
                  <Label htmlFor="icono-upload" className="text-sm font-medium">
                    Icono / Favicon
                  </Label>
                  <div
                    className={cn(
                      "relative border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 group",
                      "hover:border-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-900/10",
                      dragOverIcon
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20 scale-[1.02]"
                        : "border-slate-300 dark:border-slate-600",
                      uploadingIcon && "opacity-60 pointer-events-none"
                    )}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIcon(true); }}
                    onDragLeave={() => setDragOverIcon(false)}
                    onDrop={(e) => handleDrop(e, 'icono')}
                  >
                    {uploadingIcon && (
                      <div className="absolute inset-0 bg-white/60 dark:bg-black/60 rounded-xl flex items-center justify-center z-10">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                          <span className="text-xs text-slate-600 dark:text-slate-400">Subiendo...</span>
                        </div>
                      </div>
                    )}

                    {config.iconoUrl ? (
                      <div className="space-y-3">
                        <div className="relative w-20 h-20 mx-auto bg-slate-50 dark:bg-slate-800/50 rounded-xl overflow-hidden
                          group-hover:ring-2 ring-purple-400/50 transition-all">
                          <Image
                            src={config.iconoUrl}
                            alt="Icono"
                            fill
                            className="object-contain p-2"
                          />
                        </div>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => iconInputRef.current?.click()}
                            className="group/btn"
                          >
                            <Upload className="h-3.5 w-3.5 mr-1.5 transition-transform group/btn:-translate-y-0.5" />
                            Cambiar Icono
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateConfig('iconoUrl', '')}
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3" onClick={() => iconInputRef.current?.click()}>
                        <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center
                          group-hover:bg-purple-100 dark:group-hover:bg-purple-900/30 transition-colors cursor-pointer">
                          <ImageIcon className="h-7 w-7 text-slate-400 group-hover:text-purple-500 transition-colors" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-purple-600 transition-colors">
                            Haz clic para subir
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                            PNG, JPG o WebP · Máx 5MB
                          </p>
                        </div>
                      </div>
                    )}

                    <input
                      ref={iconInputRef}
                      id="icono-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleIconChange}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Colores */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm">
                  <Hash className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Colores de Marca</CardTitle>
                  <CardDescription>
                    Define la paleta de colores que representará tu marca
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Muestra de paleta completa */}
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex h-12">
                  {colors.map((c, i) => (
                    <div
                      key={c.key}
                      className="flex-1 flex items-center justify-center text-[10px] font-mono font-bold tracking-wider transition-all duration-200 hover:flex-[1.3]"
                      style={{ backgroundColor: c.value, color: getContrastText(c.value) }}
                    >
                      <span className="opacity-80 hover:opacity-100">{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {colors.map((c) => (
                  <div key={c.key} className="space-y-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50
                    hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={c.key} className="text-sm font-medium cursor-pointer">
                        {c.label}
                      </Label>
                      <div
                        className="h-5 w-5 rounded-full border-2 border-white shadow-sm"
                        style={{ backgroundColor: c.value }}
                      />
                    </div>
                    <div className="flex gap-2 items-center">
                      <div className="relative">
                        <Input
                          id={c.key}
                          type="color"
                          value={c.value}
                          onChange={(e) => updateConfig(c.key, e.target.value)}
                          className="!w-12 h-10 cursor-pointer p-0.5 border-2 rounded-lg"
                          style={{ borderColor: c.value }}
                        />
                      </div>
                      <Input
                        id={`${c.key}-hex`}
                        type="text"
                        value={c.value}
                        onChange={(e) => updateConfig(c.key, e.target.value)}
                        className="flex-1 font-mono text-xs tracking-wider uppercase transition-all focus:ring-2"
                        style={{
                          borderColor: c.value,
                          boxShadow: `0 0 0 0 ${hexToRgba(c.value, 0.1)}`,
                        }}
                        onFocus={(e) => e.target.style.boxShadow = `0 0 0 3px ${hexToRgba(c.value, 0.2)}`}
                        onBlur={(e) => e.target.style.boxShadow = 'none'}
                        aria-label={`${c.label} (hex)`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Mock UI Preview con los colores */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-5 bg-white dark:bg-slate-900">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wider">Vista previa de componentes</p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95 shadow-sm"
                    style={{
                      backgroundColor: config.colorPrimario || '#3b82f6',
                      color: getContrastText(config.colorPrimario || '#3b82f6'),
                    }}
                  >
                    Botón Primario
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95 shadow-sm"
                    style={{
                      backgroundColor: config.colorSecundario || '#8b5cf6',
                      color: getContrastText(config.colorSecundario || '#8b5cf6'),
                    }}
                  >
                    Botón Secundario
                  </button>
                  <span
                    className="px-3 py-1 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: hexToRgba(config.colorAcento || '#10b981', 0.15),
                      color: config.colorAcento || '#10b981',
                    }}
                  >
                    Etiqueta
                  </span>
                  <div
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{
                      border: `1.5px solid ${config.colorPrimario || '#3b82f6'}`,
                      color: config.colorPrimario || '#3b82f6',
                    }}
                  >
                    Outline
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════
           TAB 3: EMAIL & DOMINIO
        ════════════════════════════════════════ */}
        <TabsContent value="configuracion" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
                  <Mail className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Configuración de Emails</CardTitle>
                  <CardDescription>
                    Personaliza cómo apareces en los correos electrónicos
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nombreRemitente" className="text-sm font-medium">
                    Nombre del Remitente
                  </Label>
                  <Input
                    id="nombreRemitente"
                    placeholder="Ej: Volkern Propiedades"
                    value={config.nombreRemitente || ''}
                    onChange={(e) => updateConfig('nombreRemitente', e.target.value)}
                    className="transition-all focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emailRemitente" className="text-sm font-medium">
                    Email del Remitente
                  </Label>
                  <Input
                    id="emailRemitente"
                    type="email"
                    placeholder="contacto@tudominio.com"
                    value={config.emailRemitente || ''}
                    onChange={(e) => updateConfig('emailRemitente', e.target.value)}
                    className="transition-all focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 flex items-center justify-center shadow-sm">
                  <Globe className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Dominio Personalizado</CardTitle>
                  <CardDescription>
                    Conecta tu propio dominio para una experiencia profesional
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="dominio" className="text-sm font-medium">
                  Dominio / Subdominio
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="dominio"
                    placeholder="crm.miempresa.com"
                    value={config.dominio || ''}
                    onChange={(e) => updateConfig('dominio', e.target.value)}
                    className="flex-1 transition-all focus:ring-2 focus:ring-sky-500/20"
                  />
                  <Button
                    variant="outline"
                    onClick={() => toast.info('Verificando propagación DNS...')}
                    className="group gap-1.5"
                  >
                    <ExternalLink className="h-4 w-4 transition-transform group-hover:rotate-45" />
                    Verificar
                  </Button>
                </div>
              </div>

              {/* DNS Instructions */}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 
                border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Instrucciones de Configuración DNS
                  </h4>
                </div>

                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Para que tu dominio funcione, añade un registro <strong>CNAME</strong> en tu proveedor de DNS:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block uppercase tracking-wider mb-1">
                      Tipo
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                        <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400">C</span>
                      </div>
                      <span className="font-mono text-sm font-medium">CNAME</span>
                    </div>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block uppercase tracking-wider mb-1">
                      Nombre / Host
                    </span>
                    <span className="font-mono text-sm">{config.dominio?.split('.')[0] || 'crm'}</span>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block uppercase tracking-wider mb-1">
                      Apunta a
                    </span>
                    <span className="font-mono text-sm text-blue-600 dark:text-blue-400">nodes.volkern.app</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Propagación DNS</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      La propagación puede tardar de 1 a 24 horas en completarse después de añadir el registro.
                    </p>
                  </div>
                </div>
              </div>

              {config.dominio && (
                <div className="flex items-center justify-between p-4 border border-emerald-200 dark:border-emerald-800 rounded-xl bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30">
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-100 dark:bg-emerald-900/50 p-2 rounded-full">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Dominio Configurado</p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">
                        {config.dominio} — Listo para verificar SSL
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                    Activo
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ════════════════════════════════════════
         BOTÓN DE GUARDAR (Sticky)
      ════════════════════════════════════════ */}
      <div className="sticky bottom-6 z-10 flex justify-end">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3 
          flex items-center gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
            Los cambios se aplicarán al recargar la página
          </span>
          <Button
            onClick={guardarConfiguracion}
            disabled={saving}
            size="lg"
            className={cn(
              "transition-all duration-200",
              "hover:scale-[1.02] active:scale-[0.98]",
              "shadow-md hover:shadow-lg"
            )}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Guardar Configuración
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
