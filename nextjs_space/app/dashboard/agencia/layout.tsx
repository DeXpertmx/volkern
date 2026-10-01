import { exigirHub } from '@/lib/module-guard'

/**
 * El hub de Agencia no se abre por URL directa si el tenant activo no es una
 * agencia con el Feature «Agencia» activo, o si un Superadmin está suplantando
 * a un tenant que no lo tiene. Ocultarlo en el menú no bastaba: bastaba
 * escribir `/dashboard/agencia` para entrar a la pantalla (ver
 * `lib/module-guard.ts`).
 */
export default async function AgenciaLayout({ children }: { children: React.ReactNode }) {
  await exigirHub('agencia')
  return <>{children}</>
}
