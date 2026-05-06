import CalidadDashboard from '@/components/hubs/CalidadDashboard'

export const metadata = {
  title: 'Calidad & QC | Volkern ERP',
  description: 'Garantía de calidad industrial con trazabilidad criptográfica y auditoría IA.',
}

export default function CalidadPage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <CalidadDashboard />
    </div>
  )
}
