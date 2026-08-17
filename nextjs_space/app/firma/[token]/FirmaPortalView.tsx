'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  FileText,
  CheckCircle2,
  Clock,
  Loader2,
  PenLine,
  Mail,
  MessageCircle,
  Download,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ContratoItem {
  id: string;
  concepto: string;
  descripcion: string | null;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  total: number;
}

interface Signer {
  email?: string;
  name?: string;
  role?: string;
  signRequestId?: number;
  signedAt?: string | null;
  signedBy?: string | null;
}

interface SignatureRequest {
  id: string;
  title: string;
  status: string;
  sentAt: string | null;
  completedAt: string | null;
  signers: Signer[];
  pdfFirmadoDisponible?: boolean;
}

interface TimelineEvent {
  id: string;
  action: string;
  note: string | null;
  createdAt: string;
}

interface Contrato {
  id: string;
  numero: string;
  titulo: string;
  descripcion: string | null;
  tipo: string;
  estado: string;
  subtotal: number;
  descuentoPorcentaje: number;
  descuentoMonto: number;
  impuestos: number;
  total: number;
  moneda: string;
  condicionesPago: string | null;
  clausulas: string | null;
  notasCliente: string | null;
  fechaCreacion: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  fechaEnvio: string | null;
  firmadoPorCliente: boolean;
  nombreFirmaCliente: string | null;
  fechaFirmaCliente: string | null;
  firmadoPorEmpresa: boolean;
  nombreFirmaEmpresa: string | null;
  fechaFirmaEmpresa: string | null;
  clienteNombre: string | null;
  clienteEmpresa: string | null;
  clienteEmail: string | null;
  items: ContratoItem[];
  signatureRequests: SignatureRequest[];
  timeline: TimelineEvent[];
  pdfFirmadoDisponible: boolean;
  tenant: { nombre: string; dominio: string | null; configuracion: any };
}

