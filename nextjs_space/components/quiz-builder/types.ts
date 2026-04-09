export type QuestionType = 'multiple_choice' | 'multiple_selection' | 'true_false' | 'open_text';

export interface QuizOption {
  id: string;
  label: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  pregunta: string;
  tipoPregunta: QuestionType;
  orden: number;
  puntaje: number;
  opciones: QuizOption[];
  explicacion?: string;
}

export interface Quiz {
  id?: string;
  titulo: string;
  descripcion?: string;
  tipoQuiz: string;
  puntuajeMinimo: number;
  intentosPermitidos: number;
  tiempoLimiteMinutos?: number;
  preguntas: Question[];
}
