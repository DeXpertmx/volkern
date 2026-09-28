'use client';

/**
 * Selectores compartidos para datos del viajero y CRM. País y sexo usan
 * controles nativos (sin portales que rompan los diálogos); teléfono entrega
 * el número en E.164 y el municipio se busca por nombre sin exponer el INE.
 */
import { useEffect, useMemo, useState } from 'react';
import { Phone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PAISES, normalizarTelefono, paisPorCodigo } from '@/lib/paises-municipios/paises';
import { municipiosDeProvincia, NOMBRES_PROVINCIA, nombreMunicipioINE, provinciasINE } from '@/lib/paises-municipios/municipios-ine';

const CONTROL_NATIVO = 'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';

// ─── Selector de país ───────────────────────────────────────────────────────

export function SelectorPais({
  value,
  onChange,
  placeholder = 'Selecciona un país',
  className,
  disabled,
  ariaLabel = 'País',
}: {
  value: string;
  onChange: (codigo: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className={cn(CONTROL_NATIVO, !value && 'text-muted-foreground', className)}
      value={value || ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" disabled>{placeholder}</option>
      {PAISES.map((p) => (
        <option key={p.codigo} value={p.codigo}>{p.bandera} {p.nombre} ({p.codigo})</option>
      ))}
    </select>
  );
}

// ─── Tipos de documento y sexo permitidos por el formulario MIR ─────────────

export type TipoDocumentoViajero = 'NIF' | 'NIE' | 'PAS' | 'OTRO';
const OPCIONES_DOCUMENTO: Array<{ value: TipoDocumentoViajero; label: string }> = [
  { value: 'NIF', label: 'NIF (DNI)' },
  { value: 'NIE', label: 'NIE' },
  { value: 'PAS', label: 'Pasaporte' },
  { value: 'OTRO', label: 'Otro documento' },
];

export function normalizarTipoDocumentoViajero(value: string | null | undefined): TipoDocumentoViajero | '' {
  const codigo = (value || '').trim().toUpperCase();
  if (codigo === 'DNI') return 'NIF';
  if (codigo === 'PASAPORTE' || codigo === 'PASSPORT') return 'PAS';
  return OPCIONES_DOCUMENTO.some((opcion) => opcion.value === codigo)
    ? codigo as TipoDocumentoViajero
    : '';
}

export function SelectorTipoDocumentoViajero({
  value,
  onChange,
  ariaLabel = 'Tipo de documento',
  placeholder = 'Selecciona tipo de documento',
  className,
  disabled,
}: {
  value: string;
  onChange: (codigo: TipoDocumentoViajero | '') => void;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const valor = normalizarTipoDocumentoViajero(value);
  return (
    <select
      aria-label={ariaLabel}
      className={cn(CONTROL_NATIVO, !valor && 'text-muted-foreground', className)}
      value={valor}
      disabled={disabled}
      onChange={(e) => onChange(normalizarTipoDocumentoViajero(e.target.value))}
    >
      <option value="" disabled>{placeholder}</option>
      {OPCIONES_DOCUMENTO.map((opcion) => <option key={opcion.value} value={opcion.value}>{opcion.label}</option>)}
    </select>
  );
}

export function SelectorSexoViajero({
  value,
  onChange,
  ariaLabel = 'Sexo',
  placeholder = 'Selecciona sexo',
  className,
  disabled,
}: {
  value: string;
  onChange: (codigo: 'H' | 'M' | '') => void;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const sexo = value === 'H' || value === 'M' ? value : '';
  return (
    <select
      aria-label={ariaLabel}
      className={cn(CONTROL_NATIVO, !sexo && 'text-muted-foreground', className)}
      value={sexo}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === 'H' || e.target.value === 'M' ? e.target.value : '')}
    >
      <option value="" disabled>{placeholder}</option>
      <option value="H">Hombre</option>
      <option value="M">Mujer</option>
    </select>
  );
}

// ─── Teléfono: país (prefijo) + número ──────────────────────────────────────

export function CampoTelefonoConPais({
  telefono,
  pais,
  onTelefono,
  onPais,
  placeholder = '600 123 456',
  paisPlaceholder = 'País',
  paisAriaLabel = 'País del teléfono',
  id,
  disabled,
  className,
}: {
  telefono: string;
  pais: string;
  onTelefono: (normalizado: string) => void;
  onPais: (codigo: string) => void;
  placeholder?: string;
  paisPlaceholder?: string;
  paisAriaLabel?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}) {
  const paisActual = paisPorCodigo(pais);
  const prefijo = paisActual?.prefijo ?? '';
  const visible = useMemo(() => {
    if (!telefono) return '';
    if (prefijo && telefono.startsWith(prefijo)) return telefono.slice(prefijo.length).replace(/^[\s-]+/, '');
    return telefono;
  }, [telefono, prefijo]);

  return (
    <div className={cn('flex min-w-0 gap-1', className)}>
      <div className="w-[132px] shrink-0">
        <SelectorPais
          value={pais}
          onChange={(codigo) => {
            const numeroLocal = prefijo && telefono.startsWith(prefijo)
              ? telefono.slice(prefijo.length).replace(/^[\s-]+/, '')
              : telefono;
            onPais(codigo);
            if (numeroLocal) onTelefono(normalizarTelefono(numeroLocal, codigo));
          }}
          placeholder={paisPlaceholder}
          ariaLabel={paisAriaLabel}
          disabled={disabled}
          className="px-2 text-xs"
        />
        {prefijo && <p className="mt-0.5 text-center text-[10px] text-muted-foreground">{prefijo}</p>}
      </div>
      <div className="relative min-w-0 flex-1">
        <Phone className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className="pl-8"
          placeholder={placeholder}
          value={visible}
          disabled={disabled}
          onChange={(e) => onTelefono(normalizarTelefono(e.target.value, pais))}
        />
      </div>
    </div>
  );
}

// ─── Municipio INE: buscar por nombre, código oficial automático ────────────

function normalizarNombreMunicipio(nombre: string): string {
  return nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
}

const MUNICIPIOS_ESPANA = provinciasINE().flatMap((provincia) =>
  municipiosDeProvincia(provincia.codigo).map((municipio) => ({
    ...municipio,
    nombreNormalizado: normalizarNombreMunicipio(municipio.nombre),
    nombreProvincia: NOMBRES_PROVINCIA[provincia.codigo] || provincia.nombre,
  }))
);

type MunicipioConProvincia = (typeof MUNICIPIOS_ESPANA)[number];

export function SelectorMunicipioINE({
  codigoMunicipio,
  nombreMunicipio = '',
  onChange,
  className,
  disabled,
}: {
  codigoMunicipio: string;
  nombreMunicipio?: string;
  onChange: (codigo: string, nombre: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [nombreEscrito, setNombreEscrito] = useState(nombreMunicipio);
  const busqueda = normalizarNombreMunicipio(nombreEscrito);

  useEffect(() => {
    setNombreEscrito(codigoMunicipio ? nombreMunicipioINE(codigoMunicipio) || nombreMunicipio : nombreMunicipio);
  }, [codigoMunicipio, nombreMunicipio]);

  const coincidencias = useMemo(
    () => MUNICIPIOS_ESPANA.filter((municipio) => municipio.nombreNormalizado === busqueda),
    [busqueda]
  );
  const sugerencias = useMemo(() => {
    if (busqueda.length < 2) return [];
    return MUNICIPIOS_ESPANA.filter((municipio) => municipio.nombreNormalizado.includes(busqueda)).slice(0, 8);
  }, [busqueda]);

  function elegirMunicipio(municipio: MunicipioConProvincia) {
    setNombreEscrito(municipio.nombre);
    onChange(municipio.codigo, municipio.nombre);
  }

  return (
    <div className={cn('min-w-0', className)}>
      <Input
        aria-label="Municipio"
        className="w-full"
        value={nombreEscrito}
        disabled={disabled}
        placeholder="Escribe el nombre del municipio"
        autoComplete="off"
        onChange={(e) => {
          const nombre = e.target.value;
          const normalizado = normalizarNombreMunicipio(nombre);
          setNombreEscrito(nombre);
          const exactas = MUNICIPIOS_ESPANA.filter((municipio) => municipio.nombreNormalizado === normalizado);
          onChange(exactas.length === 1 ? exactas[0].codigo : '', nombre);
        }}
      />
      {busqueda.length >= 2 && coincidencias.length !== 1 && sugerencias.length > 0 && (
        <ul aria-label="Municipios sugeridos" className="mt-1 max-h-40 overflow-y-auto rounded-md border bg-background p-1 shadow-sm">
          {sugerencias.map((municipio) => (
            <li key={municipio.codigo}>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => elegirMunicipio(municipio)}
              >
                {municipio.nombre} <span className="text-muted-foreground">— {municipio.nombreProvincia}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {nombreEscrito && !codigoMunicipio && (
        <p className="mt-1 text-xs text-muted-foreground">
          {coincidencias.length > 1
            ? 'Hay varios municipios con ese nombre; selecciona uno de la lista.'
            : 'Elige una sugerencia para asignar el código oficial automáticamente.'}
        </p>
      )}
    </div>
  );
}
