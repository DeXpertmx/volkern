
'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useEffect } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [twoFactorStep, setTwoFactorStep] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { data: session, status } = useSession() || {}
  const router = useRouter()
  const { toast } = useToast()
  const [branding, setBranding] = useState<{ logoUrl: string; nombreEmpresa: string } | null>(null)

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard')
    }

    // Detectar subdominio y cargar branding
    const fetchBranding = async () => {
      try {
        const host = window.location.hostname;
        if (host === 'localhost' || host === 'volkern.app') return;

        const subdomain = host.split('.')[0];
        if (['www', 'app', 'auth', 'login'].includes(subdomain)) return;

        const res = await fetch(`/api/public/branding?subdomain=${subdomain}`);
        if (res.ok) {
          const data = await res.json();
          setBranding(data);
        } else if (res.status === 404) {
          // Si el subdominio no existe, redirigir a la landing principal
          window.location.href = process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app';
        }
      } catch (err) {
        console.error('Error al cargar branding:', err);
      }
    };

    fetchBranding();
  }, [status, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        code: twoFactorCode,
        redirect: false,
      })

      if (result?.error) {
        if (result.error === '2FA_REQUIRED') {
          setTwoFactorStep(true)
          toast({
            title: 'Código de seguridad enviado',
            description: 'Por favor, revisa tu correo electrónico e introduce el código de verificación.',
          })
        } else if (result.error === 'INVALID_2FA_CODE') {
          toast({
            title: 'Código inválido',
            description: 'El código de seguridad introducido es incorrecto o ha caducado.',
            variant: 'destructive',
          })
        } else {
          toast({
            title: 'Error de autenticación',
            description: 'Credenciales incorrectas. Por favor, intenta de nuevo.',
            variant: 'destructive',
          })
        }
      } else if (result?.ok) {
        toast({
          title: '¡Bienvenido!',
          description: 'Inicio de sesión exitoso.',
        })
        router.push('/dashboard')
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Hubo un problema al iniciar sesión. Intenta de nuevo.',
        variant: 'destructive',
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
                  src={branding?.logoUrl || "/volkern-logo.png"}
                  alt={branding?.nombreEmpresa || "Volkern CRM"}
                  width={192}
                  height={64}
                  className="object-contain"
                  style={{ width: 'auto', height: 'auto' }}
                  priority
                />
              </div>
            </div>
            <CardDescription className="text-center">
              {branding?.nombreEmpresa 
                ? `Inicia sesión en ${branding.nombreEmpresa}`
                : "Inicia sesión para acceder a tu panel de administración"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!twoFactorStep ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="admin@volkern.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Contraseña</Label>
                      <Link 
                        href="/auth/recuperar-contrasena" 
                        className="text-sm text-primary hover:underline"
                      >
                        ¿Olvidaste tu contraseña?
                      </Link>
                    </div>
                    <div className="relative" suppressHydrationWarning>
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="space-y-2">
                    <Label htmlFor="code">Código de Verificación</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="code"
                        type="text"
                        placeholder="123456"
                        value={twoFactorCode}
                        onChange={(e) => setTwoFactorCode(e.target.value)}
                        className="pl-10 text-center text-xl tracking-[0.5em] font-bold"
                        maxLength={6}
                        required
                        autoFocus
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Introduce el código de 6 dígitos que enviamos a tu email.
                    </p>
                  </div>
                  <Button 
                    type="button" 
                    variant="link" 
                    className="w-full text-xs"
                    onClick={() => setTwoFactorStep(false)}
                  >
                    Volver al login
                  </Button>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {twoFactorStep ? 'Verificando...' : 'Iniciando sesión...'}
                  </div>
                ) : (
                  twoFactorStep ? 'Verificar Código' : 'Iniciar sesión'
                )}
              </Button>
            </form>
            
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
