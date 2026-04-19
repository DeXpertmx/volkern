'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export const LeadForm = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    empresa: '',
    rol: '',
    necesidad: ''
  });

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1 && !formData.email) {
      toast.error('El email es obligatorio');
      return;
    }
    setStep(step + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Error al enviar el formulario');

      setSubmitted(true);
      toast.success('¡Solicitud enviada con éxito!');
    } catch (error) {
      console.error(error);
      toast.error('Hubo un problema al enviar tu solicitud.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-slate-900 border border-slate-800 p-12 rounded-3xl text-center max-w-xl mx-auto">
        <CheckCircle2 className="w-16 h-16 text-blue-500 mx-auto mb-6" />
        <h3 className="text-3xl font-bold text-white mb-4">¡Listo! Analizando tu perfil...</h3>
        <p className="text-slate-400 mb-8">
          Nuestro motor de automatización ha registrado tu interés. Recibirás un briefing 
          personalizado en tu bandeja de entrada en los próximos minutos.
        </p>
        <Button onClick={() => window.location.href = '/'} variant="outline" className="border-slate-800 text-slate-300">
          Volver al inicio
        </Button>
      </div>
    );
  }

  return (
    <section id="demo" className="py-24 bg-slate-950">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-16">
          <div className="flex-1">
            <h2 className="text-4xl font-bold text-white mb-6">Únete al ecosistema Soberano</h2>
            <p className="text-slate-400 mb-8 leading-relaxed">
              No estamos buscando simples usuarios, buscamos partners tecnológicos. 
              Completa el briefing para que Volkern analice la viabilidad de tu integración.
            </p>
            <ul className="space-y-4">
              {['Aislamiento de datos nivel militar', 'Soberanía de mando con IA propia', 'Integración ERP 360 nativa'].map((feature, i) => (
                <li key={i} className="flex items-center gap-3 text-slate-300">
                  <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                    <ArrowRight className="w-3 h-3 text-blue-400" />
                  </div>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex-1 w-full">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
              {/* Progress Bar */}
              <div className="absolute top-0 left-0 h-1 bg-blue-600 transition-all duration-500" style={{ width: `${(step / 2) * 100}%` }} />
              
              <AnimatePresence mode="wait">
                {step === 1 ? (
                  <motion.form
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    onSubmit={handleNext}
                    className="space-y-6"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-slate-300">Email Corporativo</Label>
                      <Input 
                        id="email" 
                        type="email" 
                        placeholder="tu@empresa.com"
                        className="bg-slate-950 border-slate-800 text-white p-6 rounded-xl"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 py-6 text-lg font-bold rounded-xl group">
                      Continuar
                      <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </motion.form>
                ) : (
                  <motion.form
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    onSubmit={handleSubmit}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name" className="text-slate-300">Nombre Completo</Label>
                        <Input 
                          id="name" 
                          className="bg-slate-950 border-slate-800 text-white p-6 rounded-xl"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="empresa" className="text-slate-300">Empresa</Label>
                        <Input 
                          id="empresa" 
                          className="bg-slate-950 border-slate-800 text-white p-6 rounded-xl"
                          value={formData.empresa}
                          onChange={(e) => setFormData({ ...formData, empresa: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rol" className="text-slate-300">Rol en la organización</Label>
                      <Input 
                        id="rol" 
                        placeholder="ej: CEO, CTO, Marketing Manager"
                        className="bg-slate-950 border-slate-800 text-white p-6 rounded-xl"
                        value={formData.rol}
                        onChange={(e) => setFormData({ ...formData, rol: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="necesidad" className="text-slate-300">¿Qué buscas automatizar?</Label>
                      <Textarea 
                        id="necesidad" 
                        placeholder="Cuéntanos tus desafíos operativos..."
                        className="bg-slate-950 border-slate-800 text-white p-4 rounded-xl min-h-[100px]"
                        value={formData.necesidad}
                        onChange={(e) => setFormData({ ...formData, necesidad: e.target.value })}
                      />
                    </div>
                    
                    <div className="flex gap-4">
                      <Button type="button" variant="ghost" onClick={() => setStep(1)} className="text-slate-500 hover:text-white">
                        Atrás
                      </Button>
                      <Button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-500 py-6 text-lg font-bold rounded-xl">
                        {loading ? <Loader2 className="animate-spin" /> : 'Solicitar Acceso'}
                      </Button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
