'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, FlaskConical, Trophy, Play, XCircle, Trash2, BarChart3, Plus } from 'lucide-react'
import { toast } from 'sonner'

type ABTestStatus = 'DRAFT' | 'RUNNING' | 'COMPLETED' | 'CANCELLED'

type ABTestMetric = 'CTR' | 'CPC' | 'CPA' | 'ROAS' | 'CONVERSIONS'

interface VariantStats {
  id: string
  label: string
  trafficAllocation: number
  impressions: number
  clicks: number
  conversions: number
  spend: number
  currentMetric: number
}

interface ABTest {
  id: string
  name: string
  status: ABTestStatus
  metric: ABTestMetric
  significanceThreshold: number
  autoDeclare: boolean
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  winnerVariantId: string | null
  variants: VariantStats[]
}

interface SignificanceResult {
  chiSquare: number
  pValue: number
  confidence: number
  winnerVariantId: string | null
  winnerLabel: string | null
  significant: boolean
}

const METRIC_LABELS: Record<ABTestMetric, string> = {
  CTR: 'CTR',
  CPC: 'CPC',
  CPA: 'CPA',
  ROAS: 'ROAS',
  CONVERSIONS: 'Conversiones',
}

const STATUS_LABELS: Record<ABTestStatus, string> = {
  DRAFT: 'Borrador',
  RUNNING: 'Activa',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
}

const STATUS_STYLES: Record<ABTestStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  RUNNING: 'bg-green-50 text-green-700 border-green-200',
  COMPLETED: 'bg-blue-50 text-blue-700 border-blue-200',
  CANCELLED: 'bg-red-50 text-red-600 border-red-200',
}

const DEFAULT_LABELS = ['A', 'B', 'C', 'D', 'E']

