import AlertasDashboard from '@/components/hubs/LogisticaAlertasDashboard'

export const metadata = {
  title: 'Alertas | Volkern ERP',
  description: 'Alertas de mantenimiento, ITV, capacidad y envíos pendientes.',
}

export default function AlertasPage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <AlertasDashboard />
    </div>
  )
}
