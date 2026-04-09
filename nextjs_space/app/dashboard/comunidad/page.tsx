'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  Card, CardContent, CardDescription, CardHeader, CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { 
  CheckCircle2, XCircle, Trash2, MessageCircle, 
  ExternalLink, Search, Loader2, Filter, Reply,
  User, GraduationCap, BookOpen, AlertCircle
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface Comentario {
  id: string;
  comentario: string;
  aprobado: boolean;
  fechaCreacion: string;
  estudiante: {
    primerNombre: string;
    apellidoPaterno: string;
    email: string;
  };
  curso?: { titulo: string };
  leccion?: { 
    titulo: string; 
    modulo?: { curso?: { titulo: string } } 
  };
  cursoId?: string;
}

export default function ModeracionComentariosPage() {
  const searchParams = useSearchParams();
  const cursoId = searchParams.get('cursoId');
  const { toast } = useToast();
  
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [actingOn, setActingOn] = useState<string | null>(null);

  useEffect(() => {
    cargarComentarios();
  }, [cursoId]);

  const cargarComentarios = async () => {
    setLoading(true);
    try {
      const url = cursoId 
        ? `/api/comunidad/moderacion?cursoId=${cursoId}` 
        : '/api/comunidad/moderacion';
      
      const res = await fetch(url);
      if (res.ok) {
        setComentarios(await res.json());
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudieron cargar los comentarios', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleApprove = async (id: string, currentStatus: boolean) => {
    setActingOn(id);
    try {
      const res = await fetch(`/api/comunidad/moderacion?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aprobado: !currentStatus })
      });

      if (res.ok) {
        toast({ title: currentStatus ? 'Comentario Ocultado' : 'Comentario Aprobado' });
        cargarComentarios();
      }
    } catch (err) {
      toast({ title: 'Error al actualizar', variant: 'destructive' });
    } finally {
      setActingOn(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este comentario permanentemente?')) return;
    setActingOn(id);
    try {
      const res = await fetch(`/api/comunidad/moderacion?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: 'Comentario eliminado' });
        cargarComentarios();
      }
    } catch (err) {
      toast({ title: 'Error al eliminar', variant: 'destructive' });
    } finally {
      setActingOn(null);
    }
  };

  const filteredComments = comentarios.filter(c => 
    c.comentario.toLowerCase().includes(filter.toLowerCase()) ||
    c.estudiante.primerNombre.toLowerCase().includes(filter.toLowerCase()) ||
    (c.curso?.titulo || c.leccion?.modulo?.curso?.titulo || '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
             <MessageCircle className="h-8 w-8 text-primary" />
             Moderación de Comunidad
          </h1>
          <p className="text-muted-foreground font-medium mt-1">
             Gestiona las interacciones de tus alumnos en tiempo real.
          </p>
        </div>
        <div className="flex gap-2">
           <Link href="/dashboard/cursos">
              <Button variant="outline" className="rounded-xl font-bold h-11">
                 <BookOpen className="h-4 w-4 mr-2" /> Gestionar Cursos
              </Button>
           </Link>
        </div>
      </div>

      <Card className="border-none shadow-sm rounded-[2rem] overflow-hidden">
        <CardHeader className="bg-slate-50/50 pb-8 px-8 border-b">
           <div className="flex flex-col md:flex-row md:items-center gap-4 pt-2">
              <div className="relative flex-1">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                 <Input 
                   placeholder="Buscar por contenido, alumno o curso..." 
                   className="pl-10 rounded-xl border-slate-200 bg-white"
                   value={filter}
                   onChange={(e) => setFilter(e.target.value)}
                 />
              </div>
              <div className="flex items-center gap-2">
                 <Badge variant="outline" className="rounded-lg h-9 px-4 font-bold uppercase text-[10px]">
                    {filteredComments.length} Comentarios
                 </Badge>
                 {cursoId && (
                    <Button variant="ghost" onClick={() => window.location.href = '/dashboard/comunidad'} className="h-9 px-4 rounded-lg text-xs font-bold text-red-500 hover:text-red-600 hover:bg-red-50">
                       Limpiar Filtros
                    </Button>
                 )}
              </div>
           </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
               <Loader2 className="h-10 w-10 animate-spin text-primary/20" />
               <p className="text-xs font-black uppercase text-muted-foreground tracking-widest">Cargando discusiones...</p>
            </div>
          ) : filteredComments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
               <div className="bg-slate-100 p-6 rounded-full mb-6">
                  <CheckCircle2 className="h-12 w-12 text-slate-300" />
               </div>
               <h3 className="text-xl font-bold text-slate-900">Todo al día</h3>
               <p className="text-muted-foreground max-w-xs mx-auto mt-2">No se encontraron comentarios que coincidan con tu búsqueda.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="border-none">
                  <TableHead className="py-4 pl-8 font-black uppercase text-[10px] tracking-widest text-slate-400">Alumno / Curso</TableHead>
                  <TableHead className="py-4 font-black uppercase text-[10px] tracking-widest text-slate-400">Contenido</TableHead>
                  <TableHead className="py-4 font-black uppercase text-[10px] tracking-widest text-slate-400 text-center">Estado</TableHead>
                  <TableHead className="py-4 font-black uppercase text-[10px] tracking-widest text-slate-400 text-right pr-8">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredComments.map((coment) => (
                  <TableRow key={coment.id} className="group hover:bg-slate-50/50 transition-colors border-slate-100">
                    <TableCell className="py-6 pl-8">
                       <div className="flex flex-col">
                          <span className="font-black text-slate-900 leading-none mb-1.5 flex items-center gap-2">
                             <User className="h-3 w-3 text-primary" /> {coment.estudiante.primerNombre} {coment.estudiante.apellidoPaterno}
                          </span>
                          <span className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5 leading-none">
                             <BookOpen className="h-3 w-3" /> {coment.curso?.titulo || coment.leccion?.modulo?.curso?.titulo || 'Curso General'}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-2 font-medium">
                             {new Date(coment.fechaCreacion).toLocaleString()}
                          </span>
                       </div>
                    </TableCell>
                    <TableCell className="max-w-[400px]">
                       <p className="text-sm text-slate-600 font-medium leading-relaxed italic">
                          "{coment.comentario}"
                       </p>
                    </TableCell>
                    <TableCell className="text-center">
                       <Badge className={cn(
                          "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-none transition-all",
                          coment.aprobado ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                       )}>
                          {coment.aprobado ? 'Aprobado' : 'Oculto'}
                       </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-8">
                       <div className="flex items-center justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className={cn("h-10 w-10 shrink-0 rounded-xl transition-all", coment.aprobado ? "text-slate-400 hover:text-red-600 hover:bg-red-50" : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50")}
                            onClick={() => handleToggleApprove(coment.id, coment.aprobado)}
                            disabled={actingOn === coment.id}
                          >
                             {actingOn === coment.id ? <Loader2 className="h-4 w-4 animate-spin" /> : coment.aprobado ? <XCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-10 w-10 shrink-0 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleDelete(coment.id)}
                            disabled={actingOn === coment.id}
                          >
                             <Trash2 className="h-5 w-5" />
                          </Button>
                       </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
