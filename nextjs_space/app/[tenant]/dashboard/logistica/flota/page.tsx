import FleetDashboard from '@/components/hubs/LogisticaFleetDashboard'

export const metadata = {
  title: 'Flota | Volkern ERP',
  description: 'Gestión de vehículos, conductores y mantenimiento de flota.',
}

export default function FlotaPage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <FleetDashboard />
    </div>
  )
}
