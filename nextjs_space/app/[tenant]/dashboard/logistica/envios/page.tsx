import EnviosDashboard from '@/components/hubs/LogisticaEnviosDashboard'

export const metadata = {
  title: 'Envíos | Volkern ERP',
  description: 'Gestión de despachos, tracking y entregas logísticas.',
}

export default function EnviosPage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <EnviosDashboard />
    </div>
  )
}
