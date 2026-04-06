
import { useState, useEffect } from 'react';

interface WhitelabelConfig {
  id: string;
  nombreEmpresa: string;
  logoUrl: string | null;
  iconoUrl: string | null;
  colorPrimario: string;
  colorSecundario: string;
  colorAcento: string;
  emailRemitente: string | null;
  nombreRemitente: string | null;
  eslogan: string | null;
  descripcion: string | null;
  dominio: string | null;
  urlFacebook: string | null;
  urlInstagram: string | null;
  urlTwitter: string | null;
  urlLinkedIn: string | null;
  urlWebsite: string | null;
}

const defaultConfig: WhitelabelConfig = {
  id: 'default',
  nombreEmpresa: 'Volkern CRM',
  logoUrl: '/volkern-logo.png',
  iconoUrl: '/volkern-icon.png',
  colorPrimario: '#3b82f6',
  colorSecundario: '#8b5cf6',
  colorAcento: '#10b981',
  emailRemitente: null,
  nombreRemitente: null,
  eslogan: null,
  descripcion: null,
  dominio: null,
  urlFacebook: null,
  urlInstagram: null,
  urlTwitter: null,
  urlLinkedIn: null,
  urlWebsite: null,
};

export function useWhitelabel() {
  const [config, setConfig] = useState<WhitelabelConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/whitelabel');
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
        }
      } catch (error) {
        console.error('Error al cargar configuración de whitelabel:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  return { config, loading };
}
