
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2, Link2, ExternalLink, Upload, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CanvaDesignerProps {
  templateId?: string;
  onDesignPublished: (url: string) => void;
  onClose?: () => void;
}

// Tipos de diseño soportados por la API de Canva
// Las plantillas se seleccionan dentro del editor de Canva
const CANVA_DESIGN_TYPES = {
  facebook_ad: { 
    name: 'Anuncio de Facebook', 
    type: 'SocialMedia',
    width: 1200,
    height: 628,
    description: '1200 x 628 px'
  },
  instagram_story: { 
    name: 'Historia de Instagram', 
    type: 'SocialMedia',
    width: 1080,
    height: 1920,
    description: '1080 x 1920 px'
  },
  instagram_post: { 
    name: 'Publicación de Instagram', 
    type: 'SocialMedia',
    width: 1080,
    height: 1080,
    description: '1080 x 1080 px'
  },
  email_header: { 
    name: 'Encabezado de Email', 
    type: 'SocialMedia',
    width: 600,
    height: 200,
    description: '600 x 200 px'
  },
  whatsapp_post: { 
    name: 'Publicación para WhatsApp', 
    type: 'SocialMedia',
    width: 1080,
    height: 1080,
    description: '1080 x 1080 px'
  },
  linkedin_post: { 
    name: 'Publicación de LinkedIn', 
    type: 'SocialMedia',
    width: 1200,
    height: 627,
    description: '1200 x 627 px'
  },
};

