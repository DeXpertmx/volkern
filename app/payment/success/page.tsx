
'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, Calendar, Mail, Home } from 'lucide-react'
import Link from 'next/link'

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams()
  const sessionId = searchParams?.get('session_id')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simular verificación del pago
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Verificando tu pago...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl text-green-800">¡Pago Exitoso!</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <div className="space-y-2">
            <p className="text-muted-foreground">
              Tu pago se ha procesado correctamente y tu cita ha sido confirmada.
            </p>
            <p className="text-sm text-muted-foreground">
              Recibirás un email de confirmación con todos los detalles.
            </p>
          </div>

          {sessionId && (
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">ID de transacción:</p>
              <p className="font-mono text-sm">{sessionId.slice(0, 20)}...</p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-center text-sm text-muted-foreground">
              <Mail className="h-4 w-4 mr-2" />
              Revisa tu email para más detalles
            </div>
            <div className="flex items-center justify-center text-sm text-muted-foreground">
              <Calendar className="h-4 w-4 mr-2" />
              Añade la cita a tu calendario
            </div>
          </div>

          <div className="pt-4 space-y-2">
            <p className="text-sm font-medium">¿Necesitas hacer cambios?</p>
            <p className="text-xs text-muted-foreground mb-4">
              Contacta con nosotros y te ayudaremos con cualquier consulta.
            </p>
            
            <Link href="/">
              <Button className="w-full">
                <Home className="h-4 w-4 mr-2" />
                Volver al inicio
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
