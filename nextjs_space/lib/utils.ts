import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatearImporte } from "@/lib/moneda"
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}

/**
 * Formatea un importe. El formato lo define `lib/moneda.ts`, que es el único
 * módulo de la plataforma que conoce divisas y formatos de dinero.
 *
 * El valor por defecto 'EUR' es deuda declarada, no una decisión: 252 de las
 * llamadas actuales no pasan divisa, y quitarlo exige llevar la divisa real
 * —la del tenant o el registro— hasta cada pantalla. La guardia de plataforma lo
 * registra como excepción con nombre y motivo, así que no puede crecer ni pasar
 * inadvertido. Además, delegar aquí arregla un fallo real: `Intl` lanza excepción
 * con un código de divisa inválido, y ahora un importe sin divisa sale sin
 * símbolo en lugar de romper el render.
 */
export function formatCurrency(amount: number, currency: string = 'EUR'): string {
  return formatearImporte(amount, currency, 2)
}