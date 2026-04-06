'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Card, CardContent, CardDescription, CardHeader, CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Award, Download, FileText, ExternalLink, 
  Loader2, Trophy, GraduationCap, Star, BookOpen,
  CheckCircle2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface CertificadoItem {
  cursoId: string;
  cursoTitulo: string;
  cursoImagen: string | null;
  fechaCompletado: string;
  progreso: number;
}

export default function CertificadosEstudiantePage() {
  const { toast } = useToast();
  const [certificados, setCertificados] = useState<CertificadoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [descargando, setDescargando] = useState<string | null>(null);

  useEffect(() => {
    cargarCertificados();
  }, []);

  const cargarCertificados = async () => {
    try {
      // Fetch inscriptions filter by completed
      const res = await fetch('/api/estudiantes/inscripciones?completado=true');
      if (res.ok) {
        const data = await res.json();
        // data -> Array of inscriptions
        setCertificados(data.map((ins: any) => ({
          cursoId: ins.curso.id,
          cursoTitulo: ins.curso.titulo,
          cursoImagen: ins.curso.imagenDestacada,
          fechaCompletado: ins.fechaActualizacion || ins.fechaInscripcion,
          progreso: ins.progreso,
        })));
      }
    } catch (error) {
      console.error('Error fetching certs:', error);
    } finally {
      setLoading(false);
    }
  };

  const descargarCertificado = async (cursoId: string, titulo: string) => {
    setDescargando(cursoId);
    try {
      const response = await fetch(`/api/certificados/${cursoId}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `certificado-${titulo}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast({ title: '¡Felicidades!', description: 'Tu certificado se ha descargado correctamente.' });
      } else {
        toast({ title: 'Error', description: 'No se pudo generar el certificado en este momento.', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Error al procesar la descarga.', variant: 'destructive' });
    } finally {
      setDescargando(null);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
             <Trophy className="h-9 w-9 text-amber-500" />
             Mis Logros y Certificados
          </h1>
          <p className="text-muted-foreground font-medium mt-1">
             Aquí se guardan para siempre todos tus reconocimientos académicos.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
           <Loader2 className="h-10 w-10 animate-spin text-primary/20" />
           <p className="text-xs font-black uppercase text-muted-foreground tracking-widest">Compilando tus éxitos...</p>
        </div>
      ) : certificados.length === 0 ? (
        <Card className="border-none shadow-sm rounded-[2.5rem] p-12 text-center bg-white overflow-hidden relative">
           <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full blur-[100px] -mr-32 -mt-32" />
           <div className="relative z-10">
              <div className="w-20 h-20 bg-slate-50 flex items-center justify-center rounded-[2rem] mx-auto mb-6 text-slate-300">
                 <Award className="h-10 w-10" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">Aún no tienes certificados</h3>
              <p className="text-muted-foreground max-w-sm mx-auto font-medium mb-8">
                 Completa el 100% de tus cursos para desbloquear tus insignias y diplomas oficiales.
              </p>
              <Button asChild className="rounded-2xl h-14 px-10 font-black uppercase text-xs tracking-widest bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 transition-all">
                 <Link href="/estudiante/mis-cursos">Ir a Estudiar</Link>
              </Button>
           </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {certificados.map((cert) => (
              <Card key={cert.cursoId} className="border-none shadow-sm hover:shadow-xl transition-all duration-300 rounded-[2.5rem] overflow-hidden group bg-white">
                 <div className="relative aspect-video">
                    {cert.cursoImagen ? (
                      <Image src={cert.cursoImagen} alt={cert.cursoTitulo} fill className="object-cover group-hover:scale-110 transition-transform duration-700" />
                    ) : (
                      <div className="bg-slate-100 flex items-center justify-center h-full">
                         <BookOpen className="h-12 w-12 text-slate-200" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                       <p className="text-white text-xs font-bold font-mono tracking-tighter flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" /> COMPLETADO EL {new Date(cert.fechaCompletado).toLocaleDateString()}
                       </p>
                    </div>
                 </div>
                 <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-black text-slate-900 truncate leading-tight group-hover:text-primary transition-colors">
                       {cert.cursoTitulo}
                    </CardTitle>
                    <CardDescription className="font-bold uppercase text-[10px] tracking-widest flex items-center gap-1.5 mt-1">
                       <Award className="h-3.5 w-3.5 text-amber-500" /> Diploma Oficial Volkern
                    </CardDescription>
                 </CardHeader>
                 <CardContent className="pt-4 pb-8">
                    <Button 
                      onClick={() => descargarCertificado(cert.cursoId, cert.cursoTitulo)}
                      disabled={descargando === cert.cursoId}
                      className={cn(
                        "w-full rounded-2xl h-12 font-black uppercase text-[10px] tracking-[0.1em] shadow-sm transition-all",
                        "bg-slate-900 text-white hover:bg-primary hover:shadow-lg hover:shadow-primary/20"
                      )}
                    >
                       {descargando === cert.cursoId ? (
                         <Loader2 className="h-4 w-4 animate-spin mr-2" />
                       ) : (
                         <Download className="h-4 w-4 mr-2" />
                       )}
                       Descargar PDF
                    </Button>
                 </CardContent>
              </Card>
           ))}
        </div>
      )}

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
         <Card className="border-none shadow-sm rounded-[2.5rem] bg-indigo-600 text-white p-8 relative overflow-hidden">
            <div className="absolute right-0 bottom-0 opacity-10 -mr-10 -mb-10 lg:block">
               <GraduationCap className="w-48 h-48" />
            </div>
            <div className="relative z-10">
               <h4 className="font-black text-[10px] uppercase tracking-widest text-indigo-100 mb-2">Tu Trayectoria</h4>
               <p className="text-2xl font-black mb-6">Has completado {certificados.length} recorridos de aprendizaje con éxito.</p>
               <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/10">
                     <span className="text-xl font-black">{certificados.length}</span>
                     <span className="text-[10px] font-bold block opacity-60 uppercase">DIPLOMAS</span>
                  </div>
                  <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/10">
                     <span className="text-xl font-black">100%</span>
                     <span className="text-[10px] font-bold block opacity-60 uppercase">CALIDAD</span>
                  </div>
               </div>
            </div>
         </Card>
      </div>
    </div>
  );
}

