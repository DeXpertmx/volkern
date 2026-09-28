'use client';

/**
 * Selectores compartidos de datos «catálogo»: país, teléfono con prefijo y
 * municipio INE. Viven en un solo fichero a propósito — comparten el combobox
 * con búsqueda y el manejo de la cadena vacía (ver el centinela de abajo) — y
 * los consumen el check-in del huésped, el parte de viajeros y los formularios
 * del CRM donde hay teléfono o país.
 *
 * NOTA RADIX 2: estos selectores viven a menudo DENTRO de un Dialog modal
 * («Datos del viajero», lápiz de Reservas, paso 3 del wizard). Un Popover
 * no-modal dentro de un diálogo modal pelea con la trampa de foco del diálogo
 * y la lista se monta y se cierra al instante (síntoma «aparece y desaparece»);
 * por eso todos los Popover de este fichero son modal={true} — receta oficial
 * Radix/shadcn para combobox dentro de Dialog.
 *
 * NOTA RADIX: ninguna opción puede llevar `value=""` (la cadena vacía es el
 * «limpiar selección» interno y el Select crashea al montar). Todos los
 * «sin valor» de estos selectores usan el centinela `VALOR_VACIO` y los
 * callbacks reciben '' normalizado.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Phone } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PAISES, normalizarTelefono, paisPorCodigo } from '@/lib/paises-municipios/paises';
import { municipiosDeProvincia, NOMBRES_PROVINCIA, provinciasINE } from '@/lib/paises-municipios/municipios-ine';

/** Centinela de «sin valor» para los Select/Command de estos selectores. */
const VALOR_VACIO = '__sin_valor__';

// ─── Selector de país (combobox con búsqueda) ───────────────────────────────

export function SelectorPais({
  value,
  onChange,
  placeholder = 'Selecciona un país',
  className,
  disabled,
}: {
  /** Código ISO alfa-3 ('' = sin elegir). */
  value: string;
  onChange: (codigo: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const actual = paisPorCodigo(value);

  const filtrados = useMemo(() => {
    const q = busqueda
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    if (!q) return PAISES;
    return PAISES.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.codigo.toLowerCase().includes(q) ||
        p.bandera.includes(busqueda)
    );
  }, [busqueda]);

  return (
    <Popover open={abierto} onOpenChange={setAbierto} modal={true}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={abierto}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className={cn('truncate', !actual && 'text-muted-foreground')}>
            {actual ? `${actual.bandera} ${actual.nombre} (${actual.codigo})` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">

        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar país…" value={busqueda} onValueChange={setBusqueda} />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {filtrados.map((p) => (
                <CommandItem
                  key={p.codigo}
                  value={p.codigo || VALOR_VACIO}
                  onSelect={() => {
                    onChange(p.codigo);
                    setAbierto(false);
                    setBusqueda('');
                  }}
                >
                  <Check className={cn('mr-1 h-4 w-4', value === p.codigo ? 'opacity-100' : 'opacity-0')} />
                  <span className="mr-2">{p.bandera}</span>
                  <span className="flex-1 truncate">{p.nombre}</span>
                  <span className="text-xs text-muted-foreground">{p.codigo}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Teléfono: país (prefijo) + número ──────────────────────────────────────

/**
 * Teléfono con país: el selector pone el prefijo, el input recibe el número
 * local. El valor que sale por `onChange` va normalizado a E.164 «ligero»
 * (+34612345678) cuando el país tiene prefijo conocido y el humano no escribió
 * ya el «+»; si el país no está en el catálogo, sale lo tecleado.
 */
export function CampoTelefonoConPais({
  telefono,
  pais,
  onTelefono,
  onPais,
  placeholder = '600 123 456',
  paisPlaceholder = 'País',
  id,
  disabled,
  className,
}: {
  telefono: string;
  /** País del teléfono (alfa-3); '' = sin prefijo conocido. */
  pais: string;
  onTelefono: (normalizado: string) => void;
  onPais: (codigo: string) => void;
  placeholder?: string;
  paisPlaceholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}) {
  const paisActual = paisPorCodigo(pais);
  const prefijo = paisActual?.prefijo ?? '';
  // En el input se muestra el número SIN el prefijo si vino normalizado con él.
  const visible = useMemo(() => {
    if (!telefono) return '';
    if (prefijo && telefono.startsWith(prefijo)) return telefono.slice(prefijo.length);
    return telefono;
  }, [telefono, prefijo]);

  return (
    <div className={cn('flex gap-1', className)}>
      <div className="w-[132px] shrink-0">
        <SelectorPais
          value={pais}
          onChange={onPais}
          placeholder={paisPlaceholder}
          disabled={disabled}
          className="justify-start px-2 text-xs"
        />
        {/* El prefijo viaja dentro del país del selector; se muestra como ayuda. */}
        {prefijo && (
          <p className="mt-0.5 text-[10px] text-muted-foreground text-center">{prefijo}</p>
        )}
      </div>
      <div className="relative flex-1">
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

// ─── Municipio INE: provincia → municipio (dos selects dependientes) ────────

export function SelectorMunicipioINE({
  codigoMunicipio,
  onChange,
  className,
  disabled,
}: {
  /** Código INE de 5 dígitos ('' = sin elegir). */
  codigoMunicipio: string;
  onChange: (codigo: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  /** La provincia vive en estado propio: derivarla del código del municipio
   * hacía que elegir provincia solo limpiara el municipio y la selección
   * «saltaba» de vuelta a «Provincia…» sin llegar a quedarse. */
  const provinciaDelCodigo = (codigoMunicipio || '').slice(0, 2);
  const [provincia, setProvincia] = useState(provinciaDelCodigo);
  // Si el código llega de fuera (ficha guardada), la provincia sigue al código.
  useEffect(() => {
    if (provinciaDelCodigo) setProvincia(provinciaDelCodigo);
  }, [provinciaDelCodigo]);
  const municipios = useMemo(() => municipiosDeProvincia(provincia), [provincia]);
  const nombreActual = municipios.find((m) => m.codigo === codigoMunicipio)?.nombre
    ?? (codigoMunicipio && NOMBRES_PROVINCIA[provincia] ? codigoMunicipio : '');

  return (
    <div className={cn('grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]', className)}>
      <select
        aria-label="Provincia"
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={provincia}
        disabled={disabled}
        onChange={(e) => {
          // Cambiar de provincia limpia el municipio: los códigos son distintos.
          const nueva = e.target.value;
          setProvincia(nueva);
          if (nueva !== provinciaDelCodigo) onChange('');
        }}
      >
        <option value="">Provincia…</option>
        {provinciasINE().map((p) => (
          <option key={p.codigo} value={p.codigo}>
            {p.nombre}
          </option>
        ))}
      </select>
      <select
        aria-label="Municipio (código INE)"
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={codigoMunicipio}
        disabled={disabled || !provincia}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">
          {nombreActual
            ? `${nombreActual}${codigoMunicipio ? ` (${codigoMunicipio})` : ''}`
            : provincia
              ? 'Municipio…'
              : 'Elige provincia primero'}
        </option>
        {municipios.map((m) => (
          <option key={m.codigo} value={m.codigo}>
            {m.nombre} ({m.codigo})
          </option>
        ))}
      </select>
    </div>
  );
}
