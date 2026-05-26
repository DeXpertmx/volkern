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
import { Building2, Mail, ShieldCheck, Sparkles, Calculator, Landmark } from 'lucide-react'

interface AccountingSlotProvisioningModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const ACCOUNTING_MODULES = [
  { id: 'crm', label: 'CRM Core', description: 'Leads, contactos, pipeline', disabled: true },
  { id: 'finanzas', label: 'Contabilidad', description: 'Libro diario, P&L, impuestos' },
  { id: 'conciliacion', label: 'Conciliación Bancaria', description: 'Conexión con bancos e IA' },
  { id: 'marketing', label: 'Marketing', description: 'Campañas y email marketing' },
]

export function AccountingSlotProvisioningModal({ isOpen, onClose, onSuccess }: AccountingSlotProvisioningModalProps) {
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
      const res = await fetch('/api/accounting/slots', {
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
        toast.success(`Cliente '${formData.client_name}' dado de alta con éxito.`)
        onSuccess()
        onClose()
      } else {
        toast.error(data.error || 'Error al crear cliente')
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
      <DialogContent className="sm:max-w-[500px] border-emerald-500/20 bg-background/95 backdrop-blur-xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter italic flex items-center gap-2">
              <Landmark className="h-6 w-6 text-emerald-500" /> Nuevo Cliente Contable
            </DialogTitle>
            <DialogDescription>
              Da de alta un nuevo cliente para tu despacho. Heredará tu marca y la configuración contable.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-6 font-sans">
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <Building2 className="h-3 w-3" /> Nombre de la Empresa / Cliente
              </Label>
              <Input
                id="name"
                placeholder="Ej. Restaurante La Tagliatella S.L."
                value={formData.client_name}
                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                required
                className="bg-accent/30 border-primary/10 focus-visible:ring-primary"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <Mail className="h-3 w-3" /> Email del Administrador (Cliente)
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
                <ShieldCheck className="h-3 w-3" /> Módulos habilitados (Clientes)
              </Label>
              <div className="grid grid-cols-1 gap-2">
                {ACCOUNTING_MODULES.map((mod) => (
                  <div key={mod.id} className="flex items-center space-x-3 p-3 rounded-lg border bg-accent/20 hover:bg-accent/30 transition-colors">
                    <Checkbox 
                      id={`m-${mod.id}`} 
                      checked={formData.modules.includes(mod.id)} 
                      onCheckedChange={() => toggleModule(mod.id)}
                      disabled={mod.disabled}
                      className={mod.disabled ? 'data-[state=checked]:bg-emerald-500' : ''}
                    />
                    <div className="flex flex-col">
                      <Label htmlFor={`m-${mod.id}`} className="text-sm font-black italic uppercase cursor-pointer">
                        {mod.label}
                      </Label>
                      <span className="text-[10px] text-muted-foreground">{mod.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notice about Powered by Volkern */}
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-xs text-amber-700 font-medium flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                El branding incluirá "Powered by Volkern" de forma permanente en todos los clientes.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" type="button" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 hover:scale-105 transition-transform" disabled={loading}>
              {loading ? 'Creando...' : 'Dar de Alta Cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
