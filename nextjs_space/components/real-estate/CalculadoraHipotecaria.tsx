'use client';

import { useId, useState } from 'react';
import { formatearImporte, interesHipotecarioOrientativo, simboloMoneda } from '@/lib/moneda';
import {
  ANIOS_POR_DEFECTO,
  APORTACION_POR_DEFECTO,
  calcularHipoteca,
  type CuotaHipotecaria,
} from '@/lib/real-estate/hipoteca';

interface Props {
  /** Precio del inmueble con el que arranca el formulario. */
  precioInicial: number;
  /** Divisa del inmueble, para escribir los importes. */
  moneda: string;
  /** Color de marca del portal. */
  color?: string;
  className?: string;
}

type Campo = 'precio' | 'aportacion' | 'interes' | 'anios' | 'vinculaciones' | 'seguros';

type Borrador = Record<Campo, number>;

/**
 * Calculadora hipotecaria del portal público.
 *
 * Se ofrece solo en inmuebles en venta con precio publicado (quien llama decide
 * eso). El resultado es una estimación con el sistema francés: cuota constante,
 * calculada sobre el capital pendiente, más los productos vinculados y los
 * seguros que el visitante escriba.
 */
export default function CalculadoraHipotecaria({
  precioInicial,
  moneda,
  color = '#2563eb',
  className,
}: Props) {
  const base = useId();
  const simbolo = simboloMoneda(moneda);

  const iniciales: Borrador = {
    precio: precioInicial,
    aportacion: Math.round(precioInicial * APORTACION_POR_DEFECTO),
    // El tipo de partida lo elige la divisa del portal: una cuota al 3 % en un
    // inmueble en pesos sería una mensualidad que nadie va a firmar.
    interes: interesHipotecarioOrientativo(moneda),
    anios: ANIOS_POR_DEFECTO,
    vinculaciones: 0,
    seguros: 0,
  };

  const [borrador, setBorrador] = useState<Borrador>(iniciales);
  const [resultado, setResultado] = useState<CuotaHipotecaria>(() =>
    calcularHipoteca({
      precio: iniciales.precio,
      aportacion: iniciales.aportacion,
      anios: iniciales.anios,
      interesAnual: iniciales.interes,
      vinculaciones: iniciales.vinculaciones,
      seguros: iniciales.seguros,
    })
  );

  const calcular = (evento: React.FormEvent) => {
    evento.preventDefault();
    setResultado(
      calcularHipoteca({
        precio: borrador.precio,
        aportacion: borrador.aportacion,
        anios: borrador.anios,
        interesAnual: borrador.interes,
        vinculaciones: borrador.vinculaciones,
        seguros: borrador.seguros,
      })
    );
  };

  const cambiar = (campo: Campo, valor: string) => {
    const numero = Number(valor.replace(',', '.'));
    setBorrador((actual) => ({ ...actual, [campo]: Number.isFinite(numero) ? numero : 0 }));
  };

  // Reparto del anillo: capital + intereses, vinculaciones y seguros. Un total
  // de cero (sin precio) se reparte como un anillo vacío en vez de dividir por 0.
  const total = resultado.totalMensual;
  const parte = (valor: number) => (total > 0 ? (valor / total) * 100 : 0);
  const parteCapital = parte(resultado.cuotaCapital);
  const parteVinculaciones = parte(resultado.vinculaciones);
  const parteSeguros = Math.max(100 - parteCapital - parteVinculaciones, 0);

  const anillo = `conic-gradient(${color} 0 ${parteCapital}%, #7dd3fc ${parteCapital}% ${
    parteCapital + parteVinculaciones
  }%, #fcd34d ${parteCapital + parteVinculaciones}% 100%)`;

  const campos: Array<{ campo: Campo; etiqueta: string; unidad: string; paso?: string }> = [
    { campo: 'precio', etiqueta: 'Precio inmueble', unidad: simbolo },
    { campo: 'aportacion', etiqueta: 'Aportación inicial', unidad: simbolo },
    { campo: 'interes', etiqueta: 'Interés', unidad: '%', paso: '0.1' },
    { campo: 'anios', etiqueta: 'Años a pagar', unidad: 'años' },
    { campo: 'vinculaciones', etiqueta: 'Vinculaciones', unidad: simbolo },
    { campo: 'seguros', etiqueta: 'Seguros', unidad: simbolo },
  ];

  return (
    <section className={`rounded-2xl bg-white p-6 shadow-sm ${className || ''}`}>
      <h2 className="text-xl font-semibold text-gray-900">Calculadora hipotecaria</h2>

      <div className="mt-5 flex flex-col items-center gap-8 border-t border-gray-100 pt-6 md:flex-row md:items-center md:justify-around">
        {/* Anillo: total mensual en el centro y reparto por colores */}
        <div
          className="relative flex h-40 w-40 shrink-0 items-center justify-center rounded-full"
          style={{ background: total > 0 ? anillo : '#e5e7eb' }}
          role="img"
          aria-label={`Cuota mensual estimada: ${formatearImporte(total, moneda, 0)}`}
        >
          <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white">
            <strong className="text-lg font-bold text-gray-900">{formatearImporte(total, moneda, 0)}</strong>
            <span className="text-xs text-gray-500">Mensuales</span>
          </div>
        </div>

        <ul className="w-full max-w-xs space-y-2">
          <Leyenda color={color} etiqueta="Capital + intereses" valor={formatearImporte(resultado.cuotaCapital, moneda, 0)} />
          <Leyenda color="#7dd3fc" etiqueta="Vinculaciones" valor={formatearImporte(resultado.vinculaciones, moneda, 0)} />
          <Leyenda color="#fcd34d" etiqueta="Seguros" valor={formatearImporte(resultado.seguros, moneda, 0)} />
        </ul>
      </div>

      <form onSubmit={calcular} className="mt-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campos.map(({ campo, etiqueta, unidad, paso }) => {
            const id = `${base}-${campo}`;
            return (
              <div key={campo}>
                <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
                  {etiqueta}
                </label>
                <div className="flex overflow-hidden rounded-lg border border-gray-300 bg-white focus-within:border-gray-400">
                  <span className="flex w-9 shrink-0 items-center justify-center bg-gray-50 text-xs text-gray-500">
                    {unidad}
                  </span>
                  <input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={paso || '1'}
                    value={borrador[campo]}
                    onChange={(evento) => cambiar(campo, evento.target.value)}
                    className="w-full min-w-0 border-0 px-3 py-2 text-sm text-gray-900 focus:outline-none"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button
            type="submit"
            className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: color }}
          >
            Calcular
          </button>
          <p className="text-xs text-gray-400">
            Intereses totales: {formatearImporte(resultado.interesesTotales, moneda, 0)}
          </p>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-gray-400">
          Estimación orientativa con cuota constante. No incluye impuestos, gastos de compraventa ni
          comisiones: el importe final lo fija la entidad financiera.
        </p>
      </form>
    </section>
  );
}

function Leyenda({ color, etiqueta, valor }: { color: string; etiqueta: string; valor: string }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-gray-100 pb-2 text-sm last:border-0 last:pb-0">
      <span className="flex items-center gap-2 text-gray-600">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
        {etiqueta}
      </span>
      <span className="font-semibold text-gray-900">{valor}</span>
    </li>
  );
}