export default function CanvaDesigner({ templateId, onDesignPublished, onClose }: CanvaDesignerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>(templateId || 'facebook_ad');
  const [designUrl, setDesignUrl] = useState<string | null>(null);
  const [currentDesignId, setCurrentDesignId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [creatingDesign, setCreatingDesign] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [canvaWindow, setCanvaWindow] = useState<Window | null>(null);
  const [manualDesignId, setManualDesignId] = useState('');

  const clientId = process.env.NEXT_PUBLIC_CANVA_CLIENT_ID;

  // Verificar estado de conexión con Canva al cargar
  useEffect(() => {
    checkCanvaConnection();
  }, []);

  const checkCanvaConnection = async () => {
    try {
      setCheckingConnection(true);
      const response = await fetch('/api/canva/status');
      const data = await response.json();
      
      setIsConnected(data.connected && !data.needsAuth);
      setLoading(false);
    } catch (error) {
      console.error('Error al verificar conexión con Canva:', error);
      setIsConnected(false);
      setLoading(false);
    } finally {
      setCheckingConnection(false);
    }
  };

  const handleConnectCanva = () => {
    // Redirigir al flujo OAuth
    window.location.href = '/api/canva/authorize';
  };

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
  };

  const handleOpenEditor = async () => {
    try {
      setCreatingDesign(true);
      setError(null);

      const designConfig = CANVA_DESIGN_TYPES[selectedTemplate as keyof typeof CANVA_DESIGN_TYPES];
      
      if (!designConfig) {
        throw new Error('Tipo de diseño no válido');
      }
      
      // Crear diseño usando la API
      const response = await fetch('/api/canva/create-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designType: designConfig.type,
          width: designConfig.width,
          height: designConfig.height,
          title: `Volkern CRM - ${designConfig.name}`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Manejar error de token expirado o permisos faltantes
        if (data.needsReconnect || response.status === 401 || response.status === 403 || response.status === 400) {
          setIsConnected(false);
          const errorMessage = data.message || 'Tu conexión con Canva necesita ser actualizada. Por favor, reconecta tu cuenta para obtener los permisos necesarios.';
          setError(errorMessage);
          
          toast.error('🔄 Reconexión Requerida', {
            description: errorMessage,
            duration: 10000,
          });
          
          // Recargar el estado de conexión
          await checkCanvaConnection();
          return;
        }
        
        throw new Error(data.error || 'Error al crear diseño en Canva');
      }

      if (data.success && data.design?.editUrl) {
        setCurrentDesignId(data.design.id);
        
        // Abrir Canva en una nueva ventana
        const width = 1200;
        const height = 800;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        
        const newWindow = window.open(
          data.design.editUrl,
          'canva-editor',
          `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );
        
        setCanvaWindow(newWindow);
        
        toast.success('Editor de Canva abierto en nueva ventana', {
          description: 'Puedes elegir una plantilla dentro de Canva. Cuando termines, haz clic en "Importar Diseño"',
        });
      } else {
        throw new Error('No se recibió URL de edición');
      }

    } catch (err: any) {
      console.error('Error al abrir editor:', err);
      setError(err.message || 'Error al abrir el editor de Canva');
      toast.error('Error al Crear Diseño', {
        description: err.message || 'No se pudo abrir el editor de Canva. Verifica tu conexión e intenta reconectar.',
        duration: 5000,
      });
    } finally {
      setCreatingDesign(false);
    }
  };

  const handleImportDesign = async () => {
    try {
      if (!currentDesignId) {
        toast.error('No hay diseño para importar');
        return;
      }

      setExporting(true);
      setError(null);

      // Exportar el diseño
      const exportResponse = await fetch('/api/canva/export-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designId: currentDesignId,
          format: 'png',
        }),
      });

      const exportData = await exportResponse.json();

      if (!exportResponse.ok) {
        throw new Error(exportData.error || 'Error al exportar diseño');
      }

      // Si es un job, esperar a que termine
      if (exportData.jobId) {
        toast.info('Procesando diseño...', {
          description: 'Esto puede tomar unos segundos',
        });

        // Polling para verificar el estado
        let attempts = 0;
        const maxAttempts = 30; // 30 segundos máximo
        
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const checkResponse = await fetch(`/api/canva/check-export?jobId=${exportData.jobId}`);
          const checkData = await checkResponse.json();
          
          if (checkData.status === 'success' && checkData.exportUrl) {
            setDesignUrl(checkData.exportUrl);
            onDesignPublished(checkData.exportUrl);
            toast.success('¡Diseño importado exitosamente!');
            
            // Cerrar ventana de Canva si está abierta
            if (canvaWindow && !canvaWindow.closed) {
              canvaWindow.close();
            }
            
            setExporting(false);
            return;
          } else if (checkData.status === 'failed') {
            throw new Error('La exportación falló');
          }
          
          attempts++;
        }
        
        throw new Error('Timeout esperando la exportación');
        
      } else if (exportData.exportUrl) {
        // URL directa
        setDesignUrl(exportData.exportUrl);
        onDesignPublished(exportData.exportUrl);
        toast.success('¡Diseño importado exitosamente!');
        
        if (canvaWindow && !canvaWindow.closed) {
          canvaWindow.close();
        }
      }

    } catch (err: any) {
      console.error('Error al importar diseño:', err);
      setError(err.message || 'Error al importar el diseño');
      toast.error('Error', {
        description: err.message || 'No se pudo importar el diseño',
      });
    } finally {
      setExporting(false);
    }
  };

  const handleManualImport = async () => {
    if (!manualDesignId.trim()) {
      toast.error('Por favor ingresa un ID de diseño');
      return;
    }

    setCurrentDesignId(manualDesignId.trim());
    await handleImportDesign();
  };

  // Mostrar loading mientras verifica conexión
  if (checkingConnection) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Verificando conexión con Canva...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Si no hay Client ID configurado
  if (!clientId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            Configuración Requerida
          </CardTitle>
          <CardDescription>
            Para usar el diseñador de Canva, necesitas configurar tu Client ID
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium mb-2">NEXT_PUBLIC_CANVA_CLIENT_ID no está configurado</p>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Ve a tu cuenta de Canva Developers</li>
                <li>Crea o accede a tu aplicación</li>
                <li>Copia el Client ID</li>
                <li>Agrégalo al archivo .env.local como NEXT_PUBLIC_CANVA_CLIENT_ID</li>
                <li>Reinicia el servidor de desarrollo</li>
              </ol>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const handleDisconnect = async () => {
    try {
      const response = await fetch('/api/canva/disconnect', {
        method: 'POST',
      });

      if (response.ok) {
        setIsConnected(false);
        toast.success('Cuenta desconectada', {
          description: 'Puedes volver a conectar tu cuenta de Canva cuando quieras',
        });
      }
    } catch (error) {
      console.error('Error al desconectar:', error);
      toast.error('Error al desconectar');
    }
  };

  // Si el usuario no está conectado, mostrar botón de conexión
  if (isConnected === false) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Conectar con Canva
          </CardTitle>
          <CardDescription>
            Necesitas autorizar a Volkern CRM para acceder a tu cuenta de Canva
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium mb-2">Reconexión Requerida</p>
                <p className="text-sm">{error}</p>
              </AlertDescription>
            </Alert>
          )}

          {!error && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium mb-2">¿Por qué necesito conectar mi cuenta?</p>
                <p className="text-sm">
                  Al conectar tu cuenta de Canva, podrás diseñar imágenes profesionales directamente desde 
                  el módulo de Campañas. Tus diseños se guardarán automáticamente y podrás reutilizarlos.
                </p>
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleConnectCanva}
            size="lg"
            className="w-full"
          >
            <Link2 className="h-4 w-4 mr-2" />
            {error ? 'Reconectar con Canva' : 'Conectar con Canva'}
          </Button>

          <div className="mt-4 text-xs text-muted-foreground">
            <p className="font-medium mb-1">Al conectar, podrás:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Crear diseños profesionales con plantillas</li>
              <li>Guardar y reutilizar tus diseños</li>
              <li>Exportar imágenes en alta calidad</li>
              <li>Acceder a tu biblioteca de Canva</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selector de Template */}
      {!currentDesignId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <CardTitle>Selecciona el Tamaño del Diseño</CardTitle>
                <CardDescription>
                  Elige el formato de tu diseño. Podrás seleccionar plantillas profesionales dentro del editor de Canva
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                className="ml-4"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reconectar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(CANVA_DESIGN_TYPES).map(([key, designType]) => (
                <button
                  key={key}
                  onClick={() => handleTemplateChange(key)}
                  disabled={creatingDesign}
                  className={`p-3 border-2 rounded-lg text-left transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                    selectedTemplate === key
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className={`text-sm font-medium mb-1 ${
                    selectedTemplate === key ? 'text-primary' : 'text-gray-700'
                  }`}>
                    {designType.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {designType.description}
                  </p>
                </button>
              ))}
            </div>

            <Button
              onClick={handleOpenEditor}
              className="w-full mt-4"
              size="lg"
              disabled={creatingDesign}
            >
              {creatingDesign ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Abriendo Editor...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir Editor de Canva
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Controles cuando hay un diseño abierto */}
      {currentDesignId && !designUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              Editor de Canva Abierto
            </CardTitle>
            <CardDescription>
              Diseña tu imagen en Canva y luego importa el resultado aquí
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="text-sm font-medium mb-1">Pasos:</p>
                <ol className="list-decimal list-inside text-sm space-y-1">
                  <li>Termina de diseñar en la ventana de Canva</li>
                  <li>Guarda tu diseño en Canva (se guarda automáticamente)</li>
                  <li>Haz clic en "Importar Diseño" aquí abajo</li>
                </ol>
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button
                onClick={handleImportDesign}
                className="flex-1"
                size="lg"
                disabled={exporting}
              >
                {exporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar Diseño
                  </>
                )}
              </Button>
              
              <Button
                onClick={() => {
                  setCurrentDesignId(null);
                  if (canvaWindow && !canvaWindow.closed) {
                    canvaWindow.close();
                  }
                }}
                variant="outline"
                disabled={exporting}
              >
                Cancelar
              </Button>
            </div>

            {/* Opción de importación manual */}
            <div className="pt-4 border-t">
              <Label htmlFor="manual-design-id" className="text-sm text-muted-foreground">
                ¿Tienes un diseño existente? Pega su ID aquí:
              </Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="manual-design-id"
                  placeholder="ID del diseño (ej: DAFHEsUA2dk)"
                  value={manualDesignId}
                  onChange={(e) => setManualDesignId(e.target.value)}
                  disabled={exporting}
                />
                <Button
                  onClick={handleManualImport}
                  variant="secondary"
                  disabled={exporting || !manualDesignId.trim()}
                >
                  Importar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium mb-2">Error</p>
            <p className="text-sm">{error}</p>
          </AlertDescription>
        </Alert>
      )}

      {/* Preview del diseño importado */}
      {designUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              Diseño Importado Exitosamente
            </CardTitle>
            <CardDescription>
              Tu diseño está listo para usar en la campaña
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg p-4 bg-muted">
              <div className="flex items-start gap-4">
                <div className="relative w-32 h-32 rounded overflow-hidden bg-gray-200 flex-shrink-0">
                  <Image
                    src={designUrl}
                    alt="Diseño de Canva"
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium mb-1">Imagen de la campaña</p>
                  <p className="text-xs text-muted-foreground break-all">{designUrl}</p>
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDesignUrl(null);
                        setCurrentDesignId(null);
                      }}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Crear Otro Diseño
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
