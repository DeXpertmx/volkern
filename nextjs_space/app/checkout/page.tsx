'use client'

import { useState, useMemo, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Check,
  ArrowRight,
  Users,
  BookOpen,
  Shield,
  Zap,
  Lock,
  Loader2,
  Sparkles,
  CreditCard,
  ChevronDown,
  Building2,
  Mail,
  User,
  Phone,
} from 'lucide-react'
import SetupBasico from '@/components/public/SetupBasico'
import {
  calcularPrecio,
  type PlanTipo,
  type PricingResult,
} from '@/lib/pricing-engine'

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function fmtUsuarios(n: number) {
  if (n >= 99) return '99+'
  return String(n)
}

function fmtContactos(n: number) {
  if (n >= 99000) return '99.000+'
  if (n >= 1000) return `${(n / 1000).toFixed(0)}.000`
  return n.toLocaleString('es-ES')
}

function fmtPrecio(n: number) {
  return n.toLocaleString('es-ES')
}

/* ─── PlanSummary (left column) ──────────────────────────────────────────── */

function PlanSummary({
  usuarios,
  contactos,
  plan,
  billingInterval,
  precioMostrar,
  precioOriginal,
  precioOverride,
  setupCost,
}: {
  usuarios: number
  contactos: number
  plan: PlanTipo
  billingInterval: 'monthly' | 'yearly'
  precioMostrar: number
  precioOriginal: number
  precioOverride?: boolean
  setupCost?: number
}) {
  const isCompliance = plan === 'compliance'

  const BASE = [
    'CRM completo',
    'Marketing automation',
    'Ventas',
    'Facturación',
    'Firma digital',
    'Integraciones',
    'Telefonía',
    'RRHH',
    'Academia',
    'Webhooks',
  ]

  const COMPLIANCE_EXTRAS = [
    'Auditoría completa',
    'Trazabilidad',
    'Control operativo',
    'Validaciones',
    'Preparación fiscal',
  ]

  return (
    <div className={`p-8 rounded-3xl border shadow-2xl ${
      isCompliance
        ? 'bg-gradient-to-br from-indigo-950/80 to-slate-950 border-indigo-500/30'
        : 'bg-gradient-to-br from-slate-900 to-slate-900/80 border-slate-800'
    }`}>
      {/* Compliance badge */}
      {isCompliance && (
        <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-4 animate-in fade-in duration-300">
          <Lock className="h-3 w-3" />
          Modo Compliance activado
        </div>
      )}

      {/* Plan name */}
      <div className="flex items-center gap-2 mb-4">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
          isCompliance ? 'bg-indigo-500/10' : 'bg-purple-500/10'
        }`}>
          {isCompliance
            ? <Shield className="h-5 w-5 text-indigo-400" />
            : <Zap className="h-5 w-5 text-purple-400" />
          }
        </div>
        <div>
          <p className="text-sm font-black text-white uppercase tracking-tight">
            Volkern {isCompliance ? 'Compliance Pro' : 'Scale'}
          </p>
          {billingInterval === 'yearly' && (
            <p className="text-[10px] text-emerald-500 font-bold">Facturado anualmente · Ahorra 20%</p>
          )}
        </div>
      </div>

      {/* Config */}
      <div className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          <span className="text-sm text-slate-300"><span className="font-bold text-white">{fmtUsuarios(usuarios)}</span> usuarios</span>
        </div>
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-slate-500" />
          <span className="text-sm text-slate-300"><span className="font-bold text-white">{fmtContactos(contactos)}</span> contactos</span>
        </div>
      </div>

      {/* Features */}
      <div className="space-y-3 mb-8">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Incluye</p>
        {BASE.map((f, i) => (
          <div key={i} className="flex items-start gap-3">
            <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <span className="text-sm text-slate-300">{f}</span>
          </div>
        ))}
        {isCompliance && (
          <>
            <div className="border-t border-indigo-500/20 pt-3 mt-3" />
            {COMPLIANCE_EXTRAS.map((f, i) => (
              <div key={`comp-${i}`} className="flex items-start gap-3 animate-in fade-in duration-300">
                <Check className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                <span className="text-sm text-indigo-300">{f}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Price */}
      <div className="border-t border-slate-800 pt-6">
        {precioOverride && (
          <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-500/20 to-emerald-400/10 text-emerald-300 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border border-emerald-500/30 mb-3">
            🔥 Promo Neting · 20% OFF
          </div>
        )}
        <div className="flex items-baseline gap-2">
          {precioOverride && (
            <span className="text-xl font-black text-slate-500 line-through">
              €{fmtPrecio(Math.round(precioMostrar / 0.8))}
              {billingInterval === 'yearly' ? '/año' : '/mes'}
            </span>
          )}
          <span className="text-4xl font-black text-white tracking-tight">€{fmtPrecio(precioMostrar)}</span>
          <span className="text-slate-500">/{billingInterval === 'yearly' ? 'año' : 'mes'}</span>
        </div>
        {precioOverride ? (
          <p className="text-xs text-emerald-400 mt-1 font-medium">
            Ahorras 20% con la promo Neting
          </p>
        ) : billingInterval === 'yearly' ? (
          <p className="text-xs text-emerald-500 mt-1">
            Ahorro aplicado · Pago anual único
          </p>
        ) : (
          <p className="text-xs text-slate-500 mt-1">
            Facturado mensualmente · Cancela cuando quieras
          </p>
        )}
        {/* Setup cost (Neting promo) */}
        {setupCost && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
            <p className="text-[10px] font-black text-emerald-300 uppercase tracking-widest mb-1">
              Setup Asistido · Pago único
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400 line-through">
                €299
              </span>
              <span className="text-lg font-black text-emerald-400">
                €{fmtPrecio(setupCost)}
              </span>
              <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/20 px-1.5 py-0.5 rounded-full">
                -{Math.round(((299 - setupCost) / 299) * 100)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Checkout Form (inner, uses useSearchParams) ────────────────────────── */

function CheckoutForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [success, setSuccess] = useState(false)

  // Read pricing params
  const pricingParams = {
    usuarios: parseInt(searchParams.get('usuarios') || '1'),
    contactos: parseInt(searchParams.get('contactos') || '1000'),
    plan: (searchParams.get('plan') || 'scale') as PlanTipo,
    interval: (searchParams.get('interval') || 'yearly') as 'monthly' | 'yearly',
    precio: parseInt(searchParams.get('precio') || '0'),
    setup: parseInt(searchParams.get('setup') || '0'),
    promo: searchParams.get('promo') || '',
  }

  const isNetingPromo = pricingParams.promo === 'neting' && pricingParams.precio > 0;

  // If no pricing params, redirect to /precios
  const hasPricing = searchParams.has('usuarios')
  useEffect(() => {
    if (!hasPricing && !success) {
      router.push('/precios')
    }
  }, [hasPricing, success, router])

  // Estado de éxito post-pago
  const checkoutSuccess = searchParams.get('success')

  if (checkoutSuccess === 'true') {
    return <SuccessScreen />
  }

  const [loading, setLoading] = useState(false)
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>(pricingParams.interval || 'yearly')
  const [showBilling, setShowBilling] = useState(false)
  const [formData, setFormData] = useState({
    fullName: '',
    companyName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    // Billing
    billingName: '',
    billingVat: '',
    billingAddress: '',
    billingCity: '',
    billingCountry: 'ES',
  })

  // Calculate price (skip for Neting promo — use URL precio instead)
  const result = useMemo(
    () => isNetingPromo ? null : calcularPrecio({
      usuarios: pricingParams.usuarios,
      contactos: pricingParams.contactos,
      plan: pricingParams.plan,
    }),
    [isNetingPromo, pricingParams.usuarios, pricingParams.contactos, pricingParams.plan]
  );

  // Lock billing interval to URL param when Neting promo
  const effectiveBillingInterval = isNetingPromo ? pricingParams.interval : billingInterval;

  const precioMostrar = isNetingPromo
    ? pricingParams.precio
    : billingInterval === 'yearly' ? Math.round((result?.precio ?? 0) * 0.8) : (result?.precio ?? 0);

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

    setLoading(true)

    try {
      const payload = {
        ...formData,
        couponCode: undefined,
        pricing: {
          usuarios: pricingParams.usuarios,
          contactos: pricingParams.contactos,
          plan: pricingParams.plan,
          interval: effectiveBillingInterval,
          ...(isNetingPromo && { precio: pricingParams.precio, setup: pricingParams.setup, promo: 'neting' }),
        },
      }

      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear la cuenta')
      }

      toast.success('¡Cuenta creada! Redirigiendo al pago...')

      // Sign in automatically
      const signInResult = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      })

      if (signInResult?.error) {
        toast.error('Error al iniciar sesión')
        return
      }

      // Redirect to Stripe Checkout or show success
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else {
        setSuccess(true)
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al procesar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="container mx-auto px-4 lg:px-6 max-w-6xl py-12">

        {/* ══════════ PROGRESS + HEADER ═══════════════════════════════════ */}
        <div className="text-center mb-10">
          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="flex items-center">
              <div className="h-8 w-8 rounded-full bg-purple-600 text-white text-xs font-black flex items-center justify-center">1</div>
              <span className="ml-2 text-xs font-bold text-white uppercase tracking-wider">Confirmar</span>
            </div>
            <div className="w-12 h-px bg-slate-700" />
            <div className="flex items-center">
              <div className="h-8 w-8 rounded-full bg-slate-800 text-slate-500 text-xs font-black flex items-center justify-center">2</div>
              <span className="ml-2 text-xs font-bold text-slate-600 uppercase tracking-wider">Pago</span>
            </div>
            <div className="w-12 h-px bg-slate-700" />
            <div className="flex items-center">
              <div className="h-8 w-8 rounded-full bg-slate-800 text-slate-500 text-xs font-black flex items-center justify-center">✓</div>
              <span className="ml-2 text-xs font-bold text-slate-600 uppercase tracking-wider">Activo</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 mb-6">
            <Image src="/volkern-logo.png" alt="Volkern" width={160} height={48} className="h-10 w-auto" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-2">
            Estás a un paso de activar Volkern
          </h1>
          <p className="text-slate-400 text-base">
            Tu configuración ya está lista
          </p>
        </div>

        {/* ══════════ CONTENIDO 2 COLUMNAS ══════════════════════════════════ */}
        <div className="grid lg:grid-cols-5 gap-10">

          {/* ── LEFT: 2/5 — Plan Summary ────────────────────────────────── */}
          <div className="lg:col-span-2">
            <PlanSummary
              usuarios={pricingParams.usuarios}
              contactos={pricingParams.contactos}
              plan={pricingParams.plan}
              billingInterval={effectiveBillingInterval}
              precioMostrar={precioMostrar}
              precioOriginal={result?.precio ?? 0}
              precioOverride={isNetingPromo || undefined}
              setupCost={isNetingPromo ? pricingParams.setup : undefined}
            />
            <div className="mt-6">
              <SetupBasico />
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Check className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Empresas ya operando con Volkern</p>
                  <p className="text-[10px] text-slate-500">Plataforma todo en uno</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Zap className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Sin integraciones externas</p>
                  <p className="text-[10px] text-slate-500">Todo incluido en un solo sistema</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: 3/5 — Form + Payment ────────────────────────────── */}
          <div className="lg:col-span-3">
            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800">
              <form onSubmit={handleSubmit} className="space-y-6">

                {/* MONTHLY / YEARLY TOGGLE (locked for Neting promo) */}
                {isNetingPromo ? (
                  <div className="flex justify-center mb-2">
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 rounded-full">
                      🔥 Plan {effectiveBillingInterval === 'yearly' ? 'Anual' : 'Mensual'} · Promo Neting
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-center mb-2">
                    <div className="bg-slate-800/50 rounded-full p-1 flex gap-1">
                      <button
                        type="button"
                        onClick={() => setBillingInterval('monthly')}
                        className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                          billingInterval === 'monthly'
                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >Mensual</button>
                      <button
                        type="button"
                        onClick={() => setBillingInterval('yearly')}
                        className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                          billingInterval === 'yearly'
                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >Anual <span className="text-[9px] text-purple-300 ml-0.5">-20%</span></button>
                    </div>
                  </div>
                )}

                {/* BLOQUE 1: DATOS BÁSICOS */}
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Datos básicos</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fullName" className="text-slate-300 text-xs">Nombre completo</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                        <Input
                          id="fullName"
                          placeholder="Juan Pérez"
                          className="pl-10 bg-slate-950 border-slate-800 text-white placeholder:text-slate-600"
                          value={formData.fullName}
                          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyName" className="text-slate-300 text-xs">Empresa</Label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                        <Input
                          id="companyName"
                          placeholder="Mi Empresa S.A."
                          className="pl-10 bg-slate-950 border-slate-800 text-white placeholder:text-slate-600"
                          value={formData.companyName}
                          onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-slate-300 text-xs">Email corporativo</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="tu@empresa.com"
                          className="pl-10 bg-slate-950 border-slate-800 text-white placeholder:text-slate-600"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-slate-300 text-xs">Teléfono (opcional)</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="+34 600 000 000"
                          className="pl-10 bg-slate-950 border-slate-800 text-white placeholder:text-slate-600"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* BLOQUE 2: CUENTA */}
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Cuenta</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-slate-300 text-xs">Contraseña</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                        <Input
                          id="password"
                          type="password"
                          placeholder="Mínimo 6 caracteres"
                          className="pl-10 bg-slate-950 border-slate-800 text-white placeholder:text-slate-600"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword" className="text-slate-300 text-xs">Confirmar contraseña</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                        <Input
                          id="confirmPassword"
                          type="password"
                          placeholder="Repite tu contraseña"
                          className="pl-10 bg-slate-950 border-slate-800 text-white placeholder:text-slate-600"
                          value={formData.confirmPassword}
                          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* BLOQUE 3: FACTURACIÓN (toggle) */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowBilling(!showBilling)}
                    className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showBilling ? 'rotate-180' : ''}`} />
                    Datos de facturación (opcional)
                  </button>
                  {showBilling && (
                    <div className="mt-4 space-y-4 animate-in fade-in duration-200">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="billingName" className="text-slate-300 text-xs">Nombre fiscal</Label>
                          <Input
                            id="billingName"
                            placeholder="Nombre o Razón Social"
                            className="bg-slate-950 border-slate-800 text-white placeholder:text-slate-600"
                            value={formData.billingName}
                            onChange={(e) => setFormData({ ...formData, billingName: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="billingVat" className="text-slate-300 text-xs">NIF / VAT</Label>
                          <Input
                            id="billingVat"
                            placeholder="ES12345678Z"
                            className="bg-slate-950 border-slate-800 text-white placeholder:text-slate-600"
                            value={formData.billingVat}
                            onChange={(e) => setFormData({ ...formData, billingVat: e.target.value })}
                          />
                        </div>
                        <div className="sm:col-span-2 space-y-2">
                          <Label htmlFor="billingAddress" className="text-slate-300 text-xs">Dirección</Label>
                          <Input
                            id="billingAddress"
                            placeholder="Calle y número"
                            className="bg-slate-950 border-slate-800 text-white placeholder:text-slate-600"
                            value={formData.billingAddress}
                            onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="billingCity" className="text-slate-300 text-xs">Ciudad</Label>
                          <Input
                            id="billingCity"
                            placeholder="Madrid"
                            className="bg-slate-950 border-slate-800 text-white placeholder:text-slate-600"
                            value={formData.billingCity}
                            onChange={(e) => setFormData({ ...formData, billingCity: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="billingCountry" className="text-slate-300 text-xs">País</Label>
                          <select
                            id="billingCountry"
                            className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm"
                            value={formData.billingCountry}
                            onChange={(e) => setFormData({ ...formData, billingCountry: e.target.value })}
                          >
                            <option value="ES">España</option>
                            <option value="MX">México</option>
                            <option value="CO">Colombia</option>
                            <option value="AR">Argentina</option>
                            <option value="CL">Chile</option>
                            <option value="PE">Perú</option>
                            <option value="US">Estados Unidos</option>
                            <option value="OTHER">Otro</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* BLOQUE: PAGO */}
                <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center gap-2 mb-4">
                    <CreditCard className="h-4 w-4 text-slate-400" />
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pago seguro vía Stripe</p>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">
                    Serás redirigido a Stripe para completar el pago de forma segura.
                  </p>
                </div>

                {/* CTA PRINCIPAL */}
                <Button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-6 text-base font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                    pricingParams.plan === 'compliance'
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                      : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20'
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Activando...
                    </>
                  ) : (
                    <>
                      Activar Volkern ahora
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </Button>

                {/* MICROCOPY */}
                <p className="text-xs text-center text-slate-600">
                  Puedes cambiar tu configuración en cualquier momento.
                </p>

                {/* SEGURIDAD */}
                <div className="flex items-center justify-center gap-4 text-[10px] text-slate-500">
                  <span>🔒 Pago seguro</span>
                  <span>·</span>
                  <span>⚡ Activación inmediata</span>
                  <span>·</span>
                  <span>🔄 Sin permanencia</span>
                </div>

                {/* TRIAL */}
                <div className="text-center pt-2 border-t border-slate-800">
                  <p className="text-xs text-slate-500 mb-3">¿No estás seguro?</p>
                  <Link
                    href="/signup"
                    onClick={() => {
                      try { localStorage.setItem('neting_trial_started', 'true'); } catch {}
                    }}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white py-3 text-xs font-bold"
                    >
                      Probar 7 días gratis — Sin tarjeta
                    </Button>
                  </Link>
                </div>

              </form>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

/* ─── Success Screen ──────────────────────────────────────────────────────── */

function SuccessScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="max-w-md mx-auto text-center px-4">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-8 animate-in zoom-in duration-300">
          <Sparkles className="h-10 w-10 text-emerald-400" />
        </div>
        <h1 className="text-4xl font-black text-white mb-4">🎉 Volkern activado</h1>
        <p className="text-slate-400 text-lg mb-10">Tu entorno ya está listo.</p>
        <Link href="/dashboard/onboarding-quick">
          <Button className="bg-purple-600 hover:bg-purple-500 text-white px-10 py-6 rounded-xl font-bold text-base shadow-xl shadow-purple-600/30">
            Entrar a mi panel
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </Link>
      </div>
    </div>
  )
}

/* ─── Page Export ─────────────────────────────────────────────────────────── */

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    }>
      <CheckoutForm />
    </Suspense>
  )
}
