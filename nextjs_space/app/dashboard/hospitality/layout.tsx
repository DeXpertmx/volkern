import { exigirHub } from '@/lib/module-guard'

/**
 * Hub de Hospitality: cubre la carpeta entera, incluidas sus diecinueve
 * pantallas. Sin el módulo activo, la URL directa devuelve al panel.
 */
export default async function HospitalityLayout({ children }: { children: React.ReactNode }) {
  await exigirHub('hospitality')
  return <>{children}</>
}
