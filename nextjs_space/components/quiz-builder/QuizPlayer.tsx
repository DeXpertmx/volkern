'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { 
  CheckCircle2, 
  XCircle, 
  ChevronRight, 
  ChevronLeft, 
  Clock, 
  Send,
  AlertCircle,
  Trophy,
  RotateCcw,
  Layout
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Question, Quiz } from './types'
import { toast } from 'sonner'

interface QuizPlayerProps {
  quiz: Quiz;
  onSubmit: (respuestas: Record<string, any>) => Promise<any>;
}

export function QuizPlayer({ quiz, onSubmit }: QuizPlayerProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [responses, setResponses] = useState<Record<string, any>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [startTime] = useState(new Date())

  const currentQuestion = quiz.preguntas[currentQuestionIndex]
  const progress = ((currentQuestionIndex + 1) / quiz.preguntas.length) * 100

  const handleResponseChange = (questionId: string, value: any) => {
    setResponses((prev) => ({
      ...prev,
      [questionId]: value
    }))
  }

  const handleMultipleSelection = (questionId: string, optionId: string, checked: boolean) => {
    const currentSelections = responses[questionId] || []
    if (checked) {
      handleResponseChange(questionId, [...currentSelections, optionId])
    } else {
      handleResponseChange(questionId, currentSelections.filter((id: string) => id !== optionId))
    }
  }

  const handleSubmit = async () => {
    // Validar que todas las preguntas estén respondidas (opcional, pero recomendado)
    const totalQuestions = quiz.preguntas.length
    const answeredCount = Object.keys(responses).length
    
    if (answeredCount < totalQuestions) {
       toast.warning('Por favor responde todas las preguntas antes de enviar.')
       return
    }

    setSubmitting(true)
    try {
      const resultData = await onSubmit(responses)
      setResult(resultData)
      toast.success('¡Cuestionario enviado!')
    } catch (error) {
      console.error('Error submitting quiz:', error)
      toast.error('Error al enviar el cuestionario')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <Card className="border-none shadow-2xl rounded-3xl overflow-hidden bg-white dark:bg-slate-900">
          <div className={cn(
            "p-12 text-center text-white",
            result.aprobado ? "bg-gradient-to-br from-green-400 to-green-600" : "bg-gradient-to-br from-red-400 to-red-600"
          )}>
            <div className="flex justify-center mb-6">
              {result.aprobado ? <Trophy className="h-20 w-20" /> : <AlertCircle className="h-20 w-20" />}
            </div>
            <h2 className="text-4xl font-bold mb-2">
              {result.aprobado ? '¡Felicidades!' : 'Sigue intentándolo'}
            </h2>
            <p className="text-xl opacity-90">
              {result.aprobado ? 'Has aprobado el cuestionario' : 'No has superado la puntuación mínima'}
            </p>
          </div>
          
          <CardContent className="p-12 space-y-8">
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl text-center">
                <span className="text-sm text-slate-500 uppercase font-bold tracking-widest">Tu Puntuación</span>
                <p className="text-4xl font-black mt-2 text-primary">{result.porcentaje}%</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl text-center">
                <span className="text-sm text-slate-500 uppercase font-bold tracking-widest">Resultado</span>
                <p className={cn(
                  "text-4xl font-black mt-2",
                  result.aprobado ? "text-green-500" : "text-red-500"
                )}>
                  {result.aprobado ? 'APROBADO' : 'FALLIDO'}
                </p>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-2xl border border-blue-100 dark:border-blue-800">
               <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
                 Mínimo para aprobar: {quiz.puntuajeMinimo}%
               </p>
            </div>

            <div className="flex flex-col gap-3">
              <Button size="lg" className="rounded-full shadow-lg" onClick={() => window.location.reload()}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reintentar Cuestionario
              </Button>
              <Button variant="ghost" size="lg" className="rounded-full" onClick={() => window.history.back()}>
                Volver
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6 min-h-[90vh]">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
            <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight">{quiz.titulo}</h1>
                <p className="text-sm text-slate-500">Pregunta {currentQuestionIndex + 1} de {quiz.preguntas.length}</p>
            </div>
            {quiz.tiempoLimiteMinutos && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 px-3 py-1.5 rounded-full flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span className="font-mono font-bold tracking-widest">00:00</span>
                </Badge>
            )}
        </div>
        <Progress value={progress} className="h-2 rounded-full" />
      </header>

      <main className="flex-1 flex flex-col justify-center py-6">
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white dark:bg-slate-900 min-h-[400px] flex flex-col">
          <CardHeader className="p-8 pb-4">
            <h2 className="text-2xl md:text-3xl font-semibold leading-tight text-slate-900 dark:text-white">
              {currentQuestion.pregunta}
            </h2>
          </CardHeader>
          
          <CardContent className="p-8 pt-6 flex-1">
            {currentQuestion.tipoPregunta === 'multiple_choice' || currentQuestion.tipoPregunta === 'true_false' ? (
              <RadioGroup 
                value={responses[currentQuestion.id] || ''} 
                onValueChange={(val) => handleResponseChange(currentQuestion.id, val)}
                className="space-y-4"
              >
                {currentQuestion.opciones.map((option) => (
                  <div 
                    key={option.id}
                    className={cn(
                      "flex items-center space-x-3 p-5 rounded-2xl border-2 transition-all cursor-pointer group hover:bg-slate-50 dark:hover:bg-slate-800",
                      responses[currentQuestion.id] === (option.id || option.label)
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-slate-100 dark:border-slate-800"
                    )}
                    onClick={() => handleResponseChange(currentQuestion.id, option.id || option.label)}
                  >
                    <RadioGroupItem value={option.id || option.label} id={option.id} className="h-5 w-5" />
                    <Label htmlFor={option.id} className="text-lg font-medium cursor-pointer grow">{option.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            ) : currentQuestion.tipoPregunta === 'multiple_selection' ? (
              <div className="space-y-4">
                {currentQuestion.opciones.map((option) => {
                  const isChecked = (responses[currentQuestion.id] || []).includes(option.id || option.label)
                  return (
                    <div 
                      key={option.id}
                      className={cn(
                        "flex items-center space-x-3 p-5 rounded-2xl border-2 transition-all cursor-pointer group hover:bg-slate-50 dark:hover:bg-slate-800",
                        isChecked
                          ? "border-primary bg-primary/5 shadow-md"
                          : "border-slate-100 dark:border-slate-800"
                      )}
                      onClick={() => handleMultipleSelection(currentQuestion.id, option.id || option.label, !isChecked)}
                    >
                      <Checkbox 
                        id={option.id} 
                        checked={isChecked}
                        onCheckedChange={(checked) => handleMultipleSelection(currentQuestion.id, option.id || option.label, !!checked)}
                        className="h-5 w-5"
                      />
                      <Label htmlFor={option.id} className="text-lg font-medium cursor-pointer grow">{option.label}</Label>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-4 h-full">
                <Textarea 
                  placeholder="Escribe tu respuesta aquí..."
                  className="w-full text-lg p-6 rounded-2xl border-2 border-slate-100 dark:border-slate-800 focus:border-primary transition-all grow min-h-[200px]"
                  value={responses[currentQuestion.id] || ''}
                  onChange={(e) => handleResponseChange(currentQuestion.id, e.target.value)}
                />
              </div>
            )}
          </CardContent>

          <CardFooter className="p-8 pt-4 border-t border-slate-50 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 flex justify-between">
             <Button 
                variant="ghost" 
                size="lg" 
                className="rounded-full px-6"
                disabled={currentQuestionIndex === 0}
                onClick={() => setCurrentQuestionIndex(currentQuestionIndex - 1)}
             >
                <ChevronLeft className="mr-2 h-5 w-5" />
                Anterior
             </Button>

             {currentQuestionIndex === quiz.preguntas.length - 1 ? (
                <Button 
                    size="lg" 
                    className="rounded-full px-8 shadow-lg shadow-primary/20 transition-all hover:scale-105"
                    disabled={submitting}
                    onClick={handleSubmit}
                >
                    {submitting ? 'Enviando...' : 'Finalizar y Enviar'}
                    <Send className="ml-2 h-5 w-5" />
                </Button>
             ) : (
                <Button 
                    size="lg" 
                    className="rounded-full px-8 shadow-md"
                    onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
                >
                    Siguiente
                    <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
             )}
          </CardFooter>
        </Card>
      </main>
    </div>
  )
}
