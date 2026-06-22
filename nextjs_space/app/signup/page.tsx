
'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Building2, Mail, Lock, User, Loader2, Zap, Shield, Users, BookOpen, PenTool, GraduationCap, Calculator, Factory, UserCheck, CheckCircle2, LayoutGrid } from 'lucide-react'

/* ─── Plan Summary Card ──────────────────────────────────────────────────── */

function PlanSummary({ searchParams }: { searchParams: Record<string, string> }) {
  const plan = searchParams.plan === 'compliance' ? 'compliance' : 'scale'
  const usuarios = parseInt(searchParams.usuarios || '5')
  const contactos = parseInt(searchParams.contactos || '5000')
  const precio = parseInt(searchParams.precio || '0')
  const interval = searchParams.interval === 'yearly' ? 'yearly' : 'monthly'

  // Si no hay precio, no mostramos resumen (viene sin slider)
  if (!searchParams.precio || precio === 0 || Number.isNaN(precio)) return null

  const planName = plan === 'compliance' ? 'Compliance Pro' : 'Scale'
  const planIcon = plan === 'compliance' ? Shield : Zap
  const planColor = plan === 'compliance' ? 'indigo' : 'purple'
  const IconPlan = planIcon
  const safeUsuarios = Number.isNaN(usuarios) ? 5 : usuarios
  const safeContactos = Number.isNaN(contactos) ? 5000 : contactos

  return (
    <div className={`p-4 rounded-xl border mb-6 ${planColor === 'indigo' ? 'bg-indigo-50 border-indigo-200' : 'bg-purple-50 border-purple-200'}`}>
      <div className="flex items-center gap-2 mb-3">
        <IconPlan className={`h-4 w-4 ${planColor === 'indigo' ? 'text-indigo-500' : 'text-purple-500'}`} />
        <span className={`text-xs font-bold ${planColor === 'indigo' ? 'text-indigo-700' : 'text-purple-700'}`}>
          Tu plan · {planName}
        </span>
        {interval === 'yearly' && (
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">-20%</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs text-slate-600"><span className="text-slate-900 font-bold">{safeUsuarios}</span> usuarios</span>
        </div>
        <div className="flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs text-slate-600"><span className="text-slate-900 font-bold">{safeContactos >= 1000 ? `${(safeContactos/1000).toFixed(0)}.000` : safeContactos}</span> contactos</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xl font-black text-slate-900">€{precio.toLocaleString('es-ES')}</span>
          <span className="text-xs text-slate-400">/mes</span>
          {interval === 'yearly' && <span className="text-[10px] text-slate-400">fact. anual</span>}
        </div>
      </div>
    </div>
  )
}

/* ─── Signup Form (inner, uses useSearchParams) ──────────────────────────── */

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Leer params del slider
  const pricingParams: Record<string, string> = {}
  const paramKeys = ['usuarios', 'contactos', 'plan', 'interval', 'precio']
  paramKeys.forEach(k => {
    const v = searchParams.get(k)
    if (v) pricingParams[k] = v
  })

  const [loading, setLoading] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [requestedImmediateStart, setRequestedImmediateStart] = useState(false)
  const [formData, setFormData] = useState({
    companyName: '',
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    couponCode: ''
  })
  const [couponValid, setCouponValid] = useState<any>(null)
  const [validatingCoupon, setValidatingCoupon] = useState(false)
  const [selectedVertical, setSelectedVertical] = useState<string | null>(null)

  const validateCoupon = async () => {
    if (!formData.couponCode.trim()) return
    
    setValidatingCoupon(true)
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: formData.couponCode, email: formData.email })
      })
      const data = await res.json()
      
      if (data.valid) {
        setCouponValid(data.coupon)
        toast.success(`Cupón válido: ${data.coupon.durationDays} días`)
      } else {
        setCouponValid(null)
        toast.error(data.error || 'Cupón inválido')
      }
    } catch (error) {
      toast.error('Error al validar cupón')
    } finally {
      setValidatingCoupon(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (formData.password !== formData.confirmPassword) {
      toast.error('Las contraseñas no coinciden')
      return
    }

    if (formData.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }

    if (!acceptedTerms) {
      toast.error('Debes aceptar los Términos y Condiciones y la Política de Reembolsos')
      return
    }

    if (!requestedImmediateStart) {
      toast.error('Debes confirmar que solicitas el inicio inmediato del servicio')
      return
    }

    setLoading(true)

    try {
      // Construir payload con pricing params si vienen del slider
      const payload: any = {
        ...formData,
        couponCode: formData.couponCode.trim() || undefined,
        legalConsent: {
          acceptedTerms,
          requestedImmediateStart,
          consentedAt: new Date().toISOString(),
        },
      }
      if (pricingParams.usuarios) {
        payload.pricing = {
          usuarios: parseInt(pricingParams.usuarios),
          contactos: parseInt(pricingParams.contactos || '5000'),
          plan: pricingParams.plan || 'scale',
          interval: pricingParams.interval || 'monthly'
        }
      }
      if (selectedVertical) {
        payload.vertical = selectedVertical
      }

      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear la cuenta')
      }

      toast.success('¡Cuenta creada exitosamente! Iniciando sesión...')
      
      // Iniciar sesión automáticamente
      const signInResult = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      })

      if (signInResult?.error) {
        toast.error('Error al iniciar sesión. Por favor intenta de nuevo.')
        router.push(`/auth/login?email=${encodeURIComponent(formData.email)}`)
        return
      }

      // Si la API devolvió checkout URL → redirigir a Stripe
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }

      // Sin checkout → redirigir al onboarding simplificado (cupón / trial)
      router.push(`/dashboard/onboarding-quick${selectedVertical ? `?vertical=${selectedVertical}` : ''}`)
      
    } catch (error: any) {
      console.error('Error en signup:', error)
      toast.error(error.message || 'Error al crear la cuenta')
    } finally {
      setLoading(false)
    }
  }

  const hasPricing = Object.keys(pricingParams).length > 0

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-blue-50 to-white p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex items-center justify-center mb-6">
            <Image 
              src="/volkern-logo.png" 
              alt="Volkern CRM" 
              width={200} 
              height={60}
              className="h-12 w-auto"
              priority
            />
          </div>
          <CardTitle className="text-2xl font-bold">Crea tu cuenta</CardTitle>
          <CardDescription>
            {hasPricing 
              ? 'Completa tus datos para activar tu plan.' 
              : 'Comienza tu prueba gratuita de 14 días. Sin tarjeta de crédito.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Resumen del plan elegido */}
          <PlanSummary searchParams={pricingParams} />

          {/* ─── Vertical Selector ────────────────────────────────────── */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <LayoutGrid className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-xs font-medium text-gray-500">¿Cuál es tu sector? (opcional)</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'crm_ventas', label: 'CRM Ventas', icon: Zap, color: 'border-cyan-300 bg-cyan-50', iconColor: 'text-cyan-500' },
                { id: 'agencia_marketing', label: 'Agencia Marketing', icon: PenTool, color: 'border-purple-300 bg-purple-50', iconColor: 'text-purple-500' },
                { id: 'academia', label: 'Academia', icon: GraduationCap, color: 'border-amber-300 bg-amber-50', iconColor: 'text-amber-500' },
                { id: 'asesoria_contable', label: 'Asesoría Contable', icon: Calculator, color: 'border-blue-300 bg-blue-50', iconColor: 'text-blue-500' },
                { id: 'rrhh', label: 'RRHH', icon: UserCheck, color: 'border-rose-300 bg-rose-50', iconColor: 'text-rose-500' },
                { id: 'inmobiliaria', label: 'Inmobiliaria', icon: Building2, color: 'border-emerald-300 bg-emerald-50', iconColor: 'text-emerald-500' },
                { id: 'industria', label: 'Industria', icon: Factory, color: 'border-orange-300 bg-orange-50', iconColor: 'text-orange-500' },
              ].map(v => {
                const Icon = v.icon
                const isSelected = selectedVertical === v.id
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVertical(isSelected ? null : v.id)}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all text-xs ${
                      isSelected
                        ? `${v.color} shadow-sm ring-1 ring-offset-1 ring-purple-300`
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isSelected ? v.iconColor : 'text-gray-400'}`} />
                    <span className={`font-medium truncate ${isSelected ? 'text-gray-800' : 'text-gray-600'}`}>{v.label}</span>
                    {isSelected && <CheckCircle2 className="h-3 w-3 text-purple-500 ml-auto flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
            {selectedVertical && (
              <p className="text-[10px] text-gray-400 mt-1.5">
                Los módulos de esta vertical se pre-seleccionarán en el siguiente paso.
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Nombre de tu empresa</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="companyName"
                  type="text"
                  placeholder="Mi Empresa S.A."
                  className="pl-10"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Tu nombre completo</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Juan Pérez"
                  className="pl-10"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email corporativo</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@empresa.com"
                  className="pl-10"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  className="pl-10"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirma tu contraseña"
                  className="pl-10"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="couponCode">Código de regalo (opcional)</Label>
              <div className="flex gap-2">
                <Input
                  id="couponCode"
                  placeholder="ABCD-EFGH-IJKL-MNOP"
                  value={formData.couponCode}
                  onChange={(e) => {
                    setFormData({ ...formData, couponCode: e.target.value.toUpperCase() })
                    setCouponValid(null)
                  }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={validateCoupon}
                  disabled={!formData.couponCode.trim() || validatingCoupon}
                >
                  {validatingCoupon ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Validar'
                  )}
                </Button>
              </div>
              {couponValid && (
                <p className="text-xs text-green-600 font-medium">
                  ✓ Cupón válido: {couponValid.durationDays} días de acceso
                  {couponValid.discountPercent > 0 && ` - ${couponValid.discountPercent}% descuento`}
                </p>
              )}
            </div>

            {/* ═══ CHECKBOXES LEGALES ═════════════════════════════════ */}
            <div className="space-y-3">
              {/* Checkbox 1: Términos + Reembolsos */}
              <label className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                acceptedTerms
                  ? 'bg-emerald-50 border-emerald-300'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span className="text-xs text-gray-600 leading-relaxed">
                  Acepto los{' '}
                  <Link href="/terms" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-purple-600 hover:underline font-medium">Términos y Condiciones</Link>
                  {' '}y la{' '}
                  <Link href="/reembolsos" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-purple-600 hover:underline font-medium">Política de Reembolsos</Link>.
                  Entiendo que dispongo de un plazo de 14 días naturales para ejercer mi derecho de desistimiento,
                  aplicable únicamente al primer pago.
                </span>
              </label>

              {/* Checkbox 2: Renuncia al desistimiento (CLAVE) */}
              <label className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                requestedImmediateStart
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="checkbox"
                  checked={requestedImmediateStart}
                  onChange={(e) => setRequestedImmediateStart(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-xs text-gray-600 leading-relaxed">
                  <strong className="text-amber-600">Solicito expresamente</strong> que el servicio comience de forma inmediata y
                  reconozco que, al tratarse de contenido digital y/o servicios ejecutados,
                  pierdo mi derecho de desistimiento en la parte del servicio que haya sido prestada o utilizada.
                </span>
              </label>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creando cuenta...
                </>
              ) : hasPricing ? (
                'Activar plan'
              ) : (
                'Crear cuenta gratis'
              )}
            </Button>

            <p className="text-[10px] text-center text-gray-500 leading-relaxed">
              El acceso al servicio se activará inmediatamente tras el registro.
              {' '}No se realizan reembolsos por periodos ya iniciados ni por servicios ejecutados.
            </p>

            <p className="text-xs text-center text-gray-500">
              <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-purple-600 underline transition">Términos</Link>
              {' · '}
              <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-purple-600 underline transition">Privacidad</Link>
              {' · '}
              <Link href="/reembolsos" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-purple-600 underline transition">Reembolsos</Link>
            </p>

            <div className="text-center text-sm">
              <span className="text-gray-600">¿Ya tienes cuenta? </span>
              <Link href="/auth/login" className="text-purple-600 hover:underline font-medium">
                Inicia sesión
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

/* ─── Page export (wraps in Suspense for useSearchParams) ────────────────── */

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-blue-50 to-white p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500 mx-auto" />
          </CardContent>
        </Card>
      </div>
    }>
      <SignupForm />
    </Suspense>
  )
}
