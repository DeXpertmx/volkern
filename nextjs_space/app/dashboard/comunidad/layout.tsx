import { exigirHub } from '@/lib/module-guard'

/** Ruta hermana de Academia: misma guardia que el hub. */
export default async function ComunidadLayout({ children }: { children: React.ReactNode }) {
  await exigirHub('academia')
  return <>{children}</>
}
