'use client';

/**
 * Completar el parte de viajeros de una reserva (RD 933/2021).
 *
 * Los canales no mandan documento, nacionalidad ni domicilio del huésped, y el
 * Ministerio rechaza el parte sin ellos. Este diálogo es el camino del
 * operador: los pone tal como figuran en el documento de identidad y, al
 * guardar, el parte sale **en el momento** (sin esperar al barrido horario).
 *
 * Se usa desde dos pantallas —la del registro de viajeros y la de reservas—
 * porque es la misma tarea: por eso vive aquí y no duplicado en cada página.
 * El envío lo hace la API del producto (`accion: 'completar'`), que delega en
 * el módulo del contrato oficial: aquí no se construye ningún XML.
 */

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
// Selectores de catálogos: país (alfa-3), teléfono con prefijo y municipio
// INE (provincia → municipio). El operador ya no teclea códigos: elige de la
// lista y el valor que viaja al Ministerio es exactamente el del catálogo.
import {
  CampoTelefonoConPais,
  SelectorMunicipioINE,
  SelectorPais,
} from '@/components/paises-municipios/selectores';

/** Campos que van con selector de catálogo (no Input libre). */
const CAMPOS_CON_SELECTOR = new Set(['nacionalidad', 'telefono', 'codigoMunicipio', 'pais']);

/** Reserva cuyo parte se va a completar. La referencia solo se enseña. */
export interface ReservaDelParte {
  id: string;
  referencia?: string | null;
}

/** Formulario vacío: los mismos campos que pide el check-in del huésped. */
const VIAJERO_VACIO = {
  nombre: '',
  apellido1: '',
  apellido2: '',
  tipoDocumento: 'NIF',
  numeroDocumento: '',
  soporteDocumento: '',
  fechaNacimiento: '',
  nacionalidad: 'ESP',
  sexo: 'H',
  telefono: '',
  correo: '',
  direccion: '',
  codigoMunicipio: '',
  /** Nombre del municipio cuando el país NO es España (lo pide el Ministerio). */
  ciudadExtranjera: '',
  codigoPostal: '',
  pais: 'ESP',
};

const CAMPOS = [
  ['nombre', 'Nombre'],
  ['apellido1', 'Primer apellido'],
  ['apellido2', 'Segundo apellido'],
  ['fechaNacimiento', 'Fecha de nacimiento (AAAA-MM-DD)'],
  ['tipoDocumento', 'Tipo de documento'],
  ['numeroDocumento', 'Número de documento'],
  ['soporteDocumento', 'Número de soporte'],
  ['nacionalidad', 'Nacionalidad (ISO-3)'],
  ['sexo', 'Sexo'],
  ['telefono', 'Teléfono'],
  ['correo', 'Correo'],
  ['direccion', 'Domicilio'],
  ['codigoMunicipio', 'Municipio (INE, 5 dígitos)'],
  ['codigoPostal', 'Código postal'],
  ['pais', 'País (ISO-3)'],
] as const;

type CampoFormulario = (typeof CAMPOS)[number][0];

/** Errores de validación que devuelve el servicio (o de la API). */
type ErroresDelParte =
  | Array<{ campo: string; mensaje: string }>
  | { error?: string }
  | null
  | undefined;

function faltantesLegibles(errores: ErroresDelParte): string {
  if (!errores) return 'revisa el formulario';
  if (Array.isArray(errores)) {
    return (
      etiquetasDeCampos(
        errores.map((e) => e.campo as CampoViajero),
        'es'
      ) || errores.map((e) => e.mensaje).filter(Boolean).join(' · ')
    );
  }
  return errores.error || 'revisa el formulario';
}

