import GPSStreamDashboard from '@/components/hubs/LogisticaGPSStream'

export const metadata = {
  title: 'GPS en Vivo | Volkern ERP',
  description: 'Dashboard en tiempo real con streaming SSE de posiciones GPS de vehículos y envíos.',
}

export const dynamic = 'force-dynamic'

export default function GPSStreamPage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <GPSStreamDashboard />
    </div>
  )
}
