import TrackingDashboard from '@/components/hubs/LogisticaTrackingDashboard'

export const metadata = {
  title: 'Tracking GPS | Volkern ERP',
  description: 'Localización de envíos y seguimiento GPS en tiempo real.',
}

export default function TrackingPage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <TrackingDashboard />
    </div>
  )
}
