'use client';

import { Input } from '@/components/ui/input';

/**
 * Campo común de nacimiento para ERP y check-in público.
 * El control nativo es un selector de fecha; su value/changeValue mantienen
 * AAAA-MM-DD, que es el formato que espera el servicio del Ministerio.
 */
export function InputFechaNacimiento({
  id,
  ariaLabel,
  value,
  onChange,
}: {
  id?: string;
  ariaLabel: string;
  value: string;
  onChange: (fechaISO: string) => void;
}) {
  return (
    <Input
      id={id}
      type="date"
      lang="es"
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
