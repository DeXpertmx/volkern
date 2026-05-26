'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Users, Calculator } from 'lucide-react'
import { AccountingSlotList } from '@/components/accounting/AccountingSlotList'
import { AccountingSlotProvisioningModal } from '@/components/accounting/AccountingSlotProvisioningModal'

export default function AccountingSlotsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase italic flex items-center gap-3">
            <Calculator className="h-8 w-8 text-emerald-500" />
            Gestión de Clientes
          </h1>
          <p className="text-muted-foreground">Administra los entornos aislados de tus clientes de asesoría.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 hover:scale-105 transition-transform shadow-lg shadow-emerald-600/25">
          <Plus className="mr-2 h-4 w-4" /> Nuevo Cliente
        </Button>
      </div>

      <Card className="border-emerald-500/10 shadow-xl">
        <CardHeader className="bg-emerald-500/5 border-b">
          <CardTitle className="flex items-center gap-2 uppercase text-xs font-black tracking-widest text-emerald-600">
            <Users className="h-4 w-4" /> Listado de Clientes
          </CardTitle>
          <CardDescription>Visualiza el estado, consumo y accesos de cada cliente contable.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <AccountingSlotList />
        </CardContent>
      </Card>

      <AccountingSlotProvisioningModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => window.location.reload()} 
      />
    </div>
  )
}
