'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  Loader2, 
  Award, 
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface Question {
  id: string;
  pregunta: string;
  opciones: any; // { id, texto }[]
}

interface AcademyQuizProps {
  quizId: string;
  title: string;
  questions: Question[];
  onComplete?: (result: any) => void;
}

export function AcademyQuiz({ quizId, title, questions, onComplete }: AcademyQuizProps) {
  const [currentStep, setCurrentStep] = useState(0); // 0: Start, 1: Questions, 2: Result
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const currentQuestion = questions[currentQuestionIndex];

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      submitQuiz();
    }
  };

  const submitQuiz = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/academy/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId, answers })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al enviar quiz');

      setResult(data);
      setCurrentStep(2);
      if (onComplete) onComplete(data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="rounded-[2.5rem] border-none shadow-2xl bg-white overflow-hidden max-w-2xl mx-auto">
      <AnimatePresence mode="wait">
        {currentStep === 0 && (
          <motion.div
            key="start"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-10 text-center"
          >
            <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center text-emerald-600 mx-auto mb-6">
              <HelpCircle className="w-12 h-12" />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-4">{title}</h2>
            <p className="text-slate-500 mb-8 font-medium">
              Esta evaluación validará tus conocimientos adquiridos en este módulo. 
              Necesitas un **80%** para aprobar y obtener tu certificación.
            </p>
            <Button 
              onClick={() => setCurrentStep(1)} 
              className="h-14 px-10 rounded-2xl bg-emerald-600 hover:bg-emerald-700 font-black text-lg shadow-xl shadow-emerald-100"
            >
              Comenzar Evaluación
            </Button>
          </motion.div>
        )}

        {currentStep === 1 && (
          <motion.div
            key="questions"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="p-10"
          >
            <div className="flex justify-between items-center mb-8">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                Pregunta {currentQuestionIndex + 1} de {questions.length}
              </span>
              <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-300" 
                  style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                />
              </div>
            </div>

            <h3 className="text-2xl font-black text-slate-900 mb-8 leading-tight">
              {currentQuestion.pregunta}
            </h3>

            <RadioGroup 
              value={answers[currentQuestion.id]} 
              onValueChange={(val) => setAnswers({ ...answers, [currentQuestion.id]: val })}
              className="space-y-4 mb-10"
            >
              {currentQuestion.opciones.map((opcion: any) => (
                <div key={opcion.id} className="flex items-center space-x-2">
                  <RadioGroupItem value={opcion.id} id={opcion.id} className="peer hidden" />
                  <Label 
                    htmlFor={opcion.id} 
                    className="flex-1 p-5 rounded-2xl border-2 border-slate-50 bg-slate-50/50 peer-data-[state=checked]:border-emerald-500 peer-data-[state=checked]:bg-emerald-50/30 cursor-pointer transition-all font-bold text-slate-700 hover:bg-slate-50"
                  >
                    {opcion.texto}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            <Button 
              onClick={handleNext} 
              disabled={!answers[currentQuestion.id] || loading}
              className="w-full h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 font-black text-lg"
            >
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                currentQuestionIndex < questions.length - 1 ? 'Siguiente Pregunta' : 'Finalizar Evaluación'
              )}
            </Button>
          </motion.div>
        )}

        {currentStep === 2 && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-12 text-center"
          >
            {result.result.passed ? (
              <div className="space-y-6">
                <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center text-white mx-auto shadow-2xl shadow-emerald-200">
                  <Award className="w-14 h-14" />
                </div>
                <div>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tight">¡Certificado Obtenido!</h2>
                  <p className="text-emerald-600 font-bold text-lg mt-2">Puntuación: {result.result.score.toFixed(0)}%</p>
                </div>
                <p className="text-slate-500 max-w-sm mx-auto font-medium">
                  Has demostrado dominio sobre esta materia. Tu certificación digital ha sido emitida e integrada en tu Digital DNA.
                </p>
                <div className="pt-6 space-y-3">
                  <Button className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 font-black text-lg shadow-xl shadow-emerald-100">
                    Descargar Certificado
                  </Button>
                  <Button variant="ghost" className="w-full text-slate-500 font-bold" onClick={() => window.location.reload()}>
                    Regresar al Dashboard
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center text-red-500 mx-auto">
                  <XCircle className="w-14 h-14" />
                </div>
                <div>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tight">No aprobado</h2>
                  <p className="text-red-600 font-bold text-lg mt-2">Puntuación: {result.result.score.toFixed(0)}%</p>
                </div>
                <p className="text-slate-500 max-w-sm mx-auto font-medium">
                  Necesitas al menos un **80%** para obtener la certificación. Te recomendamos revisar el material e intentarlo de nuevo.
                </p>
                <Button 
                  onClick={() => window.location.reload()} 
                  className="w-full h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 font-black text-lg mt-6"
                >
                  Intentar de Nuevo
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
