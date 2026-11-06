import { headers } from 'next/headers'
import { DashboardLayout } from '@/components/dashboard-layout'
import { exigirHubDeRuta } from '@/lib/module-guard'

/**
 * Armazón del panel.
 *
 * La guardia de módulos se aplica AQUÍ y no solo en el layout de cada sección
 * porque este es el primer componente que se renderiza: el corte ocurre antes de
 * que el armazón salga por el stream y la respuesta es un 307, en vez de un 200
 * con la orden de redirección escondida en el payload.
 *
 * La ruta llega en `x-pathname`, que pone el middleware (`headers()` no expone el
 * pathname). Si no viene —por ejemplo en un render sin middleware— no se corta
 * aquí: los layouts de cada sección siguen teniendo su propia guardia.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get('x-pathname')
  if (pathname) await exigirHubDeRuta(pathname)

  return <DashboardLayout>{children}</DashboardLayout>
}
