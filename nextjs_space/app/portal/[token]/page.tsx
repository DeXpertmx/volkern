
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    FileText,
    ScrollText,
    TrendingUp,
    ShoppingCart,
    ChevronRight,
    CheckCircle2,
    Clock,
    FileCheck,
    Download,
    Eye,
    Info,
    Building2,
    Mail,
    ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import { toast } from 'sonner';

interface PortalData {
    lead: {
        nombre: string;
        empresa: string | null;
        email: string;
    };
    tenant: {
        nombreEmpresa: string;
        logoUrl: string | null;
    };
    documents: {
        cotizaciones: any[];
        contratos: any[];
        deals: any[];
        ordenesVenta: any[];
    }
}

export default function PortalPage() {
    const params = useParams();
    const token = params.token as string;
    const [data, setData] = useState<PortalData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/portal/${token}`);
                if (!res.ok) throw new Error('Portal no encontrado');
                const json = await res.json();
                setData(json);
            } catch (error) {
                console.error('Error fetching portal data:', error);
                toast.error('No se pudo cargar el portal. El enlace podría estar vencido.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [token]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                <p className="text-muted-foreground animate-pulse">Preparando su espacio de trabajo personalizado...</p>
            </div>
        );
    }

    if (!data) {
        return (
            <Card className="max-w-md mx-auto mt-20 border-red-100 shadow-xl overflow-hidden">
                <div className="h-2 bg-red-500" />
                <CardHeader className="text-center pb-2">
                    <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Info className="h-8 w-8 text-red-500" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-red-700">Acceso no autorizado</CardTitle>
                    <CardDescription>
                        El enlace que está intentando usar no es válido o ha expirado.
                    </CardDescription>
                </CardHeader>
                <CardContent className="text-center pb-8 pt-4">
                    <p className="text-sm text-muted-foreground mb-6">
                        Por favor, póngase en contacto con su asesor para recibir un nuevo enlace de acceso a su portal.
                    </p>
                    <Button variant="outline" asChild className="w-full border-red-200 text-red-700 hover:bg-red-50">
                        <Link href="https://volkern.com">Regresar a Volkern</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const getStatusBadge = (estado: string) => {
        const states: Record<string, any> = {
            'borrador': { color: 'bg-gray-100 text-gray-700', label: 'Borrador' },
            'enviado': { color: 'bg-blue-100 text-blue-700', label: 'Pendiente' },
            'aceptado': { color: 'bg-green-100 text-green-700', label: 'Aceptado' },
            'rechazado': { color: 'bg-red-100 text-red-700', label: 'Rechazado' },
            'firmado': { color: 'bg-indigo-100 text-indigo-700', label: 'Firmado' },
            'pagado': { color: 'bg-emerald-100 text-emerald-700', label: 'Pagado' },
        };
        const state = states[estado.toLowerCase()] || { color: 'bg-gray-100 text-gray-600', label: estado };
        return <Badge className={`${state.color} border-none font-medium`}>{state.label}</Badge>;
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Welcome Hero */}
            <div className="relative overflow-hidden rounded-3xl bg-indigo-600 text-white p-8 sm:p-12 shadow-2xl">
                <div className="absolute top-0 right-0 -m-8 opacity-10">
                    <Building2 size={300} />
                </div>
                <div className="relative z-10 max-w-2xl">
                    <Badge className="bg-indigo-500 text-white border-indigo-400 mb-6 px-3 py-1">Bienvenido a su Portal</Badge>
                    <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
                        Hola, {data.lead.nombre}
                    </h1>
                    <p className="text-xl text-indigo-100 leading-relaxed mb-8 opacity-90">
                        Aquí podrá gestionar sus propuestas, contratos y dar seguimiento al progreso de su colaboración con <strong>{data.tenant.nombreEmpresa}</strong>.
                    </p>
                    <div className="flex flex-wrap gap-4">
                        <Button className="bg-white text-indigo-600 hover:bg-indigo-50 font-bold px-8 h-12 rounded-xl">
                            Ver Cotización Pendiente
                        </Button>
                        <Button variant="outline" className="border-indigo-400 text-white hover:bg-indigo-500 h-12 rounded-xl">
                            Contactar Soporte
                        </Button>
                    </div>
                </div>
            </div>

            {/* Grid of Sections */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Summary & Profile */}
                <div className="space-y-8">
                    <Card className="border-indigo-100 shadow-sm overflow-hidden">
                        <CardHeader className="bg-indigo-50/30 border-b">
                            <CardTitle className="text-lg flex items-center">
                                <Building2 className="h-5 w-5 mr-2 text-indigo-600" />
                                Su Perfil
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Cliente</label>
                                <p className="font-semibold text-slate-900">{data.lead.nombre}</p>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Empresa</label>
                                <p className="font-semibold text-slate-900">{data.lead.empresa || 'N/A'}</p>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Email</label>
                                <p className="font-semibold text-slate-900">{data.lead.email}</p>
                            </div>
                            <div className="pt-4 border-t mt-4">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Estado de Cuenta</span>
                                    <Badge className="bg-green-100 text-green-700 border-none">Al día</Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-indigo-100 shadow-sm overflow-hidden bg-slate-900 text-white">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center">
                                <TrendingUp className="h-5 w-5 mr-2 text-indigo-400" />
                                Resumen de Actividad
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-500/20 rounded-lg">
                                        <FileText className="h-5 w-5 text-indigo-400" />
                                    </div>
                                    <span>Cotizaciones</span>
                                </div>
                                <span className="text-xl font-bold">{data.documents.cotizaciones.length}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-500/20 rounded-lg">
                                        <ScrollText className="h-5 w-5 text-emerald-400" />
                                    </div>
                                    <span>Contratos Activos</span>
                                </div>
                                <span className="text-xl font-bold">{data.documents.contratos.filter(c => c.estado === 'vigente').length}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-500/20 rounded-lg">
                                        <ShoppingCart className="h-5 w-5 text-blue-400" />
                                    </div>
                                    <span>Órdenes de Venta</span>
                                </div>
                                <span className="text-xl font-bold">{data.documents.ordenesVenta.length}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Columns: Documents */}
                <div className="lg:col-span-2 space-y-8">

                    {/* Cotizaciones Section */}
                    <section className="space-y-4">
                        <div className="flex items-center justify-between group">
                            <h3 className="text-xl font-bold text-slate-900 flex items-center">
                                <div className="w-1 h-6 bg-indigo-600 rounded-full mr-3" />
                                Propuestas y Cotizaciones
                            </h3>
                            <Button variant="ghost" size="sm" className="text-indigo-600 font-bold group-hover:translate-x-1 transition-transform">
                                Ver historial completo <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>

                        {data.documents.cotizaciones.length > 0 ? (
                            <div className="grid gap-4">
                                {data.documents.cotizaciones.map((cot: any) => (
                                    <Card key={cot.id} className="hover:border-indigo-300 transition-all border-slate-200 group">
                                        <CardContent className="p-0">
                                            <div className="flex items-center p-6 gap-6">
                                                <div className="bg-slate-50 p-4 rounded-xl text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                                    <FileText size={32} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <h4 className="text-lg font-bold text-slate-900 truncate">
                                                            {cot.titulo || `Cotización ${cot.numero}`}
                                                        </h4>
                                                        {getStatusBadge(cot.estado)}
                                                    </div>
                                                    <div className="flex items-center gap-4 text-sm text-muted-foreground font-medium">
                                                        <span className="flex items-center"><Clock className="h-3.5 w-3.5 mr-1" /> {format(new Date(cot.fechaCreacion), "dd MMM yyyy", { locale: es })}</span>
                                                        <span className="text-slate-900 font-bold text-lg">${cot.total.toLocaleString()} {cot.moneda || 'MXN'}</span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button size="icon" variant="outline" className="rounded-xl hover:bg-indigo-50 hover:text-indigo-600">
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="outline" className="rounded-xl hover:bg-emerald-50 hover:text-emerald-600">
                                                        <Download className="h-4 w-4" />
                                                    </Button>
                                                    <Button className="rounded-xl bg-indigo-600 hover:bg-indigo-700 ml-2">
                                                        Revisar y Aceptar
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <Card className="border-dashed border-2 py-12 text-center bg-slate-50/50">
                                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                                <p className="text-muted-foreground font-medium">No hay cotizaciones registradas actualmente.</p>
                            </Card>
                        )}
                    </section>

                    {/* Proyectos Activos (Contratos) */}
                    <section className="space-y-4 pt-12">
                        <h3 className="text-xl font-bold text-slate-900 flex items-center">
                            <div className="w-1 h-6 bg-emerald-600 rounded-full mr-3" />
                            Proyectos y Contratos Vigentes
                        </h3>

                        {data.documents.contratos.length > 0 ? (
                            <div className="grid gap-6">
                                {data.documents.contratos.map((con: any) => (
                                    <Card key={con.id} className="border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                        <div className="bg-emerald-50/50 px-6 py-4 border-b flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <Badge className="bg-emerald-600 text-white border-none">{con.numero}</Badge>
                                                <span className="text-sm font-bold text-slate-700">{con.titulo}</span>
                                            </div>
                                            {getStatusBadge(con.estado)}
                                        </div>
                                        <CardContent className="p-6">
                                            <div className="grid sm:grid-cols-2 gap-6 text-sm">
                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                                        <span className="text-muted-foreground">Fecha de Inicio</span>
                                                        <span className="font-bold text-slate-800">{con.fechaInicio ? format(new Date(con.fechaInicio), "dd/MM/yyyy") : 'Pendiente'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                                        <span className="text-muted-foreground">Método de Pago</span>
                                                        <span className="font-bold text-slate-800 capitalize">{con.metodoPago || 'Por acordar'}</span>
                                                    </div>
                                                </div>
                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                                        <span className="text-muted-foreground">Vigencia</span>
                                                        <span className="font-bold text-slate-800">{con.frecuenciaPago || 'Indefinida'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                                        <span className="text-muted-foreground">Monto de Inversión</span>
                                                        <span className="font-bold text-indigo-600 text-base">${con.total.toLocaleString()} {con.moneda}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-6 flex gap-3">
                                                <Button variant="outline" className="flex-1 rounded-xl">
                                                    <FileCheck className="h-4 w-4 mr-2" /> Descargar Copia Firmada
                                                </Button>
                                                <Button className="flex-1 rounded-xl bg-slate-900 hover:bg-black">
                                                    Ver Cronograma del Proyecto
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <Card className="border-dashed border-2 py-12 text-center bg-slate-50/50">
                                <ScrollText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                                <p className="text-muted-foreground font-medium">No tiene proyectos o contratos vigentes en este momento.</p>
                            </Card>
                        )}
                    </section>

                    {/* Quick Support Card */}
                    <div className="mt-12 p-8 rounded-3xl bg-slate-100 border border-slate-200 flex flex-col md:flex-row items-center gap-8">
                        <div className="bg-white p-4 rounded-2xl shadow-sm">
                            <Mail className="h-8 w-8 text-indigo-600" />
                        </div>
                        <div className="flex-1 text-center md:text-left">
                            <h4 className="text-xl font-bold text-slate-900 mb-2">¿Necesita asistencia directa?</h4>
                            <p className="text-muted-foreground">Nuestro equipo está listo para ayudarle con cualquier duda sobre sus propuestas o proyectos activos.</p>
                        </div>
                        <Button size="lg" className="bg-slate-900 hover:bg-black rounded-xl px-8">
                            Enviar Mensaje al Asesor
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
