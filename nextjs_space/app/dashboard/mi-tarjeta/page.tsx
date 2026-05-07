
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CreditCard,
  QrCode,
  Download,
  Eye,
  Share2,
  Loader2,
  CheckCircle2,
  Palette,
  Camera,
  ExternalLink,
  Scan,
  History,
  SmartphoneNfc,
  Copy,
  Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { TemplateSelector, ColorSelector, FontSelector, BackgroundPatternSelector } from '@/components/digital-cards/template-selector';
import { CardRenderer } from '@/components/digital-cards/card-templates';

interface DigitalCard {
  id: string;
  nombre: string;
  puesto?: string;
  empresa?: string;
  telefonoMovil?: string;
  telefonoOficina?: string;
  email?: string;
  sitioWeb?: string;
  whatsapp?: string;
  telegram?: string;
  redesSociales?: Record<string, string>;
  template: string;
  fontFamily: string;
  layoutStyle: string;
  colorPrimario: string;
  colorSecundario: string;
  colorFondo: string;
  colorTexto: string;
  backgroundPattern: string;
  logoUrl?: string;
  fotoPerfilUrl?: string;
  bannerUrl?: string;
  urlUnica: string;
  qrCodeData?: string;
  totalVistas: number;
  totalCompartidos: number;
  totalEscaneos: number;
  activo: boolean;
}

interface ApiResponse {
  digitalCard: DigitalCard | null;
}

export default function MiTarjetaPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [card, setCard] = useState<DigitalCard | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    puesto: '',
    empresa: '',
    telefonoMovil: '',
    telefonoOficina: '',
    email: '',
    sitioWeb: '',
    whatsapp: '',
    telegram: '',
    redesSociales: {
      linkedin: '',
      twitter: '',
      facebook: '',
      instagram: '',
    },
    template: 'modern',
    fontFamily: 'Inter',
    layoutStyle: 'standard',
    colorPrimario: '#3B82F6',
    colorSecundario: '#1E40AF',
    colorFondo: '#FFFFFF',
    colorTexto: '#1F2937',
    backgroundPattern: 'none',
    logoUrl: '',
    fotoPerfilUrl: '',
    bannerUrl: '',
    urlUnica: '',
  });

  // Estados separados para las URLs de visualización (signed URLs)
  const [logoDisplayUrl, setLogoDisplayUrl] = useState<string>('');
  const [fotoDisplayUrl, setFotoDisplayUrl] = useState<string>('');

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    fetchCard();
  }, []);

  const fetchCard = async () => {
    try {
      const response = await fetch('/api/tarjetas-digitales');
      if (!response.ok) {
        throw new Error('Error al cargar la tarjeta');
      }
      const data: ApiResponse = await response.json();

      if (data.digitalCard) {
        setCard(data.digitalCard);

        // Extraer S3 keys de las URLs firmadas si vienen de S3
        const extractS3Key = (url: string | undefined) => {
          if (!url) return '';
          // Si es una URL firmada de S3, extraer el key
          if (url.includes('.amazonaws.com/') || url.includes('cloudfront.net/')) {
            // Extraer el path después del bucket
            const urlObj = new URL(url);
            const pathname = decodeURIComponent(urlObj.pathname);
            // Remover el primer "/" si existe
            return pathname.startsWith('/') ? pathname.substring(1) : pathname;
          }
          return url;
        };

        setFormData({
          nombre: data.digitalCard.nombre || '',
          puesto: data.digitalCard.puesto || '',
          empresa: data.digitalCard.empresa || '',
          telefonoMovil: data.digitalCard.telefonoMovil || '',
          telefonoOficina: data.digitalCard.telefonoOficina || '',
          email: data.digitalCard.email || '',
          sitioWeb: data.digitalCard.sitioWeb || '',
          whatsapp: data.digitalCard.whatsapp || '',
          telegram: data.digitalCard.telegram || '',
          redesSociales: (data.digitalCard.redesSociales as { linkedin: string; twitter: string; facebook: string; instagram: string }) || {
            linkedin: '',
            twitter: '',
            facebook: '',
            instagram: '',
          },
          template: data.digitalCard.template || 'modern',
          fontFamily: data.digitalCard.fontFamily || 'Inter',
          layoutStyle: data.digitalCard.layoutStyle || 'standard',
          colorPrimario: data.digitalCard.colorPrimario || '#3B82F6',
          colorSecundario: data.digitalCard.colorSecundario || '#1E40AF',
          colorFondo: data.digitalCard.colorFondo || '#FFFFFF',
          colorTexto: data.digitalCard.colorTexto || '#1F2937',
          backgroundPattern: data.digitalCard.backgroundPattern || 'none',
          logoUrl: extractS3Key(data.digitalCard.logoUrl),
          fotoPerfilUrl: extractS3Key(data.digitalCard.fotoPerfilUrl),
          bannerUrl: data.digitalCard.bannerUrl || '',
          urlUnica: data.digitalCard.urlUnica || '',
        });

        // Establecer las URLs de visualización (las signed URLs que vienen del API)
        setLogoDisplayUrl(data.digitalCard.logoUrl || '');
        setFotoDisplayUrl(data.digitalCard.fotoPerfilUrl || '');
      } else if (session?.user) {
      // Prellenar con datos del usuario
      setFormData((prev) => ({
        ...prev,
        nombre: session.user.name || '',
        email: session.user.email || '',
      }));
    }
  } catch (error) {
    console.error('Error al cargar tarjeta:', error);
    toast.error('Error al cargar tu tarjeta digital');
  } finally {
    setLoading(false);
  }
};

