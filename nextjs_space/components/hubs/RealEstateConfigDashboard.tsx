'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { RealEstateModuleNav } from '@/components/real-estate/RealEstateModuleNav'
import { EmbedSnippetCard } from '@/components/real-estate/EmbedSnippetCard'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MONEDAS_SELECCIONABLES } from '@/lib/moneda'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  Building2,
  Settings,
  LayoutDashboard,
  Globe,
  DollarSign,
  Percent,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Download,
  Eye,
  FileText,
  Hash,
  Sparkles,
  MapPin,
  TrendingUp,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { fondoHeroMarca } from '@/lib/real-estate/contraste'
import PortalAnalyticsPanel from '@/components/real-estate/PortalAnalyticsPanel'
import PortalBrandEditor from '@/components/real-estate/PortalBrandEditor'
import {
  PLANTILLAS_PORTAL,
  PLANTILLAS_PORTAL_INFO,
  normalizarPlantilla,
  type PlantillaPortal,
} from '@/lib/real-estate/portal-templates'

// ─── Types ────────────────────────────────────────────────────────────────────

type CommissionType = 'porcentaje_venta' | 'porcentaje_comision' | 'monto_fijo' | 'suscripcion_mensual'

const COMMISSION_TYPE_LABELS: Record<CommissionType, string> = {
  porcentaje_venta: 'Porcentaje sobre Venta',
  porcentaje_comision: 'Porcentaje sobre Comisión',
  monto_fijo: 'Monto Fijo',
  suscripcion_mensual: 'Suscripción Mensual',
}

const COMMISSION_TYPE_DESCRIPTIONS: Record<CommissionType, string> = {
  porcentaje_venta: '% del precio de venta total',
  porcentaje_comision: '% del valor de la operación',
  monto_fijo: 'Cantidad fija por operación',
  suscripcion_mensual: 'Cuota periódica mensual (ej. franquicias)',
}

interface RealEstateConfig {
  enabled: boolean
  defaultCurrency: string
  commissionType: CommissionType
  defaultCommissionPct: number
  defaultMonthlyFee: number
  defaultFixedFee: number
  defaultSplitAgent: number
  defaultSplitAgency: number
  portalSlug: string
  /** Slug público de la cuenta (lo devuelve /api/configuracion como `_tenantSlug`). */
  _tenantSlug?: string
  portalCustomDomain: string
  portalEnabled: boolean
  /** Hero de la portada: carrusel de fotos o bloque de color de marca. */
  plantillaPortal: PlantillaPortal
  /** Marca efectiva que devuelve /api/configuracion, para pintar las vistas previas. */
  _tenantBranding?: { primaryColor?: string; logoUrl?: string; companyName?: string }
  portalTheme: Record<string, any>
  exportFormats: string[]
  autoExportEnabled: boolean
  autoExportFormat: string
  fieldPresetApplied: boolean
  pipelineStagesCreated: boolean
  automationTemplatesCreated: boolean
  propertyCount: number
}

// ─── Helper Components ─────────────────────────────────────────────────────────

