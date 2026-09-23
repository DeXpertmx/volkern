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
 *
 * La petición se comparte entre todos los componentes montados: una pantalla que
 * enseña nueve paneles de dinero pedía la misma divisa nueve veces. Es una sola
 * promesa en memoria, así que la primera llamada la dispara y el resto la
 * reutilizan; el valor no cambia durante la vida de la página, porque cambiarlo
 * recarga la configuración desde Configuración.
 */
let peticionMoneda: Promise<string> | null = null;

function pedirMoneda(): Promise<string> {
  if (!peticionMoneda) {
    peticionMoneda = apiFetch('/api/tenant/moneda')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (typeof data?.moneda === 'string' ? data.moneda : ''))
      .catch(() => {
        // Sin divisa del tenant la pantalla no se rompe: el formulario la pide.
        // El fallo no se cachea, para que un reintento posterior sí la pida.
        peticionMoneda = null;
        return '';
      });
  }
  return peticionMoneda;
}

export function useMonedaTenant(): string {
  const [moneda, setMoneda] = useState('');

  useEffect(() => {
    let activo = true;

    pedirMoneda().then((valor) => {
      if (activo) setMoneda(valor);
    });

    return () => {
      activo = false;
    };
  }, []);

  return moneda;
}
