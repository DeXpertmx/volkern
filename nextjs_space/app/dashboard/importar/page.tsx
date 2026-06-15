'use client'

import { ImportWizard } from '@/components/import/ImportWizard'
import { ImportHistory } from '@/components/import/ImportHistory'

export default function ImportPage() {
  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Importar datos</h1>
        <p className="text-gray-500 mt-1">
          Importa clientes, contabilidad o servicios desde Sage, Microdata o archivos CSV/Excel genéricos.
        </p>
      </div>

      <ImportWizard />
      <ImportHistory />
    </div>
  )
}
