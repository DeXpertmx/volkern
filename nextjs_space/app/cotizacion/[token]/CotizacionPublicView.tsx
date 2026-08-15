'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  CheckCircle,
  Download,
  Calendar,
  Building2,
  FileText,
  Clock,
  Printer,
  AlertTriangle,
  Loader2
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { calculateCotizacionDisplayTotals } from '@/lib/cotizaciones/cotizacion-totals'

interface CotizacionItem {
  id: string
  concepto: string
  descripcion: string | null
  cantidad: number
  precioUnitario: number
  descuento: number
  total: number
}

interface Cotizacion {
  id: string
  tenantId: string
  numero: string
  titulo: string
  descripcion: string | null
  estado: string
  subtotal: number
  descuentoPorcentaje: number
  descuentoMonto: number
  impuestos: number
  total: number
  moneda: string
  validezDias: number
  terminosPago: string | null
  notasCliente: string | null
  fechaCreacion: string
  fechaVencimiento: string | null
  clienteNombre: string | null
  clienteEmpresa: string | null
  items: CotizacionItem[]
  tenant: {
    nombre: string
    dominio: string | null
    configuracion: any
  }
}

export default function CotizacionPublicView({ cotizacion }: { cotizacion: Cotizacion }) {
  const [accepting, setAccepting] = useState(false)
  const [showAcceptDialog, setShowAcceptDialog] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [verificationChannels, setVerificationChannels] = useState<Array<{ channel: 'email' | 'whatsapp'; destinationMasked: string }>>([])
  const [selectedChannel, setSelectedChannel] = useState<'email' | 'whatsapp' | null>(null)
  const [verificationStep, setVerificationStep] = useState<'channel' | 'code'>('channel')
  const [challengeId, setChallengeId] = useState('')
  const [challengeToken, setChallengeToken] = useState('')
  const [verificationCode, setVerificationCode] = useState('')

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: cotizacion.moneda || 'MXN'
    }).format(amount)
  }

  const displayTotals = calculateCotizacionDisplayTotals(
    cotizacion.items,
    cotizacion.subtotal,
    cotizacion.descuentoMonto,
  )

  const isExpired = () => {
    if (!cotizacion.fechaVencimiento) return false
    return new Date(cotizacion.fechaVencimiento) < new Date() && 
           !['aceptada', 'rechazada'].includes(cotizacion.estado)
  }

  const openVerificationDialog = async () => {
    setAccepting(true)
    try {
      const res = await fetch(`/api/cotizaciones/public/${cotizacion.id}/verification?tenantId=${encodeURIComponent(cotizacion.tenantId)}`)
      const data = await res.json()
      if (!res.ok || !data.channels?.length) {
        toast.error(data.error || 'Esta cotización no tiene un email o WhatsApp válido para verificar la aceptación')
        return
      }
      setVerificationChannels(data.channels)
      setSelectedChannel(data.channels[0].channel)
      setVerificationStep('channel')
      setVerificationCode('')
      setShowAcceptDialog(true)
    } catch (error) {
      toast.error('No se pudieron consultar los canales de verificación')
    } finally {
      setAccepting(false)
    }
  }

  const requestVerificationCode = async () => {
    if (!selectedChannel) return
    setAccepting(true)
    try {
      const res = await fetch(`/api/cotizaciones/public/${cotizacion.id}/verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: cotizacion.tenantId, channel: selectedChannel }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'No se pudo enviar el código')
        return
      }
      setChallengeId(data.challengeId)
      setChallengeToken(data.challengeToken)
      setVerificationStep('code')
      toast.success(`Código enviado a ${data.destinationMasked}`)
    } catch (error) {
      toast.error('Error de conexión al enviar el código')
    } finally {
      setAccepting(false)
    }
  }

  const handleAccept = async () => {
    if (!challengeId || !challengeToken || !/^\d{6}$/.test(verificationCode)) {
      toast.error('Introduce el código de 6 dígitos')
      return
    }

    setAccepting(true)
    try {
      const res = await fetch(`/api/cotizaciones/public/${cotizacion.id}/verification/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: cotizacion.tenantId,
          challengeId,
          challengeToken,
          code: verificationCode,
        }),
      })
      const data = await res.json()

      if (res.ok) {
        toast.success('¡Cotización aceptada y verificada!')
        setShowAcceptDialog(false)
        window.location.reload()
      } else {
        toast.error(data.error || 'Código inválido')
      }
    } catch (error) {
      toast.error('Error de conexión al verificar la aceptación')
    } finally {
      setAccepting(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const downloadPdf = async () => {
    setDownloadingPdf(true)
    try {
      // Usamos el tokenPublico que está en la URL actual (segundo segmento después de /cotizacion/)
      const pathParts = window.location.pathname.split('/')
      const token = pathParts[2] // /cotizacion/[token]
      const response = await fetch(`/api/cotizaciones/public/${token}/pdf`)
      if (!response.ok) {
        throw new Error('Error generando PDF')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${cotizacion.numero}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('PDF descargado correctamente')
    } catch (error) {
      console.error('Error downloading PDF:', error)
      toast.error('Error al descargar el PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold">{cotizacion.tenant.nombre}</h1>
              <p className="text-indigo-100">Cotización {cotizacion.numero}</p>
            </div>
            <div className="flex gap-2 print:hidden">
              <Button variant="secondary" size="sm" onClick={downloadPdf} disabled={downloadingPdf}>
                {downloadingPdf ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {downloadingPdf ? 'Generando...' : 'Descargar PDF'}
              </Button>
              <Button variant="secondary" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Estado banner */}
        {cotizacion.estado === 'aceptada' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-600" />
            <div>
              <p className="font-semibold text-green-800">Cotización Aceptada</p>
              <p className="text-sm text-green-600">Gracias por confiar en nosotros</p>
            </div>
          </div>
        )}

        {isExpired() && cotizacion.estado !== 'aceptada' && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-orange-600" />
            <div>
              <p className="font-semibold text-orange-800">Cotización Vencida</p>
              <p className="text-sm text-orange-600">Esta cotización ha expirado. Contacta al proveedor para una nueva.</p>
            </div>
          </div>
        )}

        {/* Info card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-xl">{cotizacion.titulo}</CardTitle>
            {cotizacion.descripcion && (
              <p className="text-muted-foreground">{cotizacion.descripcion}</p>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              {cotizacion.clienteNombre && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{cotizacion.clienteNombre}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Creada: {format(new Date(cotizacion.fechaCreacion), 'dd MMM yyyy', { locale: es })}</span>
              </div>
              {cotizacion.fechaVencimiento && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className={isExpired() ? 'text-red-500' : ''}>
                    Vence: {format(new Date(cotizacion.fechaVencimiento), 'dd MMM yyyy', { locale: es })}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Items table */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Detalle de la Cotización
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[45%]">Concepto</TableHead>
                  <TableHead className="text-center">Cantidad</TableHead>
                  <TableHead className="text-right">Precio Unit.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cotizacion.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{item.concepto}</p>
                        {item.descripcion && (
                          <p className="text-sm text-muted-foreground">{item.descripcion}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{item.cantidad}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.precioUnitario)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(item.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Subtotal bruto</TableCell>
                  <TableCell className="text-right">{formatCurrency(displayTotals.subtotalBruto)}</TableCell>
                </TableRow>
                {displayTotals.descuentosLineas > 0 && (
                  <TableRow className="text-green-600">
                    <TableCell colSpan={3}>Descuentos por línea</TableCell>
                    <TableCell className="text-right">-{formatCurrency(displayTotals.descuentosLineas)}</TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell colSpan={3}>Subtotal</TableCell>
                  <TableCell className="text-right">{formatCurrency(displayTotals.subtotal)}</TableCell>
                </TableRow>
                {displayTotals.descuentoGlobal > 0 && (
                  <TableRow className="text-green-600">
                    <TableCell colSpan={3}>Descuento global{cotizacion.descuentoPorcentaje > 0 ? ` (${cotizacion.descuentoPorcentaje}%)` : ''}</TableCell>
                    <TableCell className="text-right">-{formatCurrency(displayTotals.descuentoGlobal)}</TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell colSpan={3}>Base imponible</TableCell>
                  <TableCell className="text-right">{formatCurrency(displayTotals.baseImponible)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3}>IVA</TableCell>
                  <TableCell className="text-right">{formatCurrency(cotizacion.impuestos)}</TableCell>
                </TableRow>
                <TableRow className="text-lg font-bold">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right">{formatCurrency(cotizacion.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {/* Términos */}
        {(cotizacion.terminosPago || cotizacion.notasCliente) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Términos y Condiciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cotizacion.terminosPago && (
                <div>
                  <p className="font-medium text-sm">Términos de Pago</p>
                  <p className="text-muted-foreground">{cotizacion.terminosPago}</p>
                </div>
              )}
              {cotizacion.notasCliente && (
                <div>
                  <p className="font-medium text-sm">Notas</p>
                  <p className="text-muted-foreground">{cotizacion.notasCliente}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Accept button */}
        {cotizacion.estado !== 'aceptada' && cotizacion.estado !== 'rechazada' && !isExpired() && (
          <div className="text-center print:hidden">
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
              onClick={() => void openVerificationDialog()}
            >
              <CheckCircle className="h-5 w-5 mr-2" />
              Aceptar Cotización
            </Button>
            <p className="text-sm text-muted-foreground mt-2">
              Válida por {cotizacion.validezDias} días
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t bg-white print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} {cotizacion.tenant.nombre} | Powered by Volkern CRM</p>
        </div>
      </div>

      {/* Verification dialog */}
      <Dialog open={showAcceptDialog} onOpenChange={setShowAcceptDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verificar y aceptar cotización</DialogTitle>
            <DialogDescription>
              Para proteger al cliente, enviaremos un código temporal al email o WhatsApp registrado.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="font-medium">Total a pagar:</span>
              <span className="text-xl font-bold">{formatCurrency(cotizacion.total)}</span>
            </div>
          </div>

          {verificationStep === 'channel' ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">¿Dónde quieres recibirlo?</p>
              {verificationChannels.map((option) => (
                <button
                  key={option.channel}
                  type="button"
                  onClick={() => setSelectedChannel(option.channel)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedChannel === option.channel ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <span className="font-medium">{option.channel === 'email' ? 'Email' : 'WhatsApp'}</span>
                  <span className="block text-sm text-muted-foreground">{option.destinationMasked}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Introduce el código de 6 dígitos que enviamos a {verificationChannels.find((option) => option.channel === selectedChannel)?.destinationMasked}.
              </p>
              <Input
                inputMode="numeric"
                autoFocus
                maxLength={6}
                placeholder="123456"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-2xl tracking-[0.5em] font-bold"
              />
              <p className="text-xs text-muted-foreground">El código caduca en 10 minutos y tiene un máximo de 5 intentos.</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAcceptDialog(false)}>
              Cancelar
            </Button>
            {verificationStep === 'code' && (
              <Button variant="ghost" onClick={() => setVerificationStep('channel')} disabled={accepting}>
                Cambiar canal
              </Button>
            )}
            <Button
              onClick={verificationStep === 'channel' ? requestVerificationCode : handleAccept}
              disabled={accepting || (verificationStep === 'channel' ? !selectedChannel : verificationCode.length !== 6)}
            >
              {accepting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              {verificationStep === 'channel' ? 'Enviar código' : 'Verificar y aceptar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
