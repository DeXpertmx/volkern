// La ruta /[tenant]/dashboard/finanzas/facturacion era una copia legacy del
// módulo de facturación SIN el modal de factura manual (ManualInvoiceModal) ni
// el listado de facturas emitidas. La página canónica es
// /dashboard/finanzas/facturacion (resuelve el tenant por sesión/subdominio).
// Redirigimos aquí para que ninguna URL con el slug en el path muestre la
// versión desactualizada.
import { redirect } from 'next/navigation'

export default function FacturacionLegacyPage() {
  redirect('/dashboard/finanzas/facturacion')
}
