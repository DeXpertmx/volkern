import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Send, Copy, RotateCcw, BrainCircuit } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export function GemmaPromptUI() {
  const [prompt, setPrompt] = useState('');
  const [platform, setPlatform] = useState('LINKEDIN');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt) return;
    setIsLoading(true);
    
    try {
      // Llamada real al skill de marketing (simulada aquí)
      const res = await fetch('/api/marketing/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, platform })
      });
      const data = await res.json();
      setResult(data.copy || data.result);
      
      toast({
        title: "Sugerencia generada",
        description: "Gemma 4 ha procesado tu solicitud con éxito.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo conectar con Gemma 4.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      toast({ title: "Copiado", description: "El contenido está en tu portapapeles." });
    }
  };

  return (
    <Card className="border-2 border-indigo-100 shadow-indigo-50/50 shadow-xl">
      <CardHeader className="bg-gradient-to-r from-indigo-50 to-white">
        <div className="flex items-center space-x-2">
          <BrainCircuit className="w-6 h-6 text-indigo-600" />
          <div>
            <CardTitle className="text-lg">Copiloto Gemma 4</CardTitle>
            <CardDescription>Generación de copy y optimización de campañas con IA soberana</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex space-x-4">
            <div className="flex-grow">
              <Textarea
                placeholder="Ej: Escribe un post para LinkedIn sobre el lanzamiento de nuestro nuevo ERP industrial..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[100px] resize-none border-indigo-100 focus:ring-indigo-500"
              />
            </div>
            <div className="w-[180px] space-y-2">
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Plataforma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LINKEDIN">LinkedIn</SelectItem>
                  <SelectItem value="YOUTUBE">YouTube</SelectItem>
                  <SelectItem value="TIKTOK">TikTok</SelectItem>
                  <SelectItem value="EMAIL">Email Marketing</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={handleGenerate}
                disabled={isLoading || !prompt}
              >
                {isLoading ? (
                  "Procesando..."
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" /> Generar</>
                )}
              </Button>
            </div>
          </div>

          {result && (
            <div className="mt-6 p-4 rounded-lg bg-slate-50 border border-slate-200 animate-in fade-in slide-in-from-top-2">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Resultado Sugerido</span>
                <div className="flex space-x-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy}>
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setResult(null)}>
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {result}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
