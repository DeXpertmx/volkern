import { Metadata } from 'next'
import ComplianceProLanding from '@/components/public/ComplianceProLanding'

export const metadata: Metadata = {
  title: 'Compliance PRO — Volkern CRM',
  description: 'Trazabilidad total, procesos obligatorios, alertas inteligentes y certificación digital. Demuestra que todo se hace correctamente.',
  openGraph: {
    title: 'Compliance PRO — Volkern CRM',
    description: 'Trazabilidad total, procesos obligatorios, alertas inteligentes y certificación digital.',
    images: ['/og-compliance-pro.png'],
  },
}

export default function ComplianceProPage() {
  return <ComplianceProLanding />
}
