'use client';

/**
 * Conectividad de Canales — el ID de socio del hotel.
 *
 * El proveedor emite un **ID de socio (partner id)** al registrarse cada hotel,
 * y ese id es la clave con la que el servicio devuelve SUS propiedades. Sin él,
 * el hotel no puede ver su catálogo (ni, por tanto, vincular unidades y vender
 * por los canales): la capa funcionaba con un único ID de plataforma mientras
 * todos los hoteles compartían cuenta.
 *
 * Aquí el hotel registra el suyo. Lo que NO se toca desde esta pantalla es el
 * usuario y la contraseña: son de plataforma y los administra Volkern.
 *
 * Dos cosas, en orden:
 *  1. **Guardar el ID de socio**, con el aviso de si la plataforma ya está
 *     activada (sin el acceso de plataforma, el ID solo no sirve para nada).
 *  2. **Comprobar** que con ese ID se ve una propiedad concreta: el proveedor
 *     responde «partner desconocido» si el id no es el suyo, y es mejor
 *     descubrirlo aquí que al vincular unidades.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Cable, CheckCircle2, Loader2, Plug, RefreshCw, Save, Search, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AccionHospitality } from '@/components/hospitality/AccionHospitality';

interface EstadoConectividad {
  nombre: string;
  plataformaConfigurada: boolean;
  tienePartnerIdPropio: boolean;
  partnerId: string;
  completo: boolean;
  estado: string;
}

export default function ConectividadDelHotel() {
  const [estado, setEstado] = useState<EstadoConectividad | null>(null);
  const [cargando, setCargando] = useState(true);
  const [partnerId, setPartnerId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [hotelCode, setHotelCode] = useState('');
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<{ ok: boolean; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/hospitality/conectividad');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'No se pudo leer la configuración de conectividad');
        return;
      }
      setEstado(data as EstadoConectividad);
    } catch {
      toast.error('No se pudo leer la configuración de conectividad');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async (valor: string | null) => {
    setGuardando(true);
    try {
      const res = await fetch('/api/hospitality/conectividad', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: valor }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'No se pudo guardar el ID de socio');
        return;
      }
      setEstado(data as EstadoConectividad);
      setPartnerId('');
      toast.success(valor ? 'ID de socio guardado' : 'ID de socio retirado');
    } catch {
      toast.error('No se pudo guardar el ID de socio');
    } finally {
      setGuardando(false);
    }
  };

  const probar = async () => {
    setProbando(true);
    setPrueba(null);
    try {
      const res = await fetch('/api/hospitality/conectividad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'probar', hotelCode }),
      });
      const data = await res.json();
      if (data?.ok) {
        const habitaciones = typeof data.habitaciones === 'number' ? data.habitaciones : null;
        setPrueba({
          ok: true,
          texto: habitaciones == null
            ? 'La propiedad responde con tu ID de socio.'
            : `La propiedad responde con tu ID de socio: ${habitaciones} tipo(s) de habitación.`,
        });
      } else {
        setPrueba({ ok: false, texto: data?.error || 'La propiedad no respondió con tu ID de socio.' });
      }
    } catch {
      setPrueba({ ok: false, texto: 'No se pudo comprobar la propiedad.' });
    } finally {
      setProbando(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
            <Cable className="h-7 w-7" />
            Conectividad de Canales
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tu ID de socio es lo que deja al servicio devolver <strong>tus</strong> propiedades
            {' '}(habitaciones y planes de tarifa) para poder vincularlas y vender por los canales.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void cargar()} disabled={cargando}>
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Actualizar</span>
        </Button>
      </div>

      {estado && !estado.plataformaConfigurada && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-900">
              Volkern todavía no ha activado la conectividad de canales en la plataforma. Puedes dejar
              tu ID de socio guardado: empezará a usarse en cuanto la activación esté hecha.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Tu ID de socio (partner id)
          </CardTitle>
          <CardDescription>
            Es el identificador que te dio el proveedor al registrar tu hotel. No es tu correo ni tu
            usuario: si te equivocas, el servicio responde «partner desconocido» y no verás tus
            propiedades.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Estado:</span>
            {estado?.tienePartnerIdPropio ? (
              <Badge className="bg-emerald-100 text-emerald-800">
                Registrado ({estado.partnerId})
              </Badge>
            ) : estado?.completo ? (
              <Badge variant="secondary">Sin registrar · se usa el de Volkern</Badge>
            ) : (
              // Sin el tuyo y sin uno de Volkern no hay con qué consultar TUS
              // propiedades: prometer un respaldo que no existe dejaría al hotel
              // esperando a que algo pase por sí solo.
              <Badge variant="destructive">Sin registrar · nadie puede consultar tus propiedades aún</Badge>
            )}
            {estado?.estado === 'error' && (
              <Badge className="bg-red-100 text-red-800">La capa reporta errores</Badge>
            )}
          </div>

          <div className="max-w-md space-y-2">
            <Label htmlFor="partnerId">ID de socio (partner id)</Label>
            <Input
              id="partnerId"
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              placeholder={estado?.tienePartnerIdPropio ? '•••••• (déjalo vacío para no cambiarlo)' : 'El que te dio el proveedor'}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <AccionHospitality capacidad="integraciones.gestionar">
              <Button onClick={() => void guardar(partnerId)} disabled={guardando || partnerId.trim() === ''}>
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="ml-2">Guardar</span>
              </Button>
            </AccionHospitality>

            {estado?.tienePartnerIdPropio && (
              <AccionHospitality capacidad="integraciones.gestionar">
                <Button variant="outline" onClick={() => void guardar(null)} disabled={guardando}>
                  <Trash2 className="h-4 w-4" />
                  <span className="ml-2">Quitar y usar el de Volkern</span>
                </Button>
              </AccionHospitality>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Comprobar con una propiedad
          </CardTitle>
          <CardDescription>
            Escribe el código de propiedad que te dio el proveedor. Con tu ID de socio debe devolver
            sus habitaciones y planes de tarifa: eso es lo que después se vincula en la puesta en
            marcha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md space-y-2">
            <Label htmlFor="hotelCode">Código de propiedad (hotelCode)</Label>
            <Input
              id="hotelCode"
              value={hotelCode}
              onChange={(e) => setHotelCode(e.target.value)}
              placeholder="El código del proveedor para tu hotel"
              autoComplete="off"
            />
          </div>

          <AccionHospitality capacidad="integraciones.gestionar">
            <Button onClick={() => void probar()} disabled={probando || hotelCode.trim() === ''}>
              {probando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Comprobar</span>
            </Button>
          </AccionHospitality>

          {prueba && (
            <div
              className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                prueba.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'
              }`}
            >
              {prueba.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <p>{prueba.texto}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
