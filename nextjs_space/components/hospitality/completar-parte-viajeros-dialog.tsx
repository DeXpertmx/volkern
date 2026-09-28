'use client';

/** Completar el parte de viajeros de una reserva (RD 933/2021). */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { etiquetasDeCampos } from '@/lib/hospitality/booking-i18n';
import type { CampoViajero } from '@/lib/hospitality/guest-checkin';
import { InputFechaNacimiento } from '@/components/hospitality/input-fecha-nacimiento';
import {
  CampoTelefonoConPais,
  SelectorMunicipioINE,
  SelectorPais,
  SelectorSexoViajero,
  SelectorTipoDocumentoViajero,
  normalizarTipoDocumentoViajero,
} from '@/components/paises-municipios/selectores';

const AYUDA_NUMERO_SOPORTE = 'https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/firma-digital-sistema-clave-pin-tecnica/incidencias-tecnicas-clave-pin.html';

export interface ReservaDelParte {
  id: string;
  referencia?: string | null;
}

const VIAJERO_VACIO = {
  nombre: '',
  apellido1: '',
  apellido2: '',
  tipoDocumento: '',
  numeroDocumento: '',
  soporteDocumento: '',
  fechaNacimiento: '',
  nacionalidad: 'ESP',
  sexo: '',
  telefono: '',
  paisTelefono: 'ESP',
  correo: '',
  direccion: '',
  codigoMunicipio: '',
  nombreMunicipio: '',
  ciudadExtranjera: '',
  codigoPostal: '',
  pais: 'ESP',
};

const CAMPOS = [
  ['nombre', 'Nombre'],
  ['apellido1', 'Primer apellido'],
  ['apellido2', 'Segundo apellido'],
  ['fechaNacimiento', 'Fecha de nacimiento'],
  ['tipoDocumento', 'Tipo de documento'],
  ['numeroDocumento', 'Número de documento'],
  ['soporteDocumento', 'Número de soporte'],
  ['nacionalidad', 'Nacionalidad'],
  ['sexo', 'Sexo'],
  ['telefono', 'Teléfono'],
  ['correo', 'Correo'],
  ['direccion', 'Domicilio'],
  ['codigoMunicipio', 'Municipio'],
  ['codigoPostal', 'Código postal'],
  ['pais', 'País'],
] as const;

type CampoFormulario = (typeof CAMPOS)[number][0];
type ErroresDelParte = Array<{ campo: string; mensaje: string }> | { error?: string } | null | undefined;

function faltantesLegibles(errores: ErroresDelParte): string {
  if (!errores) return 'revisa el formulario';
  if (Array.isArray(errores)) {
    return etiquetasDeCampos(errores.map((e) => e.campo as CampoViajero), 'es')
      || errores.map((e) => e.mensaje).filter(Boolean).join(' · ');
  }
  return errores.error || 'revisa el formulario';
}

