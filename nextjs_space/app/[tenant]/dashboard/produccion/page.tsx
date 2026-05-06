import ProduccionDashboard from '@/components/hubs/ProduccionDashboard'

export const metadata = {
  title: 'Producción & MRP | Volkern ERP',
  description: 'Gestión de manufactura, BoM e integridad de planta asistente por IA.',
}

export default function ProduccionPage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <ProduccionDashboard />
    </div>
  )
}
