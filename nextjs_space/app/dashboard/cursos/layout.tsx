import { exigirHub } from '@/lib/module-guard'

/**
 * Cursos vive dentro del hub de Academia, así que hereda su guardia: la carpeta
 * de Academia solo cubre `/dashboard/academia`, no esta ruta hermana.
 */
export default async function CursosLayout({ children }: { children: React.ReactNode }) {
  await exigirHub('academia')
  return <>{children}</>
}
