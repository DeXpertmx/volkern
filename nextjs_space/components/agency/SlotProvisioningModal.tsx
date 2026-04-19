'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Building2, Mail, ShieldCheck, Sparkles } from 'lucide-react'

interface SlotProvisioningModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function SlotProvisioningModal({ isOpen, onClose, onSuccess }: SlotProvisioningModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    client_name: '',
    admin_email: '',
    modules: ['crm']
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/agency/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: formData.client_name,
          admin_email: formData.admin_email,
          modules_enabled: formData.modules
        })
      })

      const data = await res.json()

      if (res.ok) {
        toast.success(`Slot '${formData.client_name}' creado con éxito.`)
        onSuccess()
        onClose()
      } else {
        toast.error(data.error || 'Error al crear slot')
      }
    } catch (error) {
      toast.error('Error de conexión al servidor')
    } finally {
      setLoading(false)
    }
  }

  const toggleModule = (module: string) => {
    setFormData(prev => ({
      ...prev,
      modules: prev.modules.includes(module)
        ? prev.modules.filter(m => m !== module)
        : [...prev.modules, module]
    }))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] border-primary/20 bg-background/95 backdrop-blur-xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter italic flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" /> Nuevo Slot de Cliente
            </DialogTitle>
            <DialogDescription>
              Configura un nuevo entorno aislado para tu cliente. Heredará tu marca blanca automáticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-6 font-sans">
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <Building2 className="h-3 w-3" /> Nombre de la Marca / Cliente
              </Label>
              <Input
                id="name"
                placeholder="Ej. Real Estate Inmobiliaria"
                value={formData.client_name}
                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                required
                className="bg-accent/30 border-primary/10 focus-visible:ring-primary"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <Mail className="h-3 w-3" /> Email del Administrador
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@cliente.com"
                value={formData.admin_email}
                onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
                required
                className="bg-accent/30 border-primary/10 focus-visible:ring-primary"
              />
            </div>

            <div className="grid gap-3">
              <Label className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 mb-1">
                <ShieldCheck className="h-3 w-3" /> Módulos habilitados (Slots)
              </Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center space-x-2 p-3 rounded-lg border bg-accent/20">
                  <Checkbox 
                    id="m-crm" 
                    checked={formData.modules.includes('crm')} 
                    onCheckedChange={() => toggleModule('crm')}
                    disabled 
                  />
                  <Label htmlFor="m-crm" className="text-sm font-black italic uppercase cursor-pointer">CRM Core</Label>
                </div>
                <div className="flex items-center space-x-2 p-3 rounded-lg border bg-accent/20">
                  <Checkbox 
                    id="m-mkt" 
                    checked={formData.modules.includes('marketing')} 
                    onCheckedChange={() => toggleModule('marketing')}
                  />
                  <Label htmlFor="m-mkt" className="text-sm font-black italic uppercase cursor-pointer">Marketing</Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" type="button" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-primary hover:scale-105 transition-transform" disabled={loading}>
              {loading ? 'Provisionando...' : 'Crear Entorno'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
