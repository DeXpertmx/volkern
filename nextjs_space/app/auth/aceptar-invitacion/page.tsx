'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Mail, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

function AceptarInvitacionForm() {
  const searchParams = useSearchParams()
  const token = searchParams?.get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/aceptar-invitacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (res.ok) {
        setDone(true)
        toast.success('Invitación aceptada')
      } else {
        setError(data.error || 'La invitación no pudo aceptarse')
        toast.error(data.error || 'La invitación no pudo aceptarse')
      }
    } catch {
      setError('Error de red al aceptar la invitación')
    } finally {
      setIsLoading(false)
    }
  }

  if (!token) {
    return (
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" /> Invitación inválida
          </CardTitle>
          <CardDescription>El enlace no incluye el token de invitación.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link href="/auth/login">
              <ArrowLeft className="mr-2 h-4 w-4" /> Ir a iniciar sesión
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (done) {
    return (
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" /> ¡Cuenta activada!
          </CardTitle>
          <CardDescription>
            Ya formas parte del equipo. Entra con tu email y la contraseña que acabas de crear.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/auth/login">Iniciar sesión</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-xl">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Acepta tu invitación</CardTitle>
        <CardDescription>
          Crea tu contraseña para activar tu cuenta en el equipo.{' '}
          <span className="inline-flex items-center gap-1 text-slate-500">
            <Mail className="h-3.5 w-3.5" /> Revisa el enlace que recibiste por correo.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            {error}. Pide al administrador que reenvíe la invitación desde el panel de Equipo.
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar contraseña</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aceptar invitación
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default function AceptarInvitacionPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Suspense fallback={
          <Card className="shadow-xl">
            <CardContent className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </CardContent>
          </Card>
        }>
          <AceptarInvitacionForm />
        </Suspense>
      </div>
    </div>
  )
}
