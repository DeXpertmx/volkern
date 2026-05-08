'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Users } from 'lucide-react'
import { SlotList } from '@/components/agency/SlotList'
import { SlotProvisioningModal } from '@/components/agency/SlotProvisioningModal'

export default function AgencySlotsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase italic">Gestión de Clientes</h1>
          <p className="text-muted-foreground">Administra los entornos aislados de tus clientes.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-primary hover:scale-105 transition-transform shadow-lg shadow-primary/25">
          <Plus className="mr-2 h-4 w-4" /> Nuevo Slot de Cliente
        </Button>
      </div>

      <Card className="border-primary/10 shadow-xl">
        <CardHeader className="bg-primary/5 border-b">
          <CardTitle className="flex items-center gap-2 uppercase text-xs font-black tracking-widest text-primary">
            <Users className="h-4 w-4" /> Listado de Subcuentas
          </CardTitle>
          <CardDescription>Visualiza el estado, consumo y accesos de cada slot.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <SlotList />
        </CardContent>
      </Card>

      <SlotProvisioningModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => window.location.reload()} 
      />
    </div>
  )
}
