'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Search, Building2, Phone, Mail, MapPin, Calendar, CreditCard, Tag, Receipt } from "lucide-react"
import Link from "next/link"
import useSWR from "swr"
import { toast } from "sonner"
import IvaRatesEditor from "@/components/finance/IvaRatesEditor"
import FiscalRegimeEditor from "@/components/finance/FiscalRegimeEditor"
import { EXPENSE_CATEGORIES } from "@/lib/finance/expense-categories"

const fetcher = (url: string) => fetch(url).then(res => res.json())

const TIPOS_VIA = [
  'Calle', 'Avenida', 'Plaza', 'Paseo', 'Camino', 'Carretera',
  'Travesía', 'Pasaje', 'Ronda', 'Glorieta', 'Polígono',
  'Urbanización', 'Parque', 'Autovía', 'Barrio', 'Cuesta',
  'Costanilla', 'Carrera', 'Gran Vía', 'Callejón', 'Plazuela'
]

const PAISES = [
  'España', 'Alemania', 'Andorra', 'Argentina', 'Bélgica', 'Bolivia',
  'Brasil', 'Chile', 'Colombia', 'Costa Rica', 'Cuba', 'Ecuador',
  'El Salvador', 'Francia', 'Guatemala', 'Honduras', 'Italia',
  'México', 'Nicaragua', 'Panamá', 'Paraguay', 'Perú', 'Portugal',
  'Puerto Rico', 'Reino Unido', 'República Dominicana', 'Uruguay',
  'Venezuela', 'Estados Unidos', 'Canadá', 'Países Bajos', 'Suiza',
  'Irlanda', 'Suecia', 'Noruega', 'Dinamarca', 'Finlandia', 'Austria',
  'Polonia', 'República Checa', 'Hungría', 'Rumanía', 'Bulgaria',
  'Grecia', 'Turquía', 'Marruecos', 'China', 'Japón', 'India'
]

