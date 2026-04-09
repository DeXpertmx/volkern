'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { FileText, Globe, Mail, Phone, MapPin } from 'lucide-react';

interface DocumentPreviewProps {
    title: string;
    number: string;
    date: string;
    emisor: {
        razonSocial: string;
        idFiscal: string;
        direccion?: string;
        email?: string;
        web?: string;
    };
    cliente: {
        nombre: string;
        idFiscal?: string;
        direccion?: string;
        email?: string;
    };
    items: Array<{
        concepto: string;
        descripcion?: string;
        cantidad: number;
        precioUnitario: number;
        descuento?: number;
    }>;
    totals: {
        subtotal: number;
        impuesto: number;
        total: number;
        currency: string;
    };
    notas?: string;
    condiciones?: string;
    className?: string;
}

export function DocumentPreview({
    title,
    number,
    date,
    emisor,
    cliente,
    items,
    totals,
    notas,
    condiciones,
    className
}: DocumentPreviewProps) {
    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: totals.currency,
        }).format(val);
    };

    return (
        <Card className={cn("bg-white text-slate-900 shadow-2xl border-none overflow-hidden mx-auto max-w-[800px]", className)}>
            <CardContent className="p-12 space-y-10">
                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="space-y-4">
                        <div className="h-16 w-16 bg-primary/10 rounded-xl flex items-center justify-center">
                            <FileText className="h-10 w-10 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black uppercase tracking-tighter text-primary">{emisor.razonSocial}</h2>
                            <p className="text-xs font-mono text-muted-foreground">{emisor.idFiscal}</p>
                        </div>
                    </div>
                    <div className="text-right space-y-1">
                        <h1 className="text-4xl font-black tracking-tighter uppercase">{title}</h1>
                        <p className="text-xl font-mono text-muted-foreground">{number}</p>
                        <div className="pt-2">
                            <p className="text-[10px] font-bold uppercase text-muted-foreground">Fecha de Emisión</p>
                            <p className="font-bold">{date}</p>
                        </div>
                    </div>
                </div>

                <Separator className="bg-slate-100" />

                {/* Addresses */}
                <div className="grid grid-cols-2 gap-12">
                    <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">De:</p>
                        <div className="space-y-1 text-sm">
                            <p className="font-bold text-lg">{emisor.razonSocial}</p>
                            {emisor.direccion && <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-3 w-3" /> {emisor.direccion}</p>}
                            {emisor.email && <p className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3 w-3" /> {emisor.email}</p>}
                            {emisor.web && <p className="flex items-center gap-2 text-muted-foreground"><Globe className="h-3 w-3" /> {emisor.web}</p>}
                        </div>
                    </div>
                    <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Para:</p>
                        <div className="space-y-1 text-sm">
                            <p className="font-bold text-lg">{cliente.nombre}</p>
                            {cliente.idFiscal && <p className="font-mono text-xs">{cliente.idFiscal}</p>}
                            {cliente.direccion && <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-3 w-3" /> {cliente.direccion}</p>}
                            {cliente.email && <p className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3 w-3" /> {cliente.email}</p>}
                        </div>
                    </div>
                </div>

                {/* Items Table */}
                <div className="space-y-4">
                    <div className="grid grid-cols-12 gap-4 pb-2 border-b-2 border-slate-900 px-2">
                        <div className="col-span-6 text-[10px] font-black uppercase">Descripción</div>
                        <div className="col-span-2 text-[10px] font-black uppercase text-center">Cant.</div>
                        <div className="col-span-2 text-[10px] font-black uppercase text-right">Precio</div>
                        <div className="col-span-2 text-[10px] font-black uppercase text-right">Total</div>
                    </div>
                    <div className="space-y-1">
                        {items.map((item, i) => (
                            <div key={i} className="grid grid-cols-12 gap-4 py-3 px-2 hover:bg-slate-50 rounded-lg transition-colors items-center text-sm border-b border-slate-50 last:border-none">
                                <div className="col-span-6">
                                    <p className="font-bold">{item.concepto}</p>
                                    {item.descripcion && <p className="text-xs text-muted-foreground">{item.descripcion}</p>}
                                </div>
                                <div className="col-span-2 text-center font-mono">{item.cantidad}</div>
                                <div className="col-span-2 text-right font-mono">{formatCurrency(item.precioUnitario)}</div>
                                <div className="col-span-2 text-right font-bold">{formatCurrency(item.cantidad * item.precioUnitario * (1 - (item.descuento || 0) / 100))}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Totals & Notes */}
                <div className="grid grid-cols-2 gap-12 pt-8">
                    <div className="space-y-6">
                        {notas && (
                            <div className="space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Notas</p>
                                <p className="text-xs text-muted-foreground italic leading-relaxed">{notas}</p>
                            </div>
                        )}
                        {condiciones && (
                            <div className="space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Términos y Condiciones</p>
                                <p className="text-[10px] text-muted-foreground leading-relaxed">{condiciones}</p>
                            </div>
                        )}
                    </div>
                    <div className="bg-slate-900 rounded-2xl p-8 text-white space-y-4 shadow-xl">
                        <div className="flex justify-between text-sm opacity-60">
                            <span>Subtotal</span>
                            <span className="font-mono">{formatCurrency(totals.subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-sm opacity-60">
                            <span>Impuestos</span>
                            <span className="font-mono">{formatCurrency(totals.impuesto)}</span>
                        </div>
                        <Separator className="bg-white/10" />
                        <div className="flex justify-between items-center pt-2">
                            <span className="text-xs font-black uppercase tracking-widest">Total Documento</span>
                            <span className="text-3xl font-black tracking-tighter">{formatCurrency(totals.total)}</span>
                        </div>
                        <p className="text-[10px] text-right opacity-40 uppercase font-bold tracking-tighter">Moneda: {totals.currency}</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="pt-20 text-center space-y-4">
                    <Separator className="bg-slate-100" />
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Generado automáticamente por Volkern Hub Operativo</p>
                </div>
            </CardContent>
        </Card>
    );
}