export function CompletarParteVijerosDialog({
  reserva,
  onCerrar,
  onCompletado,
}: {
  /** Reserva a completar. `null` cierra el diálogo. */
  reserva: ReservaDelParte | null;
  onCerrar: () => void;
  /** Se llama cuando el parte se guardó (aceptado, enviado o pendiente de lote). */
  onCompletado?: () => void | Promise<void>;
}) {
  const [viajero, setViajero] = useState({ ...VIAJERO_VACIO });
  const [guardando, setGuardando] = useState(false);

  // Cada reserva empieza con el formulario en blanco: reutilizar lo tecleado
  // para otra reserva sería ponerle a un huésped el documento de otro.
  useEffect(() => {
    setViajero({ ...VIAJERO_VACIO });
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
          viajeros: [
            {
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
                nombreMunicipio: viajero.pais === 'ESP' ? null : viajero.ciudadExtranjera || null,
                codigoPostal: viajero.codigoPostal,
                pais: viajero.pais,
              },
              telefono: viajero.telefono || null,
              correo: viajero.correo || null,
            },
          ],
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

  return (
    <Dialog open={!!reserva} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Datos del viajero</DialogTitle>
          <DialogDescription>
            {reserva?.referencia ? `Reserva ${reserva.referencia}. ` : ''}
            El canal no envía documento, nacionalidad ni domicilio: se completan aquí, tal como
            figuran en el documento de identidad. Al guardar se envía el parte al Ministerio.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-3">
          {CAMPOS.map(([campo, etiqueta]) => {
            // Los campos de catálogo van con selector: país, teléfono con
            // prefijo y municipio INE (provincia → municipio). El resto, Input.
            if (campo === 'nacionalidad') {
              return (
                <div key={campo}>
                  <Label className="text-xs">{etiqueta}</Label>
                  <SelectorPais
                    value={viajero.nacionalidad}
                    onChange={(codigo) => setViajero({ ...viajero, nacionalidad: codigo })}
                  />
                </div>
              );
            }
            if (campo === 'pais') {
              return (
                <div key={campo}>
                  <Label className="text-xs">{etiqueta}</Label>
                  <SelectorPais
                    value={viajero.pais}
                    onChange={(codigo) =>
                      setViajero({ ...viajero, pais: codigo, codigoMunicipio: '' })
                    }
                  />
                </div>
              );
            }
            if (campo === 'telefono') {
              return (
                <div key={campo} className="md:col-span-2">
                  <Label className="text-xs">{etiqueta}</Label>
                  <CampoTelefonoConPais
                    telefono={viajero.telefono}
                    pais={viajero.pais}
                    onTelefono={(valor) => setViajero({ ...viajero, telefono: valor })}
                    onPais={(codigo) => setViajero({ ...viajero, pais: codigo, codigoMunicipio: '' })}
                  />
                </div>
              );
            }
            if (campo === 'codigoMunicipio') {
              return viajero.pais === 'ESP' ? (
                <div key={campo} className="md:col-span-3">
                  <Label className="text-xs">{etiqueta}</Label>
                  <SelectorMunicipioINE
                    codigoMunicipio={viajero.codigoMunicipio}
                    onChange={(codigo) => setViajero({ ...viajero, codigoMunicipio: codigo })}
                  />
                </div>
              ) : (
                // Fuera de España el Ministerio pide el NOMBRE del municipio;
                // el código INE no aplica. Se reusa el mismo hueco del form.
                <div key={campo} className="md:col-span-3">
                  <Label className="text-xs">Ciudad / municipio</Label>
                  <Input
                    value={viajero.ciudadExtranjera || ''}
                    onChange={(e) => setViajero({ ...viajero, ciudadExtranjera: e.target.value })}
                  />
                </div>
              );
            }
            return (
              <div key={campo}>
                <Label className="text-xs">{etiqueta}</Label>
                <Input
                  value={viajero[campo as CampoFormulario]}
                  onChange={(e) => setViajero({ ...viajero, [campo]: e.target.value })}
                />
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void guardarYEnviar()} disabled={guardando}>
            {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar y enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
