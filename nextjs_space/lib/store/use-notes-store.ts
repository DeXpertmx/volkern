import { create } from 'zustand';
import useSWR from 'swr';
import { Note } from '@/types/note';

interface NotesState {
  notes: Note[];
  setNotes: (notes: Note[]) => void;
  addNote: (note: Note) => void;
}

export const useNotesStore = create<NotesState>((set) => ({
  notes: [],
  setNotes: (notes) => set({ notes }),
  addNote: (note) => set((state) => ({ notes: [note, ...state.notes] })),
}));

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useNotes(leadId: string) {
  const { setNotes } = useNotesStore();

  const { data, error, mutate, isLoading } = useSWR(
    leadId ? `/api/leads/${leadId}/notes` : null,
    fetcher,
    {
      refreshInterval: 5000, // Polling cada 5 segundos para tiempo real simulado
      onSuccess: (data) => {
        const notesArray = Array.isArray(data) ? data : (data.notes || []);
        // Ordenar por fecha descendente
        const sortedNotes = [...notesArray].sort((a, b) => 
          new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime()
        );
        setNotes(sortedNotes);
      },
    }
  );

  return {
    notes: Array.isArray(data) ? data : (data?.notes || []),
    isLoading,
    isError: error,
    refreshNotes: mutate,
  };
}
