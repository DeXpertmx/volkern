'use client'

import React, { useState, useEffect } from 'react'
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { 
  Plus, 
  Save, 
  Settings, 
  Eye, 
  Trash2, 
  GripVertical,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Clock,
  Target
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Question, QuestionType, Quiz, QuizOption } from './types'
import { QuestionForm } from './QuestionForm'
import { SortableWidget } from '@/components/ui/sortable-widget'
import { toast } from 'sonner'

interface QuizEditorProps {
  initialData?: Quiz;
  onSave?: (quiz: Quiz) => Promise<void>;
  isLoading?: boolean;
}

export function QuizEditor({ initialData, onSave, isLoading }: QuizEditorProps) {
  const [quiz, setQuiz] = useState<Quiz>(initialData || {
    titulo: '',
    descripcion: '',
    tipoQuiz: 'quiz',
    puntuajeMinimo: 70,
    intentosPermitidos: -1,
    preguntas: []
  })

  const [activeTab, setActiveTab] = useState('editor')
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleAddQuestion = (type: QuestionType) => {
    const newQuestion: Question = {
      id: `new-${crypto.randomUUID()}`,
      pregunta: '',
      tipoPregunta: type,
      orden: quiz.preguntas.length,
      puntaje: 1,
      opciones: type === 'true_false' 
        ? [
            { id: crypto.randomUUID(), label: 'Verdadero', isCorrect: true },
            { id: crypto.randomUUID(), label: 'Falso', isCorrect: false }
          ]
        : type === 'open_text'
        ? []
        : [
            { id: crypto.randomUUID(), label: 'Opción 1', isCorrect: true },
            { id: crypto.randomUUID(), label: 'Opción 2', isCorrect: false }
          ]
    }
    setQuiz({ ...quiz, preguntas: [...quiz.preguntas, newQuestion] })
  }

  const handleUpdateQuestion = (id: string, updates: Partial<Question>) => {
    setQuiz({
      ...quiz,
      preguntas: quiz.preguntas.map(q => q.id === id ? { ...q, ...updates } : q)
    })
  }

  const handleDeleteQuestion = (id: string) => {
    setQuiz({
      ...quiz,
      preguntas: quiz.preguntas.filter(q => q.id !== id)
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setQuiz((prev) => {
        const oldIndex = prev.preguntas.findIndex((q) => q.id === active.id)
        const newIndex = prev.preguntas.findIndex((q) => q.id === over.id)
        
        const newQuestions = arrayMove(prev.preguntas, oldIndex, newIndex).map((q, idx) => ({
          ...q,
          orden: idx
        }))

        return { ...prev, preguntas: newQuestions }
      })
    }
  }

  const handleSave = async () => {
    if (!quiz.titulo) {
      toast.error('El título del cuestionario es obligatorio')
      return
    }

    setSaving(true)
    try {
      if (onSave) {
        await onSave(quiz)
      }
      toast.success('Cuestionario guardado correctamente')
    } catch (error) {
      console.error('Error saving quiz:', error)
      toast.error('Error al guardar el cuestionario')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border shadow-sm sticky top-0 z-40 backdrop-blur-md bg-opacity-80">
        <div>
          <Input
            value={quiz.titulo}
            onChange={(e) => setQuiz({ ...quiz, titulo: e.target.value })}
            placeholder="Título del Cuestionario"
            className="text-2xl font-bold border-none focus-visible:ring-0 px-0 h-auto bg-transparent placeholder:opacity-50"
          />
          <Input
            value={quiz.descripcion}
            onChange={(e) => setQuiz({ ...quiz, descripcion: e.target.value })}
            placeholder="Añade una descripción corta..."
            className="text-sm text-slate-500 border-none focus-visible:ring-0 px-0 h-auto bg-transparent placeholder:opacity-50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setActiveTab(activeTab === 'editor' ? 'settings' : 'editor')}>
            <Settings className="h-4 w-4 mr-2" />
            Ajustes
          </Button>
          <Button variant="outline" size="sm" className="hidden lg:flex">
            <Eye className="h-4 w-4 mr-2" />
            Previsualizar
          </Button>
          <Button onClick={handleSave} disabled={saving || isLoading}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsContent value="editor" className="space-y-6 mt-0">
          <DndContext 
            sensors={sensors} 
            collisionDetection={closestCenter} 
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={quiz.preguntas.map(q => q.id)} 
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {quiz.preguntas.length === 0 && (
                  <Card className="border-dashed py-12">
                    <CardContent className="flex flex-col items-center justify-center text-center">
                      <HelpCircle className="h-12 w-12 text-slate-300 mb-4" />
                      <h3 className="text-lg font-medium">Aún no hay preguntas</h3>
                      <p className="text-slate-500 mb-6">Empieza añadiendo tu primera pregunta al cuestionario.</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button variant="secondary" onClick={() => handleAddQuestion('multiple_choice')}>
                          <Plus className="h-4 w-4 mr-2" /> Opción Múltiple
                        </Button>
                        <Button variant="secondary" onClick={() => handleAddQuestion('true_false')}>
                          <Plus className="h-4 w-4 mr-2" /> Verdadero/Falso
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                {quiz.preguntas.map((question) => (
                  <SortableWidget key={question.id} id={question.id}>
                    <QuestionForm
                      question={question}
                      onUpdate={(updates: Partial<Question>) => handleUpdateQuestion(question.id, updates)}
                      onDelete={() => handleDeleteQuestion(question.id)}
                    />
                  </SortableWidget>
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <footer className="flex justify-center p-8 border-2 border-dashed rounded-2xl bg-slate-50/50 dark:bg-slate-900/50">
             <div className="flex flex-wrap justify-center gap-3">
                <Button variant="outline" className="rounded-xl shadow-sm hover:shadow-md transition-all border-slate-200" onClick={() => handleAddQuestion('multiple_choice')}>
                  <Plus className="h-4 w-4 mr-2 text-primary" /> Opción Múltiple
                </Button>
                <Button variant="outline" className="rounded-xl shadow-sm hover:shadow-md transition-all border-slate-200" onClick={() => handleAddQuestion('multiple_selection')}>
                  <Plus className="h-4 w-4 mr-2 text-indigo-500" /> Casillas
                </Button>
                <Button variant="outline" className="rounded-xl shadow-sm hover:shadow-md transition-all border-slate-200" onClick={() => handleAddQuestion('true_false')}>
                  <Plus className="h-4 w-4 mr-2 text-green-500" /> Verdadero/Falso
                </Button>
                <Button variant="outline" className="rounded-xl shadow-sm hover:shadow-md transition-all border-slate-200" onClick={() => handleAddQuestion('open_text')}>
                  <Plus className="h-4 w-4 mr-2 text-amber-500" /> Abierta
                </Button>
             </div>
          </footer>
        </TabsContent>

        <TabsContent value="settings" className="mt-0">
          <Card className="border-none shadow-sm rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-800/50 border-b">
              <CardTitle className="text-xl flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                Configuración del Cuestionario
              </CardTitle>
              <CardDescription>Ajusta el comportamiento y las reglas de aprobación.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="flex flex-col gap-1">
                      <span>Puntuación de Aprobación (%)</span>
                      <span className="text-xs font-normal text-slate-500">Mínimo necesario para pasar el quiz.</span>
                    </Label>
                    <div className="flex items-center gap-2 w-24">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={quiz.puntuajeMinimo}
                        onChange={(e) => setQuiz({ ...quiz, puntuajeMinimo: parseInt(e.target.value) || 0 })}
                        className="text-center font-bold"
                      />
                      <span className="text-lg text-slate-400">%</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="flex flex-col gap-1">
                      <span>Límite de Tiempo</span>
                      <span className="text-xs font-normal text-slate-500">En minutos. Deja vacío para ilimitado.</span>
                    </Label>
                    <div className="flex items-center gap-2 w-32">
                      <Clock className="h-4 w-4 text-slate-400" />
                      <Input
                        type="number"
                        placeholder="∞"
                        value={quiz.tiempoLimiteMinutos || ''}
                        onChange={(e) => setQuiz({ ...quiz, tiempoLimiteMinutos: e.target.value ? parseInt(e.target.value) : undefined })}
                        className="text-center"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="flex flex-col gap-1">
                      <span>Intentos Permitidos</span>
                      <span className="text-xs font-normal text-slate-500">-1 para intentos ilimitados.</span>
                    </Label>
                    <Input
                      type="number"
                      value={quiz.intentosPermitidos}
                      onChange={(e) => setQuiz({ ...quiz, intentosPermitidos: parseInt(e.target.value) || -1 })}
                      className="w-24 text-center"
                    />
                  </div>
                </div>

                <div className="space-y-6">
                   <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <Label>Barajar Preguntas</Label>
                        <p className="text-xs text-slate-500">Muestra las preguntas en orden aleatorio cada vez.</p>
                      </div>
                      <Switch id="shuffle" />
                   </div>
                   
                   <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <Label>Mostrar Respuestas al Finalizar</Label>
                        <p className="text-xs text-slate-500">Permite al estudiante ver qué preguntas falló y sus explicaciones.</p>
                      </div>
                      <Switch id="reveal" defaultChecked />
                   </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
