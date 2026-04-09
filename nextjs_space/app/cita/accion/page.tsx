'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2, AlertTriangle, Calendar } from 'lucide-react';

export default function CitaAccionPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'expired'>('loading');
  const [action, setAction] = useState<'confirmar' | 'cancelar' | null>(null);
  const [citaInfo, setCitaInfo] = useState<any>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Token no proporcionado');
      return;
    }

    const processAction = async () => {
      try {
        const res = await fetch('/api/citas/accion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (res.status === 410) {
            setStatus('expired');
            setMessage(data.error || 'El enlace ha expirado');
          } else {
            setStatus('error');
            setMessage(data.error || 'Error al procesar la solicitud');
          }
          return;
        }

        setStatus('success');
        setAction(data.action);
        setCitaInfo(data.cita);
        setMessage(data.message);
      } catch (error) {
        setStatus('error');
        setMessage('Error de conexión. Por favor intenta de nuevo.');
      }
    };

    processAction();
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardContent className="pt-8 pb-8">
          {status === 'loading' && (
            <div className="text-center">
              <Loader2 className="h-16 w-16 animate-spin text-blue-500 mx-auto mb-4" />
              <p className="text-gray-600">Procesando tu solicitud...</p>
            </div>
          )}

          {status === 'success' && action === 'confirmar' && (
            <div className="text-center">
              <div className="bg-green-100 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                <CheckCircle className="h-12 w-12 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Cita Confirmada!</h1>
              <p className="text-gray-600 mb-6">{message}</p>
              
              {citaInfo && (
                <div className="bg-gray-50 rounded-lg p-4 text-left mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-5 w-5 text-blue-500" />
                    <span className="font-medium">{citaInfo.servicio}</span>
                  </div>
                  <p className="text-sm text-gray-600">{citaInfo.fecha}</p>
                </div>
              )}
              
              <p className="text-sm text-gray-500">
                Te esperamos. ¡Gracias por confirmar!
              </p>
            </div>
          )}

          {status === 'success' && action === 'cancelar' && (
            <div className="text-center">
              <div className="bg-red-100 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                <XCircle className="h-12 w-12 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Cita Cancelada</h1>
              <p className="text-gray-600 mb-6">{message}</p>
              
              {citaInfo && (
                <div className="bg-gray-50 rounded-lg p-4 text-left mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-5 w-5 text-gray-400" />
                    <span className="font-medium text-gray-500 line-through">{citaInfo.servicio}</span>
                  </div>
                  <p className="text-sm text-gray-400 line-through">{citaInfo.fecha}</p>
                </div>
              )}
              
              <p className="text-sm text-gray-500">
                Esperamos verte pronto. Puedes agendar una nueva cita cuando gustes.
              </p>
            </div>
          )}

          {status === 'expired' && (
            <div className="text-center">
              <div className="bg-yellow-100 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                <AlertTriangle className="h-12 w-12 text-yellow-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Enlace Expirado</h1>
              <p className="text-gray-600 mb-6">{message}</p>
              <p className="text-sm text-gray-500">
                Este enlace ya no es válido. Si necesitas modificar tu cita, por favor contáctanos directamente.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center">
              <div className="bg-red-100 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                <XCircle className="h-12 w-12 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
              <p className="text-gray-600 mb-6">{message}</p>
              <Button onClick={() => window.location.reload()} variant="outline">
                Intentar de nuevo
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
