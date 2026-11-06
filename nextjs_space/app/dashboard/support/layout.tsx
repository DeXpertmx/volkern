import { exigirHub } from '@/lib/module-guard'

/**
 * Hub de Taskforce: su ruta es `/dashboard/support`, pero el id del hub sigue
 * siendo `taskforce` (es el módulo el que manda).
 */
export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  await exigirHub('taskforce')
  return <>{children}</>
}
