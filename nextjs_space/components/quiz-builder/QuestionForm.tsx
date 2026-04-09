'use client'

import React from 'react'
import { 
  Trash2, 
  Plus, 
  X, 
  CheckCircle2, 
  Circle, 
  Square, 
  CheckSquare, 
  Type, 
  HelpCircle,
  Copy,
  RotateCcw,
  Layout
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Question, QuestionType, QuizOption } from './types'

interface QuestionFormProps {
  question: Question;
  onUpdate: (updates: Partial<Question>) => void;
  onDelete: () => void;
}

export function QuestionForm({ question, onUpdate, onDelete }: QuestionFormProps) {
  const handleAddOption = () => {
    const newOption: QuizOption = {
      id: crypto.randomUUID(),
      label: `Nueva opción ${question.opciones.length + 1}`,
      isCorrect: false
    }
    onUpdate({ opciones: [...question.opciones, newOption] })
  }

  const handleUpdateOption = (optionId: string, updates: Partial<QuizOption>) => {
    onUpdate({
      opciones: question.opciones.map(o => o.id === optionId ? { ...o, ...updates } : o)
    })
  }

  const handleDeleteOption = (optionId: string) => {
    onUpdate({
      opciones: question.opciones.filter(o => o.id !== optionId)
    })
  }

  const toggleCorrectStatus = (optionId: string) => {
    if (question.tipoPregunta === 'multiple_choice' || question.tipoPregunta === 'true_false') {
      // Solo una puede ser correcta
      onUpdate({
        opciones: question.opciones.map(o => ({
          ...o,
          isCorrect: o.id === optionId
        }))
      })
    } else {
      // Pueden ser varias correctas
      onUpdate({
        opciones: question.opciones.map(o => ({
          ...o,
          isCorrect: o.id === optionId ? !o.isCorrect : o.isCorrect
        }))
      })
    }
  }

  const getTypeIcon = (type: QuestionType) => {
    switch (type) {
      case 'multiple_choice': return <Circle className="h-4 w-4 text-primary" />;
      case 'multiple_selection': return <Square className="h-4 w-4 text-indigo-500" />;
      case 'true_false': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'open_text': return <Type className="h-4 w-4 text-amber-500" />;
      default: return <HelpCircle className="h-4 w-4" />;
    }
  }

  const getTypeLabel = (type: QuestionType) => {
    switch (type) {
      case 'multiple_choice': return 'Opción Múltiple';
      case 'multiple_selection': return 'Casillas de Selección';
      case 'true_false': return 'Verdadero o Falso';
      case 'open_text': return 'Respuesta Abierta';
      default: return 'Desconocido';
    }
  }

  return (
    <Card className="shadow-sm border-slate-200 dark:border-slate-800 hover:border-primary/30 transition-colors group">
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-4 p-4 border-b bg-slate-50/50 dark:bg-slate-800/20">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-white dark:bg-slate-900 border-slate-200 shadow-sm flex items-center gap-2 px-3 py-1">
              {getTypeIcon(question.tipoPregunta)}
              <span className="text-xs font-semibold">{getTypeLabel(question.tipoPregunta)}</span>
            </Badge>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Puntos:</span>
              <Input
                type="number"
                value={question.puntaje}
                onChange={(e) => onUpdate({ puntaje: parseInt(e.target.value) || 1 })}
                className="w-16 h-7 text-xs text-center font-bold px-1"
              />
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <Textarea
              placeholder="Escribe tu pregunta aquí..."
              value={question.pregunta}
              onChange={(e) => onUpdate({ pregunta: e.target.value })}
              className="text-lg font-medium border-none shadow-none focus-visible:ring-0 p-0 resize-none min-h-[40px] bg-transparent"
            />
          </div>

          {(question.tipoPregunta !== 'open_text') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">Opciones de respuesta</Label>
                {question.tipoPregunta !== 'true_false' && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-primary bg-primary/5 hover:bg-primary/10" onClick={handleAddOption}>
                    <Plus className="h-3 w-3 mr-1" />
                    Añadir opción
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                {question.opciones.map((option, index) => (
                  <div 
                    key={option.id} 
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border transition-all",
                      option.isCorrect 
                        ? "bg-green-50/50 border-green-200 dark:bg-green-900/10 dark:border-green-800" 
                        : "bg-white border-slate-100 dark:bg-slate-900 dark:border-slate-800"
                    )}
                  >
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={cn(
                        "h-8 w-8 rounded-full shadow-sm hover:scale-105 transition-transform",
                        option.isCorrect 
                          ? "bg-green-500 text-white hover:bg-green-600" 
                          : "bg-slate-100 text-slate-400 hover:bg-slate-200 dark:bg-slate-800"
                      )}
                      onClick={() => toggleCorrectStatus(option.id)}
                    >
                      {option.isCorrect ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        question.tipoPregunta === 'multiple_selection' ? <Square className="h-4 w-4" /> : <Circle className="h-4 w-4" />
                      )}
                    </Button>
                    
                    <Input
                      value={option.label}
                      onChange={(e) => handleUpdateOption(option.id, { label: e.target.value })}
                      className="border-none shadow-none focus-visible:ring-0 h-8 font-medium bg-transparent grow"
                      placeholder={`Opción ${index + 1}`}
                      disabled={question.tipoPregunta === 'true_false'}
                    />

                    {question.tipoPregunta !== 'true_false' && question.opciones.length > 2 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-red-400" onClick={() => handleDeleteOption(option.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {question.tipoPregunta === 'open_text' && (
             <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-dashed text-center">
                <p className="text-sm text-slate-500 italic">El estudiante escribirá su respuesta en un cuadro de texto libre.</p>
             </div>
          )}

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
             <div className="flex items-center gap-2 text-slate-400 mb-2">
                <HelpCircle className="h-3 w-3" />
                <Label className="text-xs font-semibold">Explicación del resultado (Opcional)</Label>
             </div>
             <Textarea
               placeholder="Añade una explicación que se mostrará corregida la respuesta..."
               value={question.explicacion}
               onChange={(e) => onUpdate({ explicacion: e.target.value })}
               className="text-sm border-slate-200 dark:border-slate-800 bg-slate-50/30 grow resize-none h-20"
             />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
