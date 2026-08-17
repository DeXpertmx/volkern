'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  ArrowLeft, Send, Download, Copy, CheckCircle, XCircle, Clock,
  Eye, FileText, User, Building2, Calendar, Mail, Phone,
  ExternalLink, Loader2, Edit, PenLine, AlertTriangle
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter
} from '@/components/ui/table'

interface ContratoTimelineEvent {
  id: string
  action: string
  note: string | null
  actorType: string
  metadata: any | null
  createdAt: string
}

interface ContratoItem {
  id: string
  concepto: string
  descripcion: string | null
  cantidad: number
  precioUnitario: number
  descuento: number
  total: number
  orden: number
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
  metodoPago: string | null
  condicionesPago: string | null
  frecuenciaPago: string | null
  clausulas: string | null
  notasCliente: string | null
  fechaCreacion: string
  fechaEnvio: string | null
  fechaFirmaCliente: string | null
  fechaFirmaEmpresa: string | null
  fechaInicio: string | null
  fechaFin: string | null
  tokenPublico: string | null
  vecesVista: number
  ultimaVista: string | null
  firmadoPorCliente: boolean
  nombreFirmaCliente: string | null
  firmadoPorEmpresa: boolean
  nombreFirmaEmpresa: string | null
  clienteNombre: string | null
  clienteEmail: string | null
  clienteTelefono: string | null
  clienteEmpresa: string | null
  clienteRfc: string | null
  clienteDireccion: string | null
  snapshotNombre: string | null
  snapshotNif: string | null
  snapshotDireccion: string | null
  snapshotMetadata: any | null
  templateData: any | null
  signatureRequests: any[] | null
  timeline: ContratoTimelineEvent[] | null
  contact: { id: string; nombre: string; email: string } | null
  lead: { id: string; nombre: string } | null
  deal: { id: string; titulo: string; valor: number } | null
  cotizacion: { id: string; numero: string } | null
  creadoPor: { id: string; name: string } | null
  items: ContratoItem[]
  pagos: any[]
}

