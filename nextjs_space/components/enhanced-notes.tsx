
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { useNotes } from '@/lib/store/use-notes-store';
import { SmartNoteCard } from '@/components/leads/SmartNoteCard';

interface EnhancedNotesProps {
  leadId?: string;
  contactId?: string;
}

export function EnhancedNotes({ leadId, contactId }: EnhancedNotesProps) {
  const { notes, isLoading, refreshNotes } = useNotes(leadId, contactId);
  const [newNote, setNewNote] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const entityId = leadId || contactId;
  const apiBase = leadId ? `/api/leads/${leadId}` : `/api/contacts/${contactId}`;

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      toast.error('Por favor ingresa una nota');
      return;
    }

    try {
      const res = await fetch(`${apiBase}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenido: newNote })
      });

      if (!res.ok) throw new Error('Error al crear nota');

      toast.success('Nota añadida correctamente');
      setNewNote('');
      setIsAdding(false);
      refreshNotes(); // SWR mutate para actualización inmediata
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
              Registro de notas inteligentes con análisis de IA
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

        {isLoading ? (
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
              <SmartNoteCard key={note.id} note={note} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
