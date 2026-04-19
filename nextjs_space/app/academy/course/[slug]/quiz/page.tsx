import { prisma } from '@/lib/db';
import { AcademyQuiz } from '@/components/academy/AcademyQuiz';
import { notFound } from 'next/navigation';
import { ShieldCheck, GraduationCap } from 'lucide-react';

export default async function QuizPage({ params }: { params: { slug: string } }) {
  const course = await prisma.curso.findUnique({
    where: { urlSlug: params.slug },
    include: {
      modulos: {
        include: {
          lecciones: {
            include: {
              quiz: {
                include: {
                  preguntas: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!course) notFound();

  // For simplicity, take the first quiz found in the course
  const quiz = course.modulos[0]?.lecciones.find(l => l.quiz)?.quiz;

  if (!quiz) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <GraduationCap className="w-16 h-16 text-slate-300 mx-auto mb-6" />
          <h1 className="text-2xl font-black text-slate-900">Evaluación no disponible</h1>
          <p className="text-slate-500 mt-2 font-medium">Este curso aún no cuenta con un examen de certificación configurado.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-8 md:p-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-100">
              <GraduationCap className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Examen de Certificación</p>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">{course.titulo}</h2>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-white rounded-2xl shadow-sm border border-slate-100">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <span className="text-xs font-bold text-slate-500">Evaluación Segura</span>
          </div>
        </div>

        <AcademyQuiz 
          quizId={quiz.id} 
          title={quiz.titulo} 
          questions={quiz.preguntas.map(p => ({
            id: p.id,
            pregunta: p.pregunta,
            opciones: p.opciones
          }))} 
        />

        <p className="mt-12 text-center text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
          Powered by <span className="text-slate-900">Volkern Academy Trust Engine</span>
        </p>
      </div>
    </div>
  );
}
