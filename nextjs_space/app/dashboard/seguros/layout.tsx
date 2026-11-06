import React from 'react';
import { exigirHub } from '@/lib/module-guard';
import { SegurosShell } from '@/components/seguros/SegurosShell';

/**
 * Hub de Seguros.
 *
 * El layout era un componente cliente con las pestañas dentro, así que no podía
 * comprobar nada en el servidor y la URL directa abría la pantalla sin el módulo
 * activo. Ahora la guardia corre aquí y el marco visual vive en `SegurosShell`.
 */
export default async function SegurosLayout({ children }: { children: React.ReactNode }) {
  await exigirHub('seguros');

  return <SegurosShell>{children}</SegurosShell>;
}
