import { exigirHub } from '@/lib/module-guard'

/**
 * El hub de Contabilidad no se abre por URL directa si el tenant activo no es
 * un despacho (cuenta de agencia) o si un Superadmin está suplantando a un
 * tenant que no lo es.
 *
 * Nota: en el catálogo de módulos (`ALL_MODULES`) no existe una feature
 * «contabilidad» —el despacho se define por `accountType = 'AGENCY'`—, así que
 * el gate es el tipo de cuenta, igual que en el menú.
 */
export default async function ContabilidadLayout({ children }: { children: React.ReactNode }) {
  await exigirHub('contabilidad')
  return <>{children}</>
}