export function CompletarParteVijerosDialog({
  reserva,
  onCerrar,
  onCompletado,
}: {
  reserva: ReservaDelParte | null;
  onCerrar: () => void;
  onCompletado?: () => void | Promise<void>;
}) {
  const [viajero, setViajero] = useState({ ...VIAJERO_VACIO });
  const [errorMunicipio, setErrorMunicipio] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setViajero({ ...VIAJERO_VACIO });
    setErrorMunicipio(false);
  }, [reserva?.id]);

  async function guardarYEnviar() {
    if (!reserva?.id) return;
    setGuardando(true);
    try {
      const res = await fetch('/api/hospitality/registro-viajeros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'completar',
          reservaId: reserva.id,
          viajeros: [{
            rol: 'VI',
            nombre: viajero.nombre,
            apellido1: viajero.apellido1,
            apellido2: viajero.apellido2 || null,
            tipoDocumento: viajero.tipoDocumento || null,
            numeroDocumento: viajero.numeroDocumento || null,
            soporteDocumento: viajero.soporteDocumento || null,
            fechaNacimiento: viajero.fechaNacimiento,
            nacionalidad: viajero.nacionalidad || null,
            sexo: viajero.sexo || null,
            direccion: {
              direccion: viajero.direccion,
              codigoMunicipio: viajero.pais === 'ESP' ? viajero.codigoMunicipio || null : null,
              nombreMunicipio: viajero.pais === 'ESP'
                ? viajero.nombreMunicipio || null
                : viajero.ciudadExtranjera || null,
              codigoPostal: viajero.codigoPostal,
              pais: viajero.pais,
            },
            telefono: viajero.telefono || null,
            correo: viajero.correo || null,
          }],
        }),
      });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(datos?.error || 'No se pudieron guardar los datos');

      if (datos.estado === 'datos_incompletos') {
        toast.error(`Sigue faltando información: ${faltantesLegibles(datos.errores)}`);
      } else {
        toast.success(`Parte de viajeros: ${datos.estado ?? 'guardado'}`);
        onCerrar();
      }
      await onCompletado?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error completando el parte de viajeros');
    } finally {
      setGuardando(false);
    }
  }

  const tipoDocumento = normalizarTipoDocumentoViajero(viajero.tipoDocumento);
  const pideSoporte = tipoDocumento === 'NIF' || tipoDocumento === 'NIE';
  const requiereSegundoApellido = pideSoporte;

  return (
    <Dialog open={!!reserva} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Datos del viajero</DialogTitle>
          <DialogDescription>
            {reserva?.referencia ? `Reserva ${reserva.referencia}. ` : ''}
            Completa los datos tal como aparecen en el documento. La fecha se elige con el selector en formato DD/MM/AAAA y se guarda como AAAA-MM-DD.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {CAMPOS.map(([campo, etiqueta]) => {
            if (campo === 'tipoDocumento') {
              return (
                <div key={campo} className="min-w-0">
                  <Label className="text-xs">{etiqueta}</Label>
                  <SelectorTipoDocumentoViajero
                    className="mt-1"
                    ariaLabel="Tipo de documento"
                    value={viajero.tipoDocumento}
                    onChange={(value) => setViajero((actual) => ({
                      ...actual,
                      tipoDocumento: value,
                      soporteDocumento: value === 'NIF' || value === 'NIE' ? actual.soporteDocumento : '',
                    }))}
                  />
                </div>
              );
            }
            if (campo === 'sexo') {
              return (
                <div key={campo} className="min-w-0">
                  <Label className="text-xs">{etiqueta}</Label>
                  <SelectorSexoViajero value={viajero.sexo} className="mt-1" ariaLabel="Sexo" onChange={(sexo) => setViajero((actual) => ({ ...actual, sexo }))} />
                </div>
              );
            }
            if (campo === 'fechaNacimiento') {
              return (
                <div key={campo} className="min-w-0">
                  <Label htmlFor="parte-fecha-nacimiento" className="text-xs">Fecha de nacimiento (DD/MM/AAAA)</Label>
                  <InputFechaNacimiento
                    id="parte-fecha-nacimiento"
                    ariaLabel="Fecha de nacimiento (DD/MM/AAAA)"
                    value={viajero.fechaNacimiento}
                    onChange={(fechaNacimiento) => setViajero((actual) => ({ ...actual, fechaNacimiento }))}
                  />
                </div>
              );
            }
            if (campo === 'apellido2' && !requiereSegundoApellido) return null;
            if (campo === 'soporteDocumento') {
              if (!pideSoporte) return null;
              return (
                <div key={campo} className="min-w-0">
                  <Label className="text-xs">{etiqueta} *</Label>
                  <Input
                    aria-label="Número de soporte"
                    value={viajero.soporteDocumento}
                    onChange={(e) => setViajero((actual) => ({ ...actual, soporteDocumento: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Para NIF/DNI: anverso, bajo «NUM SOPORT» o «IDESP». Para NIE/TIE: anverso de la tarjeta, número de soporte que empieza por E. No se pide con pasaporte.{' '}
                    <a className="underline underline-offset-2" href={AYUDA_NUMERO_SOPORTE} target="_blank" rel="noreferrer">Ver guía oficial</a>
                  </p>
                </div>
              );
            }
            if (campo === 'nacionalidad') {
              return (
                <div key={campo} className="min-w-0">
                  <Label className="text-xs">{etiqueta}</Label>
                  <SelectorPais className="mt-1" value={viajero.nacionalidad} ariaLabel="Nacionalidad" onChange={(codigo) => setViajero((actual) => ({ ...actual, nacionalidad: codigo }))} />
                </div>
              );
            }
            if (campo === 'pais') {
              return (
                <div key={campo} className="min-w-0">
                  <Label className="text-xs">{etiqueta}</Label>
                  <SelectorPais
                    value={viajero.pais}
                    ariaLabel="País del domicilio"
                    onChange={(codigo) => setViajero((actual) => ({ ...actual, pais: codigo, codigoMunicipio: '', nombreMunicipio: '', ciudadExtranjera: '' }))}
                  />
                </div>
              );
            }
            if (campo === 'telefono') {
              return (
                <div key={campo} className="min-w-0">
                  <Label className="text-xs">{etiqueta}</Label>
                  <CampoTelefonoConPais
                    telefono={viajero.telefono}
                    pais={viajero.paisTelefono}
                    paisAriaLabel="País del teléfono"
                    onTelefono={(telefono) => setViajero((actual) => ({ ...actual, telefono }))}
                    onPais={(paisTelefono) => setViajero((actual) => ({ ...actual, paisTelefono }))}
                  />
                </div>
              );
            }
            if (campo === 'codigoMunicipio') {
              return viajero.pais === 'ESP' ? (
                <div key={campo} className="min-w-0 sm:col-span-2">
                  <Label className="text-xs">{etiqueta} *</Label>
                  <SelectorMunicipioINE
                    codigoMunicipio={viajero.codigoMunicipio}
                    nombreMunicipio={viajero.nombreMunicipio}
                    onChange={(codigoMunicipio, nombreMunicipio) => {
                      setErrorMunicipio(Boolean(nombreMunicipio && !codigoMunicipio));
                      setViajero((actual) => ({ ...actual, codigoMunicipio, nombreMunicipio }));
                    }}
                  />
                  {errorMunicipio && <p className="mt-1 text-xs text-destructive">Selecciona un municipio de la lista para asignar el código oficial.</p>}
                </div>
              ) : (
                <div key={campo} className="min-w-0 sm:col-span-2">
                  <Label className="text-xs">Ciudad / municipio *</Label>
                  <Input
                    aria-label="Ciudad / municipio"
                    value={viajero.ciudadExtranjera}
                    onChange={(e) => setViajero((actual) => ({ ...actual, ciudadExtranjera: e.target.value }))}
                  />
                </div>
              );
            }
            return (
              <div key={campo} className="min-w-0">
                <Label className="text-xs">{etiqueta}</Label>
                <Input
                  value={viajero[campo as CampoFormulario]}
                  onChange={(e) => setViajero((actual) => ({ ...actual, [campo]: e.target.value }))}
                />
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button
            onClick={() => {
              if (viajero.pais === 'ESP' && viajero.nombreMunicipio && !viajero.codigoMunicipio) {
                setErrorMunicipio(true);
                return;
              }
              setErrorMunicipio(false);
              void guardarYEnviar();
            }}
            disabled={guardando}
          >
            {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar y enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