const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  const { name, value } = e.target;
  setFormData((prev) => ({
    ...prev,
    [name]: value,
  }));
};

const handleSocialChange = (platform: string, value: string) => {
  setFormData((prev) => ({
    ...prev,
    redesSociales: {
      ...prev.redesSociales,
      [platform]: value,
    },
  }));
};

const handleFileUpload = async (file: File, tipo: 'logo' | 'foto') => {
  if (!file) return null;

  setUploading(true);
  try {
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);
    formDataUpload.append('tipo', tipo);

    const response = await fetch('/api/tarjetas-digitales/upload', {
      method: 'POST',
      body: formDataUpload,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al subir archivo');
    }

    const data = await response.json();
    toast.success(data.message || 'Archivo subido exitosamente');
    return {
      cloudPath: data.cloud_storage_path,
      signedUrl: data.signed_url,
    };
  } catch (error: any) {
    console.error('Error al subir archivo:', error);
    toast.error(error.message || 'Error al subir el archivo');
    return null;
  } finally {
    setUploading(false);
  }
};

const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  // Validar tamaño
  if (file.size > 5 * 1024 * 1024) {
    toast.error('El archivo es demasiado grande. Máximo 5MB');
    return;
  }

  // Validar tipo
  if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
    toast.error('Tipo de archivo no permitido. Solo JPG, PNG o WEBP');
    return;
  }

  const result = await handleFileUpload(file, 'logo');
  if (result) {
    // Guardar el S3 key en formData para enviarlo al API
    setFormData((prev) => ({ ...prev, logoUrl: result.cloudPath }));
    // Guardar la URL firmada para mostrar en el UI
    setLogoDisplayUrl(result.signedUrl);
  }
};

const handleFotoPerfilChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  // Validar tamaño
  if (file.size > 5 * 1024 * 1024) {
    toast.error('El archivo es demasiado grande. Máximo 5MB');
    return;
  }

  // Validar tipo
  if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
    toast.error('Tipo de archivo no permitido. Solo JPG, PNG o WEBP');
    return;
  }

  const result = await handleFileUpload(file, 'foto');
  if (result) {
    // Guardar el S3 key en formData para enviarlo al API
    setFormData((prev) => ({ ...prev, fotoPerfilUrl: result.cloudPath }));
    // Guardar la URL firmada para mostrar en el UI
    setFotoDisplayUrl(result.signedUrl);
  }
};

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setSaving(true);

  try {
    const response = await fetch('/api/tarjetas-digitales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al guardar');
    }

    const data = await response.json();
    setCard(data.digitalCard);
    toast.success(data.message || 'Tarjeta guardada exitosamente');
  } catch (error: any) {
    console.error('Error al guardar tarjeta:', error);
    toast.error(error.message || 'Error al guardar la tarjeta');
  } finally {
    setSaving(false);
  }
};

const handleDownloadQR = () => {
  if (!card?.qrCodeData) return;

  const link = document.createElement('a');
  link.href = card.qrCodeData;
  link.download = `tarjeta-qr-${card.nombre.replace(/\s+/g, '_')}.png`;
  link.click();
  toast.success('QR Code descargado');
};

