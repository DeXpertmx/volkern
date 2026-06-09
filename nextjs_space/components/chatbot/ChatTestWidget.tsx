'use client';

import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';

interface ChatTestWidgetProps {
  nombreAsistente?: string;
  activo?: boolean;
}

export function ChatTestWidget({ nombreAsistente = 'Asistente', activo = true }: ChatTestWidgetProps) {
  if (!activo) return null;
  return (
    <Button
      className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
      size="icon"
    >
      <MessageCircle className="h-6 w-6" />
    </Button>
  );
}
