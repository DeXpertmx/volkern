
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  X,
  Sparkles,
  Users,
  Zap,
  MessageSquare,
  Briefcase,
  UserPlus,
  LayoutTemplate,
} from 'lucide-react';

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

const CHECKLIST_ITEMS = [
  {
    field: 'configuracionBasica',
    title: 'Funda tu Hub',
    description: 'Configura nombre y logo de tu empresa',
    icon: Briefcase,
    link: '/dashboard/configuracion',
  },
  {
    field: 'configuracionCanales',
    title: 'Conecta tus canales',
    description: 'WhatsApp, Email o Mensajería',
    icon: MessageSquare,
    link: '/dashboard/integraciones',
  },
  {
    field: 'primerServicio',
    title: 'Agrega un servicio',
    description: 'Define qué ofreces',
    icon: Sparkles,
    link: '/dashboard/servicios?action=create',
  },
  {
    field: 'primeraPagina',
    title: 'Crea tu primera página',
    description: 'Usa el Page Builder para diseñar un embudo',
    icon: LayoutTemplate,
    link: '/dashboard/pages',
  },
  {
    field: 'primerLead',
    title: 'Importa tus leads',
    description: 'Empieza a alimentar tu CRM',
    icon: UserPlus,
    link: '/dashboard/leads?action=create',
  },
  {
    field: 'primeraAutomatizacion',
    title: 'Automatiza procesos',
    description: 'Crea reglas y secuencias',
    icon: Zap,
    link: '/dashboard/automatizaciones',
  },
  {
    field: 'invitacionEquipo',
    title: 'Invita a tu equipo',
    description: 'Escala la operación de tu Hub',
    icon: Users,
    link: '/dashboard/equipo?action=invite',
  },
];

export function OnboardingChecklist() {
  const router = useRouter();
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [neverShowAgain, setNeverShowAgain] = useState(false);

  useEffect(() => {
    // Verificar si ya fue cerrado en esta sesión
    const wasDismissed = sessionStorage.getItem('onboardingChecklistDismissed');
    if (wasDismissed === 'true') {
      setDismissed(true);
      setLoading(false);
      return;
    }

    fetchProgress();
  }, []);

  const fetchProgress = async () => {
    try {
      const res = await fetch('/api/onboarding');
      if (res.ok) {
        const data = await res.json();
        setProgress(data);

        // Ocultar si está completado u omitido
        if (data.completado || data.omitido) {
          setDismissed(true);
        }
      }
    } catch (error) {
      console.error('Error fetching onboarding progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    if (neverShowAgain) {
      try {
        await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ omitido: true }),
        });
      } catch (error) {
        console.error('Error omitiendo onboarding permanentemente:', error);
      }
    }

    // Marcar como omitido temporalmente en esta sesión (o permanentemente si se completó arriba)
    sessionStorage.setItem('onboardingChecklistDismissed', 'true');
    setDismissed(true);
  };

  const completedCount = progress
    ? CHECKLIST_ITEMS.filter((item) => progress[item.field as keyof OnboardingProgress]).length
    : 0;
  const totalCount = CHECKLIST_ITEMS.length;
  const progressPercentage = Math.round((completedCount / totalCount) * 100);

  if (loading || !progress || dismissed || progress.completado || progress.omitido) {
    return null;
  }

  return (
    <Card className="border-2 border-primary/20 shadow-lg mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Configura tu CRM</CardTitle>
              <CardDescription>
                {completedCount} de {totalCount} pasos completados
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4">
          <Progress value={progressPercentage} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">{progressPercentage}% completado</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pb-4">
        {CHECKLIST_ITEMS.map((item) => {
          const isComplete = progress[item.field as keyof OnboardingProgress];
          const Icon = item.icon;

          return (
            <div
              key={item.field}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${isComplete
                ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                : 'bg-card hover:bg-muted/50'
                }`}
            >
              <div className="flex items-center gap-3 flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isComplete
                    ? 'bg-green-100 dark:bg-green-900'
                    : 'bg-muted'
                    }`}
                >
                  {isComplete ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </div>

              {!isComplete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(item.link)}
                  className="flex-shrink-0"
                >
                  Completar
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              )}

              {isComplete && (
                <Badge variant="secondary" className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-0">
                  Listo
                </Badge>
              )}
            </div>
          );
        })}

        <div className="pt-3 space-y-3">
          <div className="flex gap-2">
            <Button
              onClick={() => router.push('/dashboard/onboarding')}
              className="flex-1"
              size="sm"
            >
              Continuar Configuración
            </Button>
            <Button variant="outline" onClick={handleDismiss} size="sm">
              Más tarde
            </Button>
          </div>
          <div className="flex items-center space-x-2 pt-1 border-t mt-2">
            <Checkbox
              id="never-show-checklist"
              checked={neverShowAgain}
              onCheckedChange={(checked) => setNeverShowAgain(checked as boolean)}
            />
            <label
              htmlFor="never-show-checklist"
              className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-muted-foreground cursor-pointer"
            >
              No volver a mostrar en el dashboard
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
