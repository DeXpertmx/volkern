// La ruta /[tenant]/dashboard/finanzas/proveedores era una copia legacy del
// módulo de proveedores SIN el trato fiscal (retenciones IRPF/IVA), las tarifas
// de IVA ni el catálogo de categorías. La página canónica es
// /dashboard/finanzas/proveedores (resuelve el tenant por sesión/subdominio).
// Redirigimos aquí para que ninguna URL con el slug en el path muestre la
// versión desactualizada.
import { redirect } from 'next/navigation'

export default function ProveedoresLegacyPage() {
  redirect('/dashboard/finanzas/proveedores')
}
