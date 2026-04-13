import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Brain, MessageSquare } from "lucide-react";
import { Note } from "@/types/note";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface SmartNoteCardProps {
  note: Note;
}

export const SmartNoteCard = ({ note }: SmartNoteCardProps) => {
  // Asegurar que metadata exista para evitar errores de renderizado
  const metadata = note.metadata || { sentimiento: 'neutro', fuente: 'sistema' };
  const { sentimiento, next_step } = metadata;

  const sentimentColors = {
    positivo: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
    neutro: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800/30 dark:text-slate-400 dark:border-slate-800",
    negativo: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
    urgente: "bg-red-100 text-red-800 border-red-200 animate-pulse dark:bg-red-900/40 dark:text-red-400 dark:border-red-800",
  };

  return (
    <Card className="border-l-4 border-l-primary hover:shadow-md transition-all">
      <CardHeader className="flex flex-row items-center justify-between py-2 space-y-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {format(new Date(note.fechaCreacion), "HH:mm", { locale: es })}
          </span>
        </div>
        <Badge variant="outline" className={`${sentimentColors[sentimiento as keyof typeof sentimentColors]} capitalize px-2 py-0 h-5`}>
          {sentimiento}
        </Badge>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-sm text-foreground whitespace-pre-wrap">{note.contenido}</p>
        
        {next_step && (
          <div className="mt-3 flex items-start gap-2 p-2 bg-primary/5 rounded-md border border-primary/10">
            <Brain className="w-4 h-4 text-primary mt-0.5" />
            <div className="text-xs italic text-muted-foreground">
              <strong className="text-primary not-italic">Sugerencia de IA:</strong> {next_step}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
