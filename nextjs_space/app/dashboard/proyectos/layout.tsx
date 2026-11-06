import { exigirHub } from '@/lib/module-guard'

/** Hub de Proyectos: fuera del vertical inmobiliario, no debe abrirse por URL. */
export default async function ProyectosLayout({ children }: { children: React.ReactNode }) {
  await exigirHub('proyectos')
  return <>{children}</>
}
