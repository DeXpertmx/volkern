'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, XCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/**
 * Banner de advertencia que se muestra cuando un Superadmin está suplantando a un tenant.
 */
export default function ImpersonationBanner() {
  const router = useRouter();
  const [impersonatingTenant, setImpersonatingTenant] = useState<{ id: string, nombre: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkImpersonation();
    
    // Polling ligero para detectar cambios de estado (opcional, pero útil tras navegación)
    const interval = setInterval(checkImpersonation, 30000); // 30 segundos
    return () => clearInterval(interval);
  }, []);

  const checkImpersonation = async () => {
    try {
      const res = await fetch('/api/admin/impersonate');
      if (res.ok) {
        const data = await res.json();
        if (data.active) {
          setImpersonatingTenant(data.tenant);
        } else {
          setImpersonatingTenant(null);
        }
      }
    } catch (error) {
      console.error('Error checking impersonation:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStopImpersonation = async () => {
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });

      if (res.ok) {
        toast.success('Suplantación finalizada');
        setImpersonatingTenant(null);
        // Recargar para limpiar el contexto global y volver al panel del admin.
        // Ojo con la ruta: los tenants del backoffice están en `/admin/saas/tenants`.
        // Aquí ponía `/admin/tenants`, que no existe (no hay carpeta `tenants`
        // bajo `app/admin/`), así que detener la suplantación terminaba en un 404.
        // El fallo no se veía porque hasta hoy era imposible llegar a suplantar.
        window.location.href = '/admin/saas/tenants';
      } else {
        toast.error('Error al detener la suplantación');
      }
    } catch (error) {
      toast.error('Error de conexión al detener suplantación');
    }
  };

  if (loading || !impersonatingTenant) return null;

  return (
    <div className="bg-amber-600 text-white py-2 px-4 sticky top-0 z-[100] shadow-md animate-in slide-in-from-top duration-300">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-amber-700 p-1.5 rounded-full animate-pulse">
            <AlertTriangle size={18} className="text-white" />
          </div>
          <div className="text-sm md:text-base font-medium">
            MODO SOPORTE ACTIVO: Estás suplantando a <span className="font-bold underlineDecoration-amber-200">{impersonatingTenant.nombre}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-white hover:bg-amber-700 border border-amber-400/30"
            onClick={() => router.push('/dashboard')}
          >
            <ExternalLink size={14} className="mr-2" />
            Ir al Dashboard Suplantado
          </Button>
          
          <Button 
            variant="secondary" 
            size="sm" 
            className="bg-white text-amber-800 hover:bg-gray-100 font-bold"
            onClick={handleStopImpersonation}
          >
            <XCircle size={14} className="mr-2 text-red-600" />
            DETENER SUPLANTACIÓN
          </Button>
        </div>
      </div>
    </div>
  );
}
