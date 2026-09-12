'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

/**
 * Moneda de reporte del tenant, para componentes de cliente.
 *
 * La divisa del tenant es un dato del servidor (`Tenant.moneda`) y esta es la
 * puerta por la que un componente de cliente la pide. Existe para que ninguna
 * pantalla vuelva a escribir una divisa a mano como valor inicial de un
 * formulario: los formularios de seguros y de inmuebles nacían en `'EUR'`
 * aunque el tenant tuviera la moneda en pesos, así que el usuario guardaba en
 * euros sin verlo.
 *
 * Devuelve cadena vacía mientras carga y también cuando el tenant no tiene
 * divisa declarada: dejar el campo vacío hace que el usuario elija, en vez de
 * inventar una divisa en su nombre.
 *
 * El endpoint es `/api/tenant/moneda`, la ruta que ya usa Configuración para
 * mostrar y cambiar la misma moneda.
 */
export function useMonedaTenant(): string {
  const [moneda, setMoneda] = useState('');

  useEffect(() => {
    let activo = true;

    apiFetch('/api/tenant/moneda')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (activo && typeof data?.moneda === 'string') {
          setMoneda(data.moneda);
        }
      })
      .catch(() => {
        // Sin divisa del tenant la pantalla no se rompe: el formulario la pide.
      });

    return () => {
      activo = false;
    };
  }, []);

  return moneda;
}
