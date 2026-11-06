import { exigirHub } from '@/lib/module-guard'

/**
 * Hub de Inventario: cubre stock, movimientos, almacenes y alertas de
 * reposición de esta carpeta.
 */
export default async function InventarioLayout({ children }: { children: React.ReactNode }) {
  await exigirHub('inventario')
  return <>{children}</>
}
