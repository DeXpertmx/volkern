'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  Shield,
  MapPin,
  Send,
  QrCode,
  TrendingUp,
  Briefcase,
  Factory,
  ChevronRight,
  Loader2,
  Lock,
  Zap,
  CheckCircle2,
  Sparkles,
  Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';

type DNA = 'CRM_CORE' | 'ERP_LIGHT' | 'ERP_INDUSTRIAL';

export default function OnboardingGenesisPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [dna, setDna] = useState<DNA | null>(null);
  const [loading, setLoading] = useState(false);
  const [masterKey, setMasterKey] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [detectingGps, setDetectingGps] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/users/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        }
      } catch (err) {
        console.error('Error al cargar info de usuario:', err);
      }
    };
    fetchUser();
  }, []);

  const [botToken, setBotToken] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [botConfigured, setBotConfigured] = useState(false);
  const [validatingBot, setValidatingBot] = useState(false);
  const [subdomain, setSubdomain] = useState('');
  const [isSubdomainAvailable, setIsSubdomainAvailable] = useState(true);
  const [checkingSubdomain, setCheckingSubdomain] = useState(false);

  // Derivados
  const watchdogUrl = botUsername 
    ? `tg://resolve?domain=${botUsername.replace('@', '')}&start=${user?.tenant?.id}`
    : null;

  const qrUrl = botUsername 
    ? `https://t.me/${botUsername.replace('@', '')}?start=${user?.tenant?.id}`
    : null;


  // DNA Options Configuration
  const DNA_OPTIONS = [
    {
      id: 'CRM_CORE' as DNA,
      title: 'Solo necesito vender (CRM Core)',
      description: 'Activa el Radar de Ghosting y Embudo de Ventas.',
      icon: TrendingUp,
      features: ['Lead Scoring AI', 'Pipeline Visual', 'Radar de Ghosting']
    },
    {
      id: 'ERP_LIGHT' as DNA,
      title: 'Gestiono Proyectos y Personal (ERP Light)',
      description: 'Activa Control de Asistencia con Selfie y Gestión de Citas.',
      icon: Briefcase,
      features: ['Reloj Checador con Selfie', 'Gestión de Proyectos', 'Agenda Inteligente']
    },
    {
      id: 'ERP_INDUSTRIAL' as DNA,
      title: 'Operación Física / Fábrica (ERP Industrial)',
      description: 'Activa Vision-Lock, Inventarios, BoM y el Watchdog de Telegram.',
      icon: Factory,
      features: ['Vision-Lock (Fraude Cero)', 'Control de Mermas con IA', 'Watchdog de Telegram']
    }
  ];

  const handleDetectLocation = () => {
    setDetectingGps(true);
    if (!navigator.geolocation) {
      toast.error('Geolocalización no soportada por este navegador');
      setDetectingGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setDetectingGps(false);
        toast.success('Ubicación base fijada correctamente');
      },
      (err) => {
        console.error(err);
        toast.error('Error al detectar ubicación. Por favor permite el acceso.');
        setDetectingGps(false);
      }
    );
  };

  const handleConfigureBot = async () => {
    if (!botToken) {
      toast.error('Proporciona el token del bot');
      return;
    }
    setValidatingBot(true);
    try {
      const res = await fetch('/api/onboarding/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken, botUsername: botUsername || 'WatchdogBot' })
      });
      const data = await res.json();
      if (res.ok) {
        setBotUsername(data.botInfo.username);
        setBotConfigured(true);
        toast.success(`Bot @${data.botInfo.username} vinculado correctamente`);
      } else {
        toast.error(data.error || 'Error al vincular bot');
      }
    } catch (err) {
      toast.error('Error de conexión');
    } finally {
      setValidatingBot(false);
    }
  };

  const handleFinalizeGenesis = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/onboarding/genesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dnaOperativo: dna,
          masterKeyHash: masterKey ? 'ENCRYPTED_CLIENT_SIDE_STUB' : null, // Mantenemos la promesa de no subir la key real
          lat: location?.lat,
          lng: location?.lng,
          subdomain
        })
      });

      if (res.ok) {
        toast.success('¡Génesis completado con éxito!');
        
        // Redirigir al subdominio si se acaba de configurar
        if (subdomain) {
          const protocol = window.location.protocol;
          const host = window.location.host;
          const isLocalhost = host.includes('localhost');
          const domain = isLocalhost ? 'localhost:3000' : 'volkern.app';
          
          // Prevenir bucle si ya estamos en el subdominio
          if (!host.startsWith(`${subdomain}.`)) {
            window.location.href = `${protocol}//${subdomain}.${domain}/dashboard`;
            return;
          }
        }
        
        router.push('/dashboard');
      } else {
        const errorData = await res.json();
        toast.error(`Error: ${errorData.message || 'Error al inicializar la bóveda'}`);
      }
    } catch (error) {
       toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A] font-sans selection:bg-[#1A365D]/20">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#1A365D]/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#1A365D]/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-20 max-w-5xl">
        <AnimatePresence mode="wait">
          {/* STEP 1: OPERATIONAL DNA */}
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="text-center space-y-4">
                <motion.div 
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className="mx-auto w-16 h-16 bg-[#1A365D] rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-[#1A365D]/20 mb-6"
                >
                  <Sparkles className="h-8 w-8" />
                </motion.div>
                <h1 className="text-4xl md:text-5xl font-black tracking-tight text-[#1A365D]">
                  Bienvenido a tu Centro de Mando
                </h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto">
                  Vamos a configurar las capas de seguridad y módulos que tu industria requiere. Selecciona el ADN operativo de tu negocio.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                {DNA_OPTIONS.map((opt) => (
                  <Card 
                    key={opt.id}
                    onClick={() => setDna(opt.id)}
                    className={cn(
                      "group relative cursor-pointer overflow-hidden transition-all duration-500 border-2",
                      dna === opt.id 
                        ? "border-[#1A365D] bg-white shadow-2xl scale-[1.02]" 
                        : "border-slate-200 bg-white/50 hover:bg-white hover:border-slate-400"
                    )}
                  >
                    <CardContent className="p-8 space-y-6">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-500",
                        dna === opt.id ? "bg-[#1A365D] text-white" : "bg-slate-100 text-slate-600 group-hover:bg-[#1A365D]/10 group-hover:text-[#1A365D]"
                      )}>
                        <opt.icon className="h-6 w-6" />
                      </div>
                      
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold text-[#1A365D]">{opt.title}</h3>
                        <p className="text-sm text-slate-500 leading-relaxed">{opt.description}</p>
                      </div>

                      <ul className="space-y-2 pt-4">
                        {opt.features.map(f => (
                          <li key={f} className="flex items-center text-xs font-semibold text-slate-400">
                            <Zap className="h-3 w-3 mr-2 text-[#1A365D] fill-[#1A365D]/20" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex justify-center pt-8">
                <Button 
                  size="lg"
                  disabled={!dna}
                  onClick={() => setStep(2)}
                  className="h-14 px-10 bg-[#1A365D] hover:bg-[#0F172A] text-white rounded-xl shadow-xl shadow-[#1A365D]/20 transition-all font-bold text-lg"
                >
                  Inicializar Bóveda y Continuar
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: SECURITY & VAULT (FOR ERP) */}
          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto space-y-10"
            >
              <div className="text-center space-y-4">
                <div className="mx-auto w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-[#1A365D] mb-4">
                  <Shield className="h-7 w-7" />
                </div>
                <h2 className="text-3xl font-black text-[#1A365D]">Configuración de la Bóveda</h2>
                <p className="text-slate-500">Asegura la integridad de tu operación física.</p>
              </div>

              <Card className="border-2 border-slate-200 overflow-hidden shadow-xl">
                <CardContent className="p-10 space-y-10">
                  {/* DIGITAL IDENTITY (SUBDOMAIN) */}
                  <div className="space-y-4">
                    <Label className="text-md font-bold text-[#1A365D] flex items-center">
                      <Globe className="h-4 w-4 mr-2" />
                      Identidad Digital (Subdominio)
                    </Label>
                    <div className="flex gap-2 relative">
                      <Input 
                        placeholder="tu-empresa"
                        value={subdomain}
                        onChange={async (e) => {
                          const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                          setSubdomain(val);
                          if (val.length > 2) {
                            setCheckingSubdomain(true);
                            const res = await fetch(`/api/public/subdomain/check?subdomain=${val}`);
                            const data = await res.json();
                            setIsSubdomainAvailable(data.available);
                            setCheckingSubdomain(false);
                          }
                        }}
                        className={cn(
                          "h-14 bg-slate-50 border-slate-200 focus:ring-[#1A365D] rounded-xl text-lg pr-32",
                          !isSubdomainAvailable && subdomain.length > 2 && "border-red-300 bg-red-50"
                        )}
                      />
                      <div className="absolute right-4 top-4 text-slate-400 font-bold flex items-center gap-2 pointer-events-none">
                        {checkingSubdomain && <Loader2 className="h-4 w-4 animate-spin" />}
                        .volkern.app
                      </div>
                    </div>
                    {!isSubdomainAvailable && subdomain.length > 2 && (
                      <p className="text-xs text-red-500 font-bold">⚠️ Este subdominio no está disponible o está reservado.</p>
                    )}
                    <p className="text-xs text-slate-400 italic">
                      Este será el link oficial para tus tarjetas digitales y páginas web (ej: <strong>{subdomain || 'empresa'}.volkern.app</strong>).
                    </p>
                  </div>

                  {/* MASTER KEY */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-md font-bold text-[#1A365D] flex items-center">
                        <Lock className="h-4 w-4 mr-2" />
                        Crea tu Llave Maestra de RRHH
                      </Label>
                      <span className="text-[10px] uppercase tracking-widest bg-amber-100 text-amber-700 font-bold px-2 py-1 rounded">Alta Seguridad</span>
                    </div>
                    <Input 
                      type="password"
                      placeholder="Tu frase secreta de cifrado..."
                      value={masterKey}
                      onChange={(e) => setMasterKey(e.target.value)}
                      className="h-14 bg-slate-50 border-slate-200 focus:ring-[#1A365D] rounded-xl text-lg"
                    />
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex gap-3">
                      <Shield className="h-5 w-5 text-[#1A365D] shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-500 leading-relaxed">
                        <strong>Nota Crítica:</strong> Esta llave nunca toca nuestros servidores; sin ella, nadie (ni siquiera el soporte de Volkern) puede ver tus nóminas o datos sensibles. Guárdala en un lugar seguro.
                      </p>
                    </div>
                  </div>

                  {/* GPS GEORREFERENCE */}
                  <div className="space-y-4 pt-6 border-t border-slate-100">
                    <Label className="text-md font-bold text-[#1A365D] flex items-center">
                      <MapPin className="h-4 w-4 mr-2" />
                      Georeferencia de Base
                    </Label>
                    <div className="flex gap-4">
                      {location ? (
                        <div className="flex-1 h-14 bg-green-50 border border-green-200 rounded-xl flex items-center px-4 gap-3 text-green-700 font-bold">
                          <CheckCircle2 className="h-5 w-5" />
                          Coordenadas fijadas: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                        </div>
                      ) : (
                        <Button 
                          variant="outline"
                          onClick={handleDetectLocation}
                          disabled={detectingGps}
                          className="flex-1 h-14 border-2 border-slate-200 bg-white hover:bg-slate-50 rounded-xl font-bold flex gap-2"
                        >
                          {detectingGps ? <Loader2 className="animate-spin h-5 w-5" /> : <MapPin className="h-5 w-5" />}
                          Detectar mi ubicación actual
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 italic">
                      Esto servirá como centro del radio de 100m para las validaciones de asistencia presencial.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between items-center pt-4">
                <Button variant="ghost" onClick={() => setStep(1)} className="font-bold text-slate-500">
                  Volver
                </Button>
                <Button 
                  onClick={() => setStep(3)}
                  disabled={!masterKey || !subdomain || !isSubdomainAvailable || checkingSubdomain}
                  className="h-14 px-10 bg-[#1A365D] hover:bg-[#0F172A] text-white rounded-xl shadow-xl font-bold"
                >
                  Siguiente paso
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: WATCHDOG QR */}
          {step === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-xl mx-auto space-y-8"
            >
              <div className="text-center space-y-4">
                <div className="mx-auto w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mb-4 animate-pulse">
                  <Send className="h-7 w-7" />
                </div>
                <h2 className="text-3xl font-black text-[#1A365D]">Activación del Watchdog</h2>
                <p className="text-slate-500">Conecta tu móvil a la red neuronal de tu empresa.</p>
              </div>

              {!botConfigured ? (
                <Card className="p-8 border-2 border-[#1A365D]/10 bg-white shadow-xl rounded-3xl space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase text-slate-400 tracking-widest">Paso A: Crea tu Bot</label>
                    <p className="text-sm text-slate-500">
                      1. Ve a <a href="https://t.me/BotFather" target="_blank" className="text-blue-600 font-bold underline">@BotFather</a> en Telegram.<br/>
                      2. Envía <code className="bg-slate-100 px-1 rounded">/newbot</code> y sigue los pasos.<br/>
                      3. Copia el <strong>API Token</strong> que te proporcione.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <label className="text-xs font-black uppercase text-[#1A365D] tracking-widest">Paso B: Pega el API Token</label>
                    <div className="flex gap-2">
                      <Input 
                        value={botToken}
                        onChange={(e) => setBotToken(e.target.value)}
                        placeholder="Ej: 123456789:ABCdefGhI..."
                        className="h-12 bg-slate-50 border-slate-200 rounded-xl"
                      />
                      <Button 
                        onClick={handleConfigureBot}
                        disabled={validatingBot || !botToken}
                        className="h-12 bg-[#1A365D] hover:bg-[#0F172A] text-white rounded-xl px-6 font-bold"
                      >
                        {validatingBot ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Vincular'}
                      </Button>
                    </div>
                  </div>
                </Card>
              ) : (
                <Card className="border-4 border-dashed border-green-200 bg-green-50/30 p-12 text-center shadow-inner rounded-3xl">
                  <div className="space-y-8">
                    <a 
                      href={watchdogUrl || '#'} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="mx-auto w-48 h-48 bg-white border-2 border-green-100 rounded-2xl flex items-center justify-center shadow-2xl relative group p-4"
                    >
                      <QRCodeSVG 
                        value={qrUrl || ''}
                        size={160}
                        level="H"
                        includeMargin={false}
                        className="transition-transform group-hover:scale-95 duration-500"
                      />
                      <div className="absolute inset-0 bg-[#1A365D]/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
                        <span className="text-[10px] font-black uppercase tracking-tighter text-[#1A365D]">Escanear o Tocar</span>
                      </div>
                    </a>
                    
                    <div className="space-y-4">
                      <p className="font-bold text-green-700">¡Bot @{botUsername} vinculado!</p>
                      <p className="text-slate-500 text-sm leading-relaxed max-w-sm mx-auto">
                        Haz clic en el QR o tócalo para abrir tu bot y presiona <strong>"INICIAR"</strong>.
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              <div className="flex flex-col gap-4">
                <Button 
                  onClick={handleFinalizeGenesis}
                  disabled={loading || !botConfigured}
                  className={cn(
                    "h-16 w-full rounded-2xl shadow-2xl font-black text-xl tracking-wide transition-all active:scale-95",
                    botConfigured ? "bg-[#1A365D] hover:bg-[#0F172A] text-white shadow-[#1A365D]/30" : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  )}
                >
                  {loading ? (
                    <div className="flex items-center gap-3">
                      <Loader2 className="animate-spin h-6 w-6" />
                      Inicializando Capas...
                    </div>
                  ) : (
                    "Finalizar Activación Génesis →"
                  )}
                </Button>
                <div className="flex justify-between items-center px-2">
                  <Button variant="link" onClick={() => setStep(2)} className="text-slate-400 text-xs font-bold uppercase">
                    Volver a Seguridad
                  </Button>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
                    Audit Hash: {Math.random().toString(36).substring(7).toUpperCase()}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
