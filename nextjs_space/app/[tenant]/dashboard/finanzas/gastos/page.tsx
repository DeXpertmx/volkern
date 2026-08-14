// La ruta /[tenant]/dashboard/finanzas/gastos era una copia legacy del
// módulo de gastos SIN la columna de retención, el escaneo de documentos ni
// el catálogo de categorías. La página canónica es
// /dashboard/finanzas/gastos (resuelve el tenant por sesión/subdominio).
// Redirigimos aquí para que ninguna URL con el slug en el path muestre la
// versión desactualizada.
import { redirect } from 'next/navigation'

export default function GastosLegacyPage() {
  redirect('/dashboard/finanzas/gastos')
}
