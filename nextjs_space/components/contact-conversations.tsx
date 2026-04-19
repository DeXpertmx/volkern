
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, ExternalLink, Mail, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';

interface Conversation {
  id: string;
  canal: string;
  estado: string;
  fechaUltimoMensaje: string;
  ultimoMensaje: string | null;
}

interface ContactConversationsProps {
  contactId: string;
}

export function ContactConversations({ contactId }: ContactConversationsProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const res = await fetch(`/api/contacts/${contactId}/conversaciones`);
        if (res.ok) {
          const data = await res.json();
          setConversations(data.conversaciones || []);
        }
      } catch (error) {
        console.error('Error fetching conversations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, [contactId]);

  const getCanalIcon = (canal: string) => {
    switch (canal.toLowerCase()) {
      case 'email': return Mail;
      case 'whatsapp': return MessageCircle;
      default: return MessageSquare;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center">
              <MessageSquare className="h-5 w-5 mr-2" />
              Conversaciones ({conversations.length})
            </CardTitle>
            <CardDescription>
              Historial de emails y mensajes de chat
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/mensajes">
              Ir al Centro de Mensajes
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No hay conversaciones registradas</p>
          </div>
        ) : (
          <div className="space-y-4">
            {conversations.map((conv) => {
              const Icon = getCanalIcon(conv.canal);
              return (
                <div key={conv.id} className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm uppercase">{conv.canal}</span>
                        <Badge variant={conv.estado === 'abierta' ? 'default' : 'secondary'} className="text-[10px]">
                          {conv.estado}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(conv.fechaUltimoMensaje), "dd MMM, HH:mm", { locale: es })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mb-2">
                      {conv.ultimoMensaje || 'Sin mensajes'}
                    </p>
                    <Link 
                      href={`/dashboard/mensajes?id=${conv.id}`}
                      className="text-xs text-primary font-bold flex items-center gap-1 hover:underline"
                    >
                      Ver conversación completa <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
