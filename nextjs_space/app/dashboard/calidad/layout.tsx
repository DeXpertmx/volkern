import { exigirHub } from '@/lib/module-guard'

/** Hub de Calidad: fuera del vertical inmobiliario, no debe abrirse por URL. */
export default async function CalidadLayout({ children }: { children: React.ReactNode }) {
  await exigirHub('calidad')
  return <>{children}</>
}
