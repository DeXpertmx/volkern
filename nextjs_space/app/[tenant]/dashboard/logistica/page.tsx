import LogisticaDashboard from '@/components/hubs/LogisticaDashboard'

export const metadata = {
  title: 'Logística | Volkern ERP',
  description: 'Dashboard de gestión de flota, almacenes, envíos y tracking GPS.',
}

export default function LogisticaPage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <LogisticaDashboard />
    </div>
  )
}
