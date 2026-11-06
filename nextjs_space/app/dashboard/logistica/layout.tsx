import { exigirHub } from '@/lib/module-guard'

/** Hub de Logística: cubre flota, envíos, almacenes, tracking y alertas. */
export default async function LogisticaLayout({ children }: { children: React.ReactNode }) {
  await exigirHub('logistica')
  return <>{children}</>
}