const getBrandedUrl = () => {
  if (!card) return '';
  const protocol = window.location.protocol;
  const host = window.location.host;
  let domain = "";
  if (host.includes('localhost')) {
    domain = 'localhost:3000';
  } else {
    const parts = window.location.hostname.split('.');
    domain = parts.length >= 2 ? parts.slice(-2).join('.') : window.location.hostname;
  }
  
  const subdomain = (session?.user as any)?.tenantSubdomain;
  if (subdomain) {
    return `${protocol}//${subdomain}.${domain}/tarjeta/${card.urlUnica}`;
  }
  return `${window.location.origin}/tarjeta/${card.urlUnica}`;
};

const handleCopyUrl = () => {
  if (!card) return;
  const url = getBrandedUrl();
  navigator.clipboard.writeText(url);
  toast.success('URL copiada al portapapeles');
};

const handleShareUrl = async () => {
  if (!card) return;
  const url = getBrandedUrl();

  if (navigator.share) {
    try {
      await navigator.share({
        title: `Tarjeta de ${card.nombre}`,
        text: `Mira mi tarjeta digital de contacto`,
        url,
      });
      toast.success('Compartido exitosamente');
    } catch (error) {
      console.log('Error al compartir:', error);
    }
  } else {
    handleCopyUrl();
  }
};