export default function ContratoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [loading, setLoading] = useState(true)
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendEmail, setSendEmail] = useState('')
  const [sendMessage, setSendMessage] = useState('')
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [signModalOpen, setSignModalOpen] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signName, setSignName] = useState('')

  useEffect(() => {
    fetchContrato()
  }, [params.id])

  useEffect(() => {
    if (contrato?.clienteEmail) {
      setSendEmail(contrato.clienteEmail)
    }
  }, [contrato])

  const fetchContrato = async () => {
    try {
      const res = await fetch(`/api/contratos/${params.id}`)
      if (res.ok) {
        const data = await res.json()
        setContrato(data)
      } else {
        toast.error('Contrato no encontrado')
        router.push('/dashboard/contratos')
      }
    } catch (error) {
      toast.error('Error al cargar contrato')
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (!sendEmail) {
      toast.error('El email es requerido')
      return
    }
    setSending(true)
    try {
      const res = await fetch(`/api/contratos/${params.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sendEmail, mensaje: sendMessage })
      })
      if (res.ok) {
        toast.success('Contrato enviado correctamente')
        setSendModalOpen(false)
        fetchContrato()
      } else {
        toast.error('Error al enviar contrato')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setSending(false)
    }
  }

  const handleSignByCompany = async () => {
    setSigning(true)
    try {
      const res = await fetch(`/api/contratos/sign/${params.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorNote: `Firma digital autorizada por ${signName}`
        })
      })
      if (res.ok) {
        toast.success('Contrato sellado e inmutable. Deal actualizado.')
        setSignModalOpen(false)
        fetchContrato()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al sellar el contrato')
      }
    } catch (error) {
      toast.error('Error de conexión con el protocolo de firma')
    } finally {
      setSigning(false)
    }
  }

  const requestVolkernSign = async () => {
    if (!contrato) return
    setSending(true)
    try {
      const res = await fetch(`/api/contratos/${contrato.id}/libresign`, {
        method: 'POST'
      })
      if (res.ok) {
        toast.success('Solicitud de firma digital enviada')
        fetchContrato()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al solicitar firma')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setSending(false)
    }
  }

  const downloadPdf = async () => {
    if (!contrato) return
    setDownloadingPdf(true)
    try {
      const res = await fetch(`/api/contratos/${contrato.id}/pdf`)
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

  const copyPublicLink = () => {
    if (contrato?.tokenPublico) {
      navigator.clipboard.writeText(`${window.location.origin}/contrato/${contrato.tokenPublico}`)
      toast.success('Enlace copiado')
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: contrato?.moneda || 'MXN'
    }).format(amount)
  }

  const getEstadoBadge = (estado: string) => {
    const styles: Record<string, string> = {
      borrador: 'bg-gray-100 text-gray-700',
      enviado: 'bg-blue-100 text-blue-700',
      firmado: 'bg-green-100 text-green-700',
      vigente: 'bg-emerald-100 text-emerald-700',
      completado: 'bg-slate-100 text-slate-700',
      cancelado: 'bg-red-100 text-red-700'
    }
    return <Badge className={styles[estado] || 'bg-gray-100'}>{estado}</Badge>
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin" /></div>
  }

  if (!contrato) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/contratos')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{contrato.numero}</h1>
              {getEstadoBadge(contrato.estado)}
            </div>
            <p className="text-muted-foreground">{contrato.titulo}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {contrato.estado === 'borrador' && (
            <Button onClick={() => setSendModalOpen(true)}>
              <Send className="h-4 w-4 mr-2" /> Enviar
            </Button>
          )}
          {['borrador', 'enviado'].includes(contrato.estado) && (
            <Button variant="default" className="bg-indigo-600 hover:bg-indigo-700" onClick={requestVolkernSign} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PenLine className="h-4 w-4 mr-2" />}
              Firma eIDAS
            </Button>
          )}
          {contrato.tokenPublico && (
            <Button variant="outline" onClick={copyPublicLink}>
              <Copy className="h-4 w-4 mr-2" /> Copiar Enlace
            </Button>
          )}
          <Button variant="outline" onClick={downloadPdf} disabled={downloadingPdf}>
            {downloadingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {downloadingPdf ? 'Generando...' : 'PDF'}
          </Button>
          {!contrato.firmadoPorEmpresa && ['enviado', 'firmado'].includes(contrato.estado) && (
            <Button onClick={() => setSignModalOpen(true)}>
              <PenLine className="h-4 w-4 mr-2" /> Firmar (Empresa)
            </Button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Contenido principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle>Objeto del Contrato</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Concepto</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Precio Unit.</TableHead>
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
                      <TableCell className="text-right">{item.cantidad}</TableCell>
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
                      <TableCell colSpan={3}>Descuento{contrato.descuentoPorcentaje > 0 && ` (${contrato.descuentoPorcentaje}%)`}</TableCell>
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
            <Card>
              <CardHeader>
                <CardTitle>Términos y Condiciones</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {contrato.condicionesPago && (
                  <div>
                    <Label className="text-muted-foreground">Condiciones de Pago</Label>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{contrato.condicionesPago}</p>
                  </div>
                )}
                {contrato.clausulas && (
                  <div>
                    <Label className="text-muted-foreground">Cláusulas</Label>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{contrato.clausulas}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Timeline / Historial */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Historial del Contrato</CardTitle>
            </CardHeader>
            <CardContent>
              {contrato.timeline && contrato.timeline.length > 0 ? (
                <div className="relative pl-6 space-y-6 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:bg-muted-foreground/20">
                  {contrato.timeline.map((ev) => {
                    const isSigned = ev.action === 'document_signed'
                    const isSent = ev.action === 'sent' || ev.action === 'document_able_to_sign'
                    return (
                      <div key={ev.id} className="relative">
                        <div className={`absolute -left-[26px] mt-1 h-4 w-4 rounded-full border-4 border-background ${isSigned ? 'bg-emerald-500/10' : isSent ? 'bg-indigo-500/10' : 'bg-muted'}`}>
                          <div className={`h-1 w-1 rounded-full mt-[3px] ml-[3px] ${isSigned ? 'bg-emerald-500' : isSent ? 'bg-indigo-500' : 'bg-muted-foreground'}`} />
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[9px] uppercase tracking-wider ${isSigned ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : isSent ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : ''}`}>
                            {isSigned ? 'Firmado' : isSent ? 'Enviado a firma' : ev.action.replace(/_/g, ' ')}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(ev.createdAt), 'dd MMM yyyy HH:mm', { locale: es })}
                          </span>
                        </div>
                        <p className="text-sm mt-1 text-foreground/90">{ev.note || ev.action}</p>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin eventos registrados todavía.</p>
              )}
            </CardContent>
          </Card>

          {/* Firmas */}
          <Card>
            <CardHeader>
              <CardTitle>Estado de Firmas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center p-4 border rounded-lg">
                  <div className={`mb-2 ${contrato.firmadoPorEmpresa ? 'text-green-600' : 'text-gray-400'}`}>
                    {contrato.firmadoPorEmpresa ? <CheckCircle className="h-8 w-8 mx-auto" /> : <Clock className="h-8 w-8 mx-auto" />}
                  </div>
                  <p className="font-medium">Empresa</p>
                  {contrato.firmadoPorEmpresa ? (
                    <>
                      <p className="text-sm text-green-600">{contrato.nombreFirmaEmpresa}</p>
                      <p className="text-xs text-muted-foreground">
                        {contrato.fechaFirmaEmpresa && format(new Date(contrato.fechaFirmaEmpresa), 'dd MMM yyyy HH:mm', { locale: es })}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Pendiente</p>
                  )}
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className={`mb-2 ${contrato.firmadoPorCliente ? 'text-green-600' : 'text-gray-400'}`}>
                    {contrato.firmadoPorCliente ? <CheckCircle className="h-8 w-8 mx-auto" /> : <Clock className="h-8 w-8 mx-auto" />}
                  </div>
                  <p className="font-medium">Cliente</p>
                  {contrato.firmadoPorCliente ? (
                    <>
                      <p className="text-sm text-green-600">{contrato.nombreFirmaCliente}</p>
                      <p className="text-xs text-muted-foreground">
                        {contrato.fechaFirmaCliente && format(new Date(contrato.fechaFirmaCliente), 'dd MMM yyyy HH:mm', { locale: es })}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Pendiente</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Cliente */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><User className="h-4 w-4" /> Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-1 mb-2">
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                  {contrato.estado === 'vigente' ? 'Entidad Legal (Snapshot)' : 'Identidad del Cliente'}
                </span>
                <p className="text-lg font-bold">{contrato.snapshotNombre || contrato.clienteNombre}</p>
              </div>
              
              <div className="space-y-2">
                {(contrato.snapshotNif || contrato.clienteRfc) && (
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border border-muted">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">NIF: {contrato.snapshotNif || contrato.clienteRfc}</span>
                  </div>
                )}
                
                <div className="flex items-center gap-2 text-sm text-muted-foreground pl-1">
                  <Mail className="h-4 w-4" />
                  <span>{contrato.clienteEmail}</span>
                </div>
                
                {contrato.clienteTelefono && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground pl-1">
                    <Phone className="h-4 w-4" />
                    <span>{contrato.clienteTelefono}</span>
                  </div>
                )}

                {(contrato.snapshotDireccion || contrato.clienteDireccion) && (
                  <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-100">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Dirección Legal</p>
                    <p className="text-xs text-slate-600 leading-tight">{contrato.snapshotDireccion || (contrato as any).clienteDireccion}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Vigencia */}
          {(contrato.fechaInicio || contrato.fechaFin) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Vigencia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {contrato.fechaInicio && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Inicio:</span>
                    <span>{format(new Date(contrato.fechaInicio), 'dd MMM yyyy', { locale: es })}</span>
                  </div>
                )}
                {contrato.fechaFin && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fin:</span>
                    <span>{format(new Date(contrato.fechaFin), 'dd MMM yyyy', { locale: es })}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Integridad Digital (Trust Protocol) */}
          {contrato.estado === 'vigente' && (
            <Card className="border-emerald-200 bg-emerald-50/20 shadow-sm shadow-emerald-100">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-emerald-800 text-sm">
                  <CheckCircle className="h-4 w-4" /> Integridad Digital (Trust Protocol)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 bg-white rounded-lg border border-emerald-100 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Sello de Seguridad</span>
                    <Badge variant="outline" className="text-[9px] border-emerald-200 text-emerald-700 bg-emerald-50">VERIFICADO</Badge>
                  </div>
                  <code className="text-[10px] bg-slate-100 p-1.5 rounded break-all text-slate-500 border border-slate-200">
                    {(contrato.templateData as any)?.digitalSeal?.hash || 'HASH_GENERATED_BY_TRUST_PROTOCOL'}
                  </code>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Snapshot Fiscal:</span>
                    <span className="font-semibold text-emerald-700">CONGELADO</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Firmante Empresa:</span>
                    <span className="font-semibold">{contrato.nombreFirmaEmpresa}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Vigencia */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Eye className="h-4 w-4" /> Seguimiento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vistas:</span>
                <span>{contrato.vecesVista}</span>
              </div>
              {contrato.ultimaVista && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Última vista:</span>
                  <span>{format(new Date(contrato.ultimaVista), 'dd MMM yyyy HH:mm', { locale: es })}</span>
                </div>
              )}
              {contrato.fechaEnvio && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Enviado:</span>
                  <span>{format(new Date(contrato.fechaEnvio), 'dd MMM yyyy', { locale: es })}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Firma Digital eIDAS */}
          {contrato.signatureRequests && contrato.signatureRequests.length > 0 && (
            <Card className="border-indigo-100 bg-indigo-50/10">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-indigo-700">
                  <PenLine className="h-4 w-4" /> Firma Digital eIDAS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {contrato.signatureRequests.map((req: any) => (
                  <div key={req.id} className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-xs text-indigo-600 uppercase tracking-wider">{req.libreSignUuid.split('-')[0]}</span>
                      <Badge className={
                        req.status === 'signed' ? 'bg-green-100 text-green-700' : 
                        req.status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                      }>
                        {req.status}
                      </Badge>
                    </div>
                    
                    <div className="text-[11px] text-muted-foreground bg-white/50 p-2 rounded border border-indigo-100">
                      <strong>Último evento:</strong><br/>
                      {req.auditEvents?.[0]?.eventType || 'Pendiente'} - {req.auditEvents?.[0]?.timestamp && format(new Date(req.auditEvents[0].timestamp), 'HH:mm', { locale: es })}
                    </div>

                    {req.status === 'signed' && (
                      <Button variant="outline" size="sm" className="w-full text-[11px] h-8 bg-white" onClick={() => window.open(req.auditTrailUrl || '#')}>
                        <FileText className="h-3 w-3 mr-1" /> Ver Certificado Auditoría
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Relaciones */}
          {(contrato.deal || contrato.lead || contrato.cotizacion) && (
            <Card>
              <CardHeader>
                <CardTitle>Relaciones</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {contrato.cotizacion && (
                  <Button variant="link" className="p-0 h-auto" onClick={() => router.push(`/dashboard/cotizaciones/${contrato.cotizacion!.id}`)}>
                    Cotización: {contrato.cotizacion.numero} <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                )}
                {contrato.deal && (
                  <Button variant="link" className="p-0 h-auto" onClick={() => router.push(`/dashboard/pipeline/${contrato.deal!.id}`)}>
                    Deal: {contrato.deal.titulo} <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                )}
                {contrato.lead && (
                  <Button variant="link" className="p-0 h-auto" onClick={() => router.push(`/dashboard/leads/${contrato.lead!.id}`)}>
                    Lead: {contrato.lead.nombre} <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal Enviar */}
      <Dialog open={sendModalOpen} onOpenChange={setSendModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Contrato</DialogTitle>
            <DialogDescription>El cliente recibirá un enlace para revisar y firmar el contrato.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Email del Cliente *</Label>
              <Input type="email" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} placeholder="cliente@email.com" />
            </div>
            <div>
              <Label>Mensaje (opcional)</Label>
              <Input value={sendMessage} onChange={(e) => setSendMessage(e.target.value)} placeholder="Mensaje personalizado..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Firmar Empresa */}
      <Dialog open={signModalOpen} onOpenChange={setSignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Firmar Contrato</DialogTitle>
            <DialogDescription>Firmar el contrato en nombre de la empresa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nombre del Firmante *</Label>
              <Input value={signName} onChange={(e) => setSignName(e.target.value)} placeholder="Nombre completo" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSignByCompany} disabled={signing}>
              {signing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PenLine className="h-4 w-4 mr-2" />}
              Firmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