function StatusItem({
  icon: Icon,
  label,
  active,
  description,
}: {
  icon: any
  label: string
  active: boolean
  description: string
}) {
  return (
    <div className={`p-3 rounded-xl border ${active ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${active ? 'text-emerald-500' : 'text-amber-500'}`} />
        <span className="font-medium text-sm">{label}</span>
        <Badge
          variant={active ? 'success' : 'secondary'}
          className="ml-auto text-[9px] font-black uppercase"
        >
          {active ? 'Listo' : 'Pendiente'}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

/**
 * Miniatura de cada plantilla con los colores reales de la cuenta.
 *
 * No es un icono genérico: usa el color de marca como lo hará la portada
 * (incluido el ajuste de contraste), así que el panel enseña de verdad cómo
 * quedará el hero antes de guardar.
 */
function MiniaturaPlantilla({ plantilla, color }: { plantilla: PlantillaPortal; color: string }) {
  if (plantilla === 'marca') {
    const { base, fin, texto } = fondoHeroMarca(color)
    return (
      <div
        className="flex h-20 w-full flex-col justify-center gap-1.5 overflow-hidden rounded-md px-3"
        style={{ backgroundImage: `linear-gradient(135deg, ${base} 0%, ${fin} 100%)` }}
        aria-hidden="true"
      >
        <span className="h-1.5 w-10 rounded-full" style={{ backgroundColor: texto, opacity: 0.7 }} />
        <span className="h-2.5 w-24 rounded" style={{ backgroundColor: texto, opacity: 0.95 }} />
        <span className="h-1.5 w-16 rounded-full" style={{ backgroundColor: texto, opacity: 0.55 }} />
      </div>
    )
  }

  return (
    <div
      className="flex h-20 w-full items-end gap-2 overflow-hidden rounded-md bg-[linear-gradient(115deg,#94a3b8_0%,#334155_55%,#0f172a_100%)] px-3 pb-3"
      aria-hidden="true"
    >
      <span className="h-1.5 w-14 rounded-full bg-white/85" />
      <span className="h-1.5 w-6 rounded-full bg-white/45" />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RealEstateConfigDashboard() {
  const { data: session } = useSession() || {}

  const [config, setConfig] = useState<RealEstateConfig>({
    enabled: false,
    // La divisa real llega de la configuración guardada; hasta entonces el
    // select muestra su placeholder en vez de inventar un euro.
    defaultCurrency: '',
    commissionType: 'porcentaje_venta',
    defaultCommissionPct: 3,
    defaultMonthlyFee: 0,
    defaultFixedFee: 0,
    defaultSplitAgent: 50,
    defaultSplitAgency: 50,
    portalSlug: 'propiedades',
    portalCustomDomain: '',
    portalEnabled: true,
    plantillaPortal: 'foto',
    portalTheme: {},
    exportFormats: ['xml', 'csv'],
    autoExportEnabled: false,
    autoExportFormat: 'xml',
    fieldPresetApplied: false,
    pipelineStagesCreated: false,
    automationTemplatesCreated: false,
    propertyCount: 0,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmSetup, setConfirmSetup] = useState(false)
  const [setupLoading, setSetupLoading] = useState(false)

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const rawTab = searchParams.get('tab')
  const activeTab = rawTab && ['general', 'portal', 'commissions', 'export'].includes(rawTab)
    ? (rawTab as 'general' | 'portal' | 'commissions' | 'export')
    : 'general'

  const setActiveTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'general') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }
    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  // ─── Fetch Config ───────────────────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    try {
      const [statsRes, configRes] = await Promise.allSettled([
        fetch('/api/real-estate/dashboard-stats'),
        fetch('/api/configuracion?section=real_estate'),
      ])

      let propertyCount = 0
      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const statsData = await statsRes.value.json()
        propertyCount = statsData?.stats?.total || 0
      }

      if (configRes.status === 'fulfilled' && configRes.value.ok) {
        const cfg = await configRes.value.json()
        if (typeof cfg.exportFormats === 'string') {
          cfg.exportFormats = cfg.exportFormats.split(',').map((s: string) => s.trim())
        }
        setConfig(prev => ({
          ...prev,
          ...cfg,
          // La configuración guarda la clave en snake_case (`plantilla_portal`);
          // el estado del panel la usa en camelCase.
          plantillaPortal: normalizarPlantilla(cfg.plantilla_portal),
          propertyCount,
        }))
      } else {
        // Fallback: infer config from module status
        setConfig(prev => ({
          ...prev,
          propertyCount,
          enabled: propertyCount > 0,
        }))
      }
    } catch (error) {
      console.error('Error fetching real estate config:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  // ─── Save Config ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/configuracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'real_estate',
          data: {
            defaultCurrency: config.defaultCurrency,
            commissionType: config.commissionType,
            defaultCommissionPct: config.defaultCommissionPct,
            defaultMonthlyFee: config.defaultMonthlyFee,
            defaultFixedFee: config.defaultFixedFee,
            defaultSplitAgent: config.defaultSplitAgent,
            defaultSplitAgency: config.defaultSplitAgency,
            portalSlug: config.portalSlug,
            portalCustomDomain: config.portalCustomDomain,
            portalEnabled: config.portalEnabled,
            plantilla_portal: config.plantillaPortal,
            autoExportEnabled: config.autoExportEnabled,
            autoExportFormat: config.autoExportFormat,
            exportFormats: config.exportFormats,
          },
        }),
      })
      if (res.ok) {
        toast.success('Configuración guardada correctamente')
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al guardar configuración')
      }
    } catch {
      toast.error('Error de conexión al guardar')
    } finally {
      setSaving(false)
    }
  }

  // ─── Setup Module ───────────────────────────────────────────────────────────

  const handleSetupModule = async () => {
    setSetupLoading(true)
    try {
      const res = await fetch('/api/configuracion/real-estate/setup', {
        method: 'POST',
      })
      if (res.ok) {
        toast.success('Módulo inmobiliario configurado correctamente')
        setConfirmSetup(false)
        fetchConfig()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al configurar módulo')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSetupLoading(false)
    }
  }

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-8 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // ─── Module Status Card ─────────────────────────────────────────────────────

  const moduleActive = config.enabled || config.propertyCount > 0
  const setupComplete = config.fieldPresetApplied && config.pipelineStagesCreated

  return (
    <div className="space-y-8">
      <RealEstateModuleNav />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight uppercase italic">
              Configuración Inmobiliaria
            </h1>
            <p className="text-muted-foreground">
              Gestiona la configuración del portal de propiedades, comisiones y exportaciones
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/real-estate">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Abrir panel
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={fetchConfig}
            disabled={saving}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
            Recargar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </div>
      </motion.div>

      {/* Status Cards */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-4 gap-4"
      >
        <Card className={moduleActive
          ? 'bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20'
          : 'bg-gradient-to-br from-amber-500/10 to-transparent border-amber-500/20'
        }>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {moduleActive
                ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                : <AlertTriangle className="h-4 w-4 text-amber-500" />
              }
              Estado del Módulo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge
                variant={moduleActive ? 'success' : 'secondary'}
                className="uppercase text-[10px] font-black"
              >
                {moduleActive ? 'Activo' : 'Inactivo'}
              </Badge>
              {!setupComplete && moduleActive && (
                <Badge variant="outline" className="uppercase text-[10px] font-black text-amber-500 border-amber-500/30">
              Setup Pendiente
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {config.propertyCount > 0
                ? `${config.propertyCount} propiedades registradas`
                : 'Sin propiedades aún'
              }
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-500" />
              Portal Público
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge
                variant={config.portalEnabled ? 'success' : 'secondary'}
                className="uppercase text-[10px] font-black"
              >
                {config.portalEnabled ? 'Publicado' : 'Desactivado'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {config._tenantSlug ? `/p/${config._tenantSlug}` : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Percent className="h-4 w-4 text-indigo-500" />
              Comisión Default
            </CardTitle>
          </CardHeader>
          <CardContent>
            {config.commissionType === 'suscripcion_mensual' ? (
              <>
                <div className="text-2xl font-bold">{config.defaultMonthlyFee.toLocaleString()} {config.defaultCurrency}/mes</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Suscripción mensual — sin split
                </p>
              </>
            ) : config.commissionType === 'monto_fijo' ? (
              <>
                <div className="text-2xl font-bold">{config.defaultFixedFee.toLocaleString()} {config.defaultCurrency}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Monto Fijo · Split: {config.defaultSplitAgent}% agente / {config.defaultSplitAgency}% agencia
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">{config.defaultCommissionPct}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {COMMISSION_TYPE_LABELS[config.commissionType]}
                  {' · Split: '}{config.defaultSplitAgent}% agente / {config.defaultSplitAgency}% agencia
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Download className="h-4 w-4 text-amber-500" />
              Exportación
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge
                variant={config.autoExportEnabled ? 'success' : 'secondary'}
                className="uppercase text-[10px] font-black"
              >
                {config.autoExportEnabled ? 'Auto' : 'Manual'}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {config.exportFormats.join(', ').toUpperCase()}
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList className="h-10">
            <TabsTrigger value="general" className="text-xs font-bold uppercase flex items-center gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              General
            </TabsTrigger>
            <TabsTrigger value="portal" className="text-xs font-bold uppercase flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              Portal
            </TabsTrigger>
            <TabsTrigger value="commissions" className="text-xs font-bold uppercase flex items-center gap-1.5">
              <Percent className="h-3.5 w-3.5" />
              Comisiones
            </TabsTrigger>
            <TabsTrigger value="export" className="text-xs font-bold uppercase flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Exportación
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── TAB: General ── */}
        <TabsContent value="general" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Configuración Inicial
              </CardTitle>
              <CardDescription>
                El módulo inmobiliario extiende el Catálogo de productos para gestionar propiedades.
                Los campos personalizados y el pipeline se configuran automáticamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!setupComplete && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="font-semibold text-sm">Setup Incompleto</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Algunos componentes del módulo inmobiliario no están configurados.
                        Ejecuta el setup para crear los pipelines, presets de campos y automatizaciones base.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="default"
                    onClick={() => setConfirmSetup(true)}
                    disabled={setupLoading}
                  >
                    {setupLoading ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Configurando...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Ejecutar Setup Completo
                      </>
                    )}
                  </Button>
                </div>
              )}

              {setupComplete && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    <div>
                      <h4 className="font-semibold text-sm">Setup Completado</h4>
                      <p className="text-sm text-muted-foreground">
                        Pipeline de 6 etapas, presets de campos y automatizaciones configuradas.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Componentes del Módulo</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <StatusItem
                    icon={Hash}
                    label="Preset de Campos"
                    active={config.fieldPresetApplied}
                    description="Campos personalizados para inmuebles"
                  />
                  <StatusItem
                    icon={TrendingUp}
                    label="Pipeline Stages"
                    active={config.pipelineStagesCreated}
                    description="6 etapas del ciclo inmobiliario"
                  />
                  <StatusItem
                    icon={FileText}
                    label="Automatizaciones"
                    active={config.automationTemplatesCreated}
                    description="Recordatorios y tareas automáticas"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Moneda Predeterminada
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-w-xs space-y-2">
                <Label htmlFor="currency">Moneda</Label>
                <Select
                  value={config.defaultCurrency}
                  onValueChange={(v) => setConfig(prev => ({ ...prev, defaultCurrency: v }))}
                >
                  <SelectTrigger id="currency">
                    <SelectValue placeholder="Seleccionar moneda" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONEDAS_SELECCIONABLES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Moneda por defecto para nuevas propiedades
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: Portal ── */}
        <TabsContent value="portal" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-500" />
                Configuración del Portal Público
              </CardTitle>
              <CardDescription>
                El portal público muestra tus propiedades embebibles en tu web existente.
                Se sirve en /p/[slug]/propiedades.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="portal-enabled" className="text-sm font-medium">
                    Portal Público Habilitado
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Muestra las propiedades en el portal público
                  </p>
                </div>
                <Switch
                  id="portal-enabled"
                  checked={config.portalEnabled}
                  onCheckedChange={(v) => setConfig(prev => ({ ...prev, portalEnabled: v }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Plantilla de la portada</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {PLANTILLAS_PORTAL.map((plantilla) => {
                    const info = PLANTILLAS_PORTAL_INFO[plantilla]
                    const activa = config.plantillaPortal === plantilla
                    return (
                      <button
                        key={plantilla}
                        type="button"
                        onClick={() => setConfig(prev => ({ ...prev, plantillaPortal: plantilla }))}
                        aria-pressed={activa}
                        className={`rounded-xl border p-3 text-left transition ${
                          activa
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <MiniaturaPlantilla
                          plantilla={plantilla}
                          color={config._tenantBranding?.primaryColor || '#3b82f6'}
                        />
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-sm font-medium">{info.nombre}</span>
                          {activa && (
                            <Badge variant="success" className="ml-auto text-[9px] font-black uppercase">
                              Activa
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{info.descripcion}</p>
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  El texto del hero se ajusta solo al color de marca para no perder legibilidad.
                  La vista previa se publica al guardar.
                </p>
              </div>

              <PortalBrandEditor plantilla={config.plantillaPortal} />

              <PortalAnalyticsPanel />

              <div className="space-y-2">
                <Label htmlFor="portal-slug">Alias del portal (opcional)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground font-mono">/p/</span>
                  <Input
                    id="portal-slug"
                    value={config.portalSlug}
                    onChange={(e) => setConfig(prev => ({ ...prev, portalSlug: e.target.value }))}
                    className="max-w-xs font-mono"
                    placeholder="mi-oficina"
                  />
                  <span className="text-sm text-muted-foreground font-mono">/propiedades</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Dirección de tu portal:{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    /p/{config._tenantSlug || 'tu-slug'}
                  </code>
                  . El alias es opcional, debe ser único en la plataforma y responde en
                  paralelo.
                </p>
              </div>

              <Separator />
              <div className="space-y-3">
                <Label htmlFor="portal-custom-domain" className="text-sm font-medium">
                  <Globe className="h-4 w-4 inline-block mr-1.5 -mt-0.5 text-muted-foreground" />
                  Dominio Personalizado
                </Label>
                <Input
                  id="portal-custom-domain"
                  value={config.portalCustomDomain}
                  onChange={(e) => setConfig(prev => ({ ...prev, portalCustomDomain: e.target.value }))}
                  className="max-w-sm font-mono"
                  placeholder="propiedades.tudominio.com"
                />
                <p className="text-xs text-muted-foreground">
                  Crea un registro CNAME apuntando tu dominio a <code className="text-xs bg-muted px-1 py-0.5 rounded">{process.env.NEXT_PUBLIC_APP_URL?.replace(/https?:\/\//, '') || 'volkern.app'}</code>
                </p>
                <p className="text-xs text-muted-foreground">
                  El portal se servirá en <code className="text-xs bg-muted px-1 py-0.5 rounded">{config.portalCustomDomain || 'tu-dominio.com'}</code>
                </p>
              </div>

              {config.portalEnabled && (
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-3">
                    <Eye className="h-5 w-5 text-blue-500 shrink-0" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm">Portal Publicado</h4>
                      <p className="text-xs text-muted-foreground">
                        La portada con las propiedades de la cuenta vive en /p/{config._tenantSlug}; el catálogo completo, en /p/{config._tenantSlug}/propiedades
                      </p>
                    </div>
                    {config._tenantSlug ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/p/${config._tenantSlug}`} target="_blank">
                          <ExternalLink className="h-3.5 w-3.5 mr-1" />
                          Ver Portal
                        </a>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled title="Cargando los datos de tu cuenta">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        Ver Portal
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <EmbedSnippetCard tenantId={session?.user?.tenantId} className="border-l-4 border-l-primary" />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Mapa y Ubicación
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Las propiedades con coordenadas (latitud/longitud) muestran un mapa interactivo
                en la página de detalle usando OpenStreetMap embebido. Las coordenadas se configuran
                por propiedad en los campos personalizados.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: Commissions ── */}
        <TabsContent value="commissions" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5 text-indigo-500" />
                Configuración de Comisiones
              </CardTitle>
              <CardDescription>
                Define el tipo y los valores de comisión por defecto para nuevas operaciones.
                Se pueden ajustar por transacción individual.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Tipo de Comisión */}
              <div className="space-y-2">
                <Label htmlFor="commission-type">Tipo de Comisión Default</Label>
                <Select
                  value={config.commissionType}
                  onValueChange={(v) => setConfig(prev => ({ ...prev, commissionType: v as CommissionType }))}
                >
                  <SelectTrigger id="commission-type" className="max-w-xs">
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="porcentaje_venta">Porcentaje sobre Venta</SelectItem>
                    <SelectItem value="porcentaje_comision">Porcentaje sobre Comisión</SelectItem>
                    <SelectItem value="monto_fijo">Monto Fijo</SelectItem>
                    <SelectItem value="suscripcion_mensual">Suscripción Mensual</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {COMMISSION_TYPE_DESCRIPTIONS[config.commissionType]}
                </p>
              </div>

              {/* Campos según tipo */}
              {config.commissionType === 'suscripcion_mensual' ? (
                <div className="space-y-2">
                  <Label htmlFor="monthly-fee">
                    Cuota Mensual ({config.defaultCurrency})
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="monthly-fee"
                      type="number"
                      min={0}
                      step={10}
                      value={config.defaultMonthlyFee}
                      onChange={(e) => setConfig(prev => ({
                        ...prev,
                        defaultMonthlyFee: parseFloat(e.target.value) || 0,
                      }))}
                      className="max-w-[160px]"
                    />
                    <span className="text-sm text-muted-foreground">/mes</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ideal para franquicias que cobran una suscripción periódica en lugar de comisión por venta
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="commission-pct">
                      {config.commissionType === 'monto_fijo' ? 'Monto Fijo' : 'Porcentaje'}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="commission-pct"
                        type="number"
                        min={0}
                        max={config.commissionType === 'monto_fijo' ? 999999999 : 100}
                        step={config.commissionType === 'monto_fijo' ? 50 : 0.5}
                        value={config.commissionType === 'monto_fijo' ? config.defaultFixedFee : config.defaultCommissionPct}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          if (config.commissionType === 'monto_fijo') {
                            setConfig(prev => ({ ...prev, defaultFixedFee: val }))
                          } else {
                            setConfig(prev => ({ ...prev, defaultCommissionPct: val }))
                          }
                        }}
                        className="max-w-[160px]"
                      />
                      {config.commissionType !== 'monto_fijo' && (
                        <Percent className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {config.commissionType === 'monto_fijo'
                        ? 'Cantidad fija por operación cerrada'
                        : `Valor basado en el ${COMMISSION_TYPE_LABELS[config.commissionType].toLowerCase()}`
                      }
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Split Agente / Agencia</Label>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">Agente:</span>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={config.defaultSplitAgent}
                          onChange={(e) => {
                            const agentVal = parseInt(e.target.value) || 0
                            setConfig(prev => ({
                              ...prev,
                              defaultSplitAgent: agentVal,
                              defaultSplitAgency: 100 - agentVal,
                            }))
                          }}
                          className="max-w-[80px]"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                      <span className="text-muted-foreground">/</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">Agencia:</span>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={config.defaultSplitAgency}
                          onChange={(e) => {
                            const agencyVal = parseInt(e.target.value) || 0
                            setConfig(prev => ({
                              ...prev,
                              defaultSplitAgency: agencyVal,
                              defaultSplitAgent: 100 - agencyVal,
                            }))
                          }}
                          className="max-w-[80px]"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cómo se distribuye la comisión entre agente y agencia
                    </p>
                  </div>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Tipos de Comisión Soportados</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-muted/50">
                    <p className="font-medium text-sm">Porcentaje sobre Venta</p>
                    <p className="text-xs text-muted-foreground mt-1">% del precio de venta total</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50">
                    <p className="font-medium text-sm">Porcentaje sobre Comisión</p>
                    <p className="text-xs text-muted-foreground mt-1">% del valor de la operación</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50">
                    <p className="font-medium text-sm">Monto Fijo</p>
                    <p className="text-xs text-muted-foreground mt-1">Cantidad fija por operación</p>
                  </div>
                  <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500/10 to-transparent border-indigo-500/20">
                    <p className="font-medium text-sm text-indigo-600 dark:text-indigo-400">Suscripción Mensual</p>
                    <p className="text-xs text-muted-foreground mt-1">Cuota periódica mensual — para franquicias</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: Export ── */}
        <TabsContent value="export" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5 text-amber-500" />
                Exportación a Portales
              </CardTitle>
              <CardDescription>
                Genera feeds de propiedades en formatos compatibles con portales inmobiliarios.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-export" className="text-sm font-medium">
                    Exportación Automática
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Genera feeds automáticamente (requiere configuración CRON)
                  </p>
                </div>
                <Switch
                  id="auto-export"
                  checked={config.autoExportEnabled}
                  onCheckedChange={(v) => setConfig(prev => ({ ...prev, autoExportEnabled: v }))}
                />
              </div>

              {config.autoExportEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="export-format">Formato por Defecto</Label>
                  <Select
                    value={config.autoExportFormat}
                    onValueChange={(v) => setConfig(prev => ({ ...prev, autoExportFormat: v }))}
                  >
                    <SelectTrigger id="export-format" className="max-w-xs">
                      <SelectValue placeholder="Seleccionar formato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="xml">XML Idealista</SelectItem>
                      <SelectItem value="csv">CSV Fotocasa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />

              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Formatos Soportados</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-muted/30 border">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-sm">XML Idealista</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Feed XML compatible con Idealista. Incluye datos estructurados de cada propiedad.
                    </p>
                    <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" asChild>
                      <a href="/api/real-estate/export?format=xml" target="_blank">
                        <Download className="h-3 w-3 mr-1" />
                        Descargar XML
                      </a>
                    </Button>
                  </div>

                  <div className="p-4 rounded-xl bg-muted/30 border">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-4 w-4 text-emerald-500" />
                      <span className="font-medium text-sm">CSV Fotocasa</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Archivo CSV compatible con Fotocasa. Columnas estándar del sector.
                    </p>
                    <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" asChild>
                      <a href="/api/real-estate/export?format=csv" target="_blank">
                        <Download className="h-3 w-3 mr-1" />
                        Descargar CSV
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Confirm Setup Dialog ── */}
      <AlertDialog open={confirmSetup} onOpenChange={setConfirmSetup}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Configurar Módulo Inmobiliario
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esto creará:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Pipeline de 6 etapas (Contacto → Cerrado)
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Presets de campos personalizados
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Automatizaciones base
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Esta operación es segura e idempotente. No modificará datos existentes.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSetupModule} disabled={setupLoading}>
              {setupLoading ? 'Configurando...' : 'Confirmar Setup'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
