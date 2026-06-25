import AlmacenesDashboard from '@/components/hubs/LogisticaAlmacenesDashboard'

export const metadata = {
  title: 'Almacenes | Volkern ERP',
  description: 'Gestión de almacenes, WMS y recepción de mercancía.',
}

export default function AlmacenesPage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <AlmacenesDashboard />
    </div>
  )
}
