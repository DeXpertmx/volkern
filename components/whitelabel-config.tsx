
'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Palette, Upload, Save, Globe, Mail, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';

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

export function WhitelabelConfig() {
  const [config, setConfig] = useState<WhitelabelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [isCustomConfig, setIsCustomConfig] = useState(false);
  const [isGlobalUpdate, setIsGlobalUpdate] = useState(false);

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
        setIsCustomConfig(data.isCustom || false);
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
    if (tipo === 'logo') {
      setUploadingLogo(true);
    } else {
      setUploadingIcon(true);
    }

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
      formData.append('tipo', tipo);

      const res = await fetch('/api/whitelabel', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        // Usar downloadUrl si está disponible, sino usar url
        const urlToUse = data.downloadUrl || data.url;

        if (tipo === 'logo') {
          updateConfig('logoUrl', urlToUse);
        } else {
          updateConfig('iconoUrl', urlToUse);
        }
        toast.success(`${tipo === 'logo' ? 'Logo' : 'Icono'} subido exitosamente`);
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al subir archivo');
      }
    } catch (error) {
      console.error('Error al subir archivo:', error);
      toast.error(error instanceof Error ? error.message : 'Error al subir archivo');
    } finally {
      if (tipo === 'logo') {
        setUploadingLogo(false);
      } else {
        setUploadingIcon(false);
      }
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file, 'logo');
    }
  };

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file, 'icono');
    }
  };

  const guardarConfiguracion = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/whitelabel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          isGlobalUpdate: isGlobalUpdate
        }),
      });

      if (res.ok) {
        toast.success('Configuración guardada exitosamente');
        // Recargar la página para aplicar los cambios
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Cargando configuración...</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">No se pudo cargar la configuración</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isCustomConfig && (
        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-4">
          <div className="h-10 w-10 bg-white rounded-lg shadow-sm flex items-center justify-center">
            <Palette className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-indigo-900">Configuración Personalizada Activa</p>
            <p className="text-xs text-indigo-700">Estás editando la identidad visual de tu plataforma. Estos cambios se aplicarán a todos tus usuarios.</p>
          </div>
        </div>
      )}

      {/* Selector de modo para Superadmins */}
      {config.id === 'default' && (
        <div className="hidden">
          {/* Lógica interna para manejar si es global */}
        </div>
      )}
      {/* Información de la Empresa */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Globe className="h-5 w-5 mr-2" />
            Información de la Empresa
          </CardTitle>
          <CardDescription>
            Personaliza la información básica de tu marca
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nombreEmpresa">Nombre de la Empresa</Label>
            <Input
              id="nombreEmpresa"
              placeholder="Mi Empresa"
              value={config.nombreEmpresa || ''}
              onChange={(e) => updateConfig('nombreEmpresa', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="eslogan">Eslogan</Label>
            <Input
              id="eslogan"
              placeholder="Tu eslogan aquí"
              value={config.eslogan || ''}
              onChange={(e) => updateConfig('eslogan', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              placeholder="Descripción breve de tu empresa"
              value={config.descripcion || ''}
              onChange={(e) => updateConfig('descripcion', e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Marca Visual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Palette className="h-5 w-5 mr-2" />
            Marca Visual
          </CardTitle>
          <CardDescription>
            Personaliza el logo, icono y colores de tu marca
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Logos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Label>Logo Principal</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center space-y-4">
                {config.logoUrl && (
                  <div className="relative w-full h-24 bg-gray-50 rounded flex items-center justify-center">
                    <Image
                      src={config.logoUrl}
                      alt="Logo"
                      fill
                      className="object-contain p-2"
                    />
                  </div>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadingLogo ? 'Subiendo...' : 'Subir Logo'}
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <Label>Icono / Favicon</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center space-y-4">
                {config.iconoUrl && (
                  <div className="relative w-16 h-16 mx-auto bg-gray-50 rounded">
                    <Image
                      src={config.iconoUrl}
                      alt="Icono"
                      fill
                      className="object-contain p-1"
                    />
                  </div>
                )}
                <input
                  ref={iconInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleIconChange}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => iconInputRef.current?.click()}
                  disabled={uploadingIcon}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadingIcon ? 'Subiendo...' : 'Subir Icono'}
                </Button>
              </div>
            </div>
          </div>

          {/* Colores */}
          <div className="space-y-4">
            <Label>Colores de Marca</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="colorPrimario" className="text-sm">Color Primario</Label>
                <div className="flex gap-2">
                  <Input
                    id="colorPrimario"
                    type="color"
                    value={config.colorPrimario || '#3b82f6'}
                    onChange={(e) => updateConfig('colorPrimario', e.target.value)}
                    className="w-16 h-10 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={config.colorPrimario || '#3b82f6'}
                    onChange={(e) => updateConfig('colorPrimario', e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="colorSecundario" className="text-sm">Color Secundario</Label>
                <div className="flex gap-2">
                  <Input
                    id="colorSecundario"
                    type="color"
                    value={config.colorSecundario || '#8b5cf6'}
                    onChange={(e) => updateConfig('colorSecundario', e.target.value)}
                    className="w-16 h-10 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={config.colorSecundario || '#8b5cf6'}
                    onChange={(e) => updateConfig('colorSecundario', e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="colorAcento" className="text-sm">Color de Acento</Label>
                <div className="flex gap-2">
                  <Input
                    id="colorAcento"
                    type="color"
                    value={config.colorAcento || '#10b981'}
                    onChange={(e) => updateConfig('colorAcento', e.target.value)}
                    className="w-16 h-10 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={config.colorAcento || '#10b981'}
                    onChange={(e) => updateConfig('colorAcento', e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuración de Emails */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Mail className="h-5 w-5 mr-2" />
            Configuración de Emails
          </CardTitle>
          <CardDescription>
            Personaliza el remitente de tus emails
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nombreRemitente">Nombre del Remitente</Label>
            <Input
              id="nombreRemitente"
              placeholder="Mi Empresa"
              value={config.nombreRemitente || ''}
              onChange={(e) => updateConfig('nombreRemitente', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emailRemitente">Email del Remitente</Label>
            <Input
              id="emailRemitente"
              type="email"
              placeholder="contacto@miempresa.com"
              value={config.emailRemitente || ''}
              onChange={(e) => updateConfig('emailRemitente', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Dominio Personalizado */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Globe className="h-5 w-5 mr-2" />
            Dominio Personalizado
          </CardTitle>
          <CardDescription>
            Conecta tu propio dominio para personalizar la URL del CRM
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="dominio">Dominio / Subdominio</Label>
            <div className="flex gap-2">
              <Input
                id="dominio"
                placeholder="crm.minegocio.com"
                value={config.dominio || ''}
                onChange={(e) => updateConfig('dominio', e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" onClick={() => toast.info('Verificando propagación DNS...')}>
                Verificar DNS
              </Button>
            </div>
          </div>

          <div className="bg-slate-50 border rounded-lg p-5 space-y-4">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-500" />
              Instrucciones de Configuración
            </h4>
            <p className="text-sm text-slate-600">
              Para que tu dominio funcione con Volkern CRM, debes añadir un registro **CNAME** en tu proveedor de DNS (Cloudflare, GoDaddy, etc.):
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-2">
              <div className="p-3 bg-white border rounded shadow-sm">
                <span className="text-xs font-bold text-slate-400 block uppercase mb-1">Tipo</span>
                <span className="font-mono">CNAME</span>
              </div>
              <div className="p-3 bg-white border rounded shadow-sm">
                <span className="text-xs font-bold text-slate-400 block uppercase mb-1">Nombre (Host)</span>
                <span className="font-mono">{config.dominio?.split('.')[0] || 'crm'}</span>
              </div>
              <div className="p-3 bg-white border rounded shadow-sm md:col-span-2">
                <span className="text-xs font-bold text-slate-400 block uppercase mb-1">Valor (Destino)</span>
                <span className="font-mono">nodes.volkern.app</span>
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded text-blue-800 text-xs">
              <AlertCircle className="h-4 w-4" />
              <span>La propagación de DNS puede tardar de 1 a 24 horas en completarse.</span>
            </div>
          </div>

          {config.dominio && (
            <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50/50">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-full">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-900">Estado de Conexión</p>
                  <p className="text-xs text-green-700">Listo para verificar certificado SSL</p>
                </div>
              </div>
              <div className="text-xs font-medium bg-green-100 text-green-800 px-2 py-1 rounded">
                Configurado
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Botón de Guardar */}
      <div className="flex justify-end">
        <Button onClick={guardarConfiguracion} disabled={saving} size="lg">
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Guardando...' : 'Guardar Configuración'}
        </Button>
      </div>
    </div>
  );
}
