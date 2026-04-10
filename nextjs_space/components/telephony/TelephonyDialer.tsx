'use client';

import React, { useState } from 'react';
import { 
  Phone, 
  Delete, 
  X, 
  Mic, 
  MicOff, 
  Volume2, 
  UserPlus,
  Pause,
  Play,
  RotateCcw,
  ArrowLeftRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function TelephonyDialer({ onClose }: { onClose?: () => void }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [calling, setCalling] = useState(false);

  const handleDigit = (digit: string) => {
    if (phoneNumber.length < 15) {
      setPhoneNumber(prev => prev + digit);
    }
  };

  const handleBackspace = () => {
    setPhoneNumber(prev => prev.slice(0, -1));
  };

  const handleCall = async () => {
    if (!phoneNumber) {
      toast.error('Ingresa un número de teléfono');
      return;
    }

    setCalling(true);
    try {
      const response = await fetch('/api/integrations/telephony/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: phoneNumber })
      });

      const data = await response.json();
      if (response.ok) {
        toast.success('Llamada iniciada. Tu teléfono sonará en breve.');
      } else {
        toast.error(data.error || 'Error al iniciar llamada');
        setCalling(false);
      }
    } catch (error) {
      toast.error('Error de red al iniciar llamada');
      setCalling(false);
    }
  };

  const pad = [
    { d: '1', l: '' }, { d: '2', l: 'ABC' }, { d: '3', l: 'DEF' },
    { d: '4', l: 'GHI' }, { d: '5', l: 'JKL' }, { d: '6', l: 'MNO' },
    { d: '7', l: 'PQRS' }, { d: '8', l: 'TUV' }, { d: '9', l: 'WXYZ' },
    { d: '*', l: '' }, { d: '0', l: '+' }, { d: '#', l: '' },
  ];

  return (
    <Card className="w-80 shadow-2xl border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
      <CardHeader className="bg-slate-50 border-b py-3 px-4 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Phone className="h-4 w-4 text-blue-600" /> Marcador
        </CardTitle>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
            <X size={16} />
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-6">
        <div className="relative mb-6">
          <Input 
            value={phoneNumber} 
            readOnly 
            className="text-2xl font-bold text-center h-14 border-none bg-slate-50 focus-visible:ring-0"
            placeholder="Introduce un número"
          />
          {phoneNumber && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              onClick={handleBackspace}
            >
              <Delete size={20} />
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {pad.map((item) => (
            <Button
              key={item.d}
              variant="outline"
              className="h-14 rounded-xl flex flex-col border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all active:scale-95"
              onClick={() => handleDigit(item.d)}
            >
              <span className="text-xl font-bold text-slate-900">{item.d}</span>
              <span className="text-[8px] text-slate-400 font-bold uppercase">{item.l}</span>
            </Button>
          ))}
        </div>

        <div className="flex justify-center">
          <Button
            size="lg"
            className={cn(
              "w-20 h-20 rounded-full shadow-lg transition-all active:scale-90",
              calling ? "bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-700"
            )}
            onClick={calling ? () => setCalling(false) : handleCall}
          >
            {calling ? <Phone size={32} className="rotate-[135deg]" /> : <Phone size={32} />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
