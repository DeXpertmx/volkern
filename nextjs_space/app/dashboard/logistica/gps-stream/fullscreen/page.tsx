import GPSStreamDashboard from '@/components/hubs/LogisticaGPSStream'

export const metadata = {
  title: 'GPS en Vivo — Pantalla Completa | Volkern ERP',
  description: 'Dashboard GPS en tiempo real optimizado para centros operativos y pantallas grandes.',
}

export const dynamic = 'force-dynamic'

export default function FullscreenGPSPage() {
  return (
    <div className="min-h-screen bg-slate-900 p-0">
      <GPSStreamDashboard />
    </div>
  )
}
