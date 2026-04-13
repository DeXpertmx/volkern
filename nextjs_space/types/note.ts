export interface NoteMetadata {
  sentimiento: 'positivo' | 'neutro' | 'negativo' | 'urgente';
  fuente: string;
  fechaIA: string;
  next_step?: string;
}

export interface Note {
  id: string;
  leadId: string;
  contenido: string;
  creadoPor: string | null;
  metadata: NoteMetadata;
  fechaCreacion: string;
}
