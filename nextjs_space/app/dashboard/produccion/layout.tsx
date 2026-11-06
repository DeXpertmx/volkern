import { exigirHub } from '@/lib/module-guard'

/** Hub de Producción: fuera del vertical inmobiliario, no debe abrirse por URL. */
export default async function ProduccionLayout({ children }: { children: React.ReactNode }) {
  await exigirHub('produccion')
  return <>{children}</>
}
