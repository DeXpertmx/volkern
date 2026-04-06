'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Tag, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function ServiciosPage() {
  const router = useRouter();

  // Auto-redirect después de 5 segundos
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/dashboard/catalogo?tipo=servicio');
    }, 5000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 bg-primary/10 rounded-full w-fit">
            <Tag className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Servicios Migrados al Catálogo</CardTitle>
          <CardDescription>
            Los servicios ahora se gestionan desde el Catálogo Centralizado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Cambio Importante</AlertTitle>
            <AlertDescription>
              Para unificar la gestión de productos y servicios, todos los servicios ahora 
              se encuentran en el <strong>Catálogo Centralizado</strong>. Esto permite:
            </AlertDescription>
          </Alert>

          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="text-primary">✓</span>
              Un único lugar para gestionar precios
            </li>
            <li className="flex items-center gap-2">
              <span className="text-primary">✓</span>
              Configuración fiscal automática por servicio
            </li>
            <li className="flex items-center gap-2">
              <span className="text-primary">✓</span>
              Integración directa con citas, cotizaciones y contratos
            </li>
            <li className="flex items-center gap-2">
              <span className="text-primary">✓</span>
              SKU único para cada producto/servicio
            </li>
          </ul>

          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground text-center mb-4">
              Serás redirigido automáticamente en 5 segundos...
            </p>
            <Button 
              onClick={() => router.push('/dashboard/catalogo?tipo=servicio')} 
              className="w-full"
            >
              Ir al Catálogo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
