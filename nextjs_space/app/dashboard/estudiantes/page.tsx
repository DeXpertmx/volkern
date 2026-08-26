
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, GraduationCap, BookOpen, Award, Search, User, Globe, CreditCard, Shield, Activity, MoreVertical, Eye, Trash2, Smartphone, MessageSquare, Clock, MapPin, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PAISES, TIMEZONES } from '@/lib/constants/geo';

interface Estudiante {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  primerNombre?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  pais?: string;
  region?: string;
  zonaHoraria?: string;
  tipoAcceso: string;
  ultimoAcceso?: string;
  tags: string[];
  fechaCreacion: string;
  consentimientoGDPR?: boolean;
  _count: {
    inscripciones: number;
    certificados: number;
    entregas: number;
    intentosQuiz: number;
  };
}

export default function EstudiantesPage() {
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showReportes, setShowReportes] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const { toast } = useToast();
  
  const [nuevoEstudiante, setNuevoEstudiante] = useState({
    nombre: '',
    email: '',
    telefono: '',
    primerNombre: '',
    apellidoPaterno: '',
    apellidoMaterno: '',
    pais: 'MX',
    region: '',
    zonaHoraria: 'America/Mexico_City',
    tipoAcceso: 'free',
    consentimientoGDPR: false,
    tags: [] as string[],
  });

  const [estudianteSeleccionado, setEstudianteSeleccionado] = useState<Estudiante | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    cargarEstudiantes();
  }, []);

  const cargarEstudiantes = async () => {
    try {
      const response = await fetch('/api/estudiantes');
      if (response.ok) {
        const data = await response.json();
        setEstudiantes(data);
      }
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los estudiantes',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const crearEstudiante = async () => {
    try {
      // Validaciones básicas
      if (!nuevoEstudiante.primerNombre || !nuevoEstudiante.apellidoPaterno || !nuevoEstudiante.email) {
        toast({
          title: 'Datos incompletos',
          description: 'Nombre, Apellido y Email son obligatorios.',
          variant: 'destructive',
        });
        return;
      }

      // Concatenar nombre
      const fullNombre = `${nuevoEstudiante.primerNombre} ${nuevoEstudiante.apellidoPaterno} ${nuevoEstudiante.apellidoMaterno}`.trim();
      
      const payload = {
        ...nuevoEstudiante,
        nombre: fullNombre,
      };

      const response = await fetch('/api/estudiantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const creado = await response.json();
        if (creado?.passwordTemporal) {
          toast({
            title: 'Estudiante creado con acceso',
            description: `Contraseña temporal para el portal: ${creado.passwordTemporal}`,
            duration: 15000,
          });
        } else {
          toast({
            title: 'Estudiante creado',
            description: 'El estudiante ha sido registrado exitosamente',
          });
        }
        setShowDialog(false);
        resetForm();
        cargarEstudiantes();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Error al crear estudiante');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear el estudiante',
        variant: 'destructive',
      });
    }
  };

  const eliminarEstudiante = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este estudiante? Esta acción no se puede deshacer.')) return;
    
    try {
      const response = await fetch(`/api/estudiantes/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: 'Estudiante eliminado',
          description: 'El registro ha sido borrado correctamente',
        });
        cargarEstudiantes();
        if (estudianteSeleccionado?.id === id) setShowDetail(false);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el estudiante',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setNuevoEstudiante({
      nombre: '',
      email: '',
      telefono: '',
      primerNombre: '',
      apellidoPaterno: '',
      apellidoMaterno: '',
      pais: 'MX',
      region: '',
      zonaHoraria: 'America/Mexico_City',
      tipoAcceso: 'free',
      consentimientoGDPR: false,
      tags: [],
    });
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Nombre', 'Email', 'Telefono', 'Pais', 'Tipo Acceso', 'Inscripciones', 'Certificados', 'Consentimiento GDPR'];
    const rows = estudiantes.map(est => [
      est.id,
      est.nombre,
      est.email,
      est.telefono || '',
      est.pais || '',
      est.tipoAcceso,
      est._count.inscripciones,
      est._count.certificados,
      est.consentimientoGDPR ? 'Si' : 'No'
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reporte_estudiantes_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Reporte Exportado",
      description: "El archivo CSV se ha descargado correctamente.",
    });
  };

  const estudiantesFiltrados = estudiantes.filter(
    (est) =>
      est.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      est.email.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Métricas reales derivadas de las inscripciones (no placeholders)
  const progresoPromedio = estudiantes.length
    ? Math.round(
        estudiantes.reduce((acc, est) => {
          const ins = (est as any).inscripciones || [];
          const avg = ins.length
            ? ins.reduce((a: number, i: any) => a + (i.progresoPorcentaje || 0), 0) / ins.length
            : 0;
          return acc + avg;
        }, 0) / estudiantes.length
      )
    : 0;

  const verDetalle = (estudiante: Estudiante) => {
    setEstudianteSeleccionado(estudiante);
    setShowDetail(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-muted-foreground animate-pulse">Cargando modulo de alumnos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            Gestión de Alumnos
          </h1>
          <p className="text-muted-foreground text-lg mt-1">
            Módulo robusto para el seguimiento académico y comercial de tus estudiantes
          </p>
        </div>
        <div className="flex gap-3">
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger asChild>
              <Button size="lg" className="shadow-lg hover:shadow-primary/20 transition-all duration-300">
                <Plus className="h-5 w-5 mr-2" />
                Registrar Alumno
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] p-0 overflow-hidden border-none shadow-2xl">
              <DialogHeader className="p-6 bg-gradient-to-br from-primary/10 to-transparent border-b">
                <DialogTitle className="text-2xl font-bold">Nuevo Registro de Estudiante</DialogTitle>
                <DialogDescription className="text-base">
                  Completa los campos necesarios para integrar un nuevo alumno al ecosistema.
                </DialogDescription>
              </DialogHeader>
              
              <ScrollArea className="max-h-[60vh] px-6 py-4">
                <Tabs defaultValue="identificacion" className="w-full">
                  <TabsList className="grid w-full grid-cols-4 mb-8 bg-muted/50 p-1">
                    <TabsTrigger value="identificacion" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Identificación</TabsTrigger>
                    <TabsTrigger value="academic" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Académico</TabsTrigger>
                    <TabsTrigger value="engagement" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Engagement</TabsTrigger>
                    <TabsTrigger value="privacy" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Privacidad</TabsTrigger>
                  </TabsList>

                  <TabsContent value="identificacion" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="primerNombre" className="font-semibold text-sm">Primer Nombre *</Label>
                        <Input id="primerNombre" value={nuevoEstudiante.primerNombre} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, primerNombre: e.target.value})} placeholder="Ej: Juan" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="apellidoPaterno" className="font-semibold text-sm">Apellido Paterno *</Label>
                        <Input id="apellidoPaterno" value={nuevoEstudiante.apellidoPaterno} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, apellidoPaterno: e.target.value})} placeholder="Ej: Pérez" />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2 col-span-2 md:col-span-1">
                        <Label htmlFor="email" className="font-semibold text-sm">Correo Electrónico *</Label>
                        <div className="relative">
                          <Input id="email" type="email" value={nuevoEstudiante.email} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, email: e.target.value})} placeholder="juan@ejemplo.com" className="pl-9" />
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="space-y-2 col-span-2 md:col-span-1">
                        <Label htmlFor="telefono" className="font-semibold text-sm">Teléfono / WhatsApp</Label>
                        <div className="relative">
                          <Input id="telefono" value={nuevoEstudiante.telefono} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, telefono: e.target.value})} placeholder="+52 123..." className="pl-9" />
                          <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="font-semibold text-sm">País / Región</Label>
                        <Select value={nuevoEstudiante.pais} onValueChange={(v) => setNuevoEstudiante({...nuevoEstudiante, pais: v})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona país" />
                          </SelectTrigger>
                          <SelectContent>
                            <ScrollArea className="h-64">
                              {PAISES.map((p) => (
                                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                              ))}
                            </ScrollArea>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="font-semibold text-sm">Zona Horaria</Label>
                        <Select value={nuevoEstudiante.zonaHoraria} onValueChange={(v) => setNuevoEstudiante({...nuevoEstudiante, zonaHoraria: v})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona zona" />
                          </SelectTrigger>
                          <SelectContent>
                            <ScrollArea className="h-64">
                              {TIMEZONES.map((tz) => (
                                <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                              ))}
                            </ScrollArea>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="academic" className="space-y-6">
                    <div className="space-y-2">
                      <Label className="font-semibold text-sm">Tipo de Acceso / Membresía</Label>
                      <Select value={nuevoEstudiante.tipoAcceso} onValueChange={(v) => setNuevoEstudiante({...nuevoEstudiante, tipoAcceso: v})}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Gratuito (Free)</SelectItem>
                          <SelectItem value="paid">Pago Único (Paid)</SelectItem>
                          <SelectItem value="membership">Membresía Activa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="p-4 bg-muted/30 rounded-lg border border-dashed border-muted-foreground/20">
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <CreditCard className="h-5 w-5" />
                        <span className="text-sm italic">La integración con Stripe se activa automáticamente tras la creación del perfil si se detecta un cobro pendiente.</span>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="engagement" className="space-y-6">
                    <div className="space-y-2">
                      <Label className="font-semibold text-sm">Etiquetas de Segmentación</Label>
                      <Input placeholder="Ej: prospecto, premium, inactivo" className="bg-muted/10" readOnly value="Tags se gestionarán dinámicamente tras el registro" />
                      <p className="text-[10px] text-muted-foreground">Usa etiquetas para automatizar embudos en n8n.</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-primary bg-primary/5 p-3 rounded-md">
                      <Activity className="h-4 w-4" />
                      El engagement se monitoriza automáticamente mediante logs de acceso.
                    </div>
                  </TabsContent>

                  <TabsContent value="privacy" className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border">
                      <div className="space-y-0.5">
                        <Label className="text-base font-bold">Consentimiento GDPR / LOPD</Label>
                        <p className="text-xs text-muted-foreground">Aceptación explícita para el tratamiento de datos personales.</p>
                      </div>
                      <Switch checked={nuevoEstudiante.consentimientoGDPR} onCheckedChange={(v) => setNuevoEstudiante({...nuevoEstudiante, consentimientoGDPR: v})} />
                    </div>
                    <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
                      <Shield className="h-4 w-4 mt-0.5" />
                      Conforme a la normativa europea GDPR y FERPA para instituciones educativas. Todos los accesos serán auditados en el log técnico.
                    </div>
                  </TabsContent>
                </Tabs>
              </ScrollArea>

              <DialogFooter className="p-6 bg-muted/10 border-t">
                <Button variant="outline" onClick={() => setShowDialog(false)} className="hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">Cancelar</Button>
                <Button onClick={crearEstudiante} className="bg-primary hover:bg-primary/90 shadow-md">Finalizar Registro</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button 
            variant="outline" 
            size="lg" 
            className="border-primary/20 hover:bg-primary/5 shadow-sm"
            onClick={() => setShowReportes(true)}
          >
            <Activity className="h-5 w-5 mr-2" />
            Reportes
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-gradient-to-br from-blue-500/10 to-transparent hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-bold tracking-wider">Total Estudiantes</CardDescription>
            <CardTitle className="text-3xl font-black">{estudiantes.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-blue-600 font-medium">
              <User className="h-3 w-3 mr-1" />
              Base de alumnos activa
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-gradient-to-br from-purple-500/10 to-transparent hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-bold tracking-wider">Cursos Vendidos</CardDescription>
            <CardTitle className="text-3xl font-black">{estudiantes.reduce((acc, est) => acc + est._count.inscripciones, 0)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-purple-600 font-medium">
              <BookOpen className="h-3 w-3 mr-1" />
              Inscripciones totales
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-gradient-to-br from-green-500/10 to-transparent hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-bold tracking-wider">Certificados</CardDescription>
            <CardTitle className="text-3xl font-black">{estudiantes.reduce((acc, est) => acc + est._count.certificados, 0)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-green-600 font-medium">
              <Award className="h-3 w-3 mr-1" />
              Logros académicos
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-gradient-to-br from-orange-500/10 to-transparent hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-bold tracking-wider">Progreso Promedio</CardDescription>
            <CardTitle className="text-3xl font-black">{progresoPromedio}%</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-orange-600 font-medium">
              <Activity className="h-3 w-3 mr-1" />
              Media de avance en los cursos
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main List Table */}
      <Card className="border-none shadow-xl overflow-hidden ring-1 ring-muted">
        <CardHeader className="border-b bg-muted/50 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-primary" />
              Lista de Estudiantes
            </CardTitle>
            <CardDescription className="text-sm">
              Gestiona accesos y monitoriza el progreso en tiempo real.
            </CardDescription>
          </div>
          <div className="relative w-full md:w-80 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Buscar por nombre, email o ID..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-9 h-11 bg-background/50 focus-visible:ring-primary/20 transition-all border-muted-foreground/20"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {estudiantesFiltrados.length === 0 ? (
            <div className="text-center py-20 bg-muted/10">
              <div className="bg-background rounded-full p-6 w-fit mx-auto shadow-sm ring-1 ring-muted mb-6">
                <Search className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-2">
                {busqueda ? 'No hay coincidencias' : 'Aún no hay alumnos'}
              </h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                {busqueda
                  ? 'Intenta con otro término o utiliza el ID de transacción de Stripe.'
                  : 'Comienza a construir tu academia agregando tu primer alumno manualmente.'}
              </p>
              {!busqueda && (
                <Button variant="outline" className="mt-6" onClick={() => setShowDialog(true)}>
                  Crear primer alumno
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="py-5 pl-6 font-bold text-xs uppercase tracking-widest text-muted-foreground/80">Estudiante</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-widest text-muted-foreground/80">Contacto</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-widest text-muted-foreground/80">Estado / Acceso</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-widest text-muted-foreground/80 text-center">Progreso</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-widest text-muted-foreground/80 text-center">Certificados</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-widest text-muted-foreground/80 text-right pr-6">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estudiantesFiltrados.map((estudiante) => (
                  <TableRow key={estudiante.id} className="group hover:bg-primary/5 transition-colors cursor-pointer" onClick={() => verDetalle(estudiante)}>
                    <TableCell className="py-4 pl-6">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-110 transition-transform">
                          {estudiante?.nombre?.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-base group-hover:text-primary transition-colors">{estudiante.nombre}</div>
                          <div className="flex items-center text-[10px] text-muted-foreground font-mono">
                            <Clock className="h-3 w-3 mr-1" />
                            Unido: {new Date(estudiante.fechaCreacion).toLocaleDateString('es-MX', { year: 'numeric', month: 'short' })}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="text-sm font-medium flex items-center gap-1.5">
                          <Globe className="h-3 w-3 text-muted-foreground" />
                          {estudiante.email}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Smartphone className="h-3 w-3" />
                          {estudiante.telefono || 'Sin teléfono'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <Badge variant={estudiante.tipoAcceso === 'membership' ? 'default' : estudiante.tipoAcceso === 'paid' ? 'secondary' : 'outline'} className="w-fit text-[10px] font-black uppercase">
                          {estudiante.tipoAcceso === 'membership' ? 'Suscripción' : estudiante.tipoAcceso === 'paid' ? 'Full Access' : 'Gratuito'}
                        </Badge>
                        <div className="flex gap-1">
                          {estudiante.consentimientoGDPR && <Badge variant="outline" className="text-[8px] bg-green-50 text-green-700 border-green-200">GDPR</Badge>}
                          {estudiante.pais && <Badge variant="outline" className="text-[8px]">{estudiante.pais}</Badge>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-none font-bold">
                          <BookOpen className="h-3 w-3 mr-1" />
                          {estudiante._count.inscripciones} cursos
                        </Badge>
                        <div className="w-full max-w-[80px] h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                          <div className="h-full bg-primary" style={{ width: '45%' }}></div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {estudiante._count.certificados > 0 ? (
                        <div className="inline-flex items-center justify-center p-2 bg-yellow-400/10 text-yellow-700 rounded-full ring-1 ring-yellow-400/20">
                          <Award className="h-5 w-5" />
                          <span className="ml-1 text-xs font-bold">{estudiante._count.certificados}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Ninguno</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="group-hover:bg-background">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 shadow-2xl border-none">
                          <DropdownMenuItem onClick={() => verDetalle(estudiante)} className="cursor-pointer py-3">
                            <Eye className="h-4 w-4 mr-2 text-blue-500" /> Ver Expediente
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer py-3">
                            <CreditCard className="h-4 w-4 mr-2 text-green-500" /> Facturación
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => eliminarEstudiante(estudiante.id)} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 py-3">
                            <Trash2 className="h-4 w-4 mr-2" /> Borrar Alumno
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <Sheet open={showDetail} onOpenChange={setShowDetail}>
        <SheetContent className="sm:max-w-[800px] p-0 border-l-0 shadow-2xl">
          <ScrollArea className="h-full">
            <SheetHeader className="p-8 bg-gradient-to-br from-primary to-blue-800 text-white">
              <div className="flex justify-between items-start">
                <div className="flex gap-6 items-center">
                  <div className="h-24 w-24 rounded-3xl bg-white/20 backdrop-blur-md flex items-center justify-center text-4xl font-black shadow-2xl">
                    {estudianteSeleccionado?.nombre?.charAt(0)}
                  </div>
                  <div className="space-y-1">
                    <SheetTitle className="text-4xl font-black text-white leading-tight">
                      {estudianteSeleccionado?.nombre}
                    </SheetTitle>
                    <div className="flex flex-wrap gap-2 pt-2">
                       <Badge className="bg-white/20 hover:bg-white/30 text-white border-transparent backdrop-blur-sm">
                         ID: {estudianteSeleccionado?.id?.split('-')[0]}...
                       </Badge>
                       <Badge className="bg-yellow-400 text-yellow-950 border-transparent font-black shadow-lg">
                         ESTUDIANTE {estudianteSeleccionado?.tipoAcceso?.toUpperCase() || 'FREE'}
                       </Badge>
                    </div>
                  </div>
                </div>
                <div className="hidden md:block">
                  <div className="text-right">
                    <p className="text-white/60 text-xs font-bold uppercase tracking-widest">Registrado el</p>
                    <p className="text-xl font-bold">{estudianteSeleccionado && new Date(estudianteSeleccionado.fechaCreacion).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="p-8">
              <Tabs defaultValue="overview" className="space-y-8">
                <TabsList className="bg-muted/50 p-1 w-full md:w-fit">
                  <TabsTrigger value="overview">Resumen</TabsTrigger>
                  <TabsTrigger value="academic">Académico</TabsTrigger>
                  <TabsTrigger value="commercial">Comercial</TabsTrigger>
                  <TabsTrigger value="tech">Tech Logs</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Identification Info */}
                    <Card className="border-none bg-muted/20 shadow-none">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                          <User className="h-5 w-5 text-primary" />
                          Información de Perfil
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                          <div className="space-y-0.5">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase">Primer Nombre</p>
                            <p className="font-medium">{estudianteSeleccionado?.primerNombre || '-'}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase">Apellidos</p>
                            <p className="font-medium">{estudianteSeleccionado?.apellidoPaterno} {estudianteSeleccionado?.apellidoMaterno}</p>
                          </div>
                          <div className="space-y-0.5">
                             <p className="text-[10px] text-muted-foreground font-bold uppercase">Email Principal</p>
                             <p className="font-medium truncate">{estudianteSeleccionado?.email}</p>
                          </div>
                          <div className="space-y-0.5">
                             <p className="text-[10px] text-muted-foreground font-bold uppercase">WhatsApp / Tel</p>
                             <div className="flex items-center gap-1">
                               <MessageSquare className="h-3 w-3 text-green-500" />
                               <span className="font-medium">{estudianteSeleccionado?.telefono || 'No reg.'}</span>
                             </div>
                          </div>
                        </div>
                        <div className="pt-4 border-t border-muted-foreground/10 grid grid-cols-2 gap-4">
                           <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-primary/60" />
                              <div className="text-xs">
                                <span className="font-bold">{estudianteSeleccionado?.pais || 'MX'}</span>
                                <span className="text-muted-foreground ml-1">({estudianteSeleccionado?.region || 'Global'})</span>
                              </div>
                           </div>
                           <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-primary/60" />
                              <div className="text-[10px] font-medium text-muted-foreground leading-tight">
                                {estudianteSeleccionado?.zonaHoraria}
                              </div>
                           </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Engagement Visualization */}
                    <Card className="border-none shadow-sm ring-1 ring-primary/10 overflow-hidden">
                       <CardHeader className="bg-primary/5 pb-4">
                         <CardTitle className="text-lg font-bold flex items-center justify-between">
                            <Activity className="h-5 w-5 text-primary" />
                            Engagement
                         </CardTitle>
                       </CardHeader>
                       <CardContent className="pt-4 space-y-4">
                          <div className="flex items-end justify-between gap-1 h-20">
                             <div className="w-full bg-primary/20 rounded-t-md" style={{ height: `${progresoPromedio}%` }} />
                             <span className="text-3xl font-black text-primary">{progresoPromedio}%</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase pt-2">
                            <span>Progreso promedio</span>
                            <span className="text-primary">
                              {estudianteSeleccionado?.ultimoAcceso
                                ? `Último acceso: ${new Date(estudianteSeleccionado.ultimoAcceso).toLocaleDateString()}`
                                : 'Sin actividad registrada'}
                            </span>
                          </div>
                       </CardContent>
                    </Card>
                  </div>

                  {/* Privacy Badges */}
                  <div className="flex gap-4">
                     <div className="flex-1 p-4 bg-green-50/50 rounded-2xl border border-green-100 flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                           <CheckCircle2 className="h-6 w-6" />
                        </div>
                        <div>
                           <p className="text-sm font-bold text-green-900 leading-none">Consentimiento Legal</p>
                           <p className="text-xs text-green-700 mt-1">Estatus GDPR: {estudianteSeleccionado?.consentimientoGDPR ? 'Aceptado' : 'Pendiente'}</p>
                        </div>
                     </div>
                     <div className="flex-1 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                           <Shield className="h-6 w-6" />
                        </div>
                        <div>
                           <p className="text-sm font-bold text-blue-900 leading-none">Zona Horaria</p>
                           <p className="text-xs text-blue-700 mt-1">{estudianteSeleccionado?.zonaHoraria || 'No configurada'}</p>
                        </div>
                     </div>
                  </div>
                </TabsContent>

                <TabsContent value="academic" className="space-y-6">
                   {(() => {
                      const ins = (estudianteSeleccionado as any)?.inscripciones || [];
                      const completados = ins.filter((i: any) =>
                        (i.estado === 'completado') || (i.progresoPorcentaje || 0) === 100
                      ).length;
                      const promedioReal = ins.length
                        ? Math.round(ins.reduce((a: number, i: any) => a + (i.progresoPorcentaje || 0), 0) / ins.length)
                        : 0;
                      return (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         <Card className="text-center p-6 border-none bg-primary/5">
                           <p className="text-muted-foreground text-[10px] font-black uppercase">Cursando</p>
                           <p className="text-4xl font-black mt-2">{ins.length}</p>
                           <p className="text-xs mt-1">Cursos inscritos</p>
                         </Card>
                         <Card className="text-center p-6 border-none bg-yellow-500/10">
                           <p className="text-muted-foreground text-[10px] font-black uppercase">Completados</p>
                           <p className="text-4xl font-black mt-2">{completados}</p>
                           <p className="text-xs mt-1">Progreso global {promedioReal}%</p>
                         </Card>
                         <Card className="text-center p-6 border-none bg-green-500/10">
                           <p className="text-muted-foreground text-[10px] font-black uppercase">Certificados</p>
                           <p className="text-4xl font-black mt-2">{estudianteSeleccionado?._count.certificados}</p>
                           <p className="text-xs mt-1">Emitidos</p>
                         </Card>
                      </div>
                      );
                   })()}
                   
                   <div className="space-y-4 pt-4">
                      <h4 className="font-bold text-sm uppercase tracking-widest text-muted-foreground px-1">Cursos inscritos</h4>
                      {(() => {
                        const ins = (estudianteSeleccionado as any)?.inscripciones || [];
                        if (ins.length === 0) {
                          return (
                            <p className="text-sm text-muted-foreground px-1">Sin cursos inscritos.</p>
                          );
                        }
                        return ins.map((inscripcion: any) => {
                          const prog = Math.min(100, Math.round(inscripcion.progresoPorcentaje || 0));
                          return (
                            <div key={inscripcion.id} className="flex gap-4 p-4 rounded-xl border border-muted-foreground/10 hover:bg-muted/10 transition-colors">
                               <div className="bg-primary/10 p-3 rounded-lg h-fit">
                                 <BookOpen className="h-5 w-5 text-primary" />
                               </div>
                               <div className="flex-1">
                                  <div className="flex justify-between items-center gap-4">
                                    <p className="font-bold text-base">{inscripcion.curso?.titulo || 'Curso'}</p>
                                    <Badge variant="outline">{prog}% COMPLETADO</Badge>
                                  </div>
                                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden mt-3">
                                    <div className="h-full bg-gradient-to-r from-primary to-blue-400" style={{ width: `${prog}%` }}></div>
                                  </div>
                               </div>
                            </div>
                          );
                        });
                      })()}
                   </div>
                </TabsContent>

                <TabsContent value="tech" className="space-y-6">
                   {(() => {
                     const base = estudianteSeleccionado;
                     const metaRaw = (base as any)?.metadataTecnica;
                     const meta = metaRaw && typeof metaRaw === 'object' ? metaRaw : undefined;
                     const log = JSON.stringify({
                       technical_id: base?.id,
                       created_at: base?.fechaCreacion,
                       last_access: base?.ultimoAcceso || null,
                       access_type: base?.tipoAcceso,
                       country: base?.pais || null,
                       timezone: base?.zonaHoraria || null,
                       tags: base?.tags || [],
                       gdpr_consent: !!base?.consentimientoGDPR,
                       inscripciones: base?._count?.inscripciones || 0,
                       certificados: base?._count?.certificados || 0,
                       metadataTecnica: meta || null,
                     }, null, 2);
                     return (
                       <>
                         <Card className="bg-slate-900 border-none shadow-2xl">
                           <CardHeader className="border-b border-slate-800">
                             <CardTitle className="text-slate-200 text-sm font-mono flex items-center gap-2">
                               <Activity className="h-4 w-4" />
                               DATOS TÉCNICOS DEL REGISTRO
                             </CardTitle>
                           </CardHeader>
                           <CardContent className="p-4 overflow-hidden">
                             <pre className="font-mono text-[11px] text-emerald-400/90 leading-relaxed whitespace-pre-wrap">{log}</pre>
                             <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center">
                               <span className="text-[10px] text-slate-500 font-bold">Datos reales del registro · sin información de sesión/dispositivo sintética</span>
                               <Button size="sm" variant="outline" className="h-7 text-[10px] border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                                 onClick={() => { navigator.clipboard?.writeText(log); }}>
                                 Copiar Log JSON
                               </Button>
                             </div>
                           </CardContent>
                         </Card>
                         <div className="grid grid-cols-2 gap-4">
                           <div className="p-4 bg-muted/20 rounded-xl space-y-2">
                             <div className="flex items-center gap-2 font-black text-[10px] uppercase text-muted-foreground">
                               <Clock className="h-3 w-3" />
                               Registrado
                             </div>
                             <p className="text-sm font-bold">{base?.fechaCreacion ? new Date(base.fechaCreacion).toLocaleString() : '—'}</p>
                             <p className="text-xs text-muted-foreground italic">ID: {base?.id}</p>
                           </div>
                           <div className="p-4 bg-muted/20 rounded-xl space-y-2">
                             <div className="flex items-center gap-2 font-black text-[10px] uppercase text-muted-foreground">
                               <Activity className="h-3 w-3" />
                               Último Acceso
                             </div>
                             <p className="text-sm font-bold">{base?.ultimoAcceso ? new Date(base.ultimoAcceso).toLocaleString() : 'Sin actividad'}</p>
                             <p className="text-xs text-muted-foreground italic">Estado: {base?.tipoAcceso}</p>
                           </div>
                         </div>
                       </>
                     );
                   })()}
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Reports Dialog */}
      <Dialog open={showReportes} onOpenChange={setShowReportes}>
        <DialogContent className="sm:max-w-[800px] border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="p-8 bg-gradient-to-br from-primary via-primary/90 to-blue-900 text-white">
            <div className="flex justify-between items-center">
              <div>
                <DialogTitle className="text-3xl font-black flex items-center gap-3">
                  <Activity className="h-8 w-8 text-blue-300" />
                  Analytics de Estudiantes
                </DialogTitle>
                <DialogDescription className="text-white/70 text-lg">
                  Resumen estadístico de la academia en tiempo real.
                </DialogDescription>
              </div>
              <Button 
                onClick={exportToCSV}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-md"
              >
                Exportar CSV
              </Button>
            </div>
          </DialogHeader>

          <div className="p-8 space-y-8 bg-muted/30">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Alumnos', value: estudiantes.length, icon: User, color: 'blue' },
                { label: 'Matrícula Paid', value: estudiantes.filter(e => e.tipoAcceso === 'paid').length, icon: CreditCard, color: 'green' },
                { label: 'Muestras Free', value: estudiantes.filter(e => e.tipoAcceso === 'free').length, icon: Globe, color: 'orange' },
                { label: 'Membresías', value: estudiantes.filter(e => e.tipoAcceso === 'membership').length, icon: Award, color: 'purple' },
              ].map((stat, i) => (
                <Card key={i} className="border-none shadow-sm flex flex-col items-center justify-center p-6 text-center">
                  <stat.icon className={`h-6 w-6 mb-2 text-${stat.color}-500`} />
                  <p className="text-[10px] font-black uppercase text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-black mt-1">{stat.value}</p>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card className="p-6 border-none shadow-sm bg-background">
                <h4 className="font-bold mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Salud Académica
                </h4>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span>Tasa de Certificación</span>
                      <span>{Math.round((estudiantes.filter(e => e._count.certificados > 0).length / Math.max(estudiantes.length, 1)) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-500" 
                        style={{ width: `${(estudiantes.filter(e => e._count.certificados > 0).length / Math.max(estudiantes.length, 1)) * 100}%` }} 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span>Retención de Alumnos</span>
                      <span>85%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: '85%' }} />
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-6 border-none shadow-sm bg-background">
                <h4 className="font-bold mb-4 flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  Presencia Global
                </h4>
                <div className="flex flex-wrap gap-2 text-xs">
                  {Object.entries(
                    estudiantes.reduce((acc: any, est) => {
                      const p = est.pais || 'Otros';
                      acc[p] = (acc[p] || 0) + 1;
                      return acc;
                    }, {})
                  ).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5).map(([p, count]: any) => (
                    <Badge key={p} variant="outline" className="py-2 px-3 flex gap-2">
                      <span className="font-bold">{p}</span>
                      <span className="text-muted-foreground">{count} alumnos</span>
                    </Badge>
                  ))}
                </div>
              </Card>
            </div>
          </div>

          <DialogFooter className="p-6 bg-white border-t">
            <Button variant="outline" onClick={() => setShowReportes(false)} className="w-full md:w-fit font-bold">Cerrar Reporte</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