const ESTADO_LABELS: Record<string, { texto: string; color: string }> = {
  borrador: { texto: 'Borrador', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  enviado: { texto: 'Enviado a firma', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  firmado: { texto: 'Firmado por cliente', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  vigente: { texto: 'Vigente', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelado: { texto: 'Cancelado', color: 'bg-red-50 text-red-700 border-red-200' },
};

const TIMELINE_LABELS: Record<string, string> = {
  created: 'Creado',
  document_sent: 'Enviado a firma',
  document_signed: 'Firmado',
  plan_pagos: 'Plan de pagos',
  pagado: 'Pago registrado',
  actualizado: 'Actualizado',
  cancelado: 'Cancelado',
};

interface FirmaChannel {
  channel: 'email' | 'whatsapp';
  destinationMasked: string;
}

export default function FirmaPortalView({ contrato, token }: { contrato: Contrato; token: string }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [channels, setChannels] = useState<FirmaChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<'email' | 'whatsapp'>('email');
  const [verificationStep, setVerificationStep] = useState<'channel' | 'code'>('channel');
  const [sendingCode, setSendingCode] = useState(false);
  const [challenge, setChallenge] = useState<{
    challengeId: string;
    challengeToken: string;
    destinationMasked: string;
    channel: 'email' | 'whatsapp';
  } | null>(null);
  const [code, setCode] = useState('');
  const [signing, setSigning] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Cargar los canales de verificación disponibles (email/WhatsApp registrados)
  useEffect(() => {
    fetch(`/api/firma/${token}/code`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.channels) && data.channels.length > 0) {
          setChannels(data.channels);
          setSelectedChannel(data.channels[0].channel);
        }
      })
      .catch(() => {});
  }, [token]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: contrato.moneda || 'MXN' }).format(amount);

  const estadoInfo = ESTADO_LABELS[contrato.estado] || { texto: contrato.estado, color: 'bg-slate-100 text-slate-700 border-slate-200' };
  const yaFirmado = contrato.firmadoPorCliente;
  const activeRequest = contrato.signatureRequests[0] || null;
  const signers = activeRequest?.signers || [];

  const sendCode = async () => {
    if (!nombre.trim()) {
      toast.error('Escribe tu nombre completo primero');
      return;
    }
    setSendingCode(true);
    try {
      const res = await fetch(`/api/firma/${token}/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: selectedChannel, email: email || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'No se pudo enviar el código');
        return;
      }
      setChallenge({ challengeId: data.challengeId, challengeToken: data.challengeToken, destinationMasked: data.destinationMasked, channel: data.channel || selectedChannel });
      setVerificationStep('code');
      toast.success(`Código enviado a ${data.destinationMasked}`);
    } catch {
      toast.error('Error de conexión al enviar el código');
    } finally {
      setSendingCode(false);
    }
  };

  const firmar = async () => {
    if (!challenge) {
      toast.error('Solicita primero el código de verificación');
      return;
    }
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error('Ingresa el código de 6 dígitos');
      return;
    }
    setSigning(true);
    try {
      const res = await fetch(`/api/firma/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          challengeToken: challenge.challengeToken,
          code: code.trim(),
          nombreFirma: nombre.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al firmar el contrato');
        return;
      }
      toast.success('¡Contrato firmado exitosamente!');
      window.location.reload();
    } catch {
      toast.error('Error de conexión al firmar');
    } finally {
      setSigning(false);
    }
  };

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      // Si ya hay PDF firmado, se descarga ese; si no, el PDF del contrato
      const path = contrato.pdfFirmadoDisponible
        ? `/api/contratos/public/${token}/pdf-firmado`
        : `/api/contratos/public/${token}/pdf`;
      const res = await fetch(path);
      if (!res.ok) throw new Error('Error');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = contrato.pdfFirmadoDisponible ? `${contrato.numero}-firmado.pdf` : `${contrato.numero}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('No se pudo descargar el PDF');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex items-center gap-2 text-blue-200 text-sm mb-4">
            <ShieldCheck className="h-4 w-4" />
            <span>Portal de firma segura</span>
          </div>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{contrato.titulo}</h1>
              <p className="text-blue-200 mt-1">
                {contrato.tenant.nombre} · Contrato {contrato.numero}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={`border ${estadoInfo.color}`}>{estadoInfo.texto}</Badge>
              {contrato.pdfFirmadoDisponible ? (
                <Button size="sm" onClick={downloadPdf} disabled={downloading} className="bg-emerald-600 hover:bg-emerald-700">
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  <span className="ml-1 hidden sm:inline">PDF firmado</span>
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={downloadPdf} disabled={downloading}>
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  <span className="ml-1 hidden sm:inline">PDF</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Estado de firmas */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <PenLine className="h-4 w-4 text-blue-700" /> Estado de firmas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {signers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Este contrato aún no tiene firmantes asignados.
              </p>
            )}
            {signers.map((s, i) => {
              const firmado = Boolean(s?.signedAt);
              return (
                <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      firmado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {firmado ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s?.name || s?.email || 'Firmante'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s?.email}
                      {s?.role ? ` · ${s.role}` : ''}
                    </p>
                  </div>
                  <Badge variant={firmado ? 'default' : 'outline'} className={firmado ? 'bg-emerald-600' : ''}>
                    {firmado ? 'Firmado' : 'Pendiente'}
                  </Badge>
                </div>
              );
            })}
            {yaFirmado && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <CheckCircle2 className="h-4 w-4 inline mr-1" />
                Firmado por {contrato.nombreFirmaCliente}
                {contrato.fechaFirmaCliente
                  ? ` el ${format(new Date(contrato.fechaFirmaCliente), 'dd MMM yyyy HH:mm', { locale: es })}`
                  : ''}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Panel de firma */}
        {!yaFirmado ? (
          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <PenLine className="h-4 w-4 text-blue-700" /> Firmar contrato
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre completo</Label>
                  <Input
                    placeholder="Tu nombre y apellidos"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>¿Dónde quieres recibir el código?</Label>
                  {channels.length > 0 ? (
                    <div className="grid gap-2">
                      {channels.map((option) => (
                        <button
                          key={option.channel}
                          type="button"
                          onClick={() => setSelectedChannel(option.channel)}
                          disabled={Boolean(challenge)}
                          className={`w-full rounded-lg border p-3 text-left transition-colors ${
                            selectedChannel === option.channel
                              ? 'border-blue-600 bg-blue-50'
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <span className="flex items-center gap-2 font-medium">
                            {option.channel === 'email' ? (
                              <Mail className="h-4 w-4 text-blue-700" />
                            ) : (
                              <MessageCircle className="h-4 w-4 text-emerald-600" />
                            )}
                            {option.channel === 'email' ? 'Email' : 'WhatsApp'}
                          </span>
                          <span className="block text-sm text-muted-foreground">{option.destinationMasked}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Input
                      type="email"
                      placeholder="tucorreo@empresa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={Boolean(challenge)}
                    />
                  )}
                </div>
              </div>

              {!challenge ? (
                <Button onClick={sendCode} disabled={sendingCode}>
                  {sendingCode ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Mail className="h-4 w-4 mr-1" />}
                  Enviar código de verificación
                </Button>
              ) : (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                    {challenge.channel === 'whatsapp' ? (
                      <MessageCircle className="h-4 w-4 inline mr-1 text-emerald-600" />
                    ) : (
                      <Mail className="h-4 w-4 inline mr-1" />
                    )}
                    Enviamos un código de 6 dígitos a {challenge.destinationMasked}. Revisa tu{' '}
                    {challenge.channel === 'whatsapp' ? 'WhatsApp' : 'bandeja de entrada'}.
                  </div>
                  <div className="flex gap-3">
                    <Input
                      placeholder="Código de 6 dígitos"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      maxLength={6}
                      className="max-w-[200px] tracking-widest"
                    />
                    <Button onClick={firmar} disabled={signing} className="bg-emerald-600 hover:bg-emerald-700">
                      {signing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                      Firmar contrato
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Al firmar aceptas los términos del contrato. Tu firma queda registrada con tu nombre, IP y hora exacta.
                  </p>
                </motion.div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Contrato firmado correctamente</p>
              <p className="text-sm mt-1">
                Tu firma quedó registrada el{' '}
                {contrato.fechaFirmaCliente
                  ? format(new Date(contrato.fechaFirmaCliente), 'dd MMM yyyy HH:mm', { locale: es })
                  : ''}
                . Puedes descargar el PDF firmado desde el botón superior.
              </p>
            </div>
          </div>
        )}

        {/* Documento */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-blue-700" /> Documento
              {contrato.pdfFirmadoDisponible && (
                <Badge className="bg-emerald-600 ml-1">Firmado</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <iframe
              src={
                contrato.pdfFirmadoDisponible
                  ? `/api/contratos/public/${token}/pdf-firmado`
                  : `/api/contratos/public/${token}/pdf`
              }
              className="w-full h-[600px] rounded-lg border bg-white"
              title={`Contrato ${contrato.numero}`}
            />
          </CardContent>
        </Card>

        {/* Detalle */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Detalle del contrato</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {contrato.descripcion && (
                <p className="text-sm text-muted-foreground">{contrato.descripcion}</p>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="font-medium">{contrato.clienteNombre || '—'}</p>
                  {contrato.clienteEmpresa && <p className="text-xs text-muted-foreground">{contrato.clienteEmpresa}</p>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fechas</p>
                  <p className="font-medium">
                    {contrato.fechaInicio ? format(new Date(contrato.fechaInicio), 'dd MMM yyyy', { locale: es }) : '—'}
                    {contrato.fechaFin
                      ? ` al ${format(new Date(contrato.fechaFin), 'dd MMM yyyy', { locale: es })}`
                      : ''}
                  </p>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">P. unitario</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contrato.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{item.concepto}</p>
                        {item.descripcion && <p className="text-xs text-muted-foreground">{item.descripcion}</p>}
                      </TableCell>
                      <TableCell className="text-right">{item.cantidad}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.precioUnitario)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(item.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="text-right text-sm">Subtotal</TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(contrato.subtotal)}</TableCell>
                  </TableRow>
                  {contrato.descuentoMonto > 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-right text-sm">Descuento</TableCell>
                      <TableCell className="text-right text-sm text-emerald-600">
                        −{formatCurrency(contrato.descuentoMonto)}
                      </TableCell>
                    </TableRow>
                  )}
                  {contrato.impuestos > 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-right text-sm">Impuestos</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(contrato.impuestos)}</TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold">Total</TableCell>
                    <TableCell className="text-right font-bold text-base">{formatCurrency(contrato.total)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>

              {contrato.condicionesPago && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Condiciones de pago</p>
                  <p className="text-sm whitespace-pre-wrap">{contrato.condicionesPago}</p>
                </div>
              )}
              {contrato.clausulas && (
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">⚖️ Cláusulas del contrato</p>
                  <p className="text-sm whitespace-pre-wrap text-justify">{contrato.clausulas}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Actividad</CardTitle>
            </CardHeader>
            <CardContent>
              {contrato.timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin eventos todavía.</p>
              ) : (
                <div className="relative pl-5 space-y-4 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-0.5 before:bg-muted-foreground/20">
                  {contrato.timeline.map((ev) => (
                    <div key={ev.id} className="relative">
                      <div className="absolute -left-[19px] mt-1 h-3 w-3 rounded-full border-2 border-background bg-blue-500" />
                      <p className="text-xs font-medium">{TIMELINE_LABELS[ev.action] || ev.action.replace(/_/g, ' ')}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(ev.createdAt), 'dd MMM yyyy HH:mm', { locale: es })}
                      </p>
                      {ev.note && <p className="text-xs mt-0.5 text-muted-foreground/80">{ev.note}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <footer className="pt-4 pb-8 text-center">
          <p className="text-xs text-muted-foreground">
            Portal seguro de {contrato.tenant.nombre} · Enlace único e intransferible
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-1 flex items-center justify-center gap-1">
            <ShieldCheck className="h-3 w-3" /> Firma verificada con código enviado a tu correo
          </p>
        </footer>
      </main>
    </div>
  );
}
