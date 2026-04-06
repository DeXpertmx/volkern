'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  CheckCircle, Download, Calendar, Building2, FileText,
  Clock, Printer, AlertTriangle, PenLine, User, Loader2
} from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface ContratoItem {
  id: string
  concepto: string
  descripcion: string | null
  cantidad: number
  precioUnitario: number
  descuento: number
  total: number
}

interface Contrato {
  id: string
  numero: string
  titulo: string
  descripcion: string | null
  tipo: string
  estado: string
  subtotal: number
  descuentoPorcentaje: number
  descuentoMonto: number
  impuestos: number
  total: number
  moneda: string
  condicionesPago: string | null
  clausulas: string | null
  notasCliente: string | null
  fechaCreacion: string
  fechaInicio: string | null
  fechaFin: string | null
  firmadoPorCliente: boolean
  nombreFirmaCliente: string | null
  fechaFirmaCliente: string | null
  firmadoPorEmpresa: boolean
  nombreFirmaEmpresa: string | null
  fechaFirmaEmpresa: string | null
  clienteNombre: string | null
  clienteEmpresa: string | null
  items: ContratoItem[]
  tenant: {
    nombre: string
    dominio: string | null
    configuracion: any
  }
}

export default function ContratoPublicView({ contrato }: { contrato: Contrato }) {
  const [signing, setSigning] = useState(false)
  const [showSignDialog, setShowSignDialog] = useState(false)
  const [signName, setSignName] = useState('')
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: contrato.moneda || 'MXN'
    }).format(amount)
  }

  const handleSign = async () => {
    if (!signName.trim()) {
      toast.error('Por favor ingresa tu nombre')
      return
    }
    setSigning(true)
    try {
      const token = window.location.pathname.split('/')[2]
      const res = await fetch(`/api/contratos/public/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombreFirma: signName })
      })

      if (res.ok) {
        toast.success('¡Contrato firmado exitosamente!')
        setShowSignDialog(false)
        window.location.reload()
      } else {
        const error = await res.json()
        toast.error(error.error || 'Error al firmar')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setSigning(false)
    }
  }

  const downloadPdf = async () => {
    setDownloadingPdf(true)
    try {
      const token = window.location.pathname.split('/')[2]
      const res = await fetch(`/api/contratos/public/${token}/pdf`)
      if (!res.ok) throw new Error('Error')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${contrato.numero}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('PDF descargado')
    } catch (error) {
      toast.error('Error al descargar PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const canSign = ['enviado', 'firmado'].includes(contrato.estado) && !contrato.firmadoPorCliente

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold">{contrato.tenant.nombre}</h1>
              <p className="text-indigo-100">Contrato {contrato.numero}</p>
            </div>
            <div className="flex gap-2 print:hidden">
              <Button variant="secondary" size="sm" onClick={downloadPdf} disabled={downloadingPdf}>
                {downloadingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                {downloadingPdf ? 'Generando...' : 'PDF'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" /> Imprimir
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Estado banner */}
        {contrato.estado === 'vigente' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-600" />
            <div>
              <p className="font-semibold text-green-800">Contrato Vigente</p>
              <p className="text-sm text-green-600">Este contrato ha sido firmado por ambas partes</p>
            </div>
          </div>
        )}

        {contrato.firmadoPorCliente && contrato.estado !== 'vigente' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-blue-600" />
            <div>
              <p className="font-semibold text-blue-800">Ya has firmado este contrato</p>
              <p className="text-sm text-blue-600">Firmado por: {contrato.nombreFirmaCliente}</p>
            </div>
          </div>
        )}

        {contrato.estado === 'cancelado' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-red-600" />
            <div>
              <p className="font-semibold text-red-800">Contrato Cancelado</p>
              <p className="text-sm text-red-600">Este contrato ha sido cancelado</p>
            </div>
          </div>
        )}

        {/* Título y descripción */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-xl">{contrato.titulo}</CardTitle>
            {contrato.descripcion && <p className="text-muted-foreground">{contrato.descripcion}</p>}
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Fecha:</span>
                <span className="ml-2 font-medium">{format(new Date(contrato.fechaCreacion), 'dd MMMM yyyy', { locale: es })}</span>
              </div>
              {contrato.fechaInicio && (
                <div>
                  <span className="text-muted-foreground">Vigencia:</span>
                  <span className="ml-2 font-medium">
                    {format(new Date(contrato.fechaInicio), 'dd MMM yyyy', { locale: es })}
                    {contrato.fechaFin && ` - ${format(new Date(contrato.fechaFin), 'dd MMM yyyy', { locale: es })}`}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Items */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Objeto del Contrato</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-center">Cantidad</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contrato.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.concepto}</div>
                      {item.descripcion && <div className="text-xs text-muted-foreground">{item.descripcion}</div>}
                    </TableCell>
                    <TableCell className="text-center">{item.cantidad}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.precioUnitario)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.cantidad * item.precioUnitario)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Subtotal</TableCell>
                  <TableCell className="text-right">{formatCurrency(contrato.subtotal)}</TableCell>
                </TableRow>
                {contrato.descuentoMonto > 0 && (
                  <TableRow>
                    <TableCell colSpan={3}>Descuento</TableCell>
                    <TableCell className="text-right text-red-600">-{formatCurrency(contrato.descuentoMonto)}</TableCell>
                  </TableRow>
                )}
                {contrato.impuestos > 0 && (
                  <TableRow>
                    <TableCell colSpan={3}>IVA (16%)</TableCell>
                    <TableCell className="text-right">{formatCurrency(contrato.impuestos)}</TableCell>
                  </TableRow>
                )}
                <TableRow className="bg-primary/5">
                  <TableCell colSpan={3} className="font-bold">Total</TableCell>
                  <TableCell className="text-right font-bold text-lg">{formatCurrency(contrato.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {/* Términos */}
        {(contrato.condicionesPago || contrato.clausulas) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Términos y Condiciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {contrato.condicionesPago && (
                <div>
                  <Label className="text-muted-foreground">Condiciones de Pago</Label>
                  <p className="mt-1 text-sm whitespace-pre-wrap bg-gray-50 p-3 rounded">{contrato.condicionesPago}</p>
                </div>
              )}
              {contrato.clausulas && (
                <div>
                  <Label className="text-muted-foreground">Cláusulas</Label>
                  <p className="mt-1 text-sm whitespace-pre-wrap bg-gray-50 p-3 rounded">{contrato.clausulas}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Firmas */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Firmas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="text-center p-6 border rounded-lg">
                <div className={`mb-3 ${contrato.firmadoPorEmpresa ? 'text-green-600' : 'text-gray-400'}`}>
                  {contrato.firmadoPorEmpresa ? <CheckCircle className="h-10 w-10 mx-auto" /> : <Clock className="h-10 w-10 mx-auto" />}
                </div>
                <p className="font-medium">{contrato.tenant.nombre}</p>
                {contrato.firmadoPorEmpresa ? (
                  <>
                    <p className="text-sm text-green-600 mt-1">{contrato.nombreFirmaEmpresa}</p>
                    <p className="text-xs text-muted-foreground">
                      {contrato.fechaFirmaEmpresa && format(new Date(contrato.fechaFirmaEmpresa), 'dd MMM yyyy HH:mm', { locale: es })}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">Pendiente de firma</p>
                )}
              </div>
              <div className="text-center p-6 border rounded-lg">
                <div className={`mb-3 ${contrato.firmadoPorCliente ? 'text-green-600' : 'text-gray-400'}`}>
                  {contrato.firmadoPorCliente ? <CheckCircle className="h-10 w-10 mx-auto" /> : <User className="h-10 w-10 mx-auto" />}
                </div>
                <p className="font-medium">{contrato.clienteNombre || 'Cliente'}</p>
                {contrato.firmadoPorCliente ? (
                  <>
                    <p className="text-sm text-green-600 mt-1">{contrato.nombreFirmaCliente}</p>
                    <p className="text-xs text-muted-foreground">
                      {contrato.fechaFirmaCliente && format(new Date(contrato.fechaFirmaCliente), 'dd MMM yyyy HH:mm', { locale: es })}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">Pendiente de firma</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Botón de firma */}
        {canSign && (
          <div className="text-center print:hidden">
            <Button size="lg" onClick={() => setShowSignDialog(true)} className="px-8">
              <PenLine className="h-5 w-5 mr-2" /> Firmar Contrato
            </Button>
            <p className="text-sm text-muted-foreground mt-2">
              Al firmar, aceptas los términos y condiciones de este contrato.
            </p>
          </div>
        )}
      </div>

      {/* Dialog de firma */}
      <Dialog open={showSignDialog} onOpenChange={setShowSignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Firmar Contrato</DialogTitle>
            <DialogDescription>
              Por favor ingresa tu nombre completo para firmar el contrato.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Nombre Completo *</Label>
            <Input
              value={signName}
              onChange={(e) => setSignName(e.target.value)}
              placeholder="Tu nombre completo"
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Tu firma será registrada junto con la fecha, hora y dirección IP.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSignDialog(false)}>Cancelar</Button>
            <Button onClick={handleSign} disabled={signing}>
              {signing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PenLine className="h-4 w-4 mr-2" />}
              Confirmar Firma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
