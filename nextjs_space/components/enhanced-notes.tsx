
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Note {
  id: string;
  contenido: string;
  creadoPor: string | null;
  fechaCreacion: string;
}

interface EnhancedNotesProps {
  leadId: string;
}

export function EnhancedNotes({ leadId }: EnhancedNotesProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchNotes();
  }, [leadId]);

  const fetchNotes = async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/notes`);
      if (!res.ok) throw new Error('Error al cargar notas');
      const data = await res.json();
      // Soportar tanto el formato antiguo (array) como el nuevo ({ notes: [...] })
      setNotes(Array.isArray(data) ? data : (data.notes || []));
    } catch (error) {
      console.error('Error fetching notes:', error);
      toast.error('Error al cargar las notas');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      toast.error('Por favor ingresa una nota');
      return;
    }

    try {
      const res = await fetch(`/api/leads/${leadId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenido: newNote })
      });

      if (!res.ok) throw new Error('Error al crear nota');

      toast.success('Nota añadida correctamente');
      setNewNote('');
      setIsAdding(false);
      fetchNotes();
    } catch (error) {
      console.error('Error creating note:', error);
      toast.error('Error al añadir la nota');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center">
              <FileText className="h-5 w-5 mr-2" />
              Notas ({notes.length})
            </CardTitle>
            <CardDescription>
              Registro de notas internas sobre el lead
            </CardDescription>
          </div>
          {!isAdding && (
            <Button size="sm" onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Añadir Nota
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isAdding && (
          <div className="mb-4 p-4 border rounded-lg bg-muted/30">
            <Textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Escribe tu nota aquí..."
              rows={3}
              className="mb-3"
            />
            <div className="flex gap-2">
              <Button onClick={handleAddNote} size="sm">
                Guardar Nota
              </Button>
              <Button 
                onClick={() => {
                  setIsAdding(false);
                  setNewNote('');
                }} 
                variant="outline" 
                size="sm"
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No hay notas registradas</p>
            <p className="text-sm text-muted-foreground mt-1">
              Añade notas para mantener un registro interno sobre este lead
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="p-4 border rounded-lg bg-white">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs text-muted-foreground">
                    📝 {format(new Date(note.fechaCreacion), "dd MMM yyyy 'a las' HH:mm", { locale: es })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{note.contenido}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
