
'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/recuperar-contrasena', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok) {
        setEmailSent(true)
        toast.success('Email enviado', {
          description: 'Revisa tu bandeja de entrada para continuar con la recuperación.',
        })
      } else {
        toast.error('Error', {
          description: data.error || 'No se pudo procesar tu solicitud. Intenta de nuevo.',
        })
      }
    } catch (error) {
      toast.error('Error', {
        description: 'Hubo un problema al enviar el email. Intenta de nuevo.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-xl">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-center mb-4">
              <div className="relative w-48 h-16">
                <Image
                  src="/volkern-logo.png"
                  alt="Volkern CRM"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </div>
            <CardTitle className="text-2xl text-center">
              Recuperar contraseña
            </CardTitle>
            <CardDescription className="text-center">
              Ingresa tu email y te enviaremos instrucciones para recuperar tu contraseña
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!emailSent ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Enviando...
                    </div>
                  ) : (
                    'Enviar instrucciones'
                  )}
                </Button>
              </form>
            ) : (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  <p className="font-medium mb-2">¡Email enviado exitosamente!</p>
                  <p className="text-sm">
                    Hemos enviado instrucciones para recuperar tu contraseña a <strong>{email}</strong>.
                    Por favor, revisa tu bandeja de entrada y sigue las instrucciones.
                  </p>
                  <p className="text-xs mt-2 text-muted-foreground">
                    El enlace expirará en 1 hora por seguridad.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            <div className="mt-6 pt-6 border-t">
              <Link href="/auth/login">
                <Button variant="ghost" className="w-full">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Volver al inicio de sesión
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