export function AdABTestManager({ campaignId }: { campaignId: string }) {
  const [tests, setTests] = useState<ABTest[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [significanceOpen, setSignificanceOpen] = useState(false)
  const [significanceData, setSignificanceData] = useState<SignificanceResult | null>(null)
  const [significanceLoading, setSignificanceLoading] = useState(false)

  // Create form state
  const [newName, setNewName] = useState('')
  const [newMetric, setNewMetric] = useState<ABTestMetric>('CTR')
  const [newThreshold, setNewThreshold] = useState('0.95')
  const [newAutoDeclare, setNewAutoDeclare] = useState(false)
  const [newVariants, setNewVariants] = useState<{ label: string; trafficAllocation: number }[]>([
    { label: 'A', trafficAllocation: 50 },
    { label: 'B', trafficAllocation: 50 },
  ])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchTests()
  }, [campaignId])

  async function fetchTests() {
    try {
      setLoading(true)
      const res = await fetch(`/api/ads/ab-tests?campaignId=${campaignId}`)
      if (!res.ok) throw new Error('Error al cargar pruebas A/B')
      const data = await res.json()
      setTests(Array.isArray(data) ? data : data.tests || data.records || [])
    } catch {
      setTests([])
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    const totalAllocation = newVariants.reduce((s, v) => s + (v.trafficAllocation || 0), 0)
    if (Math.abs(totalAllocation - 100) > 0.01) {
      toast.error('La asignación de tráfico debe sumar 100%')
      return
    }
    try {
      setCreating(true)
      const res = await fetch('/api/ads/ab-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          name: newName.trim(),
          metric: newMetric,
          significanceThreshold: parseFloat(newThreshold),
          autoDeclare: newAutoDeclare,
          variants: newVariants.map(v => ({
            label: v.label,
            trafficAllocation: v.trafficAllocation,
          })),
        }),
      })
      if (!res.ok) throw new Error('Error al crear prueba')
      toast.success('Prueba A/B creada')
      setCreateOpen(false)
      resetForm()
      fetchTests()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setCreating(false)
    }
  }

  function resetForm() {
    setNewName('')
    setNewMetric('CTR')
    setNewThreshold('0.95')
    setNewAutoDeclare(false)
    setNewVariants([
      { label: 'A', trafficAllocation: 50 },
      { label: 'B', trafficAllocation: 50 },
    ])
  }

  async function handleActivate(testId: string) {
    try {
      const res = await fetch(`/api/ads/ab-tests/${testId}/activate`, { method: 'POST' })
      if (!res.ok) throw new Error('Error al activar prueba')
      toast.success('Prueba activada')
      fetchTests()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido')
    }
  }

  async function handleCancel(testId: string) {
    try {
      const res = await fetch(`/api/ads/ab-tests/${testId}/cancel`, { method: 'POST' })
      if (!res.ok) throw new Error('Error al cancelar prueba')
      toast.success('Prueba cancelada')
      fetchTests()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido')
    }
  }

  async function handleDelete(testId: string) {
    if (!confirm('¿Eliminar esta prueba A/B definitivamente?')) return
    try {
      const res = await fetch(`/api/ads/ab-tests/${testId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar prueba')
      toast.success('Prueba eliminada')
      fetchTests()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido')
    }
  }

  async function handleViewSignificance(testId: string) {
    try {
      setSignificanceLoading(true)
      setSignificanceOpen(true)
      const res = await fetch(`/api/ads/ab-tests/${testId}/significance`)
      if (!res.ok) throw new Error('Error al calcular significancia')
      const data = await res.json()
      setSignificanceData(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido')
      setSignificanceOpen(false)
    } finally {
      setSignificanceLoading(false)
    }
  }

  async function handleDeclareWinner(testId: string) {
    if (!confirm('¿Declarar ganador de esta prueba? La variante ganadora se aplicará automáticamente.')) return
    try {
      const res = await fetch(`/api/ads/ab-tests/${testId}/declare-winner`, { method: 'POST' })
      if (!res.ok) throw new Error('Error al declarar ganador')
      toast.success('Ganador declarado correctamente')
      fetchTests()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido')
    }
  }

  function addVariant() {
    const nextIndex = newVariants.length
    if (nextIndex >= DEFAULT_LABELS.length) return
    const remaining = 100 - newVariants.reduce((s, v) => s + (v.trafficAllocation || 0), 0)
    const alloc = Math.max(0, remaining / (DEFAULT_LABELS.length - nextIndex))
    setNewVariants([...newVariants, { label: DEFAULT_LABELS[nextIndex], trafficAllocation: Math.round(alloc * 100) / 100 }])
  }

  function updateVariant(index: number, field: 'label' | 'trafficAllocation', value: string | number) {
    const updated = newVariants.map((v, i) => (i === index ? { ...v, [field]: value } : v))
    setNewVariants(updated)
  }

  function removeVariant(index: number) {
    if (newVariants.length <= 2) return
    setNewVariants(newVariants.filter((_, i) => i !== index))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-purple-500" />
          <h3 className="text-lg font-bold">Pruebas A/B</h3>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Crear Prueba
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nueva Prueba A/B</DialogTitle>
              <DialogDescription>
                Define las variantes y la métrica para comparar el rendimiento de tus anuncios.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="test-name">Nombre de la prueba</Label>
                <Input
                  id="test-name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Ej: Prueba de creativo Q3"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-metric">Métrica principal</Label>
                <Select value={newMetric} onValueChange={v => setNewMetric(v as ABTestMetric)}>
                  <SelectTrigger id="test-metric">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(METRIC_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-threshold">Umbral de significancia</Label>
                <Input
                  id="test-threshold"
                  type="number"
                  step="0.01"
                  min="0.5"
                  max="0.999"
                  value={newThreshold}
                  onChange={e => setNewThreshold(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="test-auto" className="font-medium">Declarar ganador automáticamente</Label>
                  <p className="text-xs text-muted-foreground">Al alcanzar significancia estadística</p>
                </div>
                <Switch
                  id="test-auto"
                  checked={newAutoDeclare}
                  onCheckedChange={setNewAutoDeclare}
                />
              </div>

              {/* Variants */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Variantes</Label>
                  {newVariants.length < DEFAULT_LABELS.length && (
                    <Button variant="ghost" size="sm" onClick={addVariant}>
                      <Plus className="h-3 w-3 mr-1" /> Añadir
                    </Button>
                  )}
                </div>
                {newVariants.map((variant, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      className="w-16 text-center font-mono"
                      value={variant.label}
                      onChange={e => updateVariant(i, 'label', e.target.value)}
                      placeholder={DEFAULT_LABELS[i]}
                    />
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={variant.trafficAllocation}
                        onChange={e => updateVariant(i, 'trafficAllocation', parseFloat(e.target.value) || 0)}
                        className="w-20 text-center font-mono"
                      />
                      <Progress
                        value={variant.trafficAllocation}
                        className="flex-1 h-2"
                      />
                      <span className="text-xs text-muted-foreground w-8 text-right font-mono">
                        {variant.trafficAllocation}%
                      </span>
                    </div>
                    {newVariants.length > 2 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => removeVariant(i)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Asignación total:{' '}
                  <span className="font-mono font-medium">
                    {newVariants.reduce((s, v) => s + (v.trafficAllocation || 0), 0).toFixed(1)}%
                  </span>
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm() }}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Crear Prueba
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Test list */}
      {tests.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No hay pruebas A/B para esta campaña. Crea una prueba para empezar a comparar variantes.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {tests.map(test => {
            const isRunning = test.status === 'RUNNING'
            const isCompleted = test.status === 'COMPLETED'
            const isDraft = test.status === 'DRAFT'

            return (
              <Card key={test.id} className={`border shadow-sm ${isCompleted ? 'border-blue-200' : ''}`}>
                <CardHeader className="pb-3 flex flex-row items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm font-bold">{test.name}</CardTitle>
                      <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[test.status]}`}>
                        {STATUS_LABELS[test.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Métrica: {METRIC_LABELS[test.metric]} · Creada: {new Date(test.createdAt).toLocaleDateString('es-MX')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {isDraft && (
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleActivate(test.id)}>
                        <Play className="h-3 w-3 mr-1" /> Activar
                      </Button>
                    )}
                    {isRunning && (
                      <>
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleViewSignificance(test.id)}>
                          <BarChart3 className="h-3 w-3 mr-1" /> Ver Significancia
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleDeclareWinner(test.id)}>
                          <Trophy className="h-3 w-3 mr-1" /> Declarar Ganador
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleCancel(test.id)}>
                          <XCircle className="h-4 w-4 text-amber-500" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(test.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[11px] font-bold uppercase w-12">Variante</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase text-right">Tráfico</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase text-right">Impresiones</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase text-right">Clics</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase text-right">Conversiones</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase text-right">Inversión</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase text-right">{METRIC_LABELS[test.metric]}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {test.variants.map(v => {
                        const isWinner = isCompleted && v.id === test.winnerVariantId
                        return (
                          <TableRow key={v.id} className={isWinner ? 'bg-blue-50/50' : ''}>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-sm">{v.label}</span>
                                {isWinner && (
                                  <Trophy className="h-3.5 w-3.5 text-amber-500" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="font-mono text-xs">{v.trafficAllocation}%</span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {v.impressions.toLocaleString('es-MX')}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {v.clicks.toLocaleString('es-MX')}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {v.conversions.toLocaleString('es-MX')}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              ${v.spend.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs font-bold">
                              {test.metric === 'CTR'
                                ? `${v.currentMetric.toFixed(2)}%`
                                : test.metric === 'ROAS'
                                  ? `${v.currentMetric.toFixed(2)}x`
                                  : `$${v.currentMetric.toFixed(2)}`}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Significance modal */}
      <Dialog open={significanceOpen} onOpenChange={setSignificanceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resultado de Significancia</DialogTitle>
            <DialogDescription>
              Análisis estadístico basado en chi-cuadrado para determinar la significancia de la prueba.
            </DialogDescription>
          </DialogHeader>
          {significanceLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary opacity-20" />
            </div>
          ) : significanceData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Card className="border shadow-sm bg-slate-50">
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-slate-500">Chi-cuadrado</p>
                    <p className="text-lg font-mono font-bold text-slate-800">{significanceData.chiSquare.toFixed(4)}</p>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm bg-slate-50">
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-slate-500">Valor p</p>
                    <p className="text-lg font-mono font-bold text-slate-800">{significanceData.pValue.toFixed(4)}</p>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm bg-slate-50">
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-slate-500">Confianza</p>
                    <p className="text-lg font-mono font-bold text-slate-800">
                      {(significanceData.confidence * 100).toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
                <Card className={`border shadow-sm ${significanceData.significant ? 'bg-green-50' : 'bg-amber-50'}`}>
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-slate-500">Significativo</p>
                    <p className={`text-lg font-bold ${significanceData.significant ? 'text-green-600' : 'text-amber-600'}`}>
                      {significanceData.significant ? 'Sí' : 'No'}
                    </p>
                  </CardContent>
                </Card>
              </div>
              {significanceData.winnerLabel && (
                <Card className={`border shadow-sm ${significanceData.significant ? 'bg-blue-50 border-blue-200' : 'border-slate-200'}`}>
                  <CardContent className="p-3 flex items-center gap-2">
                    <Trophy className={`h-5 w-5 ${significanceData.significant ? 'text-amber-500' : 'text-slate-400'}`} />
                    <div>
                      <p className="text-xs text-muted-foreground">Ganador sugerido</p>
                      <p className="font-bold text-sm">Variante {significanceData.winnerLabel}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {!significanceData.significant && (
                <p className="text-xs text-muted-foreground text-center">
                  La prueba aún no alcanza significancia estadística. Deja que acumule más datos.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No se pudieron obtener los resultados.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignificanceOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
