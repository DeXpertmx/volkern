'use client';

import { useEffect, useState } from 'react';
import CalculadoraHipotecaria from './CalculadoraHipotecaria';

interface Props {
  /** Precio del inmueble de la tarjeta, con el que arranca la calculadora. */
  precio: number;
  /** Divisa del inmueble, para escribir los importes. */
  moneda: string;
  /** Color de marca del portal. */
  color?: string;
  /** Nombre del inmueble, para el título accesible del diálogo. */
  nombre?: string;
}

/**
 * Botón de tarjeta que abre la calculadora hipotecaria con el precio de ese
 * inmueble, sin sacar al visitante del listado.
 *
 * La calculadora se abre en un diálogo y no dentro de la tarjeta: seis campos y
 * un anillo de cuota en una tarjeta de rejilla rompen el listado, y quien solo
 * está mirando precios no tiene por qué cargar con ellos hasta que los pide.
 */
export default function BotonCalculadoraHipoteca({
  precio,
  moneda,
  color = '#2563eb',
  nombre,
}: Props) {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!abierto) return;

    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAbierto(false);
    };

    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-full rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:bg-gray-50"
        style={{ color, borderColor: `${color}55` }}
      >
        Calcular hipoteca
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/50 p-4 py-10"
          role="dialog"
          aria-modal="true"
          aria-label={nombre ? `Calculadora hipotecaria de ${nombre}` : 'Calculadora hipotecaria'}
          onClick={(evento) => {
            if (evento.target === evento.currentTarget) setAbierto(false);
          }}
        >
          <div className="relative w-full max-w-4xl">
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="absolute -top-3 right-0 z-10 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 shadow hover:text-gray-900"
              aria-label="Cerrar calculadora"
            >
              Cerrar ✕
            </button>
            <CalculadoraHipotecaria precioInicial={precio} moneda={moneda} color={color} />
          </div>
        </div>
      )}
    </>
  );
}
