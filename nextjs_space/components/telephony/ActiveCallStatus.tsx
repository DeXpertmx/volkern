'use client';

import React, { useState, useEffect } from 'react';
import { 
  Phone, 
  Mic, 
  MicOff, 
  Pause, 
  Play, 
  ArrowLeftRight, 
  X,
  User,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ActiveCallProps {
  call: {
    number: string;
    name?: string;
    location?: string;
    startTime: number;
    status: 'ringing' | 'connected' | 'ended';
  } | null;
  onHangup: () => void;
}

export function ActiveCallStatus({ call, onHangup }: ActiveCallProps) {
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    let interval: any;
    if (call && call.status === 'connected') {
      interval = setInterval(() => {
        setDuration(Math.floor((Date.now() - call.startTime) / 1000));
      }, 1000);
    } else {
      setDuration(0);
    }
    return () => clearInterval(interval);
  }, [call]);

  if (!call) return null;

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-bottom-10 fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 flex items-center gap-6 min-w-[500px]">
        {/* Contact Info */}
        <div className="flex items-center gap-3 pl-2 pr-4 border-r border-slate-100">
          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <User size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 leading-none mb-1">{call.number}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{call.location || 'Ubicación desconocida'}</p>
          </div>
        </div>

        {/* Status & Timer */}
        <div className="flex items-center gap-4">
          <p className="text-sm font-mono font-bold text-slate-600">{formatTime(duration)}</p>
          <Badge className={cn(
            "border-none px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            call.status === 'ringing' ? "bg-amber-100 text-amber-700 animate-pulse" : "bg-blue-100 text-blue-700"
          )}>
            {call.status === 'ringing' ? 'Timbrando...' : 'En Llamada'}
          </Badge>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 pr-2 ml-auto">
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn("h-10 w-10 rounded-xl transition-all", isMuted ? "bg-red-50 text-red-600" : "text-slate-400 hover:bg-slate-50")}
            onClick={() => setIsMuted(!isMuted)}
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn("h-10 w-10 rounded-xl transition-all", isPaused ? "bg-amber-50 text-amber-600" : "text-slate-400 hover:bg-slate-50")}
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? <Play size={18} /> : <Pause size={18} />}
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-slate-400 hover:bg-slate-50">
            <ArrowLeftRight size={18} />
          </Button>
          <Button 
            variant="destructive" 
            size="icon" 
            className="h-10 w-10 rounded-xl shadow-lg shadow-red-500/20"
            onClick={onHangup}
          >
            <Phone size={18} className="rotate-[135deg]" />
          </Button>
        </div>
      </div>
    </div>
  );
}
