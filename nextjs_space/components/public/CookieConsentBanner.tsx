'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Cookie, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

type ConsentPreferences = {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
};

const DEFAULT_PREFERENCES: ConsentPreferences = {
  necessary: true,  // Siempre obligatorio
  analytics: false,
  marketing: false,
  functional: false,
};

const CONSENT_KEY = 'volkern_consent';

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>(DEFAULT_PREFERENCES);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      // Mostrar banner después de un breve delay para no interferir con el render inicial
      const timer = setTimeout(() => setVisible(true), 500);
      return () => clearTimeout(timer);
    }
    try {
      const parsed = JSON.parse(stored);
      if (parsed.preferences) {
        setPreferences({ ...DEFAULT_PREFERENCES, ...parsed.preferences });
      }
    } catch {
      // Si el stored está corrupto, mostrar el banner
      setVisible(true);
    }
  }, []);

  const saveConsent = (prefs: ConsentPreferences, action: 'accepted' | 'rejected' | 'customized') => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({
      preferences: prefs,
      action,
      timestamp: new Date().toISOString(),
    }));
    setPreferences(prefs);
    setVisible(false);
    setCustomizing(false);
  };

  const handleAcceptAll = () => {
    const all: ConsentPreferences = {
      necessary: true,
      analytics: true,
      marketing: true,
      functional: true,
    };
    saveConsent(all, 'accepted');
  };

  const handleRejectAll = () => {
    saveConsent(DEFAULT_PREFERENCES, 'rejected');
  };

  const handleSaveCustom = () => {
    saveConsent(preferences, 'customized');
  };

  const togglePreference = (key: keyof ConsentPreferences) => {
    if (key === 'necessary') return; // Siempre activo
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-[9999] p-4 md:p-6"
        >
          <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-blue-900/20 overflow-hidden">
            {!customizing ? (
              <div className="p-6 md:p-8">
                <div className="flex items-start gap-4">
                  <div className="hidden md:flex w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex-shrink-0 items-center justify-center">
                    <Cookie className="w-6 h-6 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <h3 className="text-lg font-bold text-white">🍪 Configuración de Privacidad</h3>
                      <button
                        onClick={() => setVisible(false)}
                        className="text-slate-500 hover:text-white transition-colors p-1"
                        aria-label="Cerrar"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed mb-4">
                      Utilizamos cookies y tecnologías similares para mejorar tu experiencia, 
                      analizar el tráfico y personalizar contenido. Puedes aceptar todas, 
                      rechazar las no esenciales, o personalizar tu configuración.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        onClick={handleAcceptAll}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2 rounded-xl text-sm"
                      >
                        Aceptar Todas
                      </Button>
                      <Button
                        onClick={handleRejectAll}
                        variant="outline"
                        className="border-slate-700 text-slate-300 hover:bg-slate-800 px-6 py-2 rounded-xl text-sm"
                      >
                        Rechazar
                      </Button>
                      <Button
                        onClick={() => setCustomizing(true)}
                        variant="ghost"
                        className="text-slate-400 hover:text-white px-6 py-2 rounded-xl text-sm"
                      >
                        Personalizar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-6 h-6 text-blue-400" />
                    <h3 className="text-lg font-bold text-white">Personalizar Cookies</h3>
                  </div>
                  <button
                    onClick={() => setCustomizing(false)}
                    className="text-slate-500 hover:text-white transition-colors p-1"
                    aria-label="Volver"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4 mb-6">
                  {/* Necesarias - Siempre activas */}
                  <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-white font-bold cursor-pointer">Cookies Técnicas (Necesarias)</Label>
                        <p className="text-xs text-slate-400 mt-1">Imprescindibles para el funcionamiento básico del sitio.</p>
                      </div>
                      <Switch checked={true} disabled className="data-[state=checked]:bg-blue-600" />
                    </div>
                  </div>

                  {/* Analytics */}
                  <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Label
                            htmlFor="analytics"
                            className="text-white font-bold cursor-pointer"
                            onClick={() => togglePreference('analytics')}
                          >
                            Cookies de Analytics
                          </Label>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Nos ayudan a entender cómo usas el sitio para mejorarlo.</p>
                      </div>
                      <Switch
                        id="analytics"
                        checked={preferences.analytics}
                        onCheckedChange={() => togglePreference('analytics')}
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </div>
                  </div>

                  {/* Marketing */}
                  <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label
                          htmlFor="marketing"
                          className="text-white font-bold cursor-pointer"
                          onClick={() => togglePreference('marketing')}
                        >
                          Cookies de Marketing
                        </Label>
                        <p className="text-xs text-slate-400 mt-1">Permiten mostrarte contenido relevante y campañas.</p>
                      </div>
                      <Switch
                        id="marketing"
                        checked={preferences.marketing}
                        onCheckedChange={() => togglePreference('marketing')}
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </div>
                  </div>

                  {/* Funcionales */}
                  <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label
                          htmlFor="functional"
                          className="text-white font-bold cursor-pointer"
                          onClick={() => togglePreference('functional')}
                        >
                          Cookies Funcionales
                        </Label>
                        <p className="text-xs text-slate-400 mt-1">Recuerdan tus preferencias para una experiencia personalizada.</p>
                      </div>
                      <Switch
                        id="functional"
                        checked={preferences.functional}
                        onCheckedChange={() => togglePreference('functional')}
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 justify-end border-t border-slate-800 pt-4">
                  <Button
                    onClick={handleRejectAll}
                    variant="outline"
                    className="border-slate-700 text-slate-300 hover:bg-slate-800 px-6 py-2 rounded-xl text-sm"
                  >
                    Rechazar Todas
                  </Button>
                  <Button
                    onClick={handleAcceptAll}
                    variant="outline"
                    className="border-slate-700 text-slate-300 hover:bg-slate-800 px-6 py-2 rounded-xl text-sm"
                  >
                    Aceptar Todas
                  </Button>
                  <Button
                    onClick={handleSaveCustom}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2 rounded-xl text-sm"
                  >
                    Guardar Configuración
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