if (loading) {
  return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

return (
  <div className="flex flex-col lg:flex-row gap-8">
    <div className="flex-1 space-y-6 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Mi Tarjeta Digital</h1>
          <p className="text-gray-600 mt-1">
            Crea tu tarjeta digital con QR para compartir fácilmente tu información de contacto
          </p>
        </div>
        {card && (
          <Badge
            variant={card.activo ? 'default' : 'secondary'}
            className="text-sm px-3 py-1"
          >
            {card.activo ? 'Activa' : 'Inactiva'}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="editor" className="w-full">
        <TabsList className="grid w-full grid-cols-5 md:grid-cols-3">
          <TabsTrigger value="editor">
            <CreditCard className="w-4 h-4 mr-2" />
            Información
          </TabsTrigger>
          <TabsTrigger value="design">
            <Palette className="w-4 h-4 mr-2" />
            Diseño
          </TabsTrigger>
          <TabsTrigger value="preview" className="lg:hidden" disabled={!card && !formData.nombre}>
            <Eye className="w-4 h-4 mr-2" />
            Vista Previa
          </TabsTrigger>
          <TabsTrigger value="share" disabled={!card}>
            <Share2 className="w-4 h-4 mr-2" />
            Compartir
          </TabsTrigger>
          <TabsTrigger value="mobile" disabled={!card}>
            <Smartphone className="w-4 h-4 mr-2" />
            Móvil
          </TabsTrigger>
        </TabsList>

        {/* Editor Tab */}
        <TabsContent value="editor" className="mt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Información Básica</CardTitle>
                <CardDescription>
                  Completa tu información de contacto profesional
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="urlUnica">Alias de tu enlace (URL Personalizada)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg text-sm font-mono text-slate-500 border border-slate-200">
                        {(session?.user as any)?.tenantSubdomain || 'volkern'}.volkern.app/tarjeta/
                      </div>
                      <Input
                        id="urlUnica"
                        name="urlUnica"
                        value={formData.urlUnica}
                        onChange={(e) => {
                          const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                          setFormData(prev => ({ ...prev, urlUnica: val }));
                        }}
                        placeholder="tu-nombre-profesional"
                        className="font-mono"
                      />
                    </div>
                    <p className="text-[10px] text-amber-600 mt-1 font-medium">
                      ⚠️ Cambiar el alias invalidará cualquier código QR que hayas descargado o impreso anteriormente.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="nombre">Nombre Completo *</Label>
                    <Input
                      id="nombre"
                      name="nombre"
                      value={formData.nombre}
                      onChange={handleInputChange}
                      placeholder="Juan Pérez"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="puesto">Puesto</Label>
                    <Input
                      id="puesto"
                      name="puesto"
                      value={formData.puesto}
                      onChange={handleInputChange}
                      placeholder="Director de Ventas"
                    />
                  </div>
                  <div>
                    <Label htmlFor="empresa">Empresa</Label>
                    <Input
                      id="empresa"
                      name="empresa"
                      value={formData.empresa}
                      onChange={handleInputChange}
                      placeholder="Mi Empresa S.A."
                    />
                  </div>
                  <div>
                    <Label htmlFor="telefonoMovil">Teléfono Móvil</Label>
                    <Input
                      id="telefonoMovil"
                      name="telefonoMovil"
                      type="tel"
                      value={formData.telefonoMovil}
                      onChange={handleInputChange}
                      placeholder="+52 55 1234 5678"
                    />
                  </div>
                  <div>
                    <Label htmlFor="telefonoOficina">Teléfono Oficina</Label>
                    <Input
                      id="telefonoOficina"
                      name="telefonoOficina"
                      type="tel"
                      value={formData.telefonoOficina}
                      onChange={handleInputChange}
                      placeholder="+52 55 8765 4321"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="juan@empresa.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sitioWeb">Sitio Web</Label>
                    <Input
                      id="sitioWeb"
                      name="sitioWeb"
                      type="url"
                      value={formData.sitioWeb}
                      onChange={handleInputChange}
                      placeholder="https://miempresa.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input
                      id="whatsapp"
                      name="whatsapp"
                      type="tel"
                      value={formData.whatsapp}
                      onChange={handleInputChange}
                      placeholder="+52 55 1234 5678"
                    />
                  </div>
                  <div>
                    <Label htmlFor="telegram">Telegram</Label>
                    <Input
                      id="telegram"
                      name="telegram"
                      value={formData.telegram}
                      onChange={handleInputChange}
                      placeholder="@usuario"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Redes Sociales</CardTitle>
                <CardDescription>Agrega tus perfiles profesionales</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="linkedin">LinkedIn</Label>
                    <Input
                      id="linkedin"
                      value={formData.redesSociales.linkedin}
                      onChange={(e) => handleSocialChange('linkedin', e.target.value)}
                      placeholder="https://linkedin.com/in/..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="twitter">Twitter/X</Label>
                    <Input
                      id="twitter"
                      value={formData.redesSociales.twitter}
                      onChange={(e) => handleSocialChange('twitter', e.target.value)}
                      placeholder="https://twitter.com/..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="facebook">Facebook</Label>
                    <Input
                      id="facebook"
                      value={formData.redesSociales.facebook}
                      onChange={(e) => handleSocialChange('facebook', e.target.value)}
                      placeholder="https://facebook.com/..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="instagram">Instagram</Label>
                    <Input
                      id="instagram"
                      value={formData.redesSociales.instagram}
                      onChange={(e) => handleSocialChange('instagram', e.target.value)}
                      placeholder="https://instagram.com/..."
                    />
                  </div>
                </div>
              </CardContent>
            </Card>



            <div className="flex justify-end gap-3">
              <Button type="submit" disabled={saving} size="lg">
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {card ? 'Actualizar Tarjeta' : 'Crear Tarjeta'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* Design Tab */}
        <TabsContent value="design" className="mt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Plantilla de Diseño</CardTitle>
                <CardDescription>
                  Elige el diseño que mejor represente tu marca profesional
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TemplateSelector
                  currentTemplate={formData.template}
                  onSelect={(templateId) =>
                    setFormData((prev) => ({ ...prev, template: templateId }))
                  }
                  colorPrimario={formData.colorPrimario}
                  colorSecundario={formData.colorSecundario}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Imágenes Personalizadas</CardTitle>
                <CardDescription>
                  Sube tu logo y foto de perfil para la tarjeta
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Logo de la Empresa */}
                <div>
                  <Label htmlFor="logo-upload" className="text-base font-semibold">
                    Logo de la Empresa
                  </Label>
                  <p className="text-sm text-gray-500 mb-3">
                    Sube el logo de tu empresa (JPG, PNG, WEBP - Máx. 5MB)
                  </p>
                  <div className="flex items-center gap-4">
                    {logoDisplayUrl && (
                      <div className="relative bg-white p-3 rounded-lg border-2 border-gray-200 shadow-sm">
                        <Image
                          src={logoDisplayUrl}
                          alt="Logo de la empresa"
                          width={80}
                          height={80}
                          className="object-contain"
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <Input
                        id="logo-upload"
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={handleLogoChange}
                        disabled={uploading}
                        className="cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Foto de Perfil */}
                <div>
                  <Label htmlFor="foto-upload" className="text-base font-semibold">
                    Foto de Perfil
                  </Label>
                  <p className="text-sm text-gray-500 mb-3">
                    Sube tu foto profesional (JPG, PNG, WEBP - Máx. 5MB)
                  </p>
                  <div className="flex items-center gap-4">
                    {fotoDisplayUrl && (
                      <div className="relative">
                        <Image
                          src={fotoDisplayUrl}
                          alt="Foto de perfil"
                          width={80}
                          height={80}
                          className="rounded-full object-cover border-2 border-gray-200 shadow-sm"
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <Input
                        id="foto-upload"
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={handleFotoPerfilChange}
                        disabled={uploading}
                        className="cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {uploading && (
                  <Alert className="bg-blue-50 border-blue-200">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <AlertDescription className="ml-2">
                      Subiendo archivo...
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Colores de Marca</CardTitle>
                <CardDescription>
                  Personaliza los colores de tu tarjeta digital
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ColorSelector
                  label="Color Primario"
                  color={formData.colorPrimario}
                  onChange={(color) =>
                    setFormData((prev) => ({ ...prev, colorPrimario: color }))
                  }
                />

                <ColorSelector
                  label="Color Secundario"
                  color={formData.colorSecundario}
                  onChange={(color) =>
                    setFormData((prev) => ({ ...prev, colorSecundario: color }))
                  }
                />

                <ColorSelector
                  label="Color de Fondo"
                  color={formData.colorFondo}
                  onChange={(color) =>
                    setFormData((prev) => ({ ...prev, colorFondo: color }))
                  }
                />

                <ColorSelector
                  label="Color de Texto"
                  color={formData.colorTexto}
                  onChange={(color) =>
                    setFormData((prev) => ({ ...prev, colorTexto: color }))
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tipografía y Estilo</CardTitle>
                <CardDescription>
                  Personaliza la fuente y patrón de fondo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FontSelector
                  font={formData.fontFamily}
                  onChange={(font) =>
                    setFormData((prev) => ({ ...prev, fontFamily: font }))
                  }
                />

                <BackgroundPatternSelector
                  pattern={formData.backgroundPattern}
                  onChange={(pattern) =>
                    setFormData((prev) => ({ ...prev, backgroundPattern: pattern }))
                  }
                  colorPrimario={formData.colorPrimario}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button type="submit" disabled={saving} size="lg">
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {card ? 'Actualizar Diseño' : 'Guardar Diseño'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* Preview Tab */}
        <TabsContent value="preview" className="mt-6">
          {(card || formData.nombre) && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Vista Previa en Tiempo Real</CardTitle>
                  <CardDescription>
                    Así verán tu tarjeta las personas que escaneen tu QR
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert className="mb-6">
                    <AlertDescription className="text-sm">
                      💡 Esta es una vista previa en vivo. Los cambios que hagas en la pestaña de <strong>Diseño</strong> se reflejarán automáticamente aquí.
                    </AlertDescription>
                  </Alert>

                  <CardRenderer
                    data={{
                      nombre: formData.nombre,
                      puesto: formData.puesto,
                      empresa: formData.empresa,
                      telefonoMovil: formData.telefonoMovil,
                      telefonoOficina: formData.telefonoOficina,
                      email: formData.email,
                      sitioWeb: formData.sitioWeb,
                      whatsapp: formData.whatsapp,
                      telegram: formData.telegram,
                      redesSociales: formData.redesSociales,
                      template: formData.template,
                      fontFamily: formData.fontFamily,
                      layoutStyle: formData.layoutStyle,
                      colorPrimario: formData.colorPrimario,
                      colorSecundario: formData.colorSecundario,
                      colorFondo: formData.colorFondo,
                      colorTexto: formData.colorTexto,
                      backgroundPattern: formData.backgroundPattern,
                      logoUrl: logoDisplayUrl || undefined,
                      fotoPerfilUrl: fotoDisplayUrl || undefined,
                      bannerUrl: formData.bannerUrl,
                    }}
                    isPreview={true}
                  />

                  {card && (
                    <div className="mt-6 flex justify-center">
                      <a
                        href={`/tarjeta/${card.urlUnica}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline">
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Ver Tarjeta Completa
                        </Button>
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Share Tab */}
        <TabsContent value="share" className="mt-6">
          {card && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* QR Code Card */}
                <Card className="border-2 hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <CardTitle>
                      <QrCode className="w-5 h-5 inline-block mr-2 text-primary" />
                      Código QR de Presentación
                    </CardTitle>
                    <CardDescription>
                      Muestra o descarga tu QR para conectar instantáneamente
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {card.qrCodeData && (
                      <div className="flex justify-center">
                        <div className="border border-slate-200 rounded-2xl p-6 bg-white shadow-sm hover:shadow-md transition-shadow">
                          <Image
                            src={card.qrCodeData}
                            alt="QR Code"
                            width={220}
                            height={220}
                            className="w-full h-auto"
                          />
                        </div>
                      </div>
                    )}
                    <Button onClick={handleDownloadQR} className="w-full" size="lg" variant="secondary">
                      <Download className="w-4 h-4 mr-2" />
                      Descargar para Imprimir
                    </Button>
                  </CardContent>
                </Card>

                {/* Share Options Card */}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <Share2 className="w-5 h-5 inline-block mr-2 text-primary" />
                      Redes y Link Único
                    </CardTitle>
                    <CardDescription>
                      Comparte tu tarjeta digital por diferentes canales
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 block">Copia este Enlace</Label>
                      <div className="mt-2 flex gap-2">
                        <Input
                          value={mounted ? `${window.location.origin}/tarjeta/${card.urlUnica}` : ''}
                          readOnly
                          className="bg-white dark:bg-slate-950 font-mono text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Button onClick={handleCopyUrl} variant="outline" className="h-12">
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar
                      </Button>
                      <Button onClick={handleShareUrl} className="h-12 bg-primary hover:bg-primary/90">
                        <Smartphone className="w-4 h-4 mr-2" />
                        Enviar
                      </Button>
                    </div>

                    {/* Estadísticas */}
                    <div className="pt-6 mt-4 border-t border-slate-100 dark:border-slate-800">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4 block">
                        Rendimiento de tu Tarjeta
                      </Label>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3">
                          <div className="text-2xl font-bold text-primary">
                            {card.totalVistas}
                          </div>
                          <div className="text-[10px] uppercase font-semibold text-slate-500 mt-1">Vistas</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3">
                          <div className="text-2xl font-bold text-emerald-600">
                            {card.totalCompartidos}
                          </div>
                          <div className="text-[10px] uppercase font-semibold text-slate-500 mt-1">Shares</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3">
                          <div className="text-2xl font-bold text-amber-600">
                            {card.totalEscaneos}
                          </div>
                          <div className="text-[10px] uppercase font-semibold text-slate-500 mt-1">Escaneos</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* NFC Card */}
              <Card className="border-2 border-indigo-100 dark:border-indigo-900/30 overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 dark:bg-indigo-900/10 rounded-bl-full -z-10"></div>
                <CardHeader>
                  <CardTitle className="text-indigo-700 dark:text-indigo-400">
                    <SmartphoneNfc className="w-5 h-5 inline-block mr-2" />
                    Tarjeta Física NFC
                  </CardTitle>
                  <CardDescription>
                    Vincula tu información digital a una tarjeta de PVC o placa inteligente
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col md:flex-row gap-6 items-center">
                    <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/50 rounded-2xl flex items-center justify-center shrink-0 rotate-3 transform transition-transform hover:rotate-6">
                      <SmartphoneNfc className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="flex-1 text-center md:text-left">
                      <h4 className="font-semibold text-lg mb-1">Tecnología "Tap to Share"</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                        Puedes programar cualquier tarjeta NFC en blanco. Solo necesitas descargar una app gratuita como <strong>NFC Tools</strong> en tu celular, seleccionar "Escribir URI" y pegar tu enlace único.
                      </p>
                      <Button variant="outline" onClick={handleCopyUrl} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-900/50">
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar Link para Escribir NFC
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Mobile Setup Tab */}
        <TabsContent value="mobile" className="mt-6">
          {card && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* PWA / Home Screen Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Smartphone className="w-5 h-5 text-primary" />
                      Añadir a Pantalla de Inicio
                    </CardTitle>
                    <CardDescription>
                      Ten tu tarjeta siempre a mano como si fuera una App
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-4">
                      <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-xs font-bold text-blue-600">iOS</span>
                        </div>
                        <p className="text-sm">
                          Abre tu tarjeta en <strong>Safari</strong>, pulsa el botón <strong>Compartir</strong> (cuadrado con flecha) y selecciona <strong>"Añadir a la pantalla de inicio"</strong>.
                        </p>
                      </div>

                      <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-xs font-bold text-green-600">And</span>
                        </div>
                        <p className="text-sm">
                          Abre tu tarjeta en <strong>Chrome</strong>, pulsa los <strong>tres puntos</strong> arriba a la derecha y selecciona <strong>"Instalar aplicación"</strong> o <strong>"Añadir a pantalla de inicio"</strong>.
                        </p>
                      </div>
                    </div>
                    <Button asChild className="w-full mt-2" variant="outline">
                      <a href={`/tarjeta/${card.urlUnica}`} target="_blank">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Abrir para instalar
                      </a>
                    </Button>
                  </CardContent>
                </Card>

                {/* QR Wallpaper Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <QrCode className="w-5 h-5 text-amber-500" />
                      QR en Fondo de Pantalla
                    </CardTitle>
                    <CardDescription>
                      La forma más rápida de compartir sin desbloquear el móvil
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-center">
                    <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-4 inline-block mx-auto mb-2">
                      {card.qrCodeData && (
                        <Image
                          src={card.qrCodeData}
                          alt="QR Code Small"
                          width={80}
                          height={80}
                          className="mx-auto"
                        />
                      )}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Descarga tu código QR y colócalo como imagen en tu <strong>pantalla de bloqueo</strong>. ¡Ideal para eventos de networking!
                    </p>
                    <Button onClick={handleDownloadQR} className="w-full" variant="secondary">
                      <Download className="w-4 h-4 mr-2" />
                      Descargar QR para Wallpaper
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* NFC Card (Duplicate for convenience here too) */}
              <Card className="bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/50">
                <CardHeader>
                  <CardTitle className="text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                    <SmartphoneNfc className="w-5 h-5" />
                    Configuración Pro (NFC)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col md:flex-row gap-6 items-center">
                    <div className="flex-1">
                      <p className="text-sm text-indigo-900/70 dark:text-indigo-300/70 mb-4">
                        Si tienes una etiqueta o tarjeta NFC, usa la app <strong>NFC Tools</strong>, selecciona <strong>Escribir</strong> -&gt; <strong>Añadir registro</strong> -&gt; <strong>URL/URI</strong> y pega tu enlace:
                      </p>
                      <div className="flex items-center gap-2 p-2 bg-white dark:bg-slate-950 rounded-lg border border-indigo-200 dark:border-indigo-800 mb-4">
                        <code className="text-xs font-mono flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                          {mounted ? `${window.location.origin}/tarjeta/${card.urlUnica}` : ''}
                        </code>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleCopyUrl}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>

    {/* Frame de previsualización Mobile-first a la derecha (Desktop) */}
    <div className="hidden lg:block w-[350px] shrink-0 sticky top-24">
      <div className="border-[8px] border-slate-900 rounded-[3rem] shadow-2xl h-[calc(100vh-120px)] flex flex-col bg-white dark:bg-slate-950 overflow-hidden relative ring-4 ring-slate-100 dark:ring-slate-800">
        {/* Dynamic Island / Notch Mockup */}
        <div className="absolute top-0 inset-x-0 h-6 flex justify-center z-50">
          <div className="w-32 h-6 bg-slate-900 rounded-b-3xl"></div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide pt-4">
          {(card || formData.nombre) ? (
            <CardRenderer
              data={{
                nombre: formData.nombre,
                puesto: formData.puesto,
                empresa: formData.empresa,
                telefonoMovil: formData.telefonoMovil,
                telefonoOficina: formData.telefonoOficina,
                email: formData.email,
                sitioWeb: formData.sitioWeb,
                whatsapp: formData.whatsapp,
                telegram: formData.telegram,
                redesSociales: formData.redesSociales,
                template: formData.template,
                fontFamily: formData.fontFamily,
                layoutStyle: formData.layoutStyle,
                colorPrimario: formData.colorPrimario,
                colorSecundario: formData.colorSecundario,
                colorFondo: formData.colorFondo,
                colorTexto: formData.colorTexto,
                backgroundPattern: formData.backgroundPattern,
                logoUrl: logoDisplayUrl || undefined,
                fotoPerfilUrl: fotoDisplayUrl || undefined,
                bannerUrl: formData.bannerUrl,
              }}
              isPreview={true}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground p-8 text-center bg-slate-50 dark:bg-slate-900/50">
              <p className="text-sm">Comienza a llenar tu información para ver la previsualización</p>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
);
}
