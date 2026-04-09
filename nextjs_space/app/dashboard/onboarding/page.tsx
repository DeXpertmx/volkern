
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  ArrowLeft,
  X,
  Sparkles,
  Users,
  Zap,
  MessageSquare,
  Briefcase,
  UserPlus,
  LayoutTemplate,
  Send,
  ExternalLink,
  AlertCircle,
  Loader2,
  CheckCircle,
  Info,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface OnboardingProgress {
  configuracionBasica: boolean;
  configuracionCanales: boolean;
  primerServicio: boolean;
  primeraPagina: boolean;
  primerLead: boolean;
  primeraAutomatizacion: boolean;
  invitacionEquipo: boolean;
  completado: boolean;
  omitido: boolean;
  pasoActual: number;
}

const STEPS = [
  {
    id: 0,
    title: 'Bienvenido a Volkern',
    description: 'Configura tu Hub en minutos',
    icon: Sparkles,
  },
  {
    id: 1,
    title: 'Funda tu Hub',
    description: 'Configura el nombre de tu empresa y logo corporativo',
    icon: Briefcase,
    field: 'configuracionBasica',
  },
  {
    id: 2,
    title: 'Conecta tu Bot de Telegram',
    description: 'Recibe notificaciones del CRM gratis',
    icon: Send,
    field: 'configuracionCanales',
    required: true,
  },
  {
    id: 3,
    title: 'Agrega un servicio',
    description: 'Define qué ofreces a tus clientes',
    icon: Sparkles,
    field: 'primerServicio',
  },
  {
    id: 4,
    title: 'Crea tu primera página',
    description: 'Diseña un embudo de ventas asombroso',
    icon: LayoutTemplate,
    field: 'primeraPagina',
  },
  {
    id: 5,
    title: 'Importa tus leads',
    description: 'Alimenta tu CRM con contactos potenciales',
    icon: UserPlus,
    field: 'primerLead',
  },
  {
    id: 6,
    title: 'Automatiza procesos',
    description: 'Crea reglas y secuencias',
    icon: Zap,
    field: 'primeraAutomatizacion',
  },
  {
    id: 7,
    title: 'Invita a tu equipo',
    description: 'Escala la operación de tu Hub',
    icon: Users,
    field: 'invitacionEquipo',
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);

  // Form data para el paso de configuración
  const [brandName, setBrandName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // Form data para Telegram
  const [botToken, setBotToken] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [validatingTelegram, setValidatingTelegram] = useState(false);
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [telegramError, setTelegramError] = useState('');

  useEffect(() => {
    fetchProgress();
  }, []);

  const fetchProgress = async () => {
    try {
      const res = await fetch('/api/onboarding');
      if (res.ok) {
        const data = await res.json();
        setProgress(data);
        setCurrentStep(data.pasoActual || 0);

        // Si ya está completado u omitido, redirigir al dashboard
        if (data.completado || data.omitido) {
          router.push('/dashboard');
        }
      }
    } catch (error) {
      console.error('Error fetching onboarding progress:', error);
      toast.error('Error al cargar el progreso');
    } finally {
      setLoading(false);
    }
  };

  const updateProgress = async (updates: Partial<OnboardingProgress>) => {
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        const data = await res.json();
        setProgress(data);
        return data;
      }
    } catch (error) {
      console.error('Error updating progress:', error);
      toast.error('Error al actualizar el progreso');
    }
  };

  const handleNext = async () => {
    if (currentStep < STEPS.length - 1) {
      const newStep = currentStep + 1;
      setCurrentStep(newStep);
      await updateProgress({ pasoActual: newStep });
    } else {
      // Último paso, marcar como completado
      await updateProgress({ completado: true });
      toast.success('¡Onboarding completado! 🎉');
      router.push('/dashboard');
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    await updateProgress({ omitido: true });
    toast.info('Puedes completar estos pasos más tarde desde el dashboard');
    router.push('/dashboard');
  };

  const handleCompleteStep = async (field: string) => {
    await updateProgress({ [field]: true });
    toast.success('¡Paso completado!');
    setTimeout(() => handleNext(), 500);
  };

  const handleSaveBrandConfig = async () => {
    if (!brandName) {
      toast.error('Por favor ingresa el nombre de tu empresa');
      return;
    }

    try {
      // Guardar configuración general (nombre de empresa y logo corporativo)
      const res = await fetch('/api/configuracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: brandName,
          logo_corporativo: logoUrl || undefined,
        }),
      });

      if (res.ok) {
        await handleCompleteStep('configuracionBasica');
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('Error response:', errorData);
        toast.error('Error al guardar la configuración');
      }
    } catch (error) {
      console.error('Error saving brand config:', error);
      toast.error('Error al guardar la configuración');
    }
  };

  const handleConfigureTelegram = async () => {
    if (!botToken) {
      setTelegramError('Por favor ingresa el token de tu bot');
      return;
    }

    setValidatingTelegram(true);
    setTelegramError('');

    try {
      const res = await fetch('/api/onboarding/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken,
          botUsername,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setTelegramConfigured(true);
        setBotUsername(data.botInfo?.username || botUsername);
        toast.success(`¡Bot @${data.botInfo?.username || botUsername} conectado correctamente!`);
        await handleCompleteStep('configuracionCanales');
      } else {
        setTelegramError(data.error || 'Error al configurar el bot');
        toast.error(data.error || 'Error al configurar el bot');
      }
    } catch (error) {
      console.error('Error configuring Telegram:', error);
      setTelegramError('Error de conexión. Intenta de nuevo.');
      toast.error('Error de conexión');
    } finally {
      setValidatingTelegram(false);
    }
  };

  const progressPercentage = progress
    ? Math.round(
      (Object.values(progress).filter((v, i) => i < 7 && v === true).length / 7) * 100
    )
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  const StepIcon = STEPS[currentStep].icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <div className="border-b bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Configuración Inicial</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSkip}>
            <X className="h-4 w-4 mr-2" />
            Omitir por ahora
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Paso {currentStep + 1} de {STEPS.length}
            </span>
            <span className="text-sm text-muted-foreground">{progressPercentage}% completado</span>
          </div>
          <Progress value={(currentStep / (STEPS.length - 1)) * 100} className="h-2" />
        </div>

        {/* Main Card */}
        <Card className="shadow-xl border-2">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <StepIcon className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">{STEPS[currentStep].title}</CardTitle>
            <CardDescription className="text-base">
              {STEPS[currentStep].description}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Step Content */}
            {currentStep === 0 && (
              <div className="text-center space-y-4">
                <p className="text-lg">
                  ¡Bienvenido a <strong>Volkern CRM</strong>! 🎉
                </p>
                <p className="text-muted-foreground">
                  Te guiaremos paso a paso para configurar tu nuevo Hub Operativo. Automatiza procesos, gestiona tus ventas y escala tu negocio B2B desde una única plataforma.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
                  {STEPS.slice(1).map((step) => {
                    const Icon = step.icon;
                    const isComplete = progress?.[step.field as keyof OnboardingProgress];
                    return (
                      <div
                        key={step.id}
                        className="p-4 rounded-lg border bg-card text-center space-y-2"
                      >
                        <div
                          className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center ${isComplete ? 'bg-green-100 dark:bg-green-900' : 'bg-muted'
                            }`}
                        >
                          {isComplete ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          ) : (
                            <Icon className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <p className="text-xs font-medium">{step.title}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="brandName">Nombre de tu empresa *</Label>
                  <Input
                    id="brandName"
                    placeholder="Ej: Mi Empresa"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Este nombre aparecerá en tu plataforma y en las comunicaciones con clientes.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="logoUrl">Logo Corporativo (opcional)</Label>
                  <Input
                    id="logoUrl"
                    placeholder="https://cdn.pixabay.com/photo/2015/05/22/19/01/business-779542_1280.jpg"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Este logo se usará en documentos, órdenes, contratos y comunicaciones.
                    Puedes cambiarlo más tarde desde Configuración → General.
                  </p>
                </div>

                <Button onClick={handleSaveBrandConfig} className="w-full" size="lg">
                  Guardar y Continuar
                </Button>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6">
                {/* Mensaje informativo */}
                <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800 dark:text-blue-200">
                    <strong>¿Por qué Telegram?</strong> Todas las notificaciones del CRM (nuevos leads, ventas, citas, alertas) 
                    se enviarán a través de tu bot de Telegram de forma <strong>100% gratuita</strong>. 
                    Si no lo configuras, estas notificaciones se enviarían por WhatsApp con costo adicional de Meta.
                  </AlertDescription>
                </Alert>

                {telegramConfigured ? (
                  <div className="text-center space-y-4 py-4">
                    <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-green-600">¡Bot conectado exitosamente!</p>
                      <p className="text-muted-foreground">@{botUsername}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Instrucciones */}
                    <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Send className="h-4 w-4 text-blue-500" />
                        Crea tu Bot en 3 pasos:
                      </h4>
                      <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                        <li>
                          Abre Telegram y busca{' '}
                          <a
                            href="https://t.me/BotFather"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary font-medium hover:underline inline-flex items-center gap-1"
                          >
                            @BotFather <ExternalLink className="h-3 w-3" />
                          </a>
                        </li>
                        <li>Envía el comando <code className="px-1.5 py-0.5 bg-muted rounded text-xs">/newbot</code> y sigue las instrucciones</li>
                        <li>Copia el <strong>Token</strong> que te proporciona BotFather y pégalo aquí</li>
                      </ol>
                    </div>

                    {/* Formulario */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="botToken" className="flex items-center gap-2">
                          Token del Bot <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="botToken"
                          type="password"
                          placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz..."
                          value={botToken}
                          onChange={(e) => {
                            setBotToken(e.target.value);
                            setTelegramError('');
                          }}
                          className={telegramError ? 'border-red-500' : ''}
                        />
                        <p className="text-xs text-muted-foreground">
                          El token tiene un formato como: <code>123456789:ABCdef...</code>
                        </p>
                      </div>

                      {telegramError && (
                        <Alert variant="destructive" className="py-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{telegramError}</AlertDescription>
                        </Alert>
                      )}

                      <Button
                        onClick={handleConfigureTelegram}
                        className="w-full"
                        size="lg"
                        disabled={validatingTelegram || !botToken}
                      >
                        {validatingTelegram ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Validando token...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Conectar Bot de Telegram
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Define los servicios que ofreces. Esto te ayudará a organizar tus citas y cotizaciones de forma automática.
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      router.push('/dashboard/servicios?action=create');
                    }}
                    className="flex-1"
                    size="lg"
                  >
                    Crear Servicio
                  </Button>
                  <Button variant="outline" onClick={handleNext} className="flex-1" size="lg">
                    Lo haré después
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Crea tu primera landing page o embudo con nuestro constructor de páginas avanzado. Es Drag & Drop y Pixel Perfect.
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      router.push('/dashboard/pages');
                    }}
                    className="flex-1"
                    size="lg"
                  >
                    Ir al Page Builder
                  </Button>
                  <Button variant="outline" onClick={handleNext} className="flex-1" size="lg">
                    Lo haré después
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Los leads son contactos potenciales interesados en tus servicios. Comienza importándolos o creándolos manualmente.
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      router.push('/dashboard/leads?action=create');
                    }}
                    className="flex-1"
                    size="lg"
                  >
                    Importar Leads
                  </Button>
                  <Button variant="outline" onClick={handleNext} className="flex-1" size="lg">
                    Lo haré después
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 6 && (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Las automatizaciones n8n y visuales te ayudan a ahorrar tiempo enviando mensajes, asignando prospectos y operando en piloto automático.
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      router.push('/dashboard/automatizaciones');
                    }}
                    className="flex-1"
                    size="lg"
                  >
                    Crear Automatización
                  </Button>
                  <Button variant="outline" onClick={handleNext} className="flex-1" size="lg">
                    Lo haré después
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 7 && (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Un Hub Operativo multiplica fuerzas. Invita a miembros de tu equipo para colaborar juntos en la gestión de leads y ventas.
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      router.push('/dashboard/equipo?action=invite');
                    }}
                    className="flex-1"
                    size="lg"
                  >
                    Invitar Equipo
                  </Button>
                  <Button variant="outline" onClick={handleNext} className="flex-1" size="lg">
                    Lo haré después
                  </Button>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-6 border-t">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={currentStep === 0}
                size="lg"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Anterior
              </Button>

              {currentStep !== 1 && (
                <Button onClick={handleNext} size="lg">
                  {currentStep === STEPS.length - 1 ? 'Finalizar' : 'Siguiente'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Steps Overview */}
        <div className="mt-8 flex justify-center gap-2">
          {STEPS.map((step, idx) => (
            <button
              key={step.id}
              onClick={() => setCurrentStep(idx)}
              className={`w-2 h-2 rounded-full transition-all ${idx === currentStep
                ? 'w-8 bg-primary'
                : idx < currentStep
                  ? 'bg-green-500'
                  : 'bg-muted'
                }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
