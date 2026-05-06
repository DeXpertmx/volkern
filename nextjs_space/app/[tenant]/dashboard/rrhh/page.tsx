import HRMDashboard from '@/components/hubs/HRMDashboard'

export const metadata = {
  title: 'RRHH & Talento | Volkern ERP',
  description: 'Gestión de capital humano con seguridad The Vault 2.0 y analítica de retención IA.',
}

export default function HRPage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <HRMDashboard />
    </div>
  )
}
