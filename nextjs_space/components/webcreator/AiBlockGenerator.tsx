'use client';

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, Plus, Wand2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export interface AiGeneratedBlock {
  html: string;
  css: string;
  description: string;
  traits?: Array<{ type: string; label: string; name: string; placeholder?: string }>;
}

interface AiBlockGeneratorProps {
  onBlockGenerated: (block: AiGeneratedBlock) => void;
}

export const AiBlockGenerator = ({ onBlockGenerated }: AiBlockGeneratorProps) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!prompt) return;
    
    setIsGenerating(true);
    try {
      const res = await fetch('/api/marketing/ai/generate-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: prompt })
      });

      if (res.ok) {
        const block = await res.json();
        onBlockGenerated(block);
        setPrompt('');
        toast({ title: "Bloque generado", description: "El bloque ha sido añadido a tu biblioteca." });
      } else {
        throw new Error("Failed to generate block");
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "No se pudo generar el bloque. Intenta con un prompt diferente.", 
        variant: "destructive" 
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-3">
      <div className="flex items-center space-x-2 text-indigo-700">
        <Sparkles className="w-4 h-4" />
        <h3 className="text-xs font-bold uppercase tracking-wider">Generador IA DeepSeek ✦</h3>
      </div>
      
      <div className="flex space-x-2">
        <Input 
          placeholder="Ej: Hero con video y CTA..." 
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="h-9 text-xs bg-white border-indigo-100"
          onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
        />
        <Button 
          size="sm" 
          onClick={handleGenerate} 
          disabled={isGenerating || !prompt}
          className="bg-indigo-600 hover:bg-indigo-700 h-9"
        >
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
        </Button>
      </div>
      
      <p className="text-[10px] text-indigo-400 italic">
        Describe el componente y DeepSeek lo construirá con diseño profesional nativo GrapesJS.
      </p>
    </div>
  );
};
