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

export function useNotes(leadId?: string, contactId?: string) {
  const { setNotes } = useNotesStore();
  const entityId = leadId || contactId;
  const apiBase = leadId ? `/api/leads/${leadId}` : `/api/contacts/${contactId}`;

  const { data, error, mutate, isLoading } = useSWR(
    entityId ? `${apiBase}/notes` : null,
    fetcher,
    {
      refreshInterval: 5000,
      onSuccess: (data) => {
        const notesArray = Array.isArray(data) ? data : (data.notes || []);
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
