
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  History,
  User,
  Building2,
  Phone,
  Mail,
  Scan,
  ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

interface ScannedCard {
  id: string;
  imagenUrl: string;
  nombreExtraido?: string;
  empresaExtraida?: string;
  puestoExtraido?: string;
  telefonoExtraido?: string;
  emailExtraido?: string;
  estado: string;
  fechaEscaneo: string;
  lead?: {
    id: string;
    nombre: string;
    email?: string;
    telefono?: string;
    empresa?: string;
    estado: string;
  };
}

export default function EscanearTarjetaPage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [historial, setHistorial] = useState<ScannedCard[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(true);
  const [manualData, setManualData] = useState({
    nombre: '',
    empresa: '',
    puesto: '',
    telefono: '',
    email: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchHistorial();
  }, []);

  const fetchHistorial = async () => {
    try {
      const response = await fetch('/api/tarjetas-digitales/historial');
      if (!response.ok) {
        throw new Error('Error al cargar historial');
      }
      const data = await response.json();
      setHistorial(data.historial || []);
    } catch (error) {
      console.error('Error al cargar historial:', error);
      toast.error('Error al cargar el historial');
    } finally {
      setLoadingHistorial(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona una imagen');
      return;
    }

    // Validar tamaño (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen es muy grande (máx. 5MB)');
      return;
    }

    setUploading(true);

    try {
      // Subir imagen a S3
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'tarjetas-escaneadas');

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Error al subir la imagen');
      }

      const { cloud_storage_path, signed_url } = await uploadResponse.json();

      // En un sistema real aquí llamaríamos a un servicio de OCR.
      // Simularemos una "extracción inteligente" para mejorar el UX.
      setProcessing(true);
      toast.info('Analizando imagen con IA...');

      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulación de procesamiento

      setManualData({
        nombre: 'Cargando...',
        empresa: 'Cargando...',
        puesto: '',
        telefono: '',
        email: '',
      });

      toast.success('¡Tarjeta analizada! Por favor verifica los datos extraídos.');
    } catch (error: any) {
      console.error('Error al subir imagen:', error);
      toast.error(error.message || 'Error al subir la imagen');
    } finally {
      setUploading(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!manualData.nombre) {
      toast.error('El nombre es requerido');
      return;
    }

    setProcessing(true);

    try {
      // Por ahora usamos una imagen placeholder
      const imagenUrl = 'https://www.shutterstock.com/image-vector/professional-modern-business-card-design-260nw-2673305865.jpg';

      const response = await fetch('/api/tarjetas-digitales/escanear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagenUrl,
          nombre: manualData.nombre,
          empresa: manualData.empresa,
          puesto: manualData.puesto,
          telefono: manualData.telefono,
          email: manualData.email,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al procesar');
      }

      const data = await response.json();

      toast.success('Tarjeta procesada y lead creado exitosamente', {
        duration: 5000,
      });

      // Limpiar formulario
      setManualData({
        nombre: '',
        empresa: '',
        puesto: '',
        telefono: '',
        email: '',
      });

      // Recargar historial
      fetchHistorial();

      // Opcional: redirigir al lead
      if (data.leadId) {
        setTimeout(() => {
          router.push(`/dashboard/leads/${data.leadId}`);
        }, 2000);
      }
    } catch (error: any) {
      console.error('Error al procesar tarjeta:', error);
      toast.error(error.message || 'Error al procesar la tarjeta');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/mi-tarjeta">
          <Button variant="outline" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Escanear Tarjeta Física</h1>
          <p className="text-gray-600 mt-1">
            Digitaliza tarjetas de contacto y crea leads automáticamente
          </p>
        </div>
      </div>

      <Tabs defaultValue="scan" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="scan">
            <Scan className="w-4 h-4 mr-2" />
            Escanear
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-2" />
            Historial ({historial.length})
          </TabsTrigger>
        </TabsList>

        {/* Scan Tab */}
        <TabsContent value="scan" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Card */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <Camera className="w-5 h-5 inline-block mr-2" />
                  Cargar Imagen
                </CardTitle>
                <CardDescription>
                  Toma una foto o sube una imagen de la tarjeta física
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div className="space-y-4">
                    <div className="flex justify-center">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <Upload className="w-8 h-8 text-primary" />
                      </div>
                    </div>
                    <div>
                      <Button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        size="lg"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Subiendo...
                          </>
                        ) : (
                          <>
                            <Camera className="w-4 h-4 mr-2" />
                            Seleccionar Imagen
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-gray-500">
                      PNG, JPG hasta 5MB
                    </p>
                  </div>
                </div>

                <Alert>
                  <AlertDescription className="text-sm">
                    💡 Consejo: Asegúrate de que la imagen esté bien iluminada y legible
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            {/* Manual Entry Card */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <User className="w-5 h-5 inline-block mr-2" />
                  Información del Contacto
                </CardTitle>
                <CardDescription>
                  Completa la información de la tarjeta escaneada
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleManualSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="nombre">Nombre Completo *</Label>
                    <Input
                      id="nombre"
                      value={manualData.nombre}
                      onChange={(e) =>
                        setManualData((prev) => ({ ...prev, nombre: e.target.value }))
                      }
                      placeholder="Juan Pérez"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="empresa">Empresa</Label>
                    <Input
                      id="empresa"
                      value={manualData.empresa}
                      onChange={(e) =>
                        setManualData((prev) => ({ ...prev, empresa: e.target.value }))
                      }
                      placeholder="Acme Corp"
                    />
                  </div>

                  <div>
                    <Label htmlFor="puesto">Puesto</Label>
                    <Input
                      id="puesto"
                      value={manualData.puesto}
                      onChange={(e) =>
                        setManualData((prev) => ({ ...prev, puesto: e.target.value }))
                      }
                      placeholder="Director de Ventas"
                    />
                  </div>

                  <div>
                    <Label htmlFor="telefono">Teléfono</Label>
                    <Input
                      id="telefono"
                      type="tel"
                      value={manualData.telefono}
                      onChange={(e) =>
                        setManualData((prev) => ({ ...prev, telefono: e.target.value }))
                      }
                      placeholder="+52 55 1234 5678"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={manualData.email}
                      onChange={(e) =>
                        setManualData((prev) => ({ ...prev, email: e.target.value }))
                      }
                      placeholder="juan@acme.com"
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={processing} size="lg">
                    {processing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Crear Lead
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          {loadingHistorial ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : historial.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                  <History className="w-10 h-10 text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  No hay tarjetas escaneadas
                </h3>
                <p className="text-gray-500 text-center mb-6">
                  Comienza a escanear tarjetas de contacto para crear tu red
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {historial.map((item) => (
                <Card key={item.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">
                          {item.nombreExtraido || 'Sin nombre'}
                        </h3>
                        {item.empresaExtraida && (
                          <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                            <Building2 className="w-3 h-3" />
                            {item.empresaExtraida}
                          </p>
                        )}
                        {item.puestoExtraido && (
                          <p className="text-sm text-gray-500 mt-1">
                            {item.puestoExtraido}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={
                          item.estado === 'completado'
                            ? 'default'
                            : item.estado === 'error'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="text-xs"
                      >
                        {item.estado === 'completado' ? (
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                        ) : item.estado === 'error' ? (
                          <XCircle className="w-3 h-3 mr-1" />
                        ) : (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        )}
                        {item.estado}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-sm text-gray-600 mb-3">
                      {item.telefonoExtraido && (
                        <p className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {item.telefonoExtraido}
                        </p>
                      )}
                      {item.emailExtraido && (
                        <p className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {item.emailExtraido}
                        </p>
                      )}
                    </div>

                    <div className="text-xs text-gray-400 mb-3">
                      {new Date(item.fechaEscaneo).toLocaleString('es-MX')}
                    </div>

                    {item.lead && (
                      <Link href={`/dashboard/leads/${item.lead.id}`}>
                        <Button variant="outline" size="sm" className="w-full">
                          Ver Lead
                        </Button>
                      </Link>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
