'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { 
  Plus, 
  Copy, 
  Trash2, 
  Gift, 
  Calendar, 
  Clock, 
  CheckCircle, 
  XCircle,
  Loader2,
  RefreshCw
} from 'lucide-react'
import { toast } from 'sonner'

interface GiftCoupon {
  id: string
  code: string
  descripcion: string | null
  justification: string
  durationDays: number
  discountPercent: number
  modules: string[] | null
  limiteLeads: number
  limiteUsuarios: number
  isActive: boolean
  maxUses: number | null
  usedCount: number
  expiresAt: string | null
  createdAt: string
  redemptions?: Array<{
    id: string
    userEmail: string
    createdAt: string
  }>
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<GiftCoupon[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  
  const [formData, setFormData] = useState({
    descripcion: '',
    justification: '',
    durationDays: 30,
    discountPercent: 0,
    limiteLeads: 1000,
    limiteUsuarios: 5,
    maxUses: ''
  })

  const fetchCoupons = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/coupons')
      const data = await res.json()
      if (data.coupons) {
        setCoupons(data.coupons)
      }
    } catch (error) {
      toast.error('Error al cargar cupones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCoupons()
  }, [])

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          maxUses: formData.maxUses ? parseInt(formData.maxUses) : null
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error)
      }

      toast.success('Cupón creado exitosamente')
      setShowDialog(false)
      setFormData({
        descripcion: '',
        justification: '',
        durationDays: 30,
        discountPercent: 0,
        limiteLeads: 1000,
        limiteUsuarios: 5,
        maxUses: ''
      })
      fetchCoupons()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleCoupon = async (id: string) => {
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'toggle' })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast.success(data.message)
      fetchCoupons()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const deleteCoupon = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este cupón?')) return

    try {
      const res = await fetch(`/api/admin/coupons?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')

      toast.success('Cupón eliminado')
      fetchCoupons()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    toast.success('Código copiado')
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="h-6 w-6" />
            Códigos de Regalo
          </h1>
          <p className="text-muted-foreground">
            Gestiona los códigos de regalo para nuevas cuentas
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchCoupons}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Crear Cupón
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Crear Nuevo Cupón</DialogTitle>
                <DialogDescription>
                  Genera un código de regalo para una cuenta gratuita
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateCoupon} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="justification">Justificación *</Label>
                  <Textarea
                    id="justification"
                    placeholder="Meta/Facebook - Promoción especial para influencers..."
                    value={formData.justification}
                    onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Required por Meta para registros de influencers
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="descripcion">Descripción (opcional)</Label>
                  <Input
                    id="descripcion"
                    placeholder="Ej: Cupón para Juan Pérez"
                    value={formData.descripcion}
                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="durationDays">Duración (días)</Label>
                    <Input
                      id="durationDays"
                      type="number"
                      min="1"
                      max="365"
                      value={formData.durationDays}
                      onChange={(e) => setFormData({ ...formData, durationDays: parseInt(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="discountPercent">Descuento (%)</Label>
                    <Input
                      id="discountPercent"
                      type="number"
                      min="0"
                      max="100"
                      value={formData.discountPercent}
                      onChange={(e) => setFormData({ ...formData, discountPercent: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="limiteLeads">Límite Leads</Label>
                    <Input
                      id="limiteLeads"
                      type="number"
                      min="1"
                      value={formData.limiteLeads}
                      onChange={(e) => setFormData({ ...formData, limiteLeads: parseInt(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="limiteUsuarios">Límite Usuarios</Label>
                    <Input
                      id="limiteUsuarios"
                      type="number"
                      min="1"
                      value={formData.limiteUsuarios}
                      onChange={(e) => setFormData({ ...formData, limiteUsuarios: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxUses">Usos máximos (dejar vacío para ilimitado)</Label>
                  <Input
                    id="maxUses"
                    type="number"
                    min="1"
                    placeholder="Ilimitado"
                    value={formData.maxUses}
                    onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Crear Cupón
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cupones Generados</CardTitle>
          <CardDescription>
            Lista de todos los códigos de regalo disponibles
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : coupons.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay cupones generados
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Descuento</TableHead>
                  <TableHead>Usos</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.map((coupon) => (
                  <TableRow key={coupon.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm">{coupon.code}</code>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => copyCode(coupon.code)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      {coupon.descripcion && (
                        <p className="text-xs text-muted-foreground">{coupon.descripcion}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {coupon.durationDays} días
                      </div>
                    </TableCell>
                    <TableCell>
                      {coupon.discountPercent > 0 ? (
                        <Badge variant="secondary">{coupon.discountPercent}%</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={coupon.usedCount > 0 ? 'font-medium' : ''}>
                        {coupon.usedCount}
                      </span>
                      {coupon.maxUses && <span className="text-muted-foreground"> / {coupon.maxUses}</span>}
                    </TableCell>
                    <TableCell>
                      {coupon.isActive ? (
                        <Badge className="bg-green-500">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <XCircle className="h-3 w-3 mr-1" />
                          Inactivo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(coupon.createdAt).toLocaleDateString('es-MX')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => toggleCoupon(coupon.id)}
                        >
                          {coupon.isActive ? (
                            <XCircle className="h-4 w-4 text-red-500" />
                          ) : (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => deleteCoupon(coupon.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}