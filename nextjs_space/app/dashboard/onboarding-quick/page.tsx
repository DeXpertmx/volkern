'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2, CheckCircle2, MessageCircle, ArrowRight, Bot, Zap,
  Building2, Calculator, FileKey, Users, Upload, LayoutGrid, CheckSquare, Square,
  PenTool, GraduationCap, Factory, UserCheck,
} from 'lucide-react'
import {
  MODULE_GROUPS,
  PERFIL_SUGGESTED_MODULES,
  type ModuleGroup,
} from '@/lib/onboarding-modules'

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

type VerticalProfile = 'crm_ventas' | 'agencia_marketing' | 'academia' | 'asesoria_contable' | 'rrhh' | 'inmobiliaria' | 'industria' | 'facturacion' | 'gestoria' | 'general'

const VERTICAL_CARDS: { id: VerticalProfile; title: string; subtitle: string; icon: React.ElementType; color: string; bgClass: string; borderColor: string }[] = [
  { id: 'crm_ventas', title: 'CRM Ventas', subtitle: 'Pipeline que convierte', icon: Zap, color: 'cyan', bgClass: 'from-cyan-500/20 to-sky-500/10 border-cyan-500/30 hover:border-cyan-400', borderColor: 'border-cyan-400' },
  { id: 'agencia_marketing', title: 'Agencia de Marketing', subtitle: 'Automatización multicanal', icon: PenTool, color: 'purple', bgClass: 'from-purple-500/20 to-violet-500/10 border-purple-500/30 hover:border-purple-400', borderColor: 'border-purple-400' },
  { id: 'academia', title: 'Academia LMS', subtitle: 'Educación que escala', icon: GraduationCap, color: 'amber', bgClass: 'from-amber-500/20 to-yellow-500/10 border-amber-500/30 hover:border-amber-400', borderColor: 'border-amber-400' },
  { id: 'asesoria_contable', title: 'Asesoría Contable', subtitle: 'Digitaliza tu gestoría', icon: Calculator, color: 'blue', bgClass: 'from-blue-500/20 to-indigo-500/10 border-blue-500/30 hover:border-blue-400', borderColor: 'border-blue-400' },
  { id: 'rrhh', title: 'RRHH', subtitle: 'Capital humano inteligente', icon: UserCheck, color: 'rose', bgClass: 'from-rose-500/20 to-pink-500/10 border-rose-500/30 hover:border-rose-400', borderColor: 'border-rose-400' },
  { id: 'inmobiliaria', title: 'Inmobiliaria', subtitle: 'ERP inmobiliario completo', icon: Building2, color: 'emerald', bgClass: 'from-emerald-500/20 to-green-500/10 border-emerald-500/30 hover:border-emerald-400', borderColor: 'border-emerald-400' },
  { id: 'industria', title: 'Industria', subtitle: 'ERP industrial completo', icon: Factory, color: 'orange', bgClass: 'from-orange-500/20 to-amber-500/10 border-orange-500/30 hover:border-orange-400', borderColor: 'border-orange-400' },
  { id: 'facturacion', title: 'Facturación', subtitle: 'Facturas y cobros sin estrés', icon: Calculator, color: 'green', bgClass: 'from-green-500/20 to-emerald-500/10 border-green-500/30 hover:border-green-400', borderColor: 'border-green-400' },
]

