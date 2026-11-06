import { exigirHub } from '@/lib/module-guard'

/**
 * Hub de Academia: solo tiene sentido con el módulo de cursos activo.
 *
 * El menú ya no lo ofrece a quien no tiene `cursos`, pero esconderlo no es
 * prohibirlo: sin esta guardia bastaba escribir `/dashboard/academia` (o
 * `/dashboard/cursos`) para entrar. La comprobación es la misma función que
 * decide el menú.
 */
export default async function AcademiaLayout({ children }: { children: React.ReactNode }) {
  await exigirHub('academia')
  return <>{children}</>
}
