
'use client'

import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { XCircle, ArrowLeft, RefreshCw } from 'lucide-react'
import Link from 'next/link'

export default function PaymentCancelPage() {
  const searchParams = useSearchParams()
  const citaId = searchParams?.get('cita_id')

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto h-16 w-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
            <XCircle className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl text-red-800">Pago Cancelado</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <div className="space-y-2">
            <p className="text-muted-foreground">
              Has cancelado el proceso de pago. Tu cita no ha sido confirmada.
            </p>
            <p className="text-sm text-muted-foreground">
              No se ha realizado ningún cargo a tu tarjeta.
            </p>
          </div>

          <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg">
            <p className="text-sm text-orange-800">
              <strong>¿Hubo algún problema?</strong>
            </p>
            <p className="text-xs text-orange-700 mt-1">
              Si experimentaste dificultades técnicas, puedes intentar el proceso de pago nuevamente o contactarnos para asistencia.
            </p>
          </div>

          <div className="space-y-3 pt-4">
            <Link href="/embed/booking">
              <Button className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                Intentar nuevamente
              </Button>
            </Link>
            
            <Link href="/embed/contact">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Contactar soporte
              </Button>
            </Link>
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              Si continúas teniendo problemas, por favor contáctanos y te ayudaremos a completar tu reserva.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