const VERTICAL_COLORS: Record<string, { gradient: string; iconBg: string; iconColor: string }> = {
  cyan: { gradient: 'bg-gradient-to-r from-cyan-600 to-sky-600', iconBg: 'bg-cyan-500/20', iconColor: 'text-cyan-400' },
  purple: { gradient: 'bg-gradient-to-r from-purple-600 to-violet-600', iconBg: 'bg-purple-500/20', iconColor: 'text-purple-400' },
  amber: { gradient: 'bg-gradient-to-r from-amber-600 to-yellow-600', iconBg: 'bg-amber-500/20', iconColor: 'text-amber-400' },
  blue: { gradient: 'bg-gradient-to-r from-blue-600 to-indigo-600', iconBg: 'bg-blue-500/20', iconColor: 'text-blue-400' },
  rose: { gradient: 'bg-gradient-to-r from-rose-600 to-pink-600', iconBg: 'bg-rose-500/20', iconColor: 'text-rose-400' },
  emerald: { gradient: 'bg-gradient-to-r from-emerald-600 to-green-600', iconBg: 'bg-emerald-500/20', iconColor: 'text-emerald-400' },
  orange: { gradient: 'bg-gradient-to-r from-orange-600 to-amber-600', iconBg: 'bg-orange-500/20', iconColor: 'text-orange-400' },
  green: { gradient: 'bg-gradient-to-r from-green-600 to-emerald-600', iconBg: 'bg-green-500/20', iconColor: 'text-green-400' },
}

