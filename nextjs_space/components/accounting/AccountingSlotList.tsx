'use client'

import { useState, useEffect } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ExternalLink, MoreVertical, ShieldCheck, Mail, Building2, Calculator, Database } from 'lucide-react'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from 'sonner'

export function AccountingSlotList({ isLoading: parentLoading }: { isLoading?: boolean }) {
  const [slots, setSlots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSlots = async () => {
      try {
        const res = await fetch('/api/accounting/slots')
        if (res.ok) {
          const data = await res.json()
          setSlots(data)
        }
      } catch (error) {
        console.error('Error loading accounting slots:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSlots()
  }, [])

  const [seedingSlot, setSeedingSlot] = useState<string | null>(null)

  const handleSeedDemo = async (slotId: string, slotName: string) => {
    setSeedingSlot(slotId)
    try {
      const res = await fetch(`/api/accounting/slots/${slotId}/seed-demo`, { method: 'POST' })
      if (res.ok) {
        toast.success(`Datos demo cargados en ${slotName}`)
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al cargar datos demo')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSeedingSlot(null)
    }
  }

  const handleImpersonate = async (slotId: string, slotName: string) => {
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: slotId, action: 'start' })
      })

      if (res.ok) {
        toast.success(`Accediendo a ${slotName}... Redirigiendo.`)
        window.location.href = '/dashboard'
      } else {
        toast.error('No se pudo iniciar la suplantación')
      }
    } catch (error) {
      toast.error('Error al intentar Login-as')
    }
  }

  if (loading || parentLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="p-4 rounded-full bg-accent mb-4">
          <Calculator className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-bold">No tienes clientes activos</h3>
        <p className="text-muted-foreground text-sm max-w-xs">
          Comienza creando el primer cliente para gestionar su contabilidad y fiscalidad.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="font-bold uppercase text-[10px]">Cliente / Empresa</TableHead>
            <TableHead className="font-bold uppercase text-[10px]">Estado</TableHead>
            <TableHead className="font-bold uppercase text-[10px]">Leads</TableHead>
            <TableHead className="font-bold uppercase text-[10px]">Usuarios</TableHead>
            <TableHead className="font-bold uppercase text-[10px]">Módulos</TableHead>
            <TableHead className="text-right font-bold uppercase text-[10px]">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slots.map((slot) => (
            <TableRow key={slot.id} className="hover:bg-accent/5 transition-colors">
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-bold text-sm tracking-tight">{slot.nombre}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">{slot.slug}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={slot.estado === 'activo' ? 'success' : 'secondary'} className="uppercase text-[9px] font-black">
                  {slot.estado}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-sm">{slot._count?.leads || 0}</TableCell>
              <TableCell className="font-mono text-sm">{slot._count?.users || 0}</TableCell>
              <TableCell>
                <div className="flex gap-1 flex-wrap">
                  <Badge variant="outline" className="text-[9px] p-0 px-1 border-primary/20 text-primary bg-primary/5">CRM</Badge>
                  {slot.enabledModules?.includes('finanzas') && (
                    <Badge variant="outline" className="text-[9px] p-0 px-1 border-emerald-200 text-emerald-600 bg-emerald-50">CONT</Badge>
                  )}
                  {slot.enabledModules?.includes('conciliacion') && (
                    <Badge variant="outline" className="text-[9px] p-0 px-1 border-blue-200 text-blue-600 bg-blue-50">CONC</Badge>
                  )}
                  {slot.enabledModules?.includes('marketing') && (
                    <Badge variant="outline" className="text-[9px] p-0 px-1 border-purple-200 text-purple-600 bg-purple-50">MKT</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 hover:bg-primary/10 hover:text-primary transition-all group"
                    onClick={() => handleImpersonate(slot.id, slot.nombre)}
                  >
                    <ShieldCheck className="mr-2 h-3 w-3 transition-transform group-hover:scale-125" /> 
                    <span className="text-xs font-bold uppercase tracking-tighter">Login-as</span>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-xs font-bold uppercase" onClick={() => handleSeedDemo(slot.id, slot.nombre)} disabled={seedingSlot === slot.id}>
                        <Database className="mr-2 h-3 w-3" /> {seedingSlot === slot.id ? 'Cargando...' : 'Cargar Datos Demo'}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs font-bold uppercase">
                        <Mail className="mr-2 h-3 w-3" /> Contactar Admin
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs font-bold uppercase text-destructive">
                        Suspender Cliente
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