function formatAddress(s: any): string {
  if (!s) return 'No especificada'
  const parts = [
    s.streetType, s.streetName, s.streetNumber,
    s.staircase ? `Esc. ${s.staircase}` : '',
    s.floor ? `Piso ${s.floor}` : '',
    s.door ? `Pta. ${s.door}` : '',
    s.postalCode, s.city, s.province, s.country
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : 'No especificada'
}

const emptyForm = { name: '', taxId: '', email: '', phone: '', streetType: '', streetName: '', streetNumber: '', staircase: '', floor: '', door: '', postalCode: '', city: '', province: '', country: 'España', category: 'Otros', vatRates: [] as number[], fiscalRegime: 'EMPRESA', irpfRetention: 0, ivaRetention: 0 }

export default function ProveedoresPage() {
  const { data: suppliers, isLoading, mutate } = useSWR('/api/erp/suppliers', fetcher)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailSupplier, setDetailSupplier] = useState<any>(null)
  const [deepLinkedId, setDeepLinkedId] = useState<string | null>(null)

  // Entrada directa a una ficha desde el listado de gastos (?proveedor=ID)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setDeepLinkedId(params.get('proveedor'))
  }, [])
  useEffect(() => {
    if (!deepLinkedId || !Array.isArray(suppliers) || suppliers.length === 0) return
    const found = suppliers.find((s: any) => s.id === deepLinkedId)
    if (found) setDetailSupplier(found)
    setDeepLinkedId(null) // abre una sola vez, aunque los datos se refresquen
  }, [deepLinkedId, suppliers])
  const [detailSaving, setDetailSaving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  // Gastos recientes del proveedor (se cargan al abrir la ficha)
  const [supplierExpenses, setSupplierExpenses] = useState<any[]>([])
  const [expensesLoading, setExpensesLoading] = useState(false)
  const [expensesTotal, setExpensesTotal] = useState(0)

  useEffect(() => {
    if (!detailSupplier?.id) {
      setSupplierExpenses([])
      return
    }
    let cancelled = false
    setExpensesLoading(true)
    fetch(`/api/erp/expenses?supplierId=${detailSupplier.id}&limit=5`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const list = Array.isArray(data?.expenses) ? data.expenses : []
        setSupplierExpenses(list)
        setExpensesTotal(list.reduce((a: number, e: any) => a + (Number(e.amount) || 0), 0))
      })
      .catch(() => { if (!cancelled) setSupplierExpenses([]) })
      .finally(() => { if (!cancelled) setExpensesLoading(false) })
    return () => { cancelled = true }
  }, [detailSupplier?.id])

  async function saveDetailRates() {
    if (!detailSupplier) return
    setDetailSaving(true)
    try {
      const res = await fetch(`/api/erp/suppliers/${detailSupplier.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vatRates: detailSupplier.vatRates || [],
          fiscalRegime: detailSupplier.fiscalRegime || 'EMPRESA',
          irpfRetention: detailSupplier.irpfRetention ?? 0,
          ivaRetention: detailSupplier.ivaRetention ?? 0,
        })
      })
      if (!res.ok) throw new Error()
      toast.success('Datos fiscales actualizados')
      mutate()
    } catch {
      toast.error('Error al guardar los datos fiscales')
    } finally {
      setDetailSaving(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/erp/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (!res.ok) throw new Error()
      toast.success('Proveedor creado correctamente')
      setCreateOpen(false)
      setForm(emptyForm)
      mutate()
    } catch {
      toast.error('Error al crear proveedor')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Base de Proveedores</h1>
          <p className="text-muted-foreground">Directorio centralizado de partners y suministradores.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="rounded-xl font-bold uppercase text-xs tracking-wider">
          <Plus className="w-4 h-4 mr-2" /> Nuevo Proveedor
        </Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] !max-w-none max-h-[92vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black tracking-tight uppercase">Nuevo Proveedor</DialogTitle>
            <DialogDescription>Registra un nuevo socio o suministrador en tu base.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-5">
            <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-widest">Nombre *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Razón social o nombre comercial" className="rounded-xl" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-widest">CIF / NIF</Label>
              <Input value={form.taxId} onChange={e => setForm({ ...form, taxId: e.target.value })} placeholder="Ej: B12345678" className="rounded-xl" />
            </div>

            <div className="space-y-3 border-t pt-4 mt-2">
              <Label className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5"><MapPin className="w-3 h-3" /> Dirección</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground font-semibold uppercase">Tipo de vía</Label>
                  <select value={form.streetType} onChange={e => setForm({ ...form, streetType: e.target.value })} className="w-full bg-background border rounded-xl px-3 py-2.5 text-sm outline-none">
                    <option value="">Seleccionar</option>
                    {TIPOS_VIA.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-[9px] text-muted-foreground font-semibold uppercase">Nombre de la vía</Label>
                  <Input value={form.streetName} onChange={e => setForm({ ...form, streetName: e.target.value })} placeholder="Nombre de la calle/avenida" className="rounded-xl" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground font-semibold uppercase">Número</Label>
                  <Input value={form.streetNumber} onChange={e => setForm({ ...form, streetNumber: e.target.value })} placeholder="Nº" className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground font-semibold uppercase">Escalera</Label>
                  <Input value={form.staircase} onChange={e => setForm({ ...form, staircase: e.target.value })} placeholder="Esc." className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground font-semibold uppercase">Piso</Label>
                  <Input value={form.floor} onChange={e => setForm({ ...form, floor: e.target.value })} placeholder="Piso" className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground font-semibold uppercase">Puerta</Label>
                  <Input value={form.door} onChange={e => setForm({ ...form, door: e.target.value })} placeholder="Pta." className="rounded-xl" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground font-semibold uppercase">Código Postal</Label>
                  <Input value={form.postalCode} onChange={e => setForm({ ...form, postalCode: e.target.value })} placeholder="28001" className="rounded-xl" maxLength={5} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground font-semibold uppercase">Ciudad</Label>
                  <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Madrid" className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground font-semibold uppercase">Provincia</Label>
                  <Input value={form.province} onChange={e => setForm({ ...form, province: e.target.value })} placeholder="Madrid" className="rounded-xl" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[9px] text-muted-foreground font-semibold uppercase">País</Label>
                <select value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className="w-full bg-background border rounded-xl px-3 py-2.5 text-sm outline-none">
                  {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-widest">Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="correo@ejemplo.com" className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-widest">Teléfono</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+34 600 000 000" className="rounded-xl" />
              </div>
            </div>              <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-widest">Tipos de IVA aplicables</Label>
              <IvaRatesEditor value={form.vatRates} onChange={vatRates => setForm({ ...form, vatRates })} />
            </div>
            <div className="space-y-3 border-t pt-4 mt-2">
              <Label className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5"><Receipt className="w-3 h-3" /> Trato fiscal (retenciones)</Label>
              <FiscalRegimeEditor
                regime={form.fiscalRegime}
                irpfRetention={form.irpfRetention}
                ivaRetention={form.ivaRetention}
                onChange={({ fiscalRegime, irpfRetention, ivaRetention }) => setForm({ ...form, fiscalRegime, irpfRetention, ivaRetention })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-widest">Categoría</Label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-background border rounded-xl px-4 py-2.5 text-sm font-medium outline-none">
                {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.label}>{c.label}</option>)}
              </select>
            </div>
            </div>
            <DialogFooter className="pt-1">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} className="rounded-xl">Cancelar</Button>
              <Button type="submit" disabled={saving || !form.name.trim()} className="rounded-xl font-bold uppercase text-xs tracking-wider">
                {saving ? 'Guardando...' : 'Guardar Proveedor'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-xl pl-10 pr-4 py-3 text-sm" placeholder="Buscar por nombre o identificación..." />
        </div>
        <div>
             <select className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-xl px-4 py-3 text-sm font-bold appearance-none outline-none">
             <option>Todas las categorías</option>
             <option>Varios</option>
             <option>Software</option>
             <option>Marketing</option>
             <option>Logística</option>
             <option>Consultoría</option>
             <option>Hosting</option>
             <option>Servicios Profesionales</option>
             <option>Materia Prima</option>
             <option>Transporte</option>
             <option>Mantenimiento</option>
             <option>Telecomunicaciones</option>
             <option>Seguros</option>
             <option>Servicios Públicos</option>
             <option>Papelería</option>
             <option>Equipo de Cómputo</option>
             <option>Alimentos y Bebidas</option>
             <option>Capacitación</option>
           </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full text-center py-20 text-muted-foreground font-medium uppercase tracking-widest text-xs">Cargando proveedores...</div>
        ) : (suppliers && suppliers.length > 0) ? (
          suppliers.map((supplier: any) => (
            <Card key={supplier.id} className="border-none shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                 <Building2 className="w-20 h-20 -mr-6 -mt-6 rotate-12" />
               </div>
               <CardHeader className="pb-2">
                 <div className="flex justify-between items-start mb-2">
                    <Badge variant="outline" className="rounded-lg text-[10px] font-bold uppercase border-none bg-primary/10 text-primary">{supplier.category}</Badge>
                    <Badge variant="secondary" className="rounded-full h-2 w-2 p-0 bg-emerald-500" />
                 </div>
                 <CardTitle className="text-xl font-bold tracking-tight">{supplier.name}</CardTitle>
                 <CardDescription className="text-[10px] font-black uppercase tracking-widest">{supplier.taxId || 'SIN ID FISCAL'}</CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                 <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Mail className="w-3 h-3" /> {supplier.email || 'No especificado'}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="w-3 h-3" /> {supplier.phone || 'No especificado'}
                    </div>
                 </div>

                 <div className="flex flex-wrap gap-1.5">
                    {(supplier.vatRates?.length
                      ? supplier.vatRates.map((v: number) => `${v}%`)
                      : ['IVA según gasto']
                    ).map((label: string) => (
                      <span key={label} className="rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-bold px-2 py-0.5">{label}</span>
                    ))}
                    {Number(supplier.irpfRetention) > 0 && (
                      <span className="rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-bold px-2 py-0.5">IRPF {supplier.irpfRetention}%</span>
                    )}
                    {Number(supplier.ivaRetention) > 0 && (
                      <span className="rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-bold px-2 py-0.5">IVA ret. {supplier.ivaRetention}%</span>
                    )}
                 </div>

                 <div className="pt-4 border-t flex items-center justify-between">
                    <div>
                       <p className="text-[10px] font-bold text-muted-foreground uppercase">Balance Pendiente</p>
                       <p className={`text-lg font-black tracking-tighter ${supplier.balance > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                         €{supplier.balance.toFixed(2)}
                       </p>
                    </div>
                    <Button variant="ghost" size="sm" className="rounded-lg text-primary font-bold" onClick={() => setDetailSupplier(supplier)}>Detalle</Button>
                 </div>
               </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center space-y-2">
             <Building2 className="w-8 h-8 text-slate-300" />
             <p className="text-sm font-medium text-slate-500 uppercase tracking-tight">No hay proveedores en tu directorio</p>
          </div>
        )}
      </div>

      <Dialog open={!!detailSupplier} onOpenChange={(open) => { if (!open) setDetailSupplier(null) }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black tracking-tight">{detailSupplier?.name}</DialogTitle>
                <DialogDescription className="text-[10px] font-black uppercase tracking-widest">{detailSupplier?.taxId || 'SIN ID FISCAL'}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5"><Mail className="w-3 h-3" /> Email</p>
                <p className="text-sm font-medium">{detailSupplier?.email || 'No especificado'}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5"><Phone className="w-3 h-3" /> Teléfono</p>
                <p className="text-sm font-medium">{detailSupplier?.phone || 'No especificado'}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 space-y-1 col-span-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5"><MapPin className="w-3 h-3" /> Dirección</p>
                <p className="text-sm font-medium">{detailSupplier ? formatAddress(detailSupplier) : ''}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5"><Tag className="w-3 h-3" /> Categoría</p>
                <p className="text-sm font-medium">{detailSupplier?.category || 'Otros'}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5"><CreditCard className="w-3 h-3" /> Balance</p>
                <p className={`text-sm font-black tracking-tight ${detailSupplier?.balance > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                  €{Number(detailSupplier?.balance || 0).toFixed(2)}
                </p>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Registrado</p>
              <p className="text-sm font-medium">{new Date(detailSupplier?.createdAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Tipos de IVA aplicables</p>
                <Button variant="ghost" size="sm" disabled={detailSaving} onClick={saveDetailRates} className="rounded-lg text-primary font-bold h-7">
                  {detailSaving ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
              <IvaRatesEditor
                value={detailSupplier?.vatRates || []}
                onChange={vatRates => setDetailSupplier({ ...detailSupplier, vatRates })}
              />
              <p className="text-[10px] text-muted-foreground">Estos tipos se ofrecen al registrar un gasto de este proveedor.</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 space-y-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Trato fiscal (retenciones)</p>
              <FiscalRegimeEditor
                regime={detailSupplier?.fiscalRegime || 'EMPRESA'}
                irpfRetention={detailSupplier?.irpfRetention ?? 0}
                ivaRetention={detailSupplier?.ivaRetention ?? 0}
                onChange={({ fiscalRegime, irpfRetention, ivaRetention }) =>
                  setDetailSupplier({ ...detailSupplier, fiscalRegime, irpfRetention, ivaRetention })
                }
              />
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5"><Receipt className="w-3 h-3" /> Gastos recientes</p>
                {detailSupplier && (
                  <Link href={`/dashboard/finanzas/gastos?proveedor=${detailSupplier.id}`} className="text-[10px] font-bold text-primary hover:underline">
                    Ver todos →
                  </Link>
                )}
              </div>
              {expensesLoading ? (
                <p className="text-sm text-muted-foreground">Cargando gastos…</p>
              ) : supplierExpenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin gastos registrados todavía.</p>
              ) : (
                <div className="space-y-2">
                  {supplierExpenses.map(e => (
                    <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{e.description}</p>
                        <p className="text-[10px] text-muted-foreground">{new Date(e.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                      </div>
                      <span className="font-black tracking-tighter shrink-0">-€{Number(e.amount).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t pt-2 text-[10px] font-bold uppercase text-muted-foreground">
                    <span>Total (últimos {supplierExpenses.length})</span>
                    <span className="text-foreground font-black">-€{expensesTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