export default function OnboardingQuickPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState('')
  const [botUsername, setBotUsername] = useState('')
  const [polling, setPolling] = useState(false)
  const [provisionError, setProvisionError] = useState<string | null>(null)
  const [perfil, setPerfil] = useState<VerticalProfile | null>(null)
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['CRM Esencial']))
  const [nif, setNif] = useState('')
  const [nombreEmpresa, setNombreEmpresa] = useState('')
  const [pgcPlan, setPgcPlan] = useState('PYMES')
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear().toString())
  const [ivaDefecto, setIvaDefecto] = useState('21')

  const provisionStarted = useRef(false)
  const pollingInterval = useRef<NodeJS.Timeout>()
  const firstMessageMarked = useRef(false)

  // Pre-select vertical from signup query param
  useEffect(() => {
    const verticalParam = searchParams.get('vertical')
    if (verticalParam && PERFIL_SUGGESTED_MODULES[verticalParam]) {
      handleSelectProfile(verticalParam as VerticalProfile)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    if (step === 2 && !provisionStarted.current) {
      provisionStarted.current = true
      handleProvision()
    }
  }, [step])

  useEffect(() => {
    if (step === 5) startPolling()
    return () => {
      setPolling(false)
      if (pollingInterval.current) clearInterval(pollingInterval.current)
    }
  }, [step])

  const startPolling = () => {
    setPolling(true)
    pollingInterval.current = setInterval(async () => {
      try {
        const res = await fetch('/api/onboarding/check-first-message')
        if (res.ok) {
          const data = await res.json()
          if (data.hasFirstMessage) {
            // El GET es lectura pura; marcar "primer mensaje visto" es una
            // escritura que ahora vive en un POST idempotente (una sola vez).
            if (!firstMessageMarked.current) {
              firstMessageMarked.current = true
              fetch('/api/onboarding/check-first-message', { method: 'POST' }).catch(() => {})
            }
            setPolling(false)
            if (pollingInterval.current) clearInterval(pollingInterval.current)
            if (perfil === 'gestoria' || perfil === 'asesoria_contable') setStep(6)
            else router.push('/dashboard')
          }
        }
      } catch {}
    }, 3000)
  }

  const toggleModule = (id: string) => {
    setSelectedModules(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  const selectAllInGroup = (group: ModuleGroup) => {
    setSelectedModules(prev => {
      const next = new Set(prev)
      group.modules.forEach(m => next.add(m.id))
      return next
    })
  }

  const handleStartOnboarding = async () => {
    // Save module selection
    try {
      const res = await fetch('/api/onboarding/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'modules', modules: Array.from(selectedModules) })
      })
      if (!res.ok) {
        console.warn('[Onboarding] Error al guardar módulos, continuando de todas formas')
      }
    } catch (err) {
      console.warn('[Onboarding] Error de red al guardar módulos:', err)
    }
    setStep(2)
  }

  const handleSelectProfile = (p: VerticalProfile) => {
    setPerfil(p)
    // Pre-select suggested modules based on profile
    const suggested = PERFIL_SUGGESTED_MODULES[p] || []
    setSelectedModules(new Set(suggested))
    // Expand relevant groups based on vertical
    const erpVerticals: VerticalProfile[] = ['asesoria_contable', 'gestoria', 'industria', 'rrhh', 'inmobiliaria']
    const marketingVerticals: VerticalProfile[] = ['agencia_marketing', 'crm_ventas', 'academia']
    const groups = new Set(['CRM Esencial', 'Ventas y Documentos', 'Comunicación'])
    if (erpVerticals.includes(p)) groups.add('Contabilidad y ERP')
    if (marketingVerticals.includes(p)) groups.add('Marketing')
    setExpandedGroups(groups)
  }

  const handleProvision = async () => {
    setLoading(true)
    setProvisionError(null)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 20000)
      const res = await fetch('/api/onboarding/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'provision' }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const data = await res.json().catch(() => ({}))
      if (data?.success) {
        // El canal de mensajería (Chatwoot) es best-effort: si falló, se avisa
        // suave y el onboarding continúa (se puede configurar después).
        if (data?.chatwootWarning) {
          toast.warning(data.chatwootWarning)
        }
        setStep(3)
      }
      else {
        const msg = data?.error || 'Error al preparar el espacio de trabajo'
        setProvisionError(msg)
        toast.error(msg)
      }
    } catch (err: any) {
      const msg = err?.name === 'AbortError'
        ? 'La conexión está tardando demasiado.'
        : err?.message || 'Error de conexión.'
      setProvisionError(msg)
      toast.error(msg)
    } finally { setLoading(false) }
  }

  const handleConnectTelegram = async () => {
    if (!token) { toast.error('Ingresa el token del bot'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: token })
      })
      const data = await res.json()
      if (res.ok) { setBotUsername(data.botInfo.username); setStep(5) }
      else toast.error(data.error || 'Error al conectar')
    } catch { toast.error('Error de conexión') }
    finally { setLoading(false) }
  }

  const handleAccountingSetup = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding/accounting-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgcPlan, fiscalYear: parseInt(fiscalYear), ivaDefecto: parseInt(ivaDefecto) })
      })
      const data = await res.json()
      if (res.ok) setStep(7)
      else toast.error(data.error || 'Error en configuración contable')
    } catch { toast.error('Error de conexión') }
    finally { setLoading(false) }
  }

  const handleComplete = async () => {
    try {
      await fetch('/api/onboarding/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'complete' })
      })
    } catch {}
    router.push('/dashboard')
  }

  const cardClass = "bg-white/10 backdrop-blur border-white/20"

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step-1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <Card className={cardClass}>
                <CardContent className="p-8">
                  <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-purple-500/30">
                    <Zap className="h-10 w-10 text-white" />
                  </div>
                  <h1 className="text-3xl font-bold text-white text-center mb-3">Bienvenido a Volkern</h1>
                  <p className="text-slate-300 text-center mb-8">Configuremos tu espacio de trabajo en menos de 2 minutos</p>

                  <div className="mb-6">
                    <p className="text-sm text-slate-400 mb-3">¿Cuál es tu vertical?</p>
                    <div className="grid grid-cols-1 gap-2 max-h-[360px] overflow-y-auto pr-1">
                      {VERTICAL_CARDS.map(v => {
                        const Icon = v.icon
                        const colors = VERTICAL_COLORS[v.color]
                        const isSelected = perfil === v.id
                        return (
                          <motion.div key={v.id} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                            <Card
                              className={`p-3 cursor-pointer transition-all border ${isSelected ? `bg-gradient-to-r ${v.bgClass} ${v.borderColor} shadow-lg` : `bg-slate-800/50 border-slate-700 ${v.bgClass}`}`}
                              onClick={() => handleSelectProfile(v.id)}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.iconBg}`}>
                                  <Icon className={`h-5 w-5 ${colors.iconColor}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-white text-sm">{v.title}</p>
                                  <p className="text-xs text-slate-400 truncate">{v.subtitle}</p>
                                </div>
                                {isSelected && (
                                  <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                                  </div>
                                )}
                              </div>
                            </Card>
                          </motion.div>
                        )
                      })}
                    </div>
                  </div>

                  {perfil && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6">
                      {(perfil === 'asesoria_contable' || perfil === 'gestoria') && (
                        <div className="space-y-3 mb-4">
                          <Input placeholder="Nombre de la gestoría" value={nombreEmpresa} onChange={e => setNombreEmpresa(e.target.value)} className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500" />
                          <Input placeholder="NIF / CIF" value={nif} onChange={e => setNif(e.target.value)} className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500" />
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-slate-300">
                            <LayoutGrid className="inline h-4 w-4 mr-1.5 text-violet-400" />
                            Módulos a activar ({selectedModules.size})
                          </p>
                          <p className="text-xs text-slate-500">Puedes cambiarlos después en Configuración</p>
                        </div>

                        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                          {MODULE_GROUPS.map(group => (
                            <div key={group.group} className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
                              <button
                                onClick={() => toggleGroup(group.group)}
                                className="w-full flex items-center justify-between p-3 hover:bg-slate-700/30 transition-colors"
                              >
                                <span className="text-sm font-medium text-slate-200">{group.group}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500">
                                    {group.modules.filter(m => selectedModules.has(m.id)).length}/{group.modules.length}
                                  </span>
                                  <ArrowRight className={`h-4 w-4 text-slate-400 transition-transform ${expandedGroups.has(group.group) ? 'rotate-90' : ''}`} />
                                </div>
                              </button>
                              {expandedGroups.has(group.group) && (
                                <div className="px-3 pb-3 space-y-1">
                                  <button
                                    onClick={() => selectAllInGroup(group)}
                                    className="text-xs text-violet-400 hover:text-violet-300 mb-2"
                                  >
                                    Seleccionar todos
                                  </button>
                                  {group.modules.map(m => {
                                    const isSelected = selectedModules.has(m.id)
                                    const isCore = ['leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics', 'equipo', 'configuracion'].includes(m.id)
                                    return (
                                      <div
                                        key={m.id}
                                        onClick={() => !isCore && toggleModule(m.id)}
                                        className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${isCore ? 'opacity-70 cursor-default' : 'cursor-pointer hover:bg-slate-700/50'} ${isSelected ? 'bg-violet-500/10 border border-violet-500/30' : 'border border-transparent'}`}
                                      >
                                        <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-violet-500 text-white' : 'bg-slate-700 text-slate-500'} ${isCore ? 'opacity-90' : ''}`}>
                                          {isSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm text-white truncate">
                                            {m.icon} {m.label}
                                            {isCore && <span className="text-xs text-slate-500 ml-1">(esencial)</span>}
                                          </p>
                                          <p className="text-xs text-slate-500 truncate">{m.description}</p>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <Button onClick={perfil ? handleStartOnboarding : undefined} disabled={!perfil} className="w-full h-14 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold text-lg rounded-xl">
                    Comenzar <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step-2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <Card className={cardClass}>
                <CardContent className="p-8 text-center">
                  <h2 className="text-2xl font-bold text-white mb-6">Preparando tu espacio de trabajo...</h2>
                  <div className="space-y-4 text-left mb-4">
                    {[
                      { label: 'Creando base de datos', delay: 0.1 },
                      { label: 'Configurando canales', delay: 0.3 },
                      { label: loading ? 'Activando IA…' : 'IA activada', delay: 0.5, spin: true },
                    ].map((item, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: item.delay }} className="flex items-center gap-3">
                        {item.spin && loading ? <Loader2 className="h-5 w-5 text-purple-400 animate-spin" /> : <CheckCircle2 className="h-5 w-5 text-green-400" />}
                        <span className={item.spin && loading ? 'text-purple-300' : 'text-slate-300'}>{item.label}</span>
                      </motion.div>
                    ))}
                  </div>
                  {loading && <p className="text-xs text-slate-500 mt-2">Configurando tu asistente inteligente, esto toma solo unos segundos</p>}
                  {provisionError && !loading && (
                    <div className="mt-6 space-y-3">
                      <p className="text-xs text-red-400 bg-red-500/10 rounded-lg p-3 border border-red-500/20">{provisionError}</p>
                      <Button onClick={() => { provisionStarted.current = true; handleProvision() }} className="w-full h-12 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl"><Loader2 className="mr-2 h-4 w-4" />Reintentar</Button>
                      <Button variant="outline" onClick={() => setStep(3)} className="w-full h-12 border-slate-600 text-slate-300 hover:bg-slate-800 font-semibold rounded-xl">Omitir</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step-3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <Card className={cardClass}>
                <CardContent className="p-8">
                  <h2 className="text-2xl font-bold text-white mb-2">Conecta tu canal</h2>
                  <p className="text-slate-400 mb-6">Elige cómo tus clientes te contactarán</p>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Card className="p-4 cursor-pointer bg-slate-800/50 border-slate-700 hover:border-purple-500 transition-colors" onClick={() => setStep(4)}>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center"><MessageCircle className="h-6 w-6 text-blue-400" /></div>
                        <div><p className="font-semibold text-white">Telegram</p><p className="text-sm text-slate-400">Responde automáticamente con IA</p></div>
                      </div>
                    </Card>
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <Card className={cardClass}>
                <CardContent className="p-8">
                  <h2 className="text-2xl font-bold text-white mb-4">Conectar Telegram</h2>
                  <ol className="text-slate-300 text-sm space-y-2 mb-6">
                    {['Abre Telegram', 'Busca @BotFather', 'Crea tu bot con /newbot', 'Copia el token'].map((txt, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-xs">{i + 1}</span>
                        {txt === 'Abre Telegram' ? 'Abre Telegram' : txt.includes('@BotFather') ? <><span>Busca </span><span className="text-purple-400 font-mono">@BotFather</span></> : txt.includes('/newbot') ? <><span>Crea tu bot con </span><span className="text-purple-400 font-mono">/newbot</span></> : 'Copia el token'}
                      </li>
                    ))}
                  </ol>
                  <Input placeholder="Pega el token (ej: 123456789:ABC...)" value={token} onChange={e => setToken(e.target.value)} className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 mb-4" />
                  <Button onClick={handleConnectTelegram} disabled={loading || !token} className="w-full h-12 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold rounded-xl">
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Conectando...</> : 'Conectar Bot'}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div key="step-5" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}>
              <Card className={cardClass}>
                <CardContent className="p-8 text-center">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }} className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Bot className="h-10 w-10 text-green-400" />
                  </motion.div>
                  <h2 className="text-2xl font-bold text-white mb-2">¡Todo listo!</h2>
                  <p className="text-slate-400 mb-2">Tu bot @{botUsername} está conectado</p>
                  <p className="text-sm text-purple-400 mb-8">{polling ? 'Esperando primer mensaje...' : '¡Envía un mensaje!'}</p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 6 && (
            <motion.div key="step-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <Card className={cardClass}>
                <CardContent className="p-8">
                  <div className="w-14 h-14 bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-6"><Calculator className="h-7 w-7 text-indigo-400" /></div>
                  <h2 className="text-2xl font-bold text-white mb-2">Configuración contable</h2>
                  <p className="text-slate-400 mb-6">Estos valores se pueden cambiar después en Ajustes</p>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-slate-300 mb-1 block">Plan contable (PGC)</label>
                      <select value={pgcPlan} onChange={e => setPgcPlan(e.target.value)} className="w-full bg-slate-800/50 border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm">
                        <option value="NORMAL">PGC Normal (completo)</option>
                        <option value="PYMES">PGC PYMES (simplificado)</option>
                        <option value="MICRO">PGC Micro (mínimo)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-slate-300 mb-1 block">Ejercicio fiscal</label>
                      <Input type="number" value={fiscalYear} onChange={e => setFiscalYear(e.target.value)} className="bg-slate-800/50 border-slate-700 text-white" />
                    </div>
                    <div>
                      <label className="text-sm text-slate-300 mb-1 block">IVA por defecto (%)</label>
                      <select value={ivaDefecto} onChange={e => setIvaDefecto(e.target.value)} className="w-full bg-slate-800/50 border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm">
                        <option value="21">21% (General)</option>
                        <option value="10">10% (Reducido)</option>
                        <option value="4">4% (Superreducido)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-8">
                    <Button onClick={() => setStep(7)} variant="outline" className="flex-1 h-12 border-slate-600 text-slate-300 hover:bg-slate-800 rounded-xl">Omitir</Button>
                    <Button onClick={handleAccountingSetup} disabled={loading} className="flex-1 h-12 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl">
                      {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Guardar'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 7 && (
            <motion.div key="step-7" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <Card className={cardClass}>
                <CardContent className="p-8">
                  <div className="w-14 h-14 bg-amber-500/20 rounded-2xl flex items-center justify-center mb-6"><FileKey className="h-7 w-7 text-amber-400" /></div>
                  <h2 className="text-2xl font-bold text-white mb-2">Certificado digital AEAT</h2>
                  <p className="text-slate-400 mb-6">Sube tu certificado P12/PFX para presentar declaraciones electrónicas automáticamente.</p>
                  <Card className="p-4 bg-slate-800/50 border-slate-700 mb-6">
                    <p className="text-sm text-slate-300">Ve a <span className="text-indigo-400">Configuración → Fiscal → Emisores</span> para subir tu certificado .p12</p>
                  </Card>
                  <Button onClick={() => setStep(8)} className="w-full h-12 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl mb-3">Continuar</Button>
                  <Button onClick={() => setStep(8)} variant="outline" className="w-full h-12 border-slate-600 text-slate-300 hover:bg-slate-800 rounded-xl">Lo haré después</Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 8 && (
            <motion.div key="step-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <Card className={cardClass}>
                <CardContent className="p-8">
                  <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-6"><Upload className="h-7 w-7 text-blue-400" /></div>
                  <h2 className="text-2xl font-bold text-white mb-2">Importar clientes</h2>
                  <p className="text-slate-400 mb-4">Importa tus clientes desde Sage, Microdata o un archivo CSV/Excel.</p>
                  <Card className="p-4 bg-slate-800/50 border-slate-700 mb-6 cursor-pointer hover:border-purple-500 transition-colors" onClick={() => router.push('/dashboard/importar')}>
                    <div className="flex items-center gap-3">
                      <Upload className="h-5 w-5 text-purple-400" />
                      <div><p className="text-sm font-medium text-white">Ir al importador</p><p className="text-xs text-slate-400">Sage, Microdata, CSV o Excel</p></div>
                    </div>
                  </Card>
                  <Button onClick={() => setStep(9)} className="w-full h-12 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl mb-3">Continuar</Button>
                  <Button onClick={() => setStep(9)} variant="outline" className="w-full h-12 border-slate-600 text-slate-300 hover:bg-slate-800 rounded-xl">Lo haré después</Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 9 && (
            <motion.div key="step-9" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <Card className={cardClass}>
                <CardContent className="p-8">
                  <div className="w-14 h-14 bg-green-500/20 rounded-2xl flex items-center justify-center mb-6"><Users className="h-7 w-7 text-green-400" /></div>
                  <h2 className="text-2xl font-bold text-white mb-2">Invita a tu equipo</h2>
                  <p className="text-slate-400 mb-6">Añade gestores, contables y administrativos.</p>
                  <Card className="p-4 bg-slate-800/50 border-slate-700 mb-6">
                    <p className="text-sm text-slate-300">Invita desde <span className="text-indigo-400">Dashboard → Equipo</span></p>
                  </Card>
                  <Button onClick={handleComplete} className="w-full h-12 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold rounded-xl mb-3">Ir al Dashboard</Button>
                  <Button onClick={() => router.push('/dashboard/equipo')} variant="outline" className="w-full h-12 border-slate-600 text-slate-300 hover:bg-slate-800 rounded-xl">Invitar ahora</Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
